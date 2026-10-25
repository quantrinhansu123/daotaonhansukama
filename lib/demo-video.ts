import { proxyBunnyUrl } from '@/lib/bunny-media';
import { allowedBunnyStreamHost, configuredBunnyStreamHost } from './bunny-stream-hosts';

const CLOUDFLY_VIDEO_KEY = /^videos\/[0-9a-f-]{36}\.(?:mp4|webm|mov|mkv|avi|mpeg|3gp)$/i;
const BUNNY_VIDEO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bunnyStreamPlaylistUrl(videoId: string, cdnHost?: string): string | null {
  const host = cdnHost || configuredBunnyStreamHost();
  if (!host || !BUNNY_VIDEO_ID.test(videoId)) return null;
  if (cdnHost) return allowedBunnyStreamHost(cdnHost) ? `/api/bunny/cdn/${cdnHost}/${videoId}/playlist.m3u8` : null;
  return `/api/bunny/cdn/${videoId}/playlist.m3u8`;
}

function bunnyStreamIdFromUrl(value: string): { id: string; cdnHost: string } | null {
  try {
    const host = new URL(value).hostname.toLowerCase();
    if (!allowedBunnyStreamHost(host)) return null;
    const id = new URL(value).pathname.split('/').filter(Boolean)[0] || '';
    return BUNNY_VIDEO_ID.test(id) ? { id, cdnHost: host } : null;
  } catch {
    return null;
  }
}

export type DemoVideoSource =
  | { kind: 'cloudfly'; key: string }
  | { kind: 'bunny'; id: string; cdnHost?: string }
  | { kind: 'file'; url: string };

/** Nhận video demo CloudFly, mã Bunny cũ, hoặc link file. */
export function resolveDemoVideo(videoKey?: string | null, legacyId?: string | null): DemoVideoSource | null {
  const key = videoKey?.trim() || '';
  const legacy = legacyId?.trim() || '';
  if (CLOUDFLY_VIDEO_KEY.test(key)) return { kind: 'cloudfly', key };
  if (CLOUDFLY_VIDEO_KEY.test(legacy)) return { kind: 'cloudfly', key: legacy };
  const bunnyUrlId = legacy ? bunnyStreamIdFromUrl(legacy) : null;
  if (bunnyUrlId) return { kind: 'bunny', ...bunnyUrlId };
  if (/^https?:\/\//i.test(legacy)) return { kind: 'file', url: proxyBunnyUrl(legacy) };
  if (BUNNY_VIDEO_ID.test(legacy)) return { kind: 'bunny', id: legacy };
  if (BUNNY_VIDEO_ID.test(key)) return { kind: 'bunny', id: key };
  return null;
}
