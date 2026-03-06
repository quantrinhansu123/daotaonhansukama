import { NextRequest, NextResponse } from 'next/server';

const BUNNY_API_KEY = process.env.BUNNY_STREAM_API_KEY;
const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  const { videoId } = await params;
  try {
    if (!BUNNY_API_KEY || !LIBRARY_ID) {
      return NextResponse.json(
        { error: 'Thiếu cấu hình Bunny Stream API' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${videoId}`,
      {
        headers: {
          'AccessKey': BUNNY_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to get video');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
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
    if (!BUNNY_API_KEY || !LIBRARY_ID) {
      return NextResponse.json(
        { error: 'Thiếu cấu hình Bunny Stream API' },
        { status: 500 }
      );
    }

    const response = await fetch(
      `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos/${videoId}`,
      {
        method: 'DELETE',
        headers: {
          'AccessKey': BUNNY_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error('Failed to delete video');
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
