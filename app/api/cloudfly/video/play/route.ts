import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFlyStorage, isCloudFlyVideoKey } from '@/lib/cloudfly-s3';
import { getVideoAsset } from '@/lib/video-assets-server';
import { verifyVideoToken } from '@/lib/video-token-server';

export const runtime = 'nodejs';

function ffmpegBinary() {
  const fileName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const candidate = path.join(process.cwd(), 'node_modules', 'ffmpeg-static', fileName);
  return fs.existsSync(candidate) ? candidate : null;
}

function browserCanPlay(key: string) {
  return /\.(mp4|webm)$/i.test(key);
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') || '';
  if (!isCloudFlyVideoKey(key)) {
    return NextResponse.json({ error: 'Mã video CloudFly không hợp lệ.' }, { status: 400 });
  }
  if (!verifyVideoToken(key, request.nextUrl.searchParams.get('token') || '')) {
    return NextResponse.json({ error: 'Bạn cần mở video từ khóa học của mình.' }, { status: 401 });
  }
  try {
    const { client, bucket } = getCloudFlyStorage();
    const asset = await getVideoAsset(key).catch(() => null);
    const readyKey = asset?.status === 'ready' ? asset.optimized_key : null;
    const playbackKey = readyKey || key;
    const signedUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: playbackKey }), {
      expiresIn: 60 * 60,
    });

    if (readyKey || browserCanPlay(key)) {
      const response = NextResponse.redirect(signedUrl, 307);
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }

    const ffmpegPath = ffmpegBinary();
    if (!ffmpegPath) {
      return NextResponse.json({ error: 'Máy chủ chưa có bộ chuyển video sang MP4.' }, { status: 500 });
    }

    const ffmpeg = spawn(ffmpegPath, [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', signedUrl,
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4',
      'pipe:1',
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    request.signal.addEventListener('abort', () => ffmpeg.kill(), { once: true });

    ffmpeg.on('error', error => {
      console.error('[CloudFly] ffmpeg failed to start', error);
    });
    ffmpeg.stderr.on('data', chunk => {
      console.error('[CloudFly] ffmpeg', chunk.toString().slice(0, 300));
    });

    const stream = Readable.toWeb(ffmpeg.stdout) as ReadableStream;
    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[CloudFly] Could not sign playback URL:', error);
    return NextResponse.json({ error: 'Không tạo được link phát video CloudFly.' }, { status: 502 });
  }
}
