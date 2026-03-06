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
    const cdnUrl = process.env.NEXT_PUBLIC_BUNNY_STORAGE_CDN_URL;

    if (!storageZone || !storagePassword || !storageHostname || !cdnUrl) {
      console.error('[Upload API] Missing Bunny config');
      return NextResponse.json(
        { error: 'Thiếu cấu hình Bunny Storage' },
        { status: 500 }
      );
    }

    // Convert file to buffer
    console.log('[Upload API] Converting to buffer...');
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    console.log('[Upload API] Buffer size:', buffer.length);

    // Upload to Bunny Storage
    const uploadUrl = `https://${storageHostname}/${storageZone}/${path}`;
    console.log('[Upload API] Uploading to Bunny:', uploadUrl);
    
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'AccessKey': storagePassword,
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

    // Return CDN URL
    const fileUrl = `https://${cdnUrl}/${path}`;
    console.log('[Upload API] Success! URL:', fileUrl);

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
