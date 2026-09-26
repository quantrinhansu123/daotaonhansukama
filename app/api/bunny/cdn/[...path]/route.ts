import { NextRequest, NextResponse } from 'next/server';
import { fetchViaPublicDns } from '@/lib/bunny-dns';

export const runtime = 'nodejs';

function streamCdnHost() {
  return (process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function rewritePlaylist(body: string, pathPrefix: string): string {
  const cdn = streamCdnHost();
  let out = body;
  if (cdn) {
    out = out.replaceAll(`https://${cdn}/`, `${pathPrefix}/`);
    out = out.replaceAll(`http://${cdn}/`, `${pathPrefix}/`);
  }
  // Absolute path segments under CDN root → keep relative to current proxy folder
  return out;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const cdn = streamCdnHost();
  if (!cdn) {
    return NextResponse.json({ error: 'Thiếu NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME' }, { status: 500 });
  }

  const { path } = await context.params;
  if (!path?.length) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  const objectPath = path.map(encodeURIComponent).join('/');
  const target = `https://${cdn}/${objectPath}`;

  try {
    const upstream = await fetchViaPublicDns(target, {
      headers: {
        Accept: request.headers.get('Accept') || '*/*',
      },
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => '');
      console.error('[bunny/cdn]', upstream.status, target, text.slice(0, 200));
      return new NextResponse(text || 'CDN error', { status: upstream.status });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const buf = Buffer.from(await upstream.arrayBuffer());

    // Rewrite m3u8 so segment URLs stay on our proxy
    if (contentType.includes('mpegurl') || objectPath.endsWith('.m3u8')) {
      const base = `/api/bunny/cdn`;
      // If playlist has absolute CDN URLs, rewrite to proxy. Relative URLs resolve against
      // /api/bunny/cdn/{videoId}/... which already maps correctly.
      const text = rewritePlaylist(buf.toString('utf8'), base);
      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.apple.mpegurl',
          'Cache-Control': 'public, max-age=30',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': upstream.headers.get('cache-control') || 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[bunny/cdn] fetch failed', target, error);
    return NextResponse.json({ error: 'Không tải được từ Bunny CDN (DNS/network).' }, { status: 502 });
  }
}
