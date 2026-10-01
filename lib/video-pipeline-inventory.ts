import {HeadObjectCommand,GetObjectCommand} from '@aws-sdk/client-s3';
import {getCloudFlyStorage,isCloudFlyVideoKey} from './cloudfly-s3';
import {pipelineDb} from './video-pipeline-db';
import type {VideoTarget} from './video-pipeline-types';

type Document={id:string;data:Record<string,unknown>};
export type InventoryVideo=VideoTarget & {
  title:string;courseId:string;ownerId:string;provider:'cloudfly'|'bunny'|'unsupported';source:string;
  reachable:boolean;sourceStatus:string;sourceBytes?:number;legacyStatus?:string;duration?:number;
  recoveredCdn?:string;recoveredLibraryId?:number;pipelineStatus?:string;activeAssetId?:string;pendingAssetId?:string;
  firstFrameMs:null;measurementStatus:'not_measured';
};
async function documents(collection:string):Promise<Document[]> {
  const rows:Document[]=[];
  for(let offset=0;;offset+=500) {
    const {data,error}=await pipelineDb().from('app_documents').select('id,data').eq('collection',collection).order('id').range(offset,offset+499);
    if(error) throw new Error(`inventory_database_${error.code}`);
    rows.push(...(data || []));if(!data || data.length<500) return rows;
  }
}
export async function inventoryTargets() {
  const [courses,lessons]=await Promise.all([documents('courses'),documents('lessons')]);
  const map=new Map(courses.map(c=>[c.id,c]));
  const videos:InventoryVideo[]=[];
  for(const [type,rows] of [['course_intro',courses],['lesson',lessons]] as const) for(const item of rows) {
    const raw=type==='lesson'?(item.data.videoKey || item.data.videoId || item.data.videoUrl):(item.data.demoVideoKey || item.data.demoVideoId);
    if(typeof raw!=='string' || !raw.trim()) continue;
    const course=type==='course_intro'?item:map.get(String(item.data.courseId)),source=raw.trim();
    let bunnyId=/^[a-f0-9-]{36}$/i.test(source)?source:undefined;
    try {
      const url=new URL(source),host=process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME?.replace(/^https?:\/\//,'').replace(/\/$/,'');
      if(url.hostname===host || url.hostname.endsWith('.b-cdn.net')) bunnyId=url.pathname.split('/').find(p=>/^[a-f0-9-]{36}$/i.test(p));
    }catch{}
    videos.push({targetType:type,targetId:item.id,title:String(item.data.title || item.id),courseId:course?.id || String(item.data.courseId || ''),
      ownerId:String(course?.data.teacherId || 'migration'),provider:isCloudFlyVideoKey(source)?'cloudfly':bunnyId?'bunny':'unsupported',source:bunnyId || source,
      reachable:false,sourceStatus:'unchecked',firstFrameMs:null,measurementStatus:'not_measured'});
  }
  return videos;
}
type Library={Id:number;ApiKey?:string;ReadOnlyApiKey?:string;PullZoneId:number};
async function accountGet<T>(path:string):Promise<T> {
  const r=await fetch(`https://api.bunny.net${path}`,{headers:{AccessKey:process.env.BUNNY_ACCOUNT_API_KEY!},signal:AbortSignal.timeout(15_000)});
  if(!r.ok){await r.body?.cancel();throw new Error(`bunny_account_http_${r.status}`);}return r.json() as Promise<T>;
}
const arrayItems=<T>(value:T[]|{Items:T[]})=>Array.isArray(value)?value:value.Items || [];
export async function inspectVideoSources(videos:InventoryVideo[]) {
  const {client,bucket}=getCloudFlyStorage();
  let libraries:Library[]=[];
  if(process.env.BUNNY_ACCOUNT_API_KEY) libraries=arrayItems(await accountGet<Library[]|{Items:Library[]}>('/videolibrary?perPage=1000'));
  const hosts=new Map<number,string>();
  const cdn=(process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '').replace(/^https?:\/\//,'').replace(/\/$/,'');
  const currentLibrary=process.env.BUNNY_STREAM_LIBRARY_ID || process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID;
  async function checkBunny(video:InventoryVideo,libraryId:string|number,apiKey:string|undefined,hostname:string) {
    let status=0,metadata:{status?:number;length?:number}={};
    if(apiKey) {
      const response=await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${video.source}`,{headers:{AccessKey:apiKey},signal:AbortSignal.timeout(15_000)});
      status=response.status;
      if(response.ok) metadata=await response.json();else await response.body?.cancel();
    }
    if(!/^[a-z0-9.-]+$/i.test(hostname)) return false;
    const r=await fetch(`https://${hostname}/${video.source}/playlist.m3u8`,{headers:{Referer:'http://localhost:3000/'},signal:AbortSignal.timeout(15_000)});
    const valid=r.ok && (await r.text()).startsWith('#EXTM3U');if(!r.ok) await r.body?.cancel();
    if(valid) {
      Object.assign(video,{reachable:true,sourceStatus:'available',recoveredCdn:hostname,recoveredLibraryId:Number(libraryId),duration:metadata.length,legacyStatus:metadata.status===4?'ready':`bunny_status_${metadata.status ?? status}`});
      return true;
    }
    video.sourceStatus=`bunny_api_${status || 'unconfigured'}_cdn_${r.status}`;return false;
  }
  for(const video of videos) {
    try {
      if(video.provider==='cloudfly') {
        const object=await client.send(new HeadObjectCommand({Bucket:bucket,Key:video.source}),{abortSignal:AbortSignal.timeout(15_000)});
        video.sourceBytes=object.ContentLength;video.reachable=Boolean(object.ContentLength);video.sourceStatus=video.reachable?'available':'empty';
        const id=video.source.split('/')[1].split('.')[0];
        for(const key of [`videos-optimized/${id}/v2/asset.json`,`videos-optimized/${id}/v1/asset.json`,`video-queue/${id}.json`]) {
          const asset=await client.send(new GetObjectCommand({Bucket:bucket,Key:key}),{abortSignal:AbortSignal.timeout(10_000)}).catch(()=>null);
          if(asset?.Body) {
            const metadata=JSON.parse(await asset.Body.transformToString()) as {status?:string;duration_sec?:number};
            video.legacyStatus=metadata.status;video.duration=metadata.duration_sec;break;
          }
        }
      } else if(video.provider==='bunny') {
        if(await checkBunny(video,currentLibrary || '',process.env.BUNNY_STREAM_API_KEY,cdn)) continue;
        for(const library of libraries) {
          if(String(library.Id)===currentLibrary) continue;
          const key=library.ReadOnlyApiKey || library.ApiKey;if(!key) continue;
          const r=await fetch(`https://video.bunnycdn.com/library/${library.Id}/videos/${video.source}`,{headers:{AccessKey:key},signal:AbortSignal.timeout(15_000)});
          await r.body?.cancel();if(!r.ok) continue;
          let hostname=hosts.get(library.Id);
          if(!hostname) {
            const zone=await accountGet<{Hostnames:Array<{Value:string}>}>(`/pullzone/${library.PullZoneId}`);
            hostname=zone.Hostnames.find(h=>h.Value.endsWith('.b-cdn.net'))?.Value;
            if(hostname) hosts.set(library.Id,hostname);
          }
          if(hostname && await checkBunny(video,library.Id,key,hostname)) break;
        }
        if(!video.reachable) video.sourceStatus+='; requires_source_recovery_or_reupload';
      }else video.sourceStatus='unsupported_source_requires_reupload';
    }catch(error) {
      const status=(error as {$metadata?:{httpStatusCode?:number}})?.$metadata?.httpStatusCode;
      video.sourceStatus=status===404?'source_missing_requires_reupload':'source_check_failed_retry';
    }
  }
  return videos;
}
