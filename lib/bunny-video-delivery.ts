import { createHmac } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

export function bunnyVideoConfig() {
  const zone=process.env.BUNNY_VIDEO_STORAGE_ZONE;
  const password=process.env.BUNNY_VIDEO_STORAGE_KEY;
  const cdn=process.env.BUNNY_VIDEO_CDN_HOSTNAME?.replace(/^https?:\/\//,'').replace(/\/$/,'');
  const tokenKey=process.env.BUNNY_VIDEO_TOKEN_KEY;
  const storageHost=process.env.BUNNY_VIDEO_STORAGE_HOSTNAME || 'sg.storage.bunnycdn.com';
  if(!zone || !password || !cdn || !tokenKey) throw new Error('Missing private Bunny video storage/CDN configuration');
  if(!/^[a-z0-9.-]+$/i.test(storageHost) || !/^[a-z0-9.-]+$/i.test(cdn) || !/^[a-z0-9_-]+$/i.test(zone)) throw new Error('Invalid Bunny hostname/zone');
  return {zone,password,cdn,tokenKey,storageHost};
}
export function signedVideoUrl(key:string,expires=Math.floor(Date.now()/1000)+7200,scope?:string) {
  if(!/^[a-zA-Z0-9_./-]+$/.test(key) || key.split('/').includes('..')) throw new Error('Invalid CDN video path');
  const {cdn,tokenKey}=bunnyVideoConfig();
  const directory=scope || key.slice(0,key.lastIndexOf('/')+1);
  if(!directory.endsWith('/') || !key.startsWith(directory) || directory.split('/').includes('..') || !/^[a-zA-Z0-9_./-]+$/.test(directory) || !Number.isSafeInteger(expires) || expires<=0) throw new Error('Invalid CDN token scope/expiry');
  const tokenPath='/'+directory;
  const signingData=`token_path=${tokenPath}`;
  const signature=createHmac('sha256',tokenKey).update(tokenPath+expires+signingData).digest('base64url');
  return `https://${cdn}/bcdn_token=HS256-${signature}&expires=${expires}&token_path=${encodeURIComponent(tokenPath)}/${key}`;
}
export function assetScope(key:string) {
  const pieces=key.split('/');
  if(pieces.length<6 || pieces[0]!=='video-pipeline') throw new Error('Invalid asset scope');
  return pieces.slice(0,4).join('/')+'/';
}
export function videoContentType(key:string) {
  if(key.endsWith('.m3u8')) return 'application/vnd.apple.mpegurl';
  if(key.endsWith('.m4s')) return 'video/iso.segment';
  if(key.endsWith('.jpg')) return 'image/jpeg';
  return 'video/mp4';
}
export async function uploadBunnyVideoFile(key:string,file:string,signal?:AbortSignal) {
  const c=bunnyVideoConfig();
  const size=(await stat(file)).size;
  const body=createReadStream(file);
  const response=await fetch(`https://${c.storageHost}/${c.zone}/${key}`,{
    method:'PUT',headers:{AccessKey:c.password,'Content-Type':videoContentType(key),'Content-Length':String(size)},
    body:body as unknown as BodyInit,duplex:'half',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(300_000)]):AbortSignal.timeout(300_000),
  } as RequestInit & {duplex:string});
  await response.body?.cancel();
  if(!response.ok) throw new Error(`bunny_upload_http_${response.status}`);
}
