import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { authorizeRequest } from '@/lib/server-auth';
import { profileFields } from '@/lib/admin-user-fields';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

type Context = { params: Promise<{ uid: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  const actor = await authorizeRequest(request, ['admin']);
  if (actor instanceof NextResponse) return actor;
  const { uid } = await context.params;
  if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true') {
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
  const target = await adminDb().collection('users').doc(uid).get();
  if (!target.exists) return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
  if (target.data()?.role === 'admin') return NextResponse.json({ error: 'Không sửa tài khoản quản trị tại đây.' }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = String(body?.email || '').trim().toLowerCase();
  const displayName = String(body?.displayName || '').trim();
  const role = body?.role;
  const password = typeof body?.password === 'string' ? body.password : '';
  if (!email || !displayName || !['staff', 'teacher', 'student'].includes(String(role)) || (password && password.length < 6)) {
    return NextResponse.json({ error: 'Thông tin tài khoản không hợp lệ.' }, { status: 400 });
  }

  try {
    await adminAuth().updateUser(uid, { email, displayName, ...(password ? { password } : {}) });
    await target.ref.update({
      ...profileFields(body || {}),
      email,
      displayName,
      role,
      updatedAt: new Date(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Admin] Update user failed:', error);
    return NextResponse.json({ error: 'Không cập nhật được tài khoản.' }, { status: 502 });
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const actor = await authorizeRequest(request, ['admin']);
  if (actor instanceof NextResponse) return actor;
  const { uid } = await context.params;
  if (uid === actor.uid) return NextResponse.json({ error: 'Không thể tự xóa tài khoản.' }, { status: 403 });
  if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true') {
    const client = getSupabaseAdmin();
    const target = await client.from('app_documents').select('data,auth_uid').eq('collection', 'users').eq('id', uid).maybeSingle();
    if (target.error) return NextResponse.json({ error: 'Không đọc được tài khoản.' }, { status: 502 });
    if (!target.data) return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
    if (target.data.data.role === 'admin') return NextResponse.json({ error: 'Không xóa tài khoản quản trị tại đây.' }, { status: 403 });
    if (!target.data.auth_uid) return NextResponse.json({ error: 'Tài khoản chưa liên kết Supabase Auth.' }, { status: 409 });
    const removed = await client.auth.admin.deleteUser(target.data.auth_uid);
    if (removed.error) return NextResponse.json({ error: 'Không xóa được tài khoản đăng nhập.' }, { status: 502 });
    const deleted = await client.from('app_documents').delete().eq('collection', 'users').eq('id', uid);
    if (deleted.error) return NextResponse.json({ error: 'Không xóa được hồ sơ tài khoản.' }, { status: 502 });
    return NextResponse.json({ ok: true });
  }
  const target = await adminDb().collection('users').doc(uid).get();
  if (!target.exists) return NextResponse.json({ error: 'Không tìm thấy tài khoản.' }, { status: 404 });
  if (target.data()?.role === 'admin') return NextResponse.json({ error: 'Không xóa tài khoản quản trị tại đây.' }, { status: 403 });
  try {
    await adminAuth().deleteUser(uid);
    await target.ref.delete();
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[Admin] Delete user failed:', error);
    return NextResponse.json({ error: 'Không xóa được tài khoản.' }, { status: 502 });
  }
}
