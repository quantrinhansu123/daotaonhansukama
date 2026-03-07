import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    console.log('[Upload API] Receiving request...');
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const path = formData.get('path') as string;

    console.log('[Upload API] File:', file?.name, file?.size, 'bytes');
    console.log('[Upload API] Path:', path);

    if (!file || !path) {
      console.error('[Upload API] Missing file or path');
      return NextResponse.json(
        { error: 'File và path là bắt buộc' },
        { status: 400 }
      );
    }

    const storageZone = process.env.NEXT_PUBLIC_BUNNY_STORAGE_ZONE;
    const storagePassword = process.env.NEXT_PUBLIC_BUNNY_STORAGE_PASSWORD;
    const storageHostname = process.env.NEXT_PUBLIC_BUNNY_STORAGE_HOSTNAME;
    // Use Bunny Stream CDN (same as video) for serving files
    const streamCdnUrl = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;
    const storageCdnUrl = process.env.NEXT_PUBLIC_BUNNY_STORAGE_CDN_URL;

    // Debug: Log all config values (without exposing full password)
    console.log('[Upload API] Config check:', {
      hasStorageZone: !!storageZone,
      storageZone: storageZone,
      hasStoragePassword: !!storagePassword,
      passwordLength: storagePassword?.length || 0,
      passwordFirst8: storagePassword?.substring(0, 8) || 'missing',
      hasStorageHostname: !!storageHostname,
      storageHostname: storageHostname,
    });

    if (!storageZone || !storagePassword || !storageHostname) {
      console.error('[Upload API] Missing Bunny config:', {
        storageZone: !!storageZone,
        storagePassword: !!storagePassword,
        storageHostname: !!storageHostname,
      });
      return NextResponse.json(
        { error: 'Thiếu cấu hình Bunny Storage' },
        { status: 500 }
      );
    }

    // Validate AccessKey format
    if (!storagePassword || storagePassword.trim() === '') {
      console.error('[Upload API] Invalid AccessKey');
      return NextResponse.json(
        { error: 'AccessKey không hợp lệ' },
        { status: 500 }
      );
    }

    // Convert file to buffer
    console.log('[Upload API] Converting to buffer...');
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log('[Upload API] Buffer size:', buffer.length);

    // Upload to Bunny Storage
    // URL format: https://storage.bunnycdn.com/{storageZone}/{path}
    // Use AccessKey header with storage zone password (FTP password)
    const uploadUrl = `https://${storageHostname}/${storageZone}/${path}`;
    const trimmedPassword = storagePassword.trim();
    
    console.log('[Upload API] Uploading to Bunny:', uploadUrl);
    console.log('[Upload API] Storage Zone:', storageZone);
    console.log('[Upload API] Path:', path);
    console.log('[Upload API] File type:', file.type);
    console.log('[Upload API] File size:', buffer.length, 'bytes');
    console.log('[Upload API] AccessKey length:', trimmedPassword.length);
    console.log('[Upload API] AccessKey (first 12 chars):', trimmedPassword.substring(0, 12) + '...');
    console.log('[Upload API] AccessKey (last 8 chars):', '...' + trimmedPassword.substring(trimmedPassword.length - 8));
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': trimmedPassword,
        'Content-Type': file.type || 'image/jpeg',
      },
      body: buffer,
    });

    console.log('[Upload API] Bunny response status:', uploadResponse.status);

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      console.error('[Upload API] Bunny upload error:', errorText);
      return NextResponse.json(
        { error: 'Lỗi khi upload lên Bunny Storage', details: errorText },
        { status: uploadResponse.status }
      );
    }

    // Return URL - Use proxy API route to avoid CDN suspension issues
    // Proxy API route serves files from storage without requiring public CDN
    // Format: /api/banner?url={storageUrl}
    const storageUrl = `https://${storageHostname}/${storageZone}/${path}`;
    const fileUrl = `/api/banner?url=${encodeURIComponent(storageUrl)}`;
    console.log('[Upload API] Using proxy API route (avoids CDN suspension)');
    console.log('[Upload API] Storage URL:', storageUrl);
    console.log('[Upload API] Proxy URL:', fileUrl);

    return NextResponse.json({
      success: true,
      url: fileUrl,
      path: path,
    });

  } catch (error: any) {
    console.error('[Upload API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
