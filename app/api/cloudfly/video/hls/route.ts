import path from 'node:path';
import { Readable } from 'node:stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { NextRequest, NextResponse } from 'next/server';
import { getCloudFlyStorage, isCloudFlyVideoKey } from '@/lib/cloudfly-s3';
import { verifyVideoToken } from '@/lib/video-token-server';

export const runtime = 'nodejs';

function safePath(value: string): boolean {
  return value === 'master.m3u8'
    || /^\d{2,4}\/(?:index\.m3u8|init\.mp4|seg_\d{5}\.m4s)$/.test(value);
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key') || '';
  const version = request.nextUrl.searchParams.get('version') || 'v2';
  const relative = request.nextUrl.searchParams.get('path') || '';
  const token = request.nextUrl.searchParams.get('token') || '';
  if (!isCloudFlyVideoKey(key) || !/^v[12]$/.test(version) || !safePath(relative) || !verifyVideoToken(key, token)) {
    return NextResponse.json({ error: 'Không có quyền tải video.' }, { status: 403 });
  }
  const id = key.match(/^videos\/([0-9a-f-]{36})\./i)?.[1];
  if (!id) return NextResponse.json({ error: 'Video không hợp lệ.' }, { status: 400 });
  const objectKey = `videos-optimized/${id}/${version}/hls/${relative}`;

  try {
    const { client, bucket } = getCloudFlyStorage();
    if (!relative.endsWith('.m3u8')) {
      // Signed CloudFly GET responses still omit CORS headers, so a browser
      // media-source player cannot read them. Keep this proxy for callers
      // that still request HLS. Progressive MP4 playback uses the signed URL.
      const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }), {
        abortSignal: request.signal,
      });
      if (!object.Body) return NextResponse.json({ error: 'Đoạn video trống.' }, { status: 502 });
      const headers: Record<string, string> = {
        'Content-Type': relative.endsWith('.m4s') ? 'video/iso.segment' : 'video/mp4',
        'Cache-Control': 'private, max-age=86400, immutable',
      };
      if (object.ContentLength !== undefined) headers['Content-Length'] = String(object.ContentLength);
      return new NextResponse(Readable.toWeb(object.Body as Readable) as ReadableStream, { headers });
    }

    const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: objectKey }));
    const body = await object.Body?.transformToString();
    if (!body) return NextResponse.json({ error: 'Danh sách phát trống.' }, { status: 502 });
    const withToken = (child: string) => {
      const next = path.posix.normalize(path.posix.join(path.posix.dirname(relative), child));
      if (!safePath(next)) throw new Error('Unsafe video playlist path.');
      return `/api/cloudfly/video/hls?key=${encodeURIComponent(key)}&version=${version}&path=${encodeURIComponent(next)}&token=${encodeURIComponent(token)}`;
    };
    const rewritten = body.split(/\r?\n/).map(line => {
      if (line.startsWith('#EXT-X-MAP:')) {
        return line.replace(/URI="([^"]+)"/, (_match, child: string) => `URI="${withToken(child)}"`);
      }
      if (line && !line.startsWith('#')) return withToken(line.trim());
      return line;
    }).join('\n');
    return new NextResponse(rewritten, {
      headers: {
        'Content-Type': 'application/vnd.apple.mpegurl',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    console.error('[video-hls] Delivery failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Không tải được video đã xử lý.' }, { status: 502 });
  }
}
