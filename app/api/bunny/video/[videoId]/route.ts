import { NextRequest, NextResponse } from 'next/server';

const BUNNY_API_KEY = process.env.BUNNY_STREAM_API_KEY;
const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  try {
    const apiKey = process.env.BUNNY_STREAM_API_KEY || BUNNY_API_KEY;
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID || LIBRARY_ID;

    if (!apiKey || !libraryId) {
      return NextResponse.json(
        { error: 'Thiếu cấu hình Bunny Stream API' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      {
        headers: {
          'AccessKey': apiKey,
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: response.status === 404 ? 'Video không có trong Bunny library hiện tại.' : 'Không lấy được video từ Bunny Stream.' },
        { status: response.status === 404 ? 404 : 502 }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không lấy được video từ Bunny Stream.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  try {
    const apiKey = process.env.BUNNY_STREAM_API_KEY || BUNNY_API_KEY;
    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID || LIBRARY_ID;

    if (!apiKey || !libraryId) {
      return NextResponse.json(
        { error: 'Thiếu cấu hình Bunny Stream API' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://video.bunnycdn.com/library/${libraryId}/videos/${videoId}`,
      {
        method: 'DELETE',
        headers: {
          'AccessKey': apiKey,
        },
      }
    );

    if (response.status === 404) {
      return NextResponse.json(
        { error: 'Video không có trong Bunny library hiện tại.', notFound: true },
        { status: 404 }
      );
    }
    if (!response.ok) {
      return NextResponse.json({ error: 'Không xóa được video trên Bunny Stream.' }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không xóa được video trên Bunny Stream.' },
      { status: 500 }
    );
  }
}
