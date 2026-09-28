import { randomUUID } from 'node:crypto';
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextRequest, NextResponse } from 'next/server';
import { CLOUDFLY_VIDEO_PREFIX, getCloudFlyStorage, isCloudFlyVideoKey } from '@/lib/cloudfly-s3';
import { authorizeRequest } from '@/lib/server-auth';

export const runtime = 'nodejs';
const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const PART_BYTES = 16 * 1024 * 1024;
const MIME_EXTENSION: Record<string, string> = {
  'video/mp4': 'mp4', 'application/mp4': 'mp4', 'video/webm': 'webm',
  'video/quicktime': 'mov', 'video/x-matroska': 'mkv',
  'video/x-msvideo': 'avi', 'video/mpeg': 'mpeg', 'video/3gpp': '3gp',
};

function uploadParams(body: unknown): { key: string; uploadId: string } | null {
  if (!body || typeof body !== 'object') return null;
  const value = body as Record<string, unknown>;
  if (typeof value.key !== 'string' || !isCloudFlyVideoKey(value.key)
      || typeof value.uploadId !== 'string' || value.uploadId.length < 8 || value.uploadId.length > 512) return null;
  return { key: value.key, uploadId: value.uploadId };
}

export async function POST(request: NextRequest) {
  const actor = await authorizeRequest(request, ['admin', 'teacher']);
  if (actor instanceof NextResponse) return actor;
  const body = await request.json().catch(() => null) as { mime?: unknown; size?: unknown } | null;
  const mime = typeof body?.mime === 'string' ? body.mime.toLowerCase().trim() : '';
  const size = Number(body?.size);
  const extension = MIME_EXTENSION[mime];
  if (!extension || !Number.isSafeInteger(size) || size < 1 || size > MAX_BYTES) {
    return NextResponse.json({ error: 'Chỉ nhận video MP4, MOV, MKV, AVI hoặc WebM, tối đa 2 GB.' }, { status: 400 });
  }
  const { client, bucket } = getCloudFlyStorage();
  const key = `${CLOUDFLY_VIDEO_PREFIX}${randomUUID()}.${extension}`;
  let uploadId: string | undefined;
  try {
    const created = await client.send(new CreateMultipartUploadCommand({
      Bucket: bucket, Key: key, ContentType: mime, ContentDisposition: 'inline',
    }));
    uploadId = created.UploadId;
    if (!uploadId) throw new Error('CloudFly did not return an upload ID');
    const partCount = Math.ceil(size / PART_BYTES);
    const urls = await Promise.all(Array.from({ length: partCount }, (_, index) =>
      getSignedUrl(client, new UploadPartCommand({
        Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: index + 1,
      }), { expiresIn: 6 * 60 * 60 }),
    ));
    return NextResponse.json({ key, uploadId, partSize: PART_BYTES, urls });
  } catch (error) {
    if (uploadId) await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId })).catch(() => {});
    console.error('[CloudFly] Multipart start failed:', error);
    return NextResponse.json({ error: 'Không khởi tạo được tải video lên CloudFly.' }, { status: 502 });
  }
}

export async function PATCH(request: NextRequest) {
  const actor = await authorizeRequest(request, ['admin', 'teacher']);
  if (actor instanceof NextResponse) return actor;
  const body = await request.json().catch(() => null);
  const target = uploadParams(body);
  const parts = (body as { parts?: unknown } | null)?.parts;
  const expectedSize = (body as { size?: unknown } | null)?.size;
  if (!target || !Array.isArray(parts) || !parts.length || parts.length > Math.ceil(MAX_BYTES / PART_BYTES)
      || !Number.isSafeInteger(expectedSize) || Number(expectedSize) < 1 || Number(expectedSize) > MAX_BYTES
      || parts.some((part, index) => !part || part.partNumber !== index + 1
        || typeof part.etag !== 'string' || !/^"?[0-9a-f]{32}(?:-[0-9]+)?"?$/i.test(part.etag))) {
    return NextResponse.json({ error: 'Danh sách phần video không hợp lệ.' }, { status: 400 });
  }
  const { client, bucket } = getCloudFlyStorage();
  try {
    await client.send(new CompleteMultipartUploadCommand({
      Bucket: bucket, Key: target.key, UploadId: target.uploadId,
      MultipartUpload: { Parts: parts.map(part => ({ PartNumber: part.partNumber, ETag: part.etag })) },
    }));
    const object = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: target.key }));
    if (object.ContentLength !== expectedSize) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: target.key }));
      throw new Error('CloudFly returned an unexpected object size');
    }
    return NextResponse.json({ key: target.key, size: object.ContentLength });
  } catch (error) {
    // CloudFly may finish assembling the object even if the completion response is lost.
    const existing = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: target.key })).catch(() => null);
    const existingSize = existing?.ContentLength;
    if (existingSize === expectedSize) {
      return NextResponse.json({ key: target.key, size: existingSize });
    }
    console.error('[CloudFly] Multipart complete failed:', error);
    return NextResponse.json({ error: 'CloudFly chưa ghép xong video. Vui lòng thử tải lại.' }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest) {
  const actor = await authorizeRequest(request, ['admin', 'teacher']);
  if (actor instanceof NextResponse) return actor;
  const target = uploadParams(await request.json().catch(() => null));
  if (!target) return NextResponse.json({ error: 'Mã tải video không hợp lệ.' }, { status: 400 });
  const { client, bucket } = getCloudFlyStorage();
  try {
    await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: target.key, UploadId: target.uploadId }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[CloudFly] Multipart abort failed:', error);
    return NextResponse.json({ error: 'Không hủy được phiên tải video.' }, { status: 502 });
  }
}
