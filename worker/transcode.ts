import { spawn } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getCloudFlyStorage, isCloudFlyVideoKey } from '../lib/cloudfly-s3';
import type { VideoAsset, VideoVariant } from '../lib/video-assets-server';

const requireFromHere = createRequire(import.meta.url);
const ffmpeg = requireFromHere('ffmpeg-static') as string | null;
const ffprobe = (requireFromHere('ffprobe-static') as { path?: string }).path;

type ProbeStream = {
  codec_type?: string;
  codec_name?: string;
  pix_fmt?: string;
  width?: number;
  height?: number;
  color_transfer?: string;
  side_data_list?: Array<{ rotation?: number }>;
  tags?: { rotate?: string };
};

type Probe = {
  streams: ProbeStream[];
  format: { duration?: string; bit_rate?: string };
};

export type ProcessedVideo = Pick<VideoAsset,
  'optimized_key' | 'hls_master_key' | 'poster_key' | 'variants' | 'duration_sec' | 'width' | 'height'>;

async function run(program: string, args: string[], timeoutMs = 4 * 60 * 60_000, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
    child.on('error', reject);
    child.on('close', code => {
      clearTimeout(timer);
      if (code === 0) resolve(stdout);
      else reject(new Error(`media_tool_exit_${code}: ${stderr}`));
    });
  });
}

async function inspect(file: string): Promise<{
  video: ProbeStream;
  audio: ProbeStream | undefined;
  duration: number;
  bitrate: number;
}> {
  if (!ffprobe) throw new Error('ffprobe_missing');
  const raw = await run(ffprobe, ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], 60_000);
  const probe = JSON.parse(raw) as Probe;
  const video = probe.streams.find(stream => stream.codec_type === 'video');
  if (!video?.width || !video.height) throw new Error('video_stream_missing');
  const duration = Number(probe.format.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('video_duration_invalid');
  return {
    video,
    audio: probe.streams.find(stream => stream.codec_type === 'audio'),
    duration,
    bitrate: Number(probe.format.bit_rate) || 0,
  };
}

function canRemux(info: Awaited<ReturnType<typeof inspect>>): boolean {
  const rotation = Number(info.video.tags?.rotate || info.video.side_data_list?.find(item => item.rotation)?.rotation || 0);
  const hdr = ['smpte2084', 'arib-std-b67'].includes(info.video.color_transfer || '');
  return info.video.codec_name === 'h264'
    && info.video.pix_fmt === 'yuv420p'
    && (!info.audio || info.audio.codec_name === 'aac')
    && rotation === 0 && !hdr;
}

async function normalize(input: string, output: string, info: Awaited<ReturnType<typeof inspect>>): Promise<void> {
  if (!ffmpeg) throw new Error('ffmpeg_missing');
  const shared = ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-map', '0:v:0', '-map', '0:a:0?'];
  if (canRemux(info)) {
    await run(ffmpeg, [...shared, '-c', 'copy', '-movflags', '+faststart', output]);
    return;
  }
  // Keep the uploaded pixel dimensions. Only round odd dimensions down because
  // yuv420p/H.264 requires even frame dimensions.
  const scale = 'scale=w=trunc(iw/2)*2:h=trunc(ih/2)*2';
  const hdr = ['smpte2084', 'arib-std-b67'].includes(info.video.color_transfer || '');
  const filter = hdr
    ? `zscale=t=linear:npl=100,format=gbrpf32le,tonemap=tonemap=hable,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,${scale}`
    : scale;
  await run(ffmpeg, [
    ...shared, '-vf', filter,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '128k', '-ar', '48000',
    '-movflags', '+faststart', output,
  ]);
}

async function createPoster(normalized: string, poster: string, duration: number): Promise<void> {
  if (!ffmpeg) throw new Error('ffmpeg_missing');
  await run(ffmpeg, [
    '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(Math.min(2, duration / 2)),
    '-i', normalized, '-frames:v', '1', '-vf', 'scale=w=640:h=360:force_original_aspect_ratio=decrease', poster,
  ], 120_000);
}

