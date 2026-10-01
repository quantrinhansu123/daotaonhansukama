import { proxyBunnyUrl } from '@/lib/bunny-media';

const CLOUDFLY_VIDEO_KEY = /^videos\/[0-9a-f-]{36}\.(?:mp4|webm|mov|mkv|avi|mpeg|3gp)$/i;
const BUNNY_VIDEO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function bunnyStreamPlaylistUrl(videoId: string): string | null {
  const configuredHost = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '';
  const libraryId = process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID || '';
  const host = configuredHost || (libraryId ? `vz-${libraryId}.b-cdn.net` : '');
  if (!host || !BUNNY_VIDEO_ID.test(videoId)) return null;
  return `/api/bunny/cdn/${videoId}/playlist.m3u8`;
}

function bunnyStreamIdFromUrl(value: string): string | null {
  try {
    const host = new URL(value).hostname.toLowerCase();
    const configuredHost = (process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '').replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
    const libraryId = process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID || '';
    const defaultHost = libraryId ? `vz-${libraryId}.b-cdn.net`.toLowerCase() : '';
    if (!configuredHost && !defaultHost) return null;
    if (host !== configuredHost && host !== defaultHost) return null;
    const id = new URL(value).pathname.split('/').filter(Boolean)[0] || '';
    return BUNNY_VIDEO_ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

export type DemoVideoSource =
  | { kind: 'cloudfly'; key: string }
  | { kind: 'bunny'; id: string }
  | { kind: 'file'; url: string };

/** Nhận video demo CloudFly, mã Bunny cũ, hoặc link file. */
export function resolveDemoVideo(videoKey?: string | null, legacyId?: string | null): DemoVideoSource | null {
  const key = videoKey?.trim() || '';
  const legacy = legacyId?.trim() || '';
  if (CLOUDFLY_VIDEO_KEY.test(key)) return { kind: 'cloudfly', key };
  if (CLOUDFLY_VIDEO_KEY.test(legacy)) return { kind: 'cloudfly', key: legacy };
  const bunnyUrlId = legacy ? bunnyStreamIdFromUrl(legacy) : null;
  if (bunnyUrlId) return { kind: 'bunny', id: bunnyUrlId };
  if (/^https?:\/\//i.test(legacy)) return { kind: 'file', url: proxyBunnyUrl(legacy) };
  if (BUNNY_VIDEO_ID.test(legacy)) return { kind: 'bunny', id: legacy };
  if (BUNNY_VIDEO_ID.test(key)) return { kind: 'bunny', id: key };
  return null;
}
