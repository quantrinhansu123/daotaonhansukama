import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/server-auth';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function PATCH(request: NextRequest, context: { params: Promise<{ uid: string }> }) {
  if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Không tìm thấy chức năng.' }, { status: 404 });
  }
  const actor = await authorizeRequest(request, ['admin']);
  if (actor instanceof NextResponse) return actor;
  const { uid } = await context.params;
  const body = await request.json().catch(() => null);
  if (typeof body?.approved !== 'boolean') {
    return NextResponse.json({ error: 'Trạng thái duyệt không hợp lệ.' }, { status: 400 });
  }
  const client = getSupabaseAdmin();
  const found = await client.from('app_documents').select('data').eq('collection', 'users').eq('id', uid).maybeSingle();
  if (found.error) return NextResponse.json({ error: 'Không đọc được tài khoản.' }, { status: 502 });
  if (!found.data) return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
  if (found.data.data.role === 'admin') return NextResponse.json({ error: 'Không duyệt tài khoản quản trị tại đây.' }, { status: 403 });
  const changed = await client.from('app_documents').update({
    data: { ...found.data.data, approved: body.approved, updatedAt: new Date() },
  }).eq('collection', 'users').eq('id', uid);
  if (changed.error) return NextResponse.json({ error: 'Không cập nhật được trạng thái duyệt.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
