import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFlyStorage } from '@/lib/cloudfly-s3';
import { authorizeVideoSource } from '@/lib/video-access-server';
import { getVideoAsset, queueVideoAsset } from '@/lib/video-assets-server';
import { issueVideoToken } from '@/lib/video-token-server';

export const runtime = 'nodejs';

const URL_SECONDS = 2 * 60 * 60;

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') || '';
  try {
    const actor = await authorizeVideoSource(request, key);
    if (actor instanceof NextResponse) return actor;

    const { client, bucket } = getCloudFlyStorage();
    const asset = await getVideoAsset(key).catch(error => {
      console.error('[video-resolve] Asset lookup failed:', error instanceof Error ? error.message : error);
      return null;
    });
    if (!asset || asset.hls_master_key?.includes('/v1/')) {
      await queueVideoAsset(key).catch(error => {
        console.error('[video-resolve] Could not queue source:', error instanceof Error ? error.message : error);
      });
    }

    const { token, expiresAt: tokenExpiresAt } = issueVideoToken(key);
    const common = { status: asset?.status || 'queued', expiresAt: tokenExpiresAt };
    const headers = { 'Cache-Control': 'private, no-store' };

    if (asset?.status === 'ready' && asset.optimized_key) {
      const [url, posterUrl] = await Promise.all([
        getSignedUrl(client, new GetObjectCommand({
          Bucket: bucket, Key: asset.optimized_key, ResponseContentType: 'video/mp4',
        }), { expiresIn: URL_SECONDS }),
        asset.poster_key
          ? getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: asset.poster_key }), { expiresIn: URL_SECONDS })
          : Promise.resolve(undefined),
      ]);
      const playlistVersion = asset.hls_master_key?.match(/\/(v[12])\/hls\/master\.m3u8$/)?.[1] || 'v2';
      const hlsUrl = asset.hls_master_key
        ? `/api/cloudfly/video/hls?key=${encodeURIComponent(key)}&version=${playlistVersion}&path=master.m3u8&token=${encodeURIComponent(token)}`
        : undefined;
      return NextResponse.json({
        status: 'ready', url, hlsUrl, posterUrl, sourceQualityAvailable: playlistVersion === 'v2',
        expiresAt: Date.now() + URL_SECONDS * 1000,
        tokenExpiresAt,
      }, { headers });
    }

    // Keep original uploads watchable while the worker/backfill catches up.
    const legacyUrl = `/api/cloudfly/video/play?key=${encodeURIComponent(key)}&token=${encodeURIComponent(token)}`;
    return NextResponse.json({ ...common, status: 'legacy', url: legacyUrl, processing: asset?.status !== 'failed' }, { headers });
  } catch (error) {
    console.error('[video-resolve] Failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Chưa chuẩn bị được video.' }, { status: 503 });
  }
}
