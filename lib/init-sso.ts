'use client';

import { initSSOListener } from './sso-listener';
import { getSupabaseClient } from './supabase-client';

async function handleLogin(email: string, password: string) {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
  if (error || !data.user) throw new Error('Email hoặc mật khẩu không đúng');
  const profile = await client.from('app_documents').select('data')
    .eq('collection', 'users').eq('auth_uid', data.user.id).maybeSingle();
  if (profile.error || !profile.data || (profile.data.data.role !== 'admin' && profile.data.data.approved === false)) {
    await client.auth.signOut();
    throw new Error('Tài khoản chưa được duyệt hoặc không có hồ sơ.');
  }
  window.location.reload();
}

async function handleLogout() {
  await getSupabaseClient().auth.signOut();
  window.location.href = '/';
}

if (typeof window !== 'undefined') initSSOListener({ onLogin: handleLogin, onLogout: handleLogout });