const LADDER = [
  { height: 360, bitrate: 700_000, audio: 96_000 },
  { height: 480, bitrate: 1_200_000, audio: 96_000 },
  { height: 720, bitrate: 2_600_000, audio: 128_000 },
  { height: 1080, bitrate: 6_000_000, audio: 128_000 },
  { height: 1440, bitrate: 10_000_000, audio: 192_000 },
];

async function createHls(normalized: string, hlsDir: string, width: number, height: number, hasAudio: boolean): Promise<VideoVariant[]> {
  if (!ffmpeg) throw new Error('ffmpeg_missing');
  const levels = LADDER.filter(level => level.height < height);
  // Size the source rendition against its actual pixel count, including wide
  // or portrait uploads whose bitrate would be underestimated by height alone.
  const sourceBitrate = Math.min(18_000_000, Math.max(700_000, width * height * 3));
  levels.push({
    height,
    bitrate: Math.max(sourceBitrate, LADDER.find(level => level.height === height)?.bitrate || 0),
    audio: height >= 1440 ? 192_000 : height >= 720 ? 128_000 : 96_000,
  });
  const variants: VideoVariant[] = [];
  for (const level of levels) {
    const dir = path.join(hlsDir, String(level.height));
    await mkdir(dir, { recursive: true });
    await run(ffmpeg, [
      '-hide_banner', '-loglevel', 'error', '-y', '-i', normalized,
      '-map', '0:v:0', '-map', '0:a:0?',
      '-vf', `scale=w=-2:h=min(${level.height}\\,ih):flags=lanczos`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', level.height === height ? '20' : '23',
      '-maxrate', String(level.bitrate), '-bufsize', String(level.bitrate * 2),
      '-pix_fmt', 'yuv420p', '-force_key_frames', 'expr:gte(t,n_forced*2)', '-sc_threshold', '0',
      '-c:a', 'aac', '-b:a', String(level.audio),
      '-f', 'hls', '-hls_time', '2', '-hls_playlist_type', 'vod',
      '-hls_segment_type', 'fmp4', '-hls_flags', 'independent_segments',
      '-hls_fmp4_init_filename', 'init.mp4',
      '-hls_segment_filename', path.join(dir, 'seg_%05d.m4s'),
      path.join(dir, 'index.m3u8'),
    ], 4 * 60 * 60_000, dir);
    const actual = await inspect(path.join(dir, 'init.mp4')).catch(() => null);
    variants.push({
      width: actual?.video.width || Math.round(width * Math.min(1, level.height / height) / 2) * 2,
      height: Math.min(height, level.height),
      bandwidth: level.bitrate + (hasAudio ? level.audio : 0),
      playlistKey: `${level.height}/index.m3u8`,
    });
  }
  const master = [
    '#EXTM3U', '#EXT-X-VERSION:7',
    ...variants.flatMap(variant => [
      `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${variant.width}x${variant.height},CODECS="${hasAudio ? 'avc1.640028,mp4a.40.2' : 'avc1.640028'}"`,
      variant.playlistKey,
    ]),
    '',
  ].join('\n');
  await writeFile(path.join(hlsDir, 'master.m3u8'), master);
  return variants;
}

async function listFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(entry => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(root, item) : Promise.resolve([item]);
  }));
  return files.flat();
}

