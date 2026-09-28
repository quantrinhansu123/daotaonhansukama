import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFlyStorage, isCloudFlyVideoKey } from '@/lib/cloudfly-s3';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'CloudFly playback tạm khóa trên môi trường công khai cho đến khi có xác thực phía server.' }, { status: 503 });
  }
  const key = request.nextUrl.searchParams.get('key') || '';
  if (!isCloudFlyVideoKey(key)) {
    return NextResponse.json({ error: 'Mã video CloudFly không hợp lệ.' }, { status: 400 });
  }
  try {
    const { client, bucket } = getCloudFlyStorage();
    const signedUrl = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn: 60 * 60,
    });
    const response = NextResponse.redirect(signedUrl, 307);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch (error) {
    console.error('[CloudFly] Could not sign playback URL:', error);
    return NextResponse.json({ error: 'Không tạo được link phát video CloudFly.' }, { status: 502 });
  }
}
