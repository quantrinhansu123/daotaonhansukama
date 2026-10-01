import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requirePipelineEnvironment } from './video-pipeline-config';
import type { PipelineAsset, PipelineClaim, PipelineOutput, VideoTarget } from './video-pipeline-types';

let client: SupabaseClient | undefined;
export function pipelineDb() {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase server configuration');
  client = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  return client;
}
export async function pipelineRpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data,error } = await pipelineDb().rpc(name,{...args,p_environment:requirePipelineEnvironment()});
  if (error) throw new Error(`video_database_${error.code || 'error'}: ${error.message}`);
  return data as T;
}
export async function reserveVideo(input: VideoTarget & { id:string; ownerId:string; provider:'cloudfly'|'bunny'; key:string; uploadId?:string; size?:number }) {
  return pipelineRpc<PipelineAsset>('video_reserve',{
    p_asset_id:input.id,p_owner_id:input.ownerId,p_target_type:input.targetType,p_target_id:input.targetId,
    p_source_provider:input.provider,p_source_key:input.key,p_upload_id:input.uploadId || null,p_expected_bytes:input.size || null,
  });
}
export const completeVideoUpload = (id:string) => pipelineRpc<PipelineAsset>('video_complete_upload',{p_asset_id:id});
export const claimPipelineJob = (id?:string) => pipelineRpc<PipelineClaim|null>('video_claim',{p_asset_id:id || null});
export const heartbeatPipelineJob = (claim:PipelineClaim) => pipelineRpc<boolean>('video_heartbeat',{p_job_id:claim.job.id,p_lease_token:claim.job.lease_token});
export const finishPipelineJob = (claim:PipelineClaim,result:PipelineOutput) => pipelineRpc<boolean>('video_finish',{p_job_id:claim.job.id,p_lease_token:claim.job.lease_token,p_result:result});
export const failPipelineJob = (claim:PipelineClaim,code:string) => pipelineRpc<boolean>('video_fail',{p_job_id:claim.job.id,p_lease_token:claim.job.lease_token,p_error_code:code});
export async function getPipelineAsset(id:string):Promise<PipelineAsset|null> {
  const {data,error}=await pipelineDb().from('video_assets').select('*').eq('environment',requirePipelineEnvironment()).eq('id',id).maybeSingle();
  if(error) throw new Error(`video_database_${error.code}`);
  return data;
}
