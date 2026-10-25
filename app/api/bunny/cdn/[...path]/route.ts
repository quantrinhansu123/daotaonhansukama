import { NextRequest, NextResponse } from 'next/server';
import { fetchViaPublicDns, streamViaPublicDns } from '@/lib/bunny-dns';
import { allowedBunnyStreamHost, configuredBunnyStreamHost } from '@/lib/bunny-stream-hosts';

export const runtime = 'nodejs';

function rewritePlaylist(body: string, pathPrefix: string, cdn: string): string {
  let out = body;
  if (cdn) {
    out = out.replaceAll(`https://${cdn}/`, `${pathPrefix}/`);
    out = out.replaceAll(`http://${cdn}/`, `${pathPrefix}/`);
  }
  // Absolute path segments under CDN root → keep relative to current proxy folder
  return out.split(/\r?\n/).map(line => {
    if (line.startsWith('#')) {
      return line.replace(/URI="\/(?!\/)([^"]+)"/g, `URI="${pathPrefix}/$1"`);
    }
    return line.startsWith('/') ? `${pathPrefix}${line}` : line;
  }).join('\n');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (!path?.length) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  const explicitHost = path[0].includes('.');
  const cdn = explicitHost ? path[0].toLowerCase() : configuredBunnyStreamHost();
  if (!cdn || !allowedBunnyStreamHost(cdn)) {
    return NextResponse.json({ error: 'Nguồn video không hợp lệ.' }, { status: 400 });
  }
  const objectPath = (explicitHost ? path.slice(1) : path).map(encodeURIComponent).join('/');
  if (!objectPath) return NextResponse.json({ error: 'Missing path' }, { status: 400 });
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
    const base = explicitHost ? `/api/bunny/cdn/${cdn}` : '/api/bunny/cdn';
    const text = rewritePlaylist(buf.toString('utf8'), base, cdn);
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
