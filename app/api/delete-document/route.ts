import { NextRequest, NextResponse } from 'next/server';

export async function DELETE(request: NextRequest) {
  try {
    const { path } = await request.json();

    if (!path) {
      return NextResponse.json(
        { error: 'Path là bắt buộc' },
        { status: 400 }
      );
    }

    const storageZone = process.env.NEXT_PUBLIC_BUNNY_STORAGE_ZONE;
    const storagePassword = process.env.NEXT_PUBLIC_BUNNY_STORAGE_PASSWORD;
    const storageHostname = process.env.NEXT_PUBLIC_BUNNY_STORAGE_HOSTNAME;

    if (!storageZone || !storagePassword || !storageHostname) {
      return NextResponse.json(
        { error: 'Thiếu cấu hình Bunny Storage' },
        { status: 500 }
      );
    }

    // Delete from Bunny Storage
    // Use AccessKey header (same as upload)
    const deleteUrl = `https://${storageHostname}/${storageZone}/${path}`;
    
    const deleteResponse = await fetch(deleteUrl, {
      method: 'DELETE',
      headers: {
        'AccessKey': storagePassword.trim(),
      },
    });

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const errorText = await deleteResponse.text();
      console.error('Bunny delete error:', errorText);
      return NextResponse.json(
        { error: 'Lỗi khi xóa file từ Bunny Storage' },
        { status: deleteResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'File đã được xóa',
    });

  } catch (error: any) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { error: error.message || 'Lỗi server' },
      { status: 500 }
    );
  }
}
