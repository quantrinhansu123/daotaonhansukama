export type PipelineEnvironment = 'development' | 'production';
export type VideoTarget = { targetType: 'lesson' | 'course_intro'; targetId: string };
export type PipelineAssetStatus = 'uploading' | 'queued' | 'processing' | 'playable' | 'complete' | 'failed' | 'cancelled' | 'source_unavailable';
export type PipelineVariant = { width: number; height: number; bandwidth: number; playlistKey: string; codecs: string };
export type PipelineAsset = {
  id: string; environment: PipelineEnvironment; owner_id: string; target_type: VideoTarget['targetType']; target_id: string;
  source_provider: 'cloudfly' | 'bunny'; source_key: string;
  source_origin:{provider?:string;key?:string;cdn?:string;libraryId?:number;quality?:string}|null;
  published_at:string|null;
  upload_id: string | null; expected_bytes: number | null;
  status: PipelineAssetStatus; error_code: string | null; enhancement_error: string | null;
  mp4_key: string | null; master_key: string | null; poster_key: string | null;
  variants: PipelineVariant[]; duration_sec: number | null; width: number | null; height: number | null;
  created_at: string; updated_at: string;
};
export type PipelineJob = {
  id: string; environment: PipelineEnvironment; asset_id: string; stage: 'base' | 'enhance';
  status: 'queued' | 'processing' | 'done' | 'failed' | 'cancelled'; attempts: number;
  lease_token: string; lease_until: string; error_code: string | null;
};
export type PipelineClaim = { job: PipelineJob; asset: PipelineAsset };
export type PipelineOutput = {
  mp4_key?: string; master_key: string; poster_key?: string; variants: PipelineVariant[];
  duration_sec: number; width: number; height: number;
};
export type VideoBindingState = VideoTarget & {
  revision: number; removed: boolean; active: PipelineAsset | null; pending: PipelineAsset | null;
};
export type VideoUploadResult = { key: string; assetId?: string; status?: PipelineAssetStatus; processingQueued?: boolean; pipeline?: boolean };
export type PublicVideoAsset = Pick<PipelineAsset,'id'|'status'|'source_provider'|'source_key'|'duration_sec'|'width'|'height'|'error_code'|'enhancement_error'|'updated_at'>;
export type PublicVideoBinding = Omit<VideoBindingState,'active'|'pending'> & {active:PublicVideoAsset|null;pending:PublicVideoAsset|null};
