import { randomUUID } from 'node:crypto';
import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand,
} from '@aws-sdk/client-s3';
import { getCloudFlyStorage, isCloudFlyVideoKey } from '@/lib/cloudfly-s3';

export type VideoAssetStatus = 'queued' | 'processing' | 'ready' | 'failed';

export type VideoVariant = {
  width: number;
  height: number;
  bandwidth: number;
  playlistKey: string;
};

export type VideoAsset = {
  source_key: string;
  status: VideoAssetStatus;
  optimized_key: string | null;
  hls_master_key: string | null;
  poster_key: string | null;
  variants: VideoVariant[];
  duration_sec: number | null;
  width: number | null;
  height: number | null;
  attempts: number;
  available_at: string;
  lease_token: string | null;
  lease_until: string | null;
  error_code: string | null;
  created_at: string;
  updated_at: string;
};

function objectKeys(sourceKey: string) {
  if (!isCloudFlyVideoKey(sourceKey)) throw new Error('Invalid video source key.');
  const id = sourceKey.match(/^videos\/([0-9a-f-]{36})\./i)?.[1];
  if (!id) throw new Error('Invalid video source key.');
  return { queue: `video-queue/${id}.json`, ready: `videos-optimized/${id}/v2/asset.json` };
}

function missing(error: unknown): boolean {
  const code = (error as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } }) || {};
  return code.name === 'NoSuchKey' || code.name === 'NotFound' || code.Code === 'NoSuchKey'
    || code.$metadata?.httpStatusCode === 404;
}

async function readAsset(objectKey: string): Promise<VideoAsset | null> {
  const { client, bucket } = getCloudFlyStorage();
  try {
    const result = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    const raw = await result.Body?.transformToString();
    if (!raw) throw new Error('Empty video asset object.');
    return JSON.parse(raw) as VideoAsset;
  } catch (error) {
    if (missing(error)) return null;
    throw error;
  }
}

async function writeAsset(objectKey: string, asset: VideoAsset): Promise<void> {
  const { client, bucket } = getCloudFlyStorage();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: objectKey,
    Body: JSON.stringify(asset),
    ContentType: 'application/json',
    CacheControl: 'private, no-store',
  }));
}

export async function getVideoAsset(sourceKey: string): Promise<VideoAsset | null> {
  if (!isCloudFlyVideoKey(sourceKey)) return null;
  const keys = objectKeys(sourceKey);
  const ready = await readAsset(keys.ready);
  if (ready?.source_key === sourceKey && ready.status === 'ready') return ready;
  const id = sourceKey.match(/^videos\/([0-9a-f-]{36})\./i)?.[1];
  if (id) {
    const previous = await readAsset(`videos-optimized/${id}/v1/asset.json`);
    if (previous?.source_key === sourceKey && previous.status === 'ready') return previous;
  }
  const queued = await readAsset(keys.queue);
  return queued?.source_key === sourceKey ? queued : null;
}

export async function queueVideoAsset(sourceKey: string): Promise<void> {
  const keys = objectKeys(sourceKey);
  const { client, bucket } = getCloudFlyStorage();
  const [ready, queued] = await Promise.all([
    client.send(new HeadObjectCommand({ Bucket: bucket, Key: keys.ready })).then(() => true).catch(error => {
      if (missing(error)) return false;
      throw error;
    }),
    client.send(new HeadObjectCommand({ Bucket: bucket, Key: keys.queue })).then(() => true).catch(error => {
      if (missing(error)) return false;
      throw error;
    }),
  ]);
  if (ready || queued) return;
  const now = new Date().toISOString();
  await writeAsset(keys.queue, {
    source_key: sourceKey, status: 'queued',
    optimized_key: null, hls_master_key: null, poster_key: null, variants: [],
    duration_sec: null, width: null, height: null, attempts: 0,
    available_at: now, lease_token: null, lease_until: null, error_code: null,
    created_at: now, updated_at: now,
  });
}

export async function claimVideoAsset(sourceKey?: string): Promise<VideoAsset | null> {
  const { client, bucket } = getCloudFlyStorage();
  let continuation: string | undefined;
  do {
    let entries: Array<{ Key?: string }>;
    if (sourceKey) {
      entries = [{ Key: objectKeys(sourceKey).queue }];
    } else {
      const page = await client.send(new ListObjectsV2Command({
        Bucket: bucket, Prefix: 'video-queue/', ContinuationToken: continuation, MaxKeys: 100,
      }));
      entries = page.Contents || [];
      continuation = page.NextContinuationToken;
    }
    for (const entry of entries) {
      if (!entry.Key?.endsWith('.json')) continue;
      const asset = await readAsset(entry.Key);
      if (!asset || !isCloudFlyVideoKey(asset.source_key)) continue;
      const keys = objectKeys(asset.source_key);
      if (await readAsset(keys.ready)) {
        await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keys.queue }));
        continue;
      }
      if (asset.status === 'failed' || asset.attempts >= 3) continue;
      if (asset.status === 'queued' && Date.parse(asset.available_at) > Date.now()) continue;
      if (asset.status === 'processing' && Date.parse(asset.lease_until || '') > Date.now()) continue;
      const now = new Date().toISOString();
      const claimed: VideoAsset = {
        ...asset, status: 'processing', attempts: asset.attempts + 1,
        lease_token: randomUUID(), lease_until: new Date(Date.now() + 30 * 60_000).toISOString(),
        error_code: null, updated_at: now,
      };
      await writeAsset(keys.queue, claimed);
      return claimed;
    }
    if (sourceKey) return null;
  } while (continuation);
  return null;
}

export async function heartbeatVideoAsset(asset: VideoAsset): Promise<void> {
  if (!asset.lease_token) throw new Error('Video asset lease missing.');
  const key = objectKeys(asset.source_key).queue;
  const current = await readAsset(key);
  if (current?.lease_token !== asset.lease_token || current.status !== 'processing') throw new Error('Video asset lease lost.');
  await writeAsset(key, {
    ...current, lease_until: new Date(Date.now() + 30 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  });
}

export async function markVideoAssetReady(
  asset: VideoAsset,
  result: Pick<VideoAsset, 'optimized_key' | 'hls_master_key' | 'poster_key' | 'variants' | 'duration_sec' | 'width' | 'height'>,
): Promise<void> {
  if (!asset.lease_token) throw new Error('Video asset lease missing.');
  const keys = objectKeys(asset.source_key);
  const current = await readAsset(keys.queue);
  if (current?.lease_token !== asset.lease_token || current.status !== 'processing') {
    throw new Error('Video asset lease lost before publication.');
  }
  const { client, bucket } = getCloudFlyStorage();
  await writeAsset(keys.ready, {
    ...current, ...result, status: 'ready', error_code: null,
    lease_token: null, lease_until: null, updated_at: new Date().toISOString(),
  });
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: keys.queue }));
}

export async function markVideoAssetFailed(asset: VideoAsset, errorCode: string): Promise<void> {
  if (!asset.lease_token) return;
  const key = objectKeys(asset.source_key).queue;
  const current = await readAsset(key);
  if (current?.lease_token !== asset.lease_token || current.status !== 'processing') return;
  const retry = asset.attempts < 3;
  const backoffMinutes = 2 ** Math.max(0, asset.attempts - 1);
  await writeAsset(key, {
    ...current,
    status: retry ? 'queued' : 'failed',
    error_code: errorCode.replace(/[^a-z0-9_]/gi, '_').slice(0, 80),
    available_at: new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
    lease_token: null,
    lease_until: null,
    updated_at: new Date().toISOString(),
  });
}
