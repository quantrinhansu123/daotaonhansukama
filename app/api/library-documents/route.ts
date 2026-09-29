import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/server-auth';

const MANIFEST_PATH = 'library/manifest.json';

type LibraryManifestItem = {
  id: string;
  name: string;
  desc?: string;
  project?: string;
  projectTone?: string;
  dept?: string;
  type?: string;
  size?: string;
  sizeBytes?: number;
  downloads?: number;
  url: string;
  storagePath: string;
  uploadedBy?: string;
  uploadedByName?: string;
  createdAt?: string;
  updatedAt?: string;
};

function bunnyConfig() {
  const storageZone = process.env.NEXT_PUBLIC_BUNNY_STORAGE_ZONE;
  const storagePassword = process.env.NEXT_PUBLIC_BUNNY_STORAGE_PASSWORD;
  const storageHostname = process.env.NEXT_PUBLIC_BUNNY_STORAGE_HOSTNAME;
  if (!storageZone || !storagePassword || !storageHostname) {
    throw new Error('Thiếu cấu hình Bunny Storage');
  }
  return {
    storageZone,
    storagePassword: storagePassword.trim(),
    storageHostname,
  };
}

async function readManifest(): Promise<LibraryManifestItem[]> {
  const { storageZone, storagePassword, storageHostname } = bunnyConfig();
  const url = `https://${storageHostname}/${storageZone}/${MANIFEST_PATH}`;
  const response = await fetch(url, {
    headers: { AccessKey: storagePassword },
    cache: 'no-store',
  });
  if (response.status === 404) return [];
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Không đọc được manifest thư viện: ${details || response.status}`);
  }
  const payload = await response.json().catch(() => ([]));
  return Array.isArray(payload) ? payload as LibraryManifestItem[] : [];
}

async function writeManifest(items: LibraryManifestItem[]) {
  const { storageZone, storagePassword, storageHostname } = bunnyConfig();
  const url = `https://${storageHostname}/${storageZone}/${MANIFEST_PATH}`;
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      AccessKey: storagePassword,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(items),
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Không lưu manifest thư viện: ${details || response.status}`);
  }
}

export async function GET(request: NextRequest) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const items = await readManifest();
    items.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    return NextResponse.json({ items });
  } catch (error) {
    console.error('[library-documents] GET failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không tải được thư viện tài liệu' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorizeRequest(request, ['admin', 'staff', 'teacher']);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json() as LibraryManifestItem;
    if (!body?.id || !body?.name || !body?.url || !body?.storagePath) {
      return NextResponse.json({ error: 'Thiếu thông tin tài liệu' }, { status: 400 });
    }
    const items = await readManifest();
    const next = items.filter((item) => item.id !== body.id);
    next.unshift({
      ...body,
      uploadedBy: body.uploadedBy || auth.uid,
      updatedAt: body.updatedAt || new Date().toISOString(),
      createdAt: body.createdAt || new Date().toISOString(),
      downloads: Number(body.downloads) || 0,
    });
    await writeManifest(next);
    return NextResponse.json({ success: true, item: next[0] });
  } catch (error) {
    console.error('[library-documents] POST failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không lưu được tài liệu' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authorizeRequest(request);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json() as { id?: string; downloads?: number };
    if (!body?.id) return NextResponse.json({ error: 'Thiếu id tài liệu' }, { status: 400 });
    const items = await readManifest();
    const index = items.findIndex((item) => item.id === body.id);
    if (index < 0) return NextResponse.json({ error: 'Không tìm thấy tài liệu' }, { status: 404 });
    items[index] = {
      ...items[index],
      downloads: typeof body.downloads === 'number' ? body.downloads : (items[index].downloads || 0) + 1,
      updatedAt: items[index].updatedAt || new Date().toISOString(),
    };
    await writeManifest(items);
    return NextResponse.json({ success: true, item: items[index] });
  } catch (error) {
    console.error('[library-documents] PATCH failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không cập nhật được tài liệu' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authorizeRequest(request, ['admin', 'staff', 'teacher']);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await request.json() as { id?: string; storagePath?: string };
    if (!body?.id) return NextResponse.json({ error: 'Thiếu id tài liệu' }, { status: 400 });
    const items = await readManifest();
    const target = items.find((item) => item.id === body.id);
    const next = items.filter((item) => item.id !== body.id);
    await writeManifest(next);

    const storagePath = body.storagePath || target?.storagePath;
    if (storagePath) {
      const { storageZone, storagePassword, storageHostname } = bunnyConfig();
      await fetch(`https://${storageHostname}/${storageZone}/${storagePath}`, {
        method: 'DELETE',
        headers: { AccessKey: storagePassword },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[library-documents] DELETE failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Không xóa được tài liệu' },
      { status: 500 }
    );
  }
}
