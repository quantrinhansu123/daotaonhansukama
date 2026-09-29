import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/server-auth';
import { profileFields } from '@/lib/admin-user-fields';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Context = { params: Promise<{ uid: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const actor = await authorizeRequest(request, ['admin']);
  if (actor instanceof NextResponse) return actor;
  const { uid } = await context.params;
  const client = getSupabaseAdmin();
  const target = await client.from('app_documents').select('data,auth_uid').eq('collection', 'users').eq('id', uid).maybeSingle();
  if (target.error) return NextResponse.json({ error: 'Không đọc được tài khoản.' }, { status: 502 });
  if (!target.data) return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
  if (target.data.data.role === 'admin') return NextResponse.json({ error: 'Không sửa tài khoản quản trị tại đây.' }, { status: 403 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = String(body?.email || '').trim().toLowerCase();
  const displayName = String(body?.displayName || '').trim();
  const role = body?.role;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !displayName || !['staff', 'teacher', 'student'].includes(String(role)) || (password && password.length < 6)) {
    return NextResponse.json({ error: 'Thông tin tài khoản không hợp lệ.' }, { status: 400 });
  }
  if (!target.data.auth_uid) return NextResponse.json({ error: 'Tài khoản chưa liên kết Supabase Auth.' }, { status: 409 });
  const updatedAuth = await client.auth.admin.updateUserById(target.data.auth_uid, {
    email, ...(password ? { password } : {}), user_metadata: { legacy_uid: uid },
  });
  if (updatedAuth.error) return NextResponse.json({ error: 'Không cập nhật được đăng nhập.' }, { status: 502 });
  const updated = await client.from('app_documents').update({ data: {
    ...target.data.data, ...profileFields(body || {}), email, displayName, role, updatedAt: new Date(),
  } }).eq('collection', 'users').eq('id', uid);
  if (updated.error) return NextResponse.json({ error: 'Không cập nhật được hồ sơ.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, context: Context) {
  const actor = await authorizeRequest(request, ['admin']);
  if (actor instanceof NextResponse) return actor;
  const { uid } = await context.params;
  if (uid === actor.uid) return NextResponse.json({ error: 'Không thể tự xóa tài khoản.' }, { status: 403 });
  const client = getSupabaseAdmin();
  const target = await client.from('app_documents').select('data,auth_uid').eq('collection', 'users').eq('id', uid).maybeSingle();
  if (target.error) return NextResponse.json({ error: 'Không đọc được tài khoản.' }, { status: 502 });
  if (!target.data) return NextResponse.json({ error: 'Không tìmเห็น tài khoản.' }, { status: 404 });
  if (target.data.data.role === 'admin') return NextResponse.json({ error: 'Không xóa tài khoản quản trị tại đây.' }, { status: 403 });
  if (!target.data.auth_uid) return NextResponse.json({ error: 'Tài khoản chưa liên kết Supabase Auth.' }, { status: 409 });
  const removed = await client.auth.admin.deleteUser(target.data.auth_uid);
  if (removed.error) return NextResponse.json({ error: 'Không xóa được tài khoản đăng nhập.' }, { status: 502 });
  const deleted = await client.from('app_documents').delete().eq('collection', 'users').eq('id', uid);
  if (deleted.error) return NextResponse.json({ error: 'Không xóa được hồ sơ tài khoản.' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
