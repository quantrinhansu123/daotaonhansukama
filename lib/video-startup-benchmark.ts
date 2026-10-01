'use client';
import {authenticatedFetch} from './authenticated-fetch';
import {attachVideoPlayback,type PlaybackHandle} from './video-playback';
import type {ResolvedVideo} from './video-resolve';
import type {VideoTarget} from './video-pipeline-types';

export type BenchmarkTarget=VideoTarget & {title:string;published:boolean};
export type StartupTrial={targetId:string;title:string;trial:number;concurrency:number;scenario:'single'|'same_video'|'different_videos';startedAt:string;firstFrameMs:number|null;authMs:number|null;manifestMs:number|null;segmentMs:number|null;decodeMs:number|null;segmentCache:string|null;error:string|null;frameCallback:boolean};
export async function measureVideoStartup(target:BenchmarkTarget,trial:number,concurrency:number,video:HTMLVideoElement,signal:AbortSignal,scenario:StartupTrial['scenario']=concurrency===1?'single':'same_video'):Promise<{result:StartupTrial;destroy:()=>void}> {
  const started=performance.now(),startedAt=new Date().toISOString();
  let handle:PlaybackHandle|undefined,frameCallback:number|undefined,timer:ReturnType<typeof setTimeout>;
  const result:StartupTrial={targetId:target.targetId,title:target.title,trial,concurrency,scenario,startedAt,firstFrameMs:null,authMs:null,manifestMs:null,segmentMs:null,decodeMs:null,segmentCache:null,error:null,frameCallback:'requestVideoFrameCallback' in video};
  let onAbort=()=>{},onError=()=>{};
  const destroy=()=>{clearTimeout(timer);signal.removeEventListener('abort',onAbort);video.removeEventListener('error',onError);if(frameCallback!==undefined)video.cancelVideoFrameCallback?.(frameCallback);handle?.destroy();video.pause();video.removeAttribute('src');video.load();};
  const firstFrame=new Promise<void>((resolve,reject)=>{
    const mark=()=>{result.firstFrameMs=performance.now()-started;clearTimeout(timer);resolve();};
    if(result.frameCallback) frameCallback=video.requestVideoFrameCallback(mark);
    else video.addEventListener('playing',()=>requestAnimationFrame(mark),{once:true});
    onError=()=>reject(new Error('media_error'));video.addEventListener('error',onError,{once:true});
    timer=setTimeout(()=>reject(new Error('startup_timeout_12000ms')),12_000);
    onAbort=()=>reject(new Error('cancelled'));signal.addEventListener('abort',onAbort,{once:true});
  });
  // Install rejection handling immediately, before the authorization request.
  const completed=firstFrame.catch(e=>{result.error=e instanceof Error?e.message:'startup_failed';});
  try {
    signal.throwIfAborted();video.muted=true;video.playsInline=true;video.controls=true;video.preload='none';
    const response=await authenticatedFetch(`/api/video/resolve?targetType=${target.targetType}&targetId=${encodeURIComponent(target.targetId)}&benchmark=true`,{signal:AbortSignal.any([signal,AbortSignal.timeout(12_000)]),cache:'no-store'});
    const source=await response.json() as ResolvedVideo & {error?:string};result.authMs=performance.now()-started;
    if(!response.ok || source.status!=='ready' || !source.hlsUrl) throw new Error(source.error || 'not_published');
    if(signal.aborted || result.error) throw new Error(result.error || 'cancelled');
    handle=await attachVideoPlayback(video,source,{signal,onCdnResponse:(url,cache)=>{if(url.endsWith('.m4s') && result.segmentCache===null)result.segmentCache=cache;}});
    void video.play().catch(e=>{if(result.firstFrameMs===null && !signal.aborted)result.error=e instanceof Error?e.message:'autoplay_failed';});
    await completed;
    const resources=performance.getEntriesByType('resource').filter(e=>e.startTime>=started) as PerformanceResourceTiming[];
    const tokenPrefix=source.hlsUrl.slice(0,source.hlsUrl.indexOf('/video-pipeline/'));
    const own=resources.filter(e=>e.name.startsWith(tokenPrefix));
    const manifest=own.find(e=>e.name.endsWith('master.m3u8')),segment=own.find(e=>e.name.endsWith('.m4s'));
    if(manifest?.responseEnd) result.manifestMs=manifest.responseEnd-manifest.startTime;
    if(segment?.responseEnd) {result.segmentMs=segment.responseEnd-segment.startTime;result.decodeMs=result.firstFrameMs===null?null:Math.max(0,started+result.firstFrameMs-segment.responseEnd);}
  }catch(e){result.error=e instanceof Error?e.message:'startup_failed';destroy();}
  if(result.error) {result.firstFrameMs=null;destroy();}
  return {result,destroy};
}
export function startupSummary(results:StartupTrial[]) {
  const values=results.map(r=>r.error || r.firstFrameMs===null?Infinity:r.firstFrameMs).sort((a,b)=>a-b);
  const p95=values.length?values[Math.ceil(values.length*.95)-1]:Infinity;
  return {trials:values.length,failures:results.filter(r=>r.error || r.firstFrameMs===null || r.firstFrameMs>=4000).length,p95Ms:Number.isFinite(p95)?p95:null,allBelow4s:values.length>0 && values.every(v=>v<4000)};
}
