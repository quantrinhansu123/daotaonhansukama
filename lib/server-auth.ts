import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export type AuthorizedUser = { uid: string; role: string; approved: boolean };

export async function authorizeRequest(request: NextRequest, roles?: string[]): Promise<AuthorizedUser | NextResponse> {
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