function contentType(file: string): string {
  if (file.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if (file.endsWith('.m4s')) return 'video/iso.segment';
  if (file.endsWith('.jpg')) return 'image/jpeg';
  return 'video/mp4';
}

async function uploadFile(key: string, file: string): Promise<void> {
  const { client, bucket } = getCloudFlyStorage();
  const size = (await stat(file)).size;
  if (size < 5 * 1024 * 1024) {
    await client.send(new PutObjectCommand({
      Bucket: bucket, Key: key, Body: await readFile(file), ContentType: contentType(file),
      ContentDisposition: 'inline', CacheControl: 'private, max-age=3600',
    }));
    return;
  }
  await new Upload({
    client,
    params: {
      Bucket: bucket, Key: key, Body: createReadStream(file), ContentType: contentType(file),
      ContentDisposition: 'inline', CacheControl: 'private, max-age=3600',
    },
    queueSize: 2,
    partSize: 8 * 1024 * 1024,
  }).done();
}

export async function processVideo(sourceKey: string): Promise<ProcessedVideo> {
  if (!isCloudFlyVideoKey(sourceKey)) throw new Error('source_key_invalid');
  const id = sourceKey.match(/^videos\/([0-9a-f-]{36})\./i)?.[1];
  if (!id) throw new Error('source_key_invalid');
  const temp = await mkdtemp(path.join(tmpdir(), 'kama-video-'));
  const source = path.join(temp, 'source' + path.extname(sourceKey));
  const normalized = path.join(temp, 'optimized.mp4');
  const poster = path.join(temp, 'poster.jpg');
  const hlsDir = path.join(temp, 'hls');
  const prefix = `videos-optimized/${id}/v2`;
  try {
    await mkdir(hlsDir);
    const { client, bucket } = getCloudFlyStorage();
    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: sourceKey }));
    if (!object.Body) throw new Error('source_object_empty');
    await pipeline(object.Body as NodeJS.ReadableStream, createWriteStream(source));

    const { info: outputInfo, variants } = await buildVideoFiles(source, temp);

    await uploadFile(`${prefix}/optimized.mp4`, normalized);
    await uploadFile(`${prefix}/poster.jpg`, poster);
    const files = await listFiles(hlsDir);
    // Publish the playlists after every init/segment object is present.
    const mediaFiles = files.filter(item => !item.endsWith('.m3u8'));
    const uploadConcurrency = Math.max(1, Math.min(4, Number(process.env.TRANSCODE_UPLOAD_CONCURRENCY || 2)));
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(uploadConcurrency, mediaFiles.length) }, async () => {
      while (next < mediaFiles.length) {
        const file = mediaFiles[next++];
        const relative = path.relative(hlsDir, file).split(path.sep).join('/');
        await uploadFile(`${prefix}/hls/${relative}`, file);
      }
    }));
    for (const file of files.filter(item => item.endsWith('.m3u8')).sort((a, b) => Number(a.endsWith('master.m3u8')) - Number(b.endsWith('master.m3u8')))) {
      const relative = path.relative(hlsDir, file).split(path.sep).join('/');
      await uploadFile(`${prefix}/hls/${relative}`, file);
    }

    return {
      optimized_key: `${prefix}/optimized.mp4`,
      hls_master_key: `${prefix}/hls/master.m3u8`,
      poster_key: `${prefix}/poster.jpg`,
      variants: variants.map(variant => ({ ...variant, playlistKey: `${prefix}/hls/${variant.playlistKey}` })),
      duration_sec: outputInfo.duration,
      width: outputInfo.video.width!,
      height: outputInfo.video.height!,
    };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

export async function buildVideoFiles(input: string, outputDir: string): Promise<{
  info: Awaited<ReturnType<typeof inspect>>;
  variants: VideoVariant[];
}> {
  const normalized = path.join(outputDir, 'optimized.mp4');
  const poster = path.join(outputDir, 'poster.jpg');
  const hlsDir = path.join(outputDir, 'hls');
  await mkdir(hlsDir, { recursive: true });
  const sourceInfo = await inspect(input);
  await normalize(input, normalized, sourceInfo);
  const info = await inspect(normalized);
  await createPoster(normalized, poster, info.duration);
  const variants = await createHls(normalized, hlsDir, info.video.width!, info.video.height!, Boolean(info.audio));
  return { info, variants };
}
