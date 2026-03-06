import { NextRequest, NextResponse } from 'next/server';

const BUNNY_API_KEY = process.env.BUNNY_STREAM_API_KEY;
const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID;

export async function POST(request: NextRequest) {
  try {
    if (!BUNNY_API_KEY || !LIBRARY_ID) {
      console.error('[Bunny Upload] Missing configuration:', {
        hasApiKey: !!BUNNY_API_KEY,
        hasLibraryId: !!LIBRARY_ID
      });
      return NextResponse.json(
        { error: 'Thiếu cấu hình Bunny Stream API. Vui lòng kiểm tra BUNNY_STREAM_API_KEY và BUNNY_STREAM_LIBRARY_ID trong environment variables.' },
        { status: 500 }
      );
    }

    const { title } = await request.json();

    console.log('[Bunny Upload] Creating video with title:', title);
    console.log('[Bunny Upload] Library ID:', LIBRARY_ID);

    // Create video in Bunny.net
    const response = await fetch(
      `https://video.bunnycdn.com/library/${LIBRARY_ID}/videos`,
      {
        method: 'POST',
        headers: {
          'AccessKey': BUNNY_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: title || 'Untitled Video' }),
      }
    );

    const responseText = await response.text();
    console.log('[Bunny Upload] Response status:', response.status);
    console.log('[Bunny Upload] Response text:', responseText);

    if (!response.ok) {
      let errorMessage = 'Failed to create video';
      try {
        const errorData = JSON.parse(responseText);
        errorMessage = errorData.Message || errorData.message || errorMessage;
      } catch (e) {
        errorMessage = responseText || `HTTP ${response.status}: ${response.statusText}`;
      }
      console.error('[Bunny Upload] Error:', errorMessage);
      return NextResponse.json(
        { error: errorMessage, status: response.status },
        { status: response.status }
      );
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('[Bunny Upload] Failed to parse response:', e);
      return NextResponse.json(
        { error: 'Invalid response from Bunny API' },
        { status: 500 }
      );
    }

    console.log('[Bunny Upload] Video created successfully:', data.guid || data.id);
    return NextResponse.json(data);
  } catch (error: any) {
    console.error('[Bunny Upload] Unexpected error:', error);
    return NextResponse.json(
      { error: error.message || 'Unexpected error occurred' },
      { status: 500 }
    );
  }
}
