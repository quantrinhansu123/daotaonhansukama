import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { Upload } from '@aws-sdk/lib-storage';
import { NextRequest, NextResponse } from 'next/server';
import { CLOUDFLY_VIDEO_PREFIX, getCloudFlyStorage } from '@/lib/cloudfly-s3';
import { authorizeRequest } from '@/lib/server-auth';

export const runtime = 'nodejs';
const MAX_VIDEO_BYTES = 2 * 1024 * 1024 * 1024;

export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true' || process.env.NEXT_PUBLIC_FIREBASE_AUTH_ENABLED === 'true') {
    const authorized = await authorizeRequest(request, ['admin', 'teacher']);
    if (authorized instanceof NextResponse) return authorized;
  } else if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CloudFly upload tạm khóa cho đến khi chuyển sang Firebase Auth.' }, { status: 503 });
  }
  const mime = request.headers.get('content-type')?.split(';')[0].toLowerCase();
  const extensions: Record<string, string> = {
    'video/mp4': 'mp4',
    'application/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'video/x-msvideo': 'avi',
    'video/mpeg': 'mpeg',
    'video/3gpp': '3gp',
  };
  const extension = mime ? extensions[mime] : null;
  const size = Number(request.headers.get('content-length'));
  if (!extension || !Number.isSafeInteger(size) || size < 1 || size > MAX_VIDEO_BYTES || !request.body) {
    return NextResponse.json({ error: 'Chỉ nhận video MP4, MOV, MKV, AVI hoặc WebM, tối đa 2 GB.' }, { status: 400 });
  }

  try {
    const { client, bucket } = getCloudFlyStorage();
    const key = `${CLOUDFLY_VIDEO_PREFIX}${randomUUID()}.${extension}`;
    const body = Readable.fromWeb(request.body as unknown as NodeReadableStream);
    const upload = new Upload({
      client,
      params: {
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: mime,
        ContentDisposition: 'inline',
      },
      queueSize: 2,
      partSize: 8 * 1024 * 1024,
      leavePartsOnError: false,
    });
    await upload.done();
    return NextResponse.json({ key });
  } catch (error) {
    console.error('[CloudFly] Video upload failed:', error);
    return NextResponse.json({
      error: error instanceof Error && error.message.startsWith('Thiếu cấu hình')
        ? error.message
        : 'Không tải được video lên CloudFly. Kiểm tra bucket, khóa S3 và kết nối.',
    }, { status: 502 });
  }
}
