import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { authorizeRequest } from '@/lib/server-auth';
import { profileFields } from '@/lib/admin-user-fields';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export const runtime = 'nodejs';

function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.map(toIso);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toIso(item)]));
  }
  return value;
}

function mapAuthCreateError(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes('already') && lower.includes('registered')) {
    return 'Email đã có tài khoản đăng nhập. Hãy dùng email khác hoặc sửa người dùng hiện có.';
  }
  if (lower.includes('password') && lower.includes('6')) {
    return 'Mật khẩu phải có ít nhất 6 ký tự.';
  }
  if (lower.includes('invalid') && lower.includes('email')) {
    return 'Email không hợp lệ.';
  }
  return message;
}

export async function POST(request: NextRequest) {
  try {
    const actor = await authorizeRequest(request, ['admin']);
    if (actor instanceof NextResponse) return actor;

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const displayName = String(body?.displayName || '').trim();
    const role = String(body?.role || '');
    if (!email) {
      return NextResponse.json({ error: 'Email là bắt buộc.' }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'Mật khẩu phải có ít nhất 6 ký tự.' }, { status: 400 });
    }
    if (!displayName) {
      return NextResponse.json({ error: 'Họ và tên là bắt buộc.' }, { status: 400 });
    }
    if (!['staff', 'teacher', 'student'].includes(role)) {
      return NextResponse.json({ error: 'Vai trò không hợp lệ. Chọn Nhân viên, Giáo viên hoặc Học viên.' }, { status: 400 });
    }

    const uid = `user_${randomUUID()}`;
    const client = getSupabaseAdmin();

    const existing = await client
      .from('app_documents')
      .select('id')
      .eq('collection', 'users')
      .eq('data->>email', email)
      .maybeSingle();
    if (existing.error) {
      return NextResponse.json({ error: `Không kiểm tra được email: ${existing.error.message}` }, { status: 502 });
    }
    if (existing.data) {
      return NextResponse.json({ error: 'Email này đã được sử dụng.' }, { status: 409 });
    }

    const created = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { legacy_uid: uid },
    });
    if (created.error || !created.data.user) {
      const detail = created.error?.message || 'Email có thể đã được dùng.';
      return NextResponse.json({ error: mapAuthCreateError(detail) }, { status: 502 });
    }

    const now = new Date().toISOString();
    const profile = toIso({
      ...profileFields(body || {}),
      uid,
      email,
      displayName,
      role,
      approved: true,
      totalLearningHours: 0,
      createdAt: now,
      updatedAt: now,
    });

    const inserted = await client.from('app_documents').insert({
      collection: 'users',
      id: uid,
      data: profile,
      auth_uid: created.data.user.id,
    });
    if (inserted.error) {
      await client.auth.admin.deleteUser(created.data.user.id);
      const hint = inserted.error.message.includes('row-level security')
        ? ' Kiểm tra SUPABASE_SECRET_KEY trên Vercel (phải là service role key).'
        : '';
      return NextResponse.json({
        error: `Không lưu được hồ sơ tài khoản: ${inserted.error.message}.${hint}`,
      }, { status: 502 });
    }
    return NextResponse.json({ uid }, { status: 201 });
  } catch (error) {
    console.error('[Admin] Create user failed:', error);
    const message = error instanceof Error ? error.message : 'Không tạo được người dùng.';
    return NextResponse.json({ error: message }, { status: 503 });
  }
}
