import type { PipelineEnvironment } from './video-pipeline-types';

// Opt-in only. A normal Vercel deployment keeps the existing production path.
export function pipelineEnvironment(): PipelineEnvironment | null {
  const value = process.env.VIDEO_PIPELINE_ENV;
  if (!value) return null;
  if (value !== 'development' && value !== 'production') throw new Error('VIDEO_PIPELINE_ENV must be development or production');
  if (process.env.VERCEL_ENV === 'production' && value === 'development') throw new Error('Development video pipeline cannot run on production');
  return value;
}

export function requirePipelineEnvironment(): PipelineEnvironment {
  const environment = pipelineEnvironment();
  if (!environment) throw new Error('Set VIDEO_PIPELINE_ENV explicitly before running the worker');
  return environment;
}

export function pipelinePrefix(assetId: string, leaseToken: string) {
  if (!/^[a-f0-9-]{36}$/i.test(assetId) || !/^[a-f0-9-]{36}$/i.test(leaseToken)) throw new Error('Invalid pipeline identity');
  return `video-pipeline/${requirePipelineEnvironment()}/v3/${assetId}/${leaseToken}`;
}
