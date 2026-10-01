import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {inventoryTargets,inspectVideoSources} from '../lib/video-pipeline-inventory';
import {pipelineDb,reserveVideo,completeVideoUpload} from '../lib/video-pipeline-db';
import {pipelineEnvironment,requirePipelineEnvironment} from '../lib/video-pipeline-config';
import type {PipelineAsset} from '../lib/video-pipeline-types';

const queue=process.argv.includes('--queue');
if(queue && requirePipelineEnvironment()!=='development') throw new Error('Backfill currently only accepts development; no production bindings changed');
const course=process.argv.find(a=>a.startsWith('--course-id='))?.slice(12);
const videos=await inspectVideoSources((await inventoryTargets()).filter(v=>!course || v.courseId===course));
const environment=pipelineEnvironment() || 'development';
const {data:bindings,error}=await pipelineDb().from('video_bindings').select('*,active:video_assets!video_bindings_environment_active_asset_id_fkey(*),pending:video_assets!video_bindings_environment_pending_asset_id_fkey(*)').eq('environment',environment);
if(queue && error) throw new Error('Apply video pipeline migration before queueing');
for(const video of videos) {
  const binding=bindings?.find(b=>b.target_type===video.targetType && b.target_id===video.targetId);
  video.pipelineStatus=error?'migration_not_applied':binding?.removed?'removed':binding?.pending?.status || binding?.active?.status || 'not_imported';
  video.activeAssetId=binding?.active_asset_id || undefined;video.pendingAssetId=binding?.pending_asset_id || undefined;
  if(!queue || video.provider==='unsupported') continue;
  if(!video.reachable && !video.sourceStatus.includes('404') && !video.sourceStatus.includes('source_missing')) continue;
  // Never overwrite a newer teacher upload, a deliberately removed video, or an active migration.
  const existing=(binding?.pending || binding?.active) as PipelineAsset|undefined;
  if(existing && existing.source_provider===video.provider && existing.source_key===video.source && existing.status==='source_unavailable' && video.reachable && !binding?.removed) {
    const {error:recoveryError}=await pipelineDb().from('video_assets').update({status:'uploading',error_code:null,source_origin:video.provider==='bunny'?{provider:'bunny',key:video.source,cdn:video.recoveredCdn,libraryId:video.recoveredLibraryId}:existing.source_origin}).eq('environment',environment).eq('id',existing.id).eq('status','source_unavailable');
    if(recoveryError) throw new Error('Unable to restore recovered source');
    await completeVideoUpload(existing.id);video.pipelineStatus='queued';continue;
  }
  if(existing && existing.source_provider===video.provider && existing.source_key===video.source && existing.status==='uploading' && video.reachable) {
    await completeVideoUpload(existing.id);video.pipelineStatus='queued';continue;
  }
  if(binding?.removed || existing) continue;
  const assetId=randomUUID();
  await reserveVideo({...video,id:assetId,ownerId:video.ownerId,provider:video.provider,key:video.source,size:video.sourceBytes});
  if(video.provider==='bunny' && video.recoveredCdn) {
    const {error:metadataError}=await pipelineDb().from('video_assets').update({source_origin:{provider:'bunny',key:video.source,cdn:video.recoveredCdn,libraryId:video.recoveredLibraryId}}).eq('environment',environment).eq('id',assetId);
    if(metadataError) throw new Error('Unable to record recovered legacy source');
  }
  if(video.reachable) {await completeVideoUpload(assetId);video.pipelineStatus='queued';}
  else {
    const {error:missingError}=await pipelineDb().from('video_assets').update({status:'source_unavailable',error_code:'source_recovery_or_reupload_required'}).eq('environment',environment).eq('id',assetId);
    if(missingError) throw new Error('Unable to record unavailable source');
    video.pipelineStatus='source_unavailable';
  }
  video.pendingAssetId=assetId;
}
const summary={total:videos.length,cloudfly:videos.filter(v=>v.provider==='cloudfly').length,bunny:videos.filter(v=>v.provider==='bunny').length,reachable:videos.filter(v=>v.reachable).length,requiresRecovery:videos.filter(v=>!v.reachable).length,measured:0};
await mkdir('.local-backups',{recursive:true});
await writeFile('.local-backups/video-pipeline-inventory.json',JSON.stringify({generatedAt:new Date().toISOString(),environment,mode:queue?'queue':'read_only',summary,videos},null,2));
console.table(videos.map(v=>({type:v.targetType,title:v.title,source:v.provider,access:v.sourceStatus,pipeline:v.pipelineStatus,firstFrame:'not measured'})));
console.log(summary,'Report: .local-backups/video-pipeline-inventory.json');
