import { proxyBunnyUrl } from '@/lib/bunny-media';

const CLOUDFLY_VIDEO_KEY = /^videos\/[0-9a-f-]{36}\.(?:mp4|webm|mov|mkv|avi|mpeg|3gp)$/i;
const BUNNY_VIDEO_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (/^https?:\/\//i.test(legacy)) return { kind: 'file', url: proxyBunnyUrl(legacy) };
  if (BUNNY_VIDEO_ID.test(legacy)) return { kind: 'bunny', id: legacy };
  if (BUNNY_VIDEO_ID.test(key)) return { kind: 'bunny', id: key };
  return null;
}
