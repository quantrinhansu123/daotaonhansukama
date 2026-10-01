/**
 * Đổi URL Bunny CDN → proxy local khi DNS máy không resolve được *.b-cdn.net.
 * Chạy được cả client lẫn server.
 */
export function proxyBunnyUrl(url?: string | null): string {
  if (!url) return '';

  const configuredStreamCdn = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '';
  const streamLibraryId = process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID || '';
  const streamCdn = (configuredStreamCdn || (streamLibraryId ? `vz-${streamLibraryId}.b-cdn.net` : '')).replace(/^https?:\/\//, '').replace(/\/$/, '');
  const storageCdn = (process.env.NEXT_PUBLIC_BUNNY_STORAGE_CDN_URL || '').replace(/^https?:\/\//, '').replace(/\/$/, '');

  try {
    const parsed = new URL(url);
    const host = parsed.hostname;

    if (streamCdn && host === streamCdn) {
      return `/api/bunny/cdn${parsed.pathname}${parsed.search}`;
    }
    if (storageCdn && host === storageCdn) {
      return `/api/bunny/storage${parsed.pathname}${parsed.search}`;
    }
    // Bất kỳ *.b-cdn.net nào thuộc storage/stream đã biết
    if (host.endsWith('.b-cdn.net')) {
      if (streamCdn && host.startsWith('vz-')) {
        return `/api/bunny/cdn${parsed.pathname}${parsed.search}`;
      }
      return `/api/bunny/storage${parsed.pathname}${parsed.search}`;
    }
  } catch {
    // relative / invalid — giữ nguyên
  }

  return url;
}
