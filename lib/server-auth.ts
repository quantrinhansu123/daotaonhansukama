import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export type AuthorizedUser = { uid: string; role: string; approved: boolean };

export async function authorizeRequest(request: NextRequest, roles?: string[]): Promise<AuthorizedUser | NextResponse> {
  if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true') {
    const token = /^Bearer (\S+)$/i.exec(request.headers.get('authorization') || '')?.[1];
    if (!token) return NextResponse.json({ error: 'Bạn cần đăng nhập để tiếp tục.' }, { status: 401 });
    try {
      const client = getSupabaseAdmin();
      const { data: { user }, error: authError } = await client.auth.getUser(token);
      if (authError || !user) return NextResponse.json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ.' }, { status: 401 });
      const { data: row, error } = await client.from('app_documents').select('id,data')
        .eq('collection', 'users').eq('auth_uid', user.id).maybeSingle();
      if (error) throw error;
      if (!row) return NextResponse.json({ error: 'Không tìm thấy hồ sơ người dùng.' }, { status: 403 });
      const profile = row.data as { role?: string; approved?: boolean };
      if (profile.role !== 'admin' && profile.approved === false) {
        return NextResponse.json({ error: 'Tài khoản chưa được duyệt.' }, { status: 403 });
      }
      if (roles && !roles.includes(profile.role || '')) {
        return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
      }
      return { uid: row.id, role: profile.role || '', approved: true };
    } catch (error) {
      console.error('[Auth] Supabase verification failed:', error instanceof Error ? error.message : error);
      return NextResponse.json({ error: 'Máy chủ chưa xác minh được Supabase Auth.' }, { status: 503 });
    }
  }
  if (process.env.FIREBASE_AUTH_CUTOVER_READY !== 'true') {
    return NextResponse.json({ error: 'Chức năng này chưa được bật sau khi chuyển đăng nhập.' }, { status: 503 });
  }
  const header = request.headers.get('authorization') || '';
  const token = /^Bearer (\S+)$/i.exec(header)?.[1];
  if (!token) return NextResponse.json({ error: 'Bạn cần đăng nhập để tiếp tục.' }, { status: 401 });

  let uid: string;
  try {
    const { adminAuth } = await import('@/lib/firebase-admin');
    uid = (await adminAuth().verifyIdToken(token, true)).uid;
  } catch (error) {
    const code = (error as { code?: string }).code || '';
    console.error('[Auth] ID token verification failed:', code || (error instanceof Error ? error.message : error));
    if (code.startsWith('auth/id-token-') || code === 'auth/invalid-id-token' || code === 'auth/argument-error') {
      return NextResponse.json({ error: 'Phiên đăng nhập hết hạn hoặc không hợp lệ.' }, { status: 401 });
    }
    return NextResponse.json({ error: 'Máy chủ chưa xác minh được Firebase Auth. Kiểm tra cấu hình Admin SDK.' }, { status: 503 });
  }

  try {
    const { adminDb } = await import('@/lib/firebase-admin');
    const profile = await adminDb().collection('users').doc(uid).get();
    if (!profile.exists) return NextResponse.json({ error: 'Không tìm thấy hồ sơ người dùng.' }, { status: 403 });
    const data = profile.data() || {};
    if (data.role !== 'admin' && data.approved === false) {
      return NextResponse.json({ error: 'Tài khoản chưa được duyệt.' }, { status: 403 });
    }
    if (roles && !roles.includes(data.role)) {
      return NextResponse.json({ error: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
    }
    return { uid, role: data.role, approved: data.role === 'admin' || data.approved !== false };
  } catch (error) {
    console.error('[Auth] Profile lookup failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'Máy chủ không đọc được hồ sơ tài khoản.' }, { status: 503 });
  }
}
