// Origins present in the legacy lesson records. Keep requests restricted to
// project CDNs; a lesson URL must never turn the media route into an open proxy.
const LEGACY_STREAM_HOSTS = new Set([
  'vz-1884cf8e-4d7.b-cdn.net',
  'vz-69258c0a-d89.b-cdn.net',
  'vz-5f22800c-fe2.b-cdn.net',
  'vz-cfc10078-3eb.b-cdn.net',
]);

export function configuredBunnyStreamHost(): string {
  const configured = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '';
  const libraryId = process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID || '';
  return (configured || (libraryId ? `vz-${libraryId}.b-cdn.net` : '')).replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
}

export function allowedBunnyStreamHost(host: string): boolean {
  return /^[a-z0-9.-]+$/.test(host) && (LEGACY_STREAM_HOSTS.has(host) || host === configuredBunnyStreamHost());
}
