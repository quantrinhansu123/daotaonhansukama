/**
 * Utility functions for Bunny Storage URL conversion
 */

/**
 * Convert storage.bunnycdn.com URL to CDN URL (public, no auth required)
 * @param url - Original storage URL
 * @returns CDN URL or original URL if conversion fails
 */
export function convertStorageUrlToCdn(url: string | null | undefined): string | null {
  if (!url) return null;
  
  // If already CDN URL, return as is
  if (url.includes('b-cdn.net') || url.includes('/api/banner')) {
    return url;
  }
  
  // Convert storage.bunnycdn.com to CDN URL
  if (url.includes('storage.bunnycdn.com')) {
    const storageCdnUrl = process.env.NEXT_PUBLIC_BUNNY_STORAGE_CDN_URL || 'upcarezone.b-cdn.net';
    const urlMatch = url.match(/storage\.bunnycdn\.com\/[^\/]+\/(.+)$/);
    if (urlMatch && urlMatch[1]) {
      const cdnUrl = `https://${storageCdnUrl}/${urlMatch[1]}`;
      console.log('🔄 Converted storage URL to CDN:', url, '→', cdnUrl);
      return cdnUrl;
    }
  }
  
  return url;
}

/**
 * Get public URL for Bunny Storage file (always returns CDN URL or proxy)
 * @param url - Storage URL or CDN URL
 * @returns Public accessible URL
 */
export function getPublicBunnyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  const cdnUrl = convertStorageUrlToCdn(url);
  if (!cdnUrl) return null;
  
  // If still storage URL, use proxy
  if (cdnUrl.includes('storage.bunnycdn.com')) {
    return `/api/banner?url=${encodeURIComponent(cdnUrl)}`;
  }
  
  return cdnUrl;
}
