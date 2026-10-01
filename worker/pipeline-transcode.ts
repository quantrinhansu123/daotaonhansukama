import { spawn } from 'node:child_process';
import { createReadStream,createWriteStream } from 'node:fs';
import { mkdtemp,mkdir,readdir,rm,stat,statfs,writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import {Transform} from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getCloudFlyStorage } from '../lib/cloudfly-s3';
import { assetScope,bunnyVideoConfig,signedVideoUrl,uploadBunnyVideoFile } from '../lib/bunny-video-delivery';
import { pipelinePrefix } from '../lib/video-pipeline-config';
import { pipelineRpc } from '../lib/video-pipeline-db';
import type { PipelineClaim,PipelineOutput,PipelineVariant } from '../lib/video-pipeline-types';

const requireHere=createRequire(import.meta.url);
const ffmpeg=requireHere('ffmpeg-static') as string;
const ffprobe=(requireHere('ffprobe-static') as {path:string}).path;
const THREADS=Math.max(1,Math.min(2,Number(process.env.VIDEO_WORKER_THREADS)||2));
const MAX_TEMP=8*1024**3;
async function removeTemp(target:string,root:string) {
  const base=path.resolve(root),resolved=path.resolve(target),parent=path.resolve(tmpdir());
  if(path.dirname(base)!==parent || !path.basename(base).startsWith('upcare-video-')
    || (resolved!==base && !resolved.startsWith(base+path.sep))) throw new Error('video_temp_cleanup_path_invalid');
  await rm(resolved,{recursive:true,force:true});
}

export async function runMedia(program:string,args:string[],signal?:AbortSignal,timeout=4*3600_000,cwd?:string) {
  signal?.throwIfAborted();
  return new Promise<string>((resolve,reject)=>{
    const child=spawn(program,args,{stdio:['ignore','pipe','pipe'],windowsHide:true,cwd});
    let output='',error='';
    const stop=()=>child.kill();
    const timer=setTimeout(stop,timeout);
    signal?.addEventListener('abort',stop,{once:true});
    child.stdout.on('data',(b:Buffer)=>{output=(output+b.toString()).slice(-1024*1024);});
    child.stderr.on('data',(b:Buffer)=>{error=(error+b.toString()).slice(-1200);});
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',stop);};
    child.on('error',()=>{cleanup();reject(new Error('media_tool_unavailable'));});
    child.on('close',code=>{
      cleanup();
      if(signal?.aborted) reject(new Error('video_lease_lost'));
      else if(code!==0) reject(new Error(`media_tool_failed: ${error.replace(/https?:\/\/\S+/g,'[remote]').slice(-300)}`));
      else resolve(output);
    });
  });
}
export async function probeMedia(file:string,signal?:AbortSignal) {
  const raw=await runMedia(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file],signal,60_000);
  const info=JSON.parse(raw) as {format:{duration:string};streams:Array<{codec_type:string;width?:number;height?:number;codec_name?:string;color_transfer?:string;sample_aspect_ratio?:string;tags?:{rotate?:string};side_data_list?:Array<{rotation?:number}>}>};
  const video=info.streams.find(s=>s.codec_type==='video'),duration=Number(info.format.duration);
  if(!video?.width || !video.height || !Number.isFinite(duration) || duration<=0) throw new Error('video_source_invalid');
  const rotation=Number(video.tags?.rotate || video.side_data_list?.find(x=>x.rotation!==undefined)?.rotation || 0);
  const rotated=Math.abs(rotation)%180===90;
  const [sarWidth,sarHeight]=(video.sample_aspect_ratio || '1:1').split(':').map(Number),sar=sarWidth/sarHeight;
  const displayWidth=Math.round(video.width*(Number.isFinite(sar) && sar>0?sar:1));
  return {width:rotated?video.height:displayWidth,height:rotated?displayWidth:video.height,duration,
    audio:info.streams.some(s=>s.codec_type==='audio'),hdr:['smpte2084','arib-std-b67'].includes(video.color_transfer || '')};
}
export type MediaInfo=Awaited<ReturnType<typeof probeMedia>>;
export async function checkWorkerDisk(required=10*1024**3) {
  const space=await statfs(tmpdir());
  if(space.bavail*space.bsize<required) throw new Error('video_disk_space_low');
}

