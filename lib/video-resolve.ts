import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { getSupabaseClient } from '@/lib/supabase-client';
import type { VideoTarget } from './video-pipeline-types';

export type ResolvedVideo = {
  status: 'ready' | 'legacy';
  url: string;
  hlsUrl?: string;
  posterUrl?: string;
  sourceQualityAvailable?: boolean;
  expiresAt: number;
  tokenExpiresAt?: number;
  processing?: boolean;
  assetId?:string;
  version?:string;
};

const cache = new Map<string, { promise: Promise<ResolvedVideo>; until: number }>();

export async function resolveVideo(sourceKey: string, force = false): Promise<ResolvedVideo> {
  const session = (await getSupabaseClient().auth.getSession()).data.session;
  if (!session?.user?.id) throw new Error('Bạn cần đăng nhập để xem video.');
  const cacheKey = `${session.user.id}:${sourceKey}`;
  const hit = cache.get(cacheKey);
  if (!force && hit && hit.until > Date.now()) return hit.promise;

  const promise = authenticatedFetch(`/api/cloudfly/video/resolve?key=${encodeURIComponent(sourceKey)}`)
    .then(async response => {
      const payload = await response.json().catch(() => ({})) as ResolvedVideo & { error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error || `Không tải được video (HTTP ${response.status}).`);
      const seconds = payload.status === 'ready' ? 60 : 10;
      cache.set(cacheKey, { promise: Promise.resolve(payload), until: Math.min(Date.now() + seconds * 1000, payload.expiresAt - 60_000) });
      return payload;
    })
    .catch(error => {
      cache.delete(cacheKey);
      throw error;
    });
  cache.set(cacheKey, { promise, until: Date.now() + 10_000 });
  return promise;
}

export function forgetResolvedVideo(sourceKey: string): void {
  for (const key of cache.keys()) if (key.endsWith(`:${sourceKey}`)) cache.delete(key);
}

export async function resolvePlaybackSource(target:VideoTarget|undefined,fallback:()=>Promise<ResolvedVideo>|ResolvedVideo,pinned?:{assetId:string;version:string}):Promise<ResolvedVideo> {
  if(!target || process.env.NEXT_PUBLIC_VIDEO_PIPELINE_ENABLED!=='true') return fallback();
  const session=(await getSupabaseClient().auth.getSession()).data.session;
  if(!session) throw new Error('Bạn cần đăng nhập để xem video.');
  return authenticatedFetch(`/api/video/resolve?targetType=${target.targetType}&targetId=${encodeURIComponent(target.targetId)}${pinned?`&assetId=${encodeURIComponent(pinned.assetId)}&version=${encodeURIComponent(pinned.version)}`:''}`)
    .then(async r=>{
      const result=await r.json();
      if(!r.ok) throw new Error(result.error || 'Video chưa được xuất bản.');
      if(['disabled','legacy'].includes(result.status)) return fallback();
      if(!result.hlsUrl || !result.url) throw new Error('Thiếu bản video đã chuẩn hóa.');
      // Each new open checks current publication. Existing viewers explicitly
      // pin their immutable version when refreshing authentication.
      return result as ResolvedVideo;
    });
}
