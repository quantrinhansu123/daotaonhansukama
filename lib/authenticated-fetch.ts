import { getSupabaseClient } from '@/lib/supabase-client';

export async function authenticatedFetch(input: string, init: RequestInit = {}) {
  const token = (await getSupabaseClient().auth.getSession()).data.session?.access_token;
  if (!token) throw new Error('Bạn cần đăng nhập lại.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(input, { ...init, headers });
}

export async function authenticatedJson(input: string, method: string, body?: unknown) {
  const response = await authenticatedFetch(input, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { error?: string };
  if (!response.ok) {
    const fallback = response.status === 503
      ? 'Máy chủ chưa cấu hình Supabase (thiếu service role key).'
      : `Không thực hiện được thao tác (HTTP ${response.status}).`;
    throw new Error(payload.error || fallback);
  }
  return payload;
}
