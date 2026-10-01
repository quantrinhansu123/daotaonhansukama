import { AbortMultipartUploadCommand,HeadObjectCommand } from '@aws-sdk/client-s3';
import { getCloudFlyStorage } from '../lib/cloudfly-s3';
import { requirePipelineEnvironment } from '../lib/video-pipeline-config';
import { claimPipelineJob,completeVideoUpload,failPipelineJob,finishPipelineJob,heartbeatPipelineJob,pipelineDb,pipelineRpc } from '../lib/video-pipeline-db';
import { checkWorkerDisk,processPipelineVideo } from './pipeline-transcode';

const delay=(ms:number)=>new Promise(r=>setTimeout(r,ms));
export async function reconcilePipelineUploads() {
  const {data,error}=await pipelineDb().from('video_assets').select('id,source_key,expected_bytes,upload_id,created_at').eq('environment',requirePipelineEnvironment())
    .eq('status','uploading').eq('source_provider','cloudfly').lt('updated_at',new Date(Date.now()-60_000).toISOString()).order('updated_at').limit(20);
  if(error) throw new Error(`video_database_${error.code}`);
  const {client,bucket}=getCloudFlyStorage();
  for(const a of data || []) {
    let missing=false;
    const object=await client.send(new HeadObjectCommand({Bucket:bucket,Key:a.source_key}),{abortSignal:AbortSignal.timeout(15_000)}).catch((e:{$metadata?:{httpStatusCode?:number}})=>{missing=e.$metadata?.httpStatusCode===404;return null;});
    if(object?.ContentLength===a.expected_bytes) {await completeVideoUpload(a.id);continue;}
    if(missing && a.upload_id && Date.now()-Date.parse(a.created_at)>24*3600_000) {
      await client.send(new AbortMultipartUploadCommand({Bucket:bucket,Key:a.source_key,UploadId:a.upload_id}),{abortSignal:AbortSignal.timeout(15_000)}).catch(()=>{});
      await pipelineRpc('video_cancel_upload',{p_asset_id:a.id});
    }else {
      // Rotate incomplete sessions so the oldest 20 cannot starve recovery of
      // later uploads whose completion response was lost.
      const {error:rotationError}=await pipelineDb().from('video_assets').update({updated_at:new Date().toISOString()}).eq('environment',requirePipelineEnvironment()).eq('id',a.id).eq('status','uploading');
      if(rotationError) throw new Error(`video_database_${rotationError.code}`);
    }
  }
}
export async function runPipelineWorker() {
  const env=requirePipelineEnvironment();
  if(env!=='development' && !process.argv.includes('--production-worker')) throw new Error('Local worker refuses production jobs');
  const selected=process.argv.find(x=>x.startsWith('--asset='))?.slice(8);
  const once=process.argv.includes('--once') || Boolean(selected);
  let stopping=false,current:AbortController|undefined,lastReconcile=0;
  const stop=()=>{stopping=true;current?.abort();};
  process.once('SIGINT',stop);process.once('SIGTERM',stop);
  console.info('[video-worker] started',{environment:env,concurrency:1,threads:2});
  while(!stopping) {
    try {
      await checkWorkerDisk();
      if(Date.now()-lastReconcile>60_000) {await reconcilePipelineUploads();lastReconcile=Date.now();}
      const claim=await claimPipelineJob(selected);
      if(!claim) {if(once) break;await delay(3000);continue;}
      current=new AbortController();
      const controller=current;
      const timer=setInterval(()=>{void heartbeatPipelineJob(claim).then(ok=>{if(!ok)controller.abort();}).catch(()=>controller.abort());},30_000);
      const started=Date.now();
      console.info('[video-worker] processing',{assetId:claim.asset.id,stage:claim.job.stage,attempt:claim.job.attempts});
      try {
        const result=await processPipelineVideo(claim,controller.signal);
        controller.signal.throwIfAborted();
        await finishPipelineJob(claim,result);
        console.info('[video-worker] published',{assetId:claim.asset.id,stage:claim.job.stage,seconds:Math.round((Date.now()-started)/1000)});
      }catch(error) {
        const code=error instanceof Error?error.message.split(':')[0].replace(/[^a-z0-9_]/gi,'_').slice(0,80):'video_processing_failed';
        await failPipelineJob(claim,code).catch(()=>{});
        console.error('[video-worker] failed',{assetId:claim.asset.id,stage:claim.job.stage,code});
      }finally{clearInterval(timer);current=undefined;}
      if(once) break;
    }catch(error) {
      console.error('[video-worker] unavailable',{code:error instanceof Error?error.message.split(':')[0]:'unknown'});
      if(once) throw error;
      await delay(10_000);
    }
  }
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);
}
