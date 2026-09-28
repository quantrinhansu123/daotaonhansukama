import { NextRequest, NextResponse } from 'next/server';
import { fetchViaPublicDns, streamViaPublicDns } from '@/lib/bunny-dns';

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

  const isPlaylist = objectPath.endsWith('.m3u8');

  try {
    if (!isPlaylist) {
      const upstream = await streamViaPublicDns(target, {
        headers: { Accept: request.headers.get('Accept') || '*/*' },
      });
      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text().catch(() => '');
        console.error('[bunny/cdn]', upstream.status, target, text.slice(0, 200));
        return new NextResponse(text || 'CDN error', { status: upstream.status });
      }
      const headers = new Headers();
      headers.set('Content-Type', upstream.headers.get('content-type') || 'video/mp2t');
      const length = upstream.headers.get('content-length');
      if (length) headers.set('Content-Length', length);
      headers.set('Cache-Control', 'public, max-age=86400');
      headers.set('Access-Control-Allow-Origin', '*');
      return new NextResponse(upstream.body, { status: 200, headers });
    }

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

    const buf = Buffer.from(await upstream.arrayBuffer());
    const base = `/api/bunny/cdn`;
    const text = rewritePlaylist(buf.toString('utf8'), base);
    return new NextResponse(text, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'public, max-age=30',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('[bunny/cdn] fetch failed', target, error);
    return NextResponse.json({ error: 'Không tải được từ Bunny CDN (DNS/network).' }, { status: 502 });
  }
}
