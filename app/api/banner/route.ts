import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get('url');

    console.log('[Banner Proxy] Request received:', { url });

    if (!url) {
      console.error('[Banner Proxy] Missing URL parameter');
      return NextResponse.json(
        { error: 'URL parameter is required' },
        { status: 400 }
      );
    }

    // Validate URL is from Bunny Storage
    if (!url.includes('storage.bunnycdn.com') && !url.includes('b-cdn.net')) {
      return NextResponse.json(
        { error: 'Invalid URL' },
        { status: 400 }
      );
    }

    // Always use storage hostname with AccessKey (CDN may be suspended)
    // Don't convert to CDN URL - use storage directly with authentication
    let fetchUrl = url;
    const storagePassword = process.env.NEXT_PUBLIC_BUNNY_STORAGE_PASSWORD;
    
    // If URL is already storage hostname, use it directly
    // If URL is CDN URL, try to convert back to storage URL
    if (url.includes('b-cdn.net') && !url.includes('storage.bunnycdn.com')) {
      // Try to convert CDN URL back to storage URL
      const storageZone = process.env.NEXT_PUBLIC_BUNNY_STORAGE_ZONE || 'upcarestr';
      const urlMatch = url.match(/https?:\/\/[^\/]+\/(.+)$/);
      if (urlMatch && urlMatch[1]) {
        const path = urlMatch[1];
        fetchUrl = `https://storage.bunnycdn.com/${storageZone}/${path}`;
        console.log('[Banner Proxy] Converted CDN URL to storage:', url, '→', fetchUrl);
      }
    }
    
    // Always use AccessKey for storage hostname (required for access)
    console.log('[Banner Proxy] Fetching from:', fetchUrl);
    console.log('[Banner Proxy] Has AccessKey:', !!storagePassword);
    
    const imageResponse = await fetch(fetchUrl, {
      headers: {
        'AccessKey': storagePassword || '',
        'User-Agent': 'Mozilla/5.0',
      },
    });

    console.log('[Banner Proxy] Response status:', imageResponse.status);

    if (!imageResponse.ok) {
      const errorText = await imageResponse.text();
      console.error('[Banner Proxy] Failed to fetch:', {
        url: fetchUrl,
        status: imageResponse.status,
        statusText: imageResponse.statusText,
        error: errorText
      });
      // Return a transparent 1x1 pixel as fallback instead of error
      const transparentPixel = Buffer.from(
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
        'base64'
      );
      return new NextResponse(transparentPixel, {
        status: 200,
        headers: {
          'Content-Type': 'image/gif',
          'Cache-Control': 'no-cache',
        },
      });
    }

    // Get image data
    const imageBuffer = await imageResponse.arrayBuffer();
    const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

    // Return image with proper headers
    return new NextResponse(imageBuffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('[Banner Proxy] Error:', error);
    // Return transparent pixel instead of error
    const transparentPixel = Buffer.from(
      'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
      'base64'
    );
    return new NextResponse(transparentPixel, {
      status: 200,
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'no-cache',
      },
    });
  }
}
