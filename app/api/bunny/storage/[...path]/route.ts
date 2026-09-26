import { NextRequest, NextResponse } from 'next/server';
import { fetchViaPublicDns } from '@/lib/bunny-dns';

export const runtime = 'nodejs';

/**
 * Proxy ảnh/file Storage qua storage.bunnycdn.com + AccessKey.
 * (Pull zone upcarezone.b-cdn.net đang 403 hotlink — không dùng CDN.)
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const zone = process.env.NEXT_PUBLIC_BUNNY_STORAGE_ZONE;
  const password = process.env.NEXT_PUBLIC_BUNNY_STORAGE_PASSWORD;

  if (!zone || !password) {
    return NextResponse.json({ error: 'Thiếu cấu hình Bunny Storage' }, { status: 500 });
  }

  const { path } = await context.params;
  if (!path?.length) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  const objectPath = path.map((segment) => encodeURIComponent(segment)).join('/');
  const target = `https://storage.bunnycdn.com/${zone}/${objectPath}`;

  try {
    // storage.bunnycdn.com thường resolve được trên DNS local; vẫn fallback public DNS
    let upstream: Response;
    try {
      upstream = await fetch(target, {
        headers: { AccessKey: password, Accept: '*/*' },
        cache: 'no-store',
      });
    } catch {
      upstream = await fetchViaPublicDns(target, {
        headers: { AccessKey: password, Accept: '*/*' },
      });
    }

    if (!upstream.ok) {
      console.error('[bunny/storage]', upstream.status, target);
      return new NextResponse(await upstream.text().catch(() => 'Storage error'), {
        status: upstream.status,
      });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await upstream.arrayBuffer());

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[bunny/storage] fetch failed', target, error);
    return NextResponse.json({ error: 'Không tải được từ Bunny Storage.' }, { status: 502 });
  }
}
