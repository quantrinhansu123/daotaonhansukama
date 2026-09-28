import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/server-auth';
import { profileFields } from '@/lib/admin-user-fields';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const actor = await authorizeRequest(request, ['admin']);
  if (actor instanceof NextResponse) return actor;

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const displayName = String(body?.displayName || '').trim();
  const role = body?.role;
  if (!email || password.length < 6 || !displayName || !['staff', 'teacher', 'student'].includes(String(role))) {
    return NextResponse.json({ error: 'Email, mật khẩu (ít nhất 6 ký tự), tên và vai trò phải hợp lệ.' }, { status: 400 });
  }

  const uid = `user_${randomUUID()}`;
  if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true') {
    const client = getSupabaseAdmin();
    const created = await client.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { legacy_uid: uid } });
    if (created.error || !created.data.user) {
      return NextResponse.json({ error: 'Không tạo được tài khoản. Email có thể đã được dùng.' }, { status: 502 });
    }
    const profile = {
      ...profileFields(body || {}), uid, email, displayName, role, approved: false,
      totalLearningHours: 0, createdAt: new Date(), updatedAt: new Date(),
    };
    const inserted = await client.from('app_documents').insert({
      collection: 'users', id: uid, data: profile, auth_uid: created.data.user.id,
    });
    if (inserted.error) {
      await client.auth.admin.deleteUser(created.data.user.id);
      return NextResponse.json({ error: 'Không lưu được hồ sơ tài khoản.' }, { status: 502 });
    }
    return NextResponse.json({ uid }, { status: 201 });
  }
  try {
    const { adminAuth, adminDb } = await import('@/lib/firebase-admin');
    await adminAuth().createUser({ uid, email, password, displayName });
    try {
      await adminDb().collection('users').doc(uid).set({
        ...profileFields(body || {}),
        uid,
        email,
        displayName,
        role,
        approved: false,
        totalLearningHours: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (error) {
      await adminAuth().deleteUser(uid);
      throw error;
    }
    return NextResponse.json({ uid }, { status: 201 });
  } catch (error) {
    console.error('[Admin] Create user failed:', error);
    return NextResponse.json({ error: 'Không tạo được tài khoản. Email có thể đã được dùng.' }, { status: 502 });
  }
}
