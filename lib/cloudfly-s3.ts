import { S3Client } from '@aws-sdk/client-s3';

export const CLOUDFLY_VIDEO_PREFIX = 'videos/';

export function getCloudFlyStorage() {
  const bucket = process.env.CLOUDFLY_S3_BUCKET?.trim();
  const accessKeyId = process.env.CLOUDFLY_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLY_S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error('Thiếu cấu hình CLOUDFLY_S3_BUCKET, CLOUDFLY_S3_ACCESS_KEY_ID hoặc CLOUDFLY_S3_SECRET_ACCESS_KEY.');
  }
  const client = new S3Client({
    endpoint: process.env.CLOUDFLY_S3_ENDPOINT || 'https://s3.cloudfly.vn',
    region: process.env.CLOUDFLY_S3_REGION || 'hn',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { client, bucket };
}

export function isCloudFlyVideoKey(key: string): boolean {
  return /^videos\/[0-9a-f-]{36}\.(?:mp4|webm|mov|mkv|avi|mpeg|3gp)$/i.test(key);
}
