import 'server-only';
import { createClient } from '@supabase/supabase-js';

function decodeJwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { role?: string };
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('Thiếu SUPABASE_SECRET_KEY (service role) trên server.');
  }
  const role = decodeJwtRole(key);
  if (role && role !== 'service_role') {
    throw new Error('SUPABASE_SECRET_KEY phải là service role key, không dùng publishable/anon key.');
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
