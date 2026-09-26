import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const apiKey = process.env.BUNNY_STREAM_API_KEY;
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;

  if (!apiKey || !libraryId) {
    return NextResponse.json({ error: 'Thiếu cấu hình Bunny Stream trên server.' }, { status: 500 });
  }

  let title: unknown;
  try {
    ({ title } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Dữ liệu video không hợp lệ.' }, { status: 400 });
  }

  if (typeof title !== 'string' || !title.trim() || title.length > 200) {
    return NextResponse.json({ error: 'Tên video phải có từ 1 đến 200 ký tự.' }, { status: 400 });
  }

  try {
    const response = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
      method: 'POST',
      headers: { AccessKey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.trim() }),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('[Bunny Upload] Could not create video:', response.status);
      return NextResponse.json({ error: 'Không tạo được video trên Bunny Stream.' }, { status: 502 });
    }

    const video = await response.json();
    if (typeof video.guid !== 'string' || !video.guid) {
      console.error('[Bunny Upload] Bunny returned no video ID');
      return NextResponse.json({ error: 'Bunny Stream không trả về mã video.' }, { status: 502 });
    }

    const expirationTime = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
    const signature = createHash('sha256')
      .update(`${libraryId}${apiKey}${expirationTime}${video.guid}`)
      .digest('hex');

    return NextResponse.json({
      videoId: video.guid,
      libraryId,
      expirationTime,
      signature,
    });
  } catch (error) {
    console.error('[Bunny Upload] Request failed:', error);
    return NextResponse.json({ error: 'Không kết nối được Bunny Stream.' }, { status: 502 });
  }
}
