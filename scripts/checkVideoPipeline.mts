import {pipelineDb} from '../lib/video-pipeline-db';
import {bunnyVideoConfig} from '../lib/bunny-video-delivery';
import {checkWorkerDisk} from '../worker/pipeline-transcode';
import {HeadBucketCommand} from '@aws-sdk/client-s3';
import {getCloudFlyStorage} from '../lib/cloudfly-s3';

let failures=0;
async function check(name:string,action:()=>Promise<unknown>) {
  try{await action();console.log('PASS',name);}catch(e){failures++;console.log('FAIL',name,e instanceof Error?e.message.split(':')[0]:'unavailable');}
}
await check('Supabase migration',async()=>{
  for(const table of ['video_assets','video_jobs','video_bindings']) {
    const {error}=await pipelineDb().from(table).select(table==='video_assets'?'id,environment,source_origin,published_at':'environment').limit(1);
    if(error) throw new Error(`migration_missing_${error.code}`);
  }
  const {error}=await pipelineDb().rpc('video_target_state',{p_environment:'development',p_auth_uid:'00000000-0000-0000-0000-000000000000',p_target_type:'lesson',p_target_id:'__doctor__',p_manage:false});
  if(error) throw new Error(`migration_functions_missing_${error.code}`);
});
await check('CloudFly originals',async()=>{const {client,bucket}=getCloudFlyStorage();await client.send(new HeadBucketCommand({Bucket:bucket}),{abortSignal:AbortSignal.timeout(15_000)});});
await check('10 GB free scratch space',()=>checkWorkerDisk());
await check('private Bunny video configuration',async()=>{
  const c=bunnyVideoConfig();
  const r=await fetch(`https://${c.storageHost}/${c.zone}/`,{headers:{AccessKey:c.password},signal:AbortSignal.timeout(15_000)});
  await r.body?.cancel();if(!r.ok) throw new Error(`private_storage_http_${r.status}`);
});
await check('ES256 JWT signing keys',async()=>{
  const r=await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/.well-known/jwks.json`,{signal:AbortSignal.timeout(10_000)});
  const json=await r.json() as {keys:Array<{alg:string}>};
  if(!r.ok || !json.keys.some(k=>k.alg==='ES256')) throw new Error('ES256_JWKS_unavailable');
});
console.log(failures?'Pipeline cannot be enabled yet.':'Prerequisites passed. Enable development only, restart Next.js, then run inventory/backfill and the worker. CDN publication checks still run on every video.');
process.exitCode=failures?1:0;