export async function encodeRendition(input:string,folder:string,height:number,bitrate:number,info:MediaInfo,signal?:AbortSignal) {
  await mkdir(folder,{recursive:true});
  const factor=Math.min(1,height/info.height),width=Math.max(2,Math.floor(info.width*factor/2)*2),outHeight=Math.max(2,Math.floor(info.height*factor/2)*2);
  const mp4=path.join(folder,'fallback.mp4');
  const filters=[...(info.hdr?['zscale=t=linear:npl=100','format=gbrpf32le','tonemap=tonemap=hable','zscale=p=bt709:t=bt709:m=bt709:r=tv']:[]),`scale=${width}:${outHeight}:flags=lanczos`,'setsar=1'];
  const level=width*outHeight<=1280*720?'3.1':width*outHeight<=1920*1080?'4.0':width*outHeight<=2560*1440?'5.0':'5.1';
  await runMedia(ffmpeg,['-hide_banner','-loglevel','error','-y','-threads',String(THREADS),'-filter_threads','1','-i',input,
    '-map','0:v:0','-map','0:a:0?','-vf',filters.join(','),'-r','30','-c:v','libx264','-threads',String(THREADS),'-preset','veryfast',
    '-profile:v','main','-level:v',level,'-crf',height<=480?'23':'20','-maxrate',String(bitrate),'-bufsize',String(bitrate*2),
    '-pix_fmt','yuv420p','-g','60','-keyint_min','60','-sc_threshold','0','-force_key_frames','expr:gte(t,n_forced*2)',
    '-c:a','aac','-b:a',height<=480?'96k':'128k','-ar','48000','-ac','2',...(info.hdr?['-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709']:[]),'-movflags','+faststart',mp4],signal);
  await runMedia(ffmpeg,['-hide_banner','-loglevel','error','-y','-i',mp4,'-map','0:v:0','-map','0:a:0?','-c','copy',
    '-f','hls','-hls_time','2','-hls_playlist_type','vod','-hls_segment_type','fmp4','-hls_flags','independent_segments',
    '-hls_fmp4_init_filename','init.mp4','-hls_segment_filename',path.join(folder,'seg_%05d.m4s'),path.join(folder,'index.m3u8')],signal,4*3600_000,folder);
  const measured=await probeMedia(mp4,signal);
  if(Math.abs(measured.duration-info.duration)>Math.max(1,info.duration*.005)) throw new Error('video_duration_mismatch');
  return {width:measured.width,height:measured.height,bandwidth:Math.ceil(bitrate*1.4)+(info.audio?(height<=480?96000:128000):0),
    codecs:`avc1.4d40${Math.round(Number(level)*10).toString(16).padStart(2,'0')}${info.audio?',mp4a.40.2':''}`,playlistKey:''} satisfies PipelineVariant;
}

export function masterPlaylist(variants:PipelineVariant[],masterKey:string) {
  return ['#EXTM3U','#EXT-X-VERSION:7','#EXT-X-INDEPENDENT-SEGMENTS',...variants.flatMap(v=>[
    `#EXT-X-STREAM-INF:BANDWIDTH=${v.bandwidth},RESOLUTION=${v.width}x${v.height},CODECS="${v.codecs}"`,
    path.posix.relative(path.posix.dirname(masterKey),v.playlistKey),
  ]),''].join('\n');
}
export function playlistReferences(text:string) {
  if(!text.startsWith('#EXTM3U')) throw new Error('video_playlist_invalid');
  return text.split(/\r?\n/).flatMap(line=>line.startsWith('#')?[...line.matchAll(/URI="([^"]+)"/g)].map(x=>x[1]):line.trim()?[line.trim()]:[]);
}
export function selectLegacyRendition(text:string,masterUrl:string) {
  const lines=text.split(/\r?\n/),variants:Array<{pixels:number;url:string;audio?:string}>=[];
  for(let i=0;i<lines.length;i++) if(lines[i].startsWith('#EXT-X-STREAM-INF:')) {
    const match=lines[i].match(/RESOLUTION=(\d+)x(\d+)/),ref=lines.slice(i+1).find(l=>l.trim() && !l.startsWith('#'));
    if(ref) variants.push({pixels:match?Number(match[1])*Number(match[2]):0,url:ref,audio:lines[i].match(/AUDIO="([^"]+)"/)?.[1]});
  }
  const best=variants.sort((a,b)=>b.pixels-a.pixels)[0];
  const audio=best?.audio?lines.filter(l=>l.startsWith('#EXT-X-MEDIA:') && l.includes('TYPE=AUDIO') && l.includes(`GROUP-ID="${best.audio}"`)).sort((a,b)=>Number(b.includes('DEFAULT=YES'))-Number(a.includes('DEFAULT=YES')))[0]?.match(/URI="([^"]+)"/)?.[1]:undefined;
  const scope=masterUrl.slice(0,masterUrl.lastIndexOf('/')+1);
  const resolve=(ref:string)=>{const url=new URL(ref,masterUrl).href;if(!url.startsWith(scope))throw new Error('video_legacy_playlist_scope_invalid');return url;};
  return {videoUrl:best?resolve(best.url):masterUrl,audioUrl:audio?resolve(audio):undefined};
}
async function files(folder:string):Promise<string[]> {
  const result:string[]=[];
  for(const e of await readdir(folder,{withFileTypes:true})) {
    const file=path.join(folder,e.name);
    result.push(...(e.isDirectory()?await files(file):[file]));
  }
  return result;
}
async function uploadFolder(folder:string,prefix:string,signal:AbortSignal,keepFallback=false) {
  const list=await files(folder);
  let bytes=0;
  for(const f of list) bytes+=(await stat(f)).size;
  if(bytes>MAX_TEMP) throw new Error('video_temp_budget_exceeded');
  // Playlists last. A concurrent viewer never receives a partially uploaded rendition.
  for(const file of list.sort((a,b)=>Number(a.endsWith('.m3u8'))-Number(b.endsWith('.m3u8')))) {
    if(file.endsWith('fallback.mp4') && !keepFallback) continue;
    await uploadBunnyVideoFile(`${prefix}/${path.relative(folder,file).replaceAll('\\','/')}`,file,signal);
  }
}
async function fetchCdn(key:string,method='GET',signal?:AbortSignal) {
  const response=await fetch(signedVideoUrl(key,undefined,assetScope(key)),{method,headers:{Origin:'http://localhost:3000'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15_000)]):AbortSignal.timeout(15_000)});
  if(!response.ok) {await response.body?.cancel();throw new Error(`video_cdn_http_${response.status}`);}
  if(!response.headers.get('access-control-allow-origin')) {await response.body?.cancel();throw new Error('video_cdn_cors_missing');}
  return response;
}
export async function verifyCdnOutput(result:PipelineOutput,signal:AbortSignal) {
  const master=await (await fetchCdn(result.master_key,'GET',signal)).text();
  const scope=assetScope(result.master_key);
  const resolve=(base:string,relative:string)=>{
    if(/^[a-z]+:|^\//i.test(relative)) throw new Error('video_playlist_external_reference');
    const key=path.posix.normalize(path.posix.join(path.posix.dirname(base),relative));
    if(!key.startsWith(scope)) throw new Error('video_playlist_scope_escape');
    return key;
  };
  const expected=new Set(result.variants.map(v=>v.playlistKey));
  for(const ref of playlistReferences(master)) {
    const key=resolve(result.master_key,ref);
    if(!expected.delete(key)) throw new Error('video_master_variant_mismatch');
    const playlist=await (await fetchCdn(key,'GET',signal)).text();
    if(!playlist.includes('#EXT-X-ENDLIST')) throw new Error('video_playlist_not_complete');
    const segments=playlistReferences(playlist);
    if(segments.length<2) throw new Error('video_segments_missing');
    // All referenced objects must exist, including the final segment, not only the first.
    for(let n=0;n<segments.length;n+=3) await Promise.all(segments.slice(n,n+3).map(async r=>{
      const response=await fetchCdn(resolve(key,r),'HEAD',signal);
      if(Number(response.headers.get('content-length'))<=0) throw new Error('video_segment_empty');
    }));
  }
  if(expected.size) throw new Error('video_master_variant_missing');
  if(result.mp4_key) {
    const mp4=await fetch(signedVideoUrl(result.mp4_key,undefined,scope),{headers:{Range:'bytes=0-1023'},signal});
    if(mp4.status!==206) {await mp4.body?.cancel();throw new Error('video_cdn_range_missing');}
    await mp4.body?.cancel();
  }
  // Confirm cache does not bypass token authentication.
  const denied=await fetch(`https://${bunnyVideoConfig().cdn}/${result.master_key}`,{signal});
  await denied.body?.cancel();
  if(denied.status!==403) throw new Error('video_cdn_token_not_enforced');
  const expired=await fetch(signedVideoUrl(result.master_key,Math.floor(Date.now()/1000)-60,scope),{signal:AbortSignal.any([signal,AbortSignal.timeout(15_000)])});
  await expired.body?.cancel();
  if(expired.status!==403) throw new Error('video_cdn_expired_token_not_enforced');
  const checkFolder=await mkdtemp(path.join(tmpdir(),'upcare-video-verify-'));
  try {
    for(const variant of result.variants) {
      const rendition=await (await fetchCdn(variant.playlistKey,'GET',signal)).text();
      const refs=playlistReferences(rendition),init=refs.find(r=>r.endsWith('init.mp4'));
      const media=refs.filter(r=>r.endsWith('.m4s'));
      if(!init || !media.length) throw new Error('video_segments_missing');
      const initialization=Buffer.from(await (await fetchCdn(resolve(variant.playlistKey,init),'GET',signal)).arrayBuffer());
      // Decode the actual first/last CDN bytes, without HLS seek ambiguity or
      // downloading a whole long recording to check its final frame.
      for(const ref of new Set([media[0],media[media.length-1]])) {
        const segment=Buffer.from(await (await fetchCdn(resolve(variant.playlistKey,ref),'GET',signal)).arrayBuffer());
        const file=path.join(checkFolder,'check.mp4');
        await writeFile(file,Buffer.concat([initialization,segment]));
        const raw=await runMedia(ffmpeg,['-hide_banner','-loglevel','error','-threads',String(THREADS),'-i',file,'-map','0:v:0','-an','-f','framemd5','-'],signal,120_000);
        if(!raw.split(/\r?\n/).some(l=>l.trim() && !l.startsWith('#'))) throw new Error('video_cdn_decode_empty');
      }
    }
  }finally{await removeTemp(checkFolder,checkFolder);}
}

export async function downloadLegacyBunnyVideo(sourceKey:string,sourceCdn:string|undefined,file:string,signal:AbortSignal) {
    const host=(sourceCdn || process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '').replace(/^https?:\/\//,'').replace(/\/$/,'');
    const configured=(process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '').replace(/^https?:\/\//,'').replace(/\/$/,'');
    if(!/^[a-z0-9.-]+$/i.test(host) || (host!==configured && !/^[a-z0-9-]+\.b-cdn\.net$/i.test(host)) || !/^[a-f0-9-]{36}$/i.test(sourceKey)) throw new Error('video_legacy_source_invalid');
    const base=`https://${host}/${sourceKey}`;
    const requestSignal=()=>AbortSignal.any([signal,AbortSignal.timeout(15_000)]);
    const headers={Referer:'http://localhost:3000/'};
    const original=await fetch(`${base}/original`,{method:'HEAD',headers,signal:requestSignal()});
    if(original.ok && Number(original.headers.get('content-length'))<=2*1024**3) {
      // Retain original bytes, including MOV/ProRes/audio codecs that cannot
      // be remuxed to MP4. FFmpeg probes the container independently of extension.
      const response=await fetch(`${base}/original`,{headers,signal:AbortSignal.any([signal,AbortSignal.timeout(600_000)])});
      if(!response.ok || !response.body) throw new Error('video_legacy_source_unavailable');
      let count=0;
      const limited=new Transform({transform(chunk:Buffer,_encoding,done){count+=chunk.length;if(count>2*1024**3)done(new Error('video_source_too_large'));else done(null,chunk);}});
      await pipeline(response.body as unknown as NodeJS.ReadableStream,limited,createWriteStream(file),{signal});
    }else {
      const response=await fetch(`${base}/playlist.m3u8`,{headers,signal:requestSignal()});
      if(!response.ok) {await response.body?.cancel();throw new Error('video_legacy_source_unavailable');}
      const chosen=selectLegacyRendition(await response.text(),`${base}/playlist.m3u8`);
      await runMedia(ffmpeg,['-hide_banner','-loglevel','error','-y','-headers','Referer: http://localhost:3000/\r\n','-i',chosen.videoUrl,
        ...(chosen.audioUrl?['-headers','Referer: http://localhost:3000/\r\n','-i',chosen.audioUrl]:[]),
        '-map','0:v:0','-map',chosen.audioUrl?'1:a:0':'0:a:0?','-c','copy','-fs',String(2*1024**3),'-movflags','+faststart','-f','mp4',file],signal);
    }
    const bytes=(await stat(file)).size;
    if(bytes<1 || bytes>=2*1024**3-1024) throw new Error('video_source_invalid_or_size_limit');
    return bytes;
}

async function sourceFile(claim:PipelineClaim,temp:string,signal:AbortSignal) {
  const file=path.join(temp,'source');
  if(claim.asset.source_provider==='cloudfly') {
    const {client,bucket}=getCloudFlyStorage();
    const source=await client.send(new GetObjectCommand({Bucket:bucket,Key:claim.asset.source_key}),{abortSignal:signal});
    if(!source.Body || !source.ContentLength || source.ContentLength>2*1024**3) throw new Error('video_source_invalid');
    await pipeline(source.Body as NodeJS.ReadableStream,createWriteStream(file),{signal});
  } else {
    const bytes=await downloadLegacyBunnyVideo(claim.asset.source_key,claim.asset.source_origin?.cdn,file,signal);
    const {client,bucket}=getCloudFlyStorage(),key=`videos/${claim.asset.id}.mp4`;
    const upload=new Upload({client,params:{Bucket:bucket,Key:key,Body:createReadStream(file),ContentType:'application/octet-stream'},queueSize:2,partSize:16*1024**2,leavePartsOnError:false});
    const abort=()=>void upload.abort();signal.addEventListener('abort',abort,{once:true});
    try {await upload.done();signal.throwIfAborted();}finally{signal.removeEventListener('abort',abort);}
    await pipelineRpc('video_import_source',{p_job_id:claim.job.id,p_lease_token:claim.job.lease_token,p_source_key:key,p_bytes:bytes});
    claim.asset.source_provider='cloudfly';claim.asset.source_key=key;
  }
  return file;
}

export async function processPipelineVideo(claim:PipelineClaim,signal:AbortSignal):Promise<PipelineOutput> {
  await checkWorkerDisk();
  bunnyVideoConfig();
  const temp=await mkdtemp(path.join(tmpdir(),'upcare-video-'));
  const prefix=pipelinePrefix(claim.asset.id,claim.job.lease_token);
  try {
    const source=await sourceFile(claim,temp,signal),info=await probeMedia(source,signal);
    if(claim.job.stage==='base') {
      const folder=path.join(temp,'480');
      if(info.duration*(1_200_000*1.4+96000)/8*2>MAX_TEMP-2*1024**3) throw new Error('video_temp_budget_exceeded');
      const variant=await encodeRendition(source,folder,480,1_200_000,info,signal);
      variant.playlistKey=`${prefix}/480/index.m3u8`;
      const poster=path.join(folder,'poster.jpg');
      await runMedia(ffmpeg,['-hide_banner','-loglevel','error','-y','-threads','1','-ss',String(Math.min(2,info.duration/2)),'-i',path.join(folder,'fallback.mp4'),'-frames:v','1',poster],signal,60_000);
      await uploadFolder(folder,`${prefix}/480`,signal,true);
      const result:PipelineOutput={master_key:`${prefix}/master.m3u8`,mp4_key:`${prefix}/480/fallback.mp4`,poster_key:`${prefix}/480/poster.jpg`,variants:[variant],duration_sec:info.duration,width:info.width,height:info.height};
      const master=path.join(temp,'master.m3u8');
      await writeFile(master,masterPlaylist(result.variants,result.master_key));
      await uploadBunnyVideoFile(result.master_key,master,signal);
      await verifyCdnOutput(result,signal);
      return result;
    }
    const variants=[...claim.asset.variants];
    const ladder=[{height:360,rate:700000},{height:720,rate:2600000},{height:1080,rate:6000000},{height:1440,rate:10000000}].filter(v=>v.height<info.height && !variants.some(a=>a.height===v.height));
    if(!variants.some(v=>v.height===Math.floor(info.height/2)*2)) ladder.push({height:info.height,rate:Math.min(18000000,Math.max(700000,info.width*info.height*3))});
    for(const level of ladder) {
      await checkWorkerDisk(Math.max(3*1024**3,Math.min(MAX_TEMP,info.duration*(level.rate*1.4+128000)/8*2+1024**3)));
      if(info.duration*(level.rate*1.4+128000)/8*2>MAX_TEMP-2*1024**3) throw new Error('video_temp_budget_exceeded');
      const folder=path.join(temp,String(level.height));
      const variant=await encodeRendition(source,folder,level.height,level.rate,info,signal);
      variant.playlistKey=`${prefix}/${level.height}/index.m3u8`;
      await uploadFolder(folder,`${prefix}/${level.height}`,signal);
      variants.push(variant);
      await removeTemp(folder,temp);
    }
    variants.sort((a,b)=>a.height-b.height);
    const result:PipelineOutput={master_key:`${prefix}/master.m3u8`,variants,duration_sec:info.duration,width:info.width,height:info.height};
    const master=path.join(temp,'master.m3u8');
    await writeFile(master,masterPlaylist(variants,result.master_key));
    await uploadBunnyVideoFile(result.master_key,master,signal);
    await verifyCdnOutput(result,signal);
    return result;
  }finally{await removeTemp(temp,temp);}
}
