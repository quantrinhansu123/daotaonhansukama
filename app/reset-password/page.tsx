'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSupabaseClient } from '@/lib/supabase-client';

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const client = getSupabaseClient();
    void client.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 6) { setMessage('Mật khẩu cần ít nhất 6 ký tự.'); return; }
    setSaving(true);
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    setSaving(false);
    setMessage(error ? 'Không đổi được mật khẩu. Hãy yêu cầu liên kết mới.' : 'Đã đổi mật khẩu. Bạn có thể đăng nhập.');
    if (!error) await getSupabaseClient().auth.signOut();
  };

  return <main className="min-h-screen flex items-center justify-center p-6 bg-slate-950 text-white">
    <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-slate-900 p-6">
      <h1 className="text-xl font-semibold">Đặt lại mật khẩu</h1>
      {ready ? <>
        <input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)}
          placeholder="Mật khẩu mới" className="w-full rounded bg-white p-3 text-slate-900" required />
        <button type="submit" disabled={saving} className="w-full rounded bg-green-700 p-3 disabled:opacity-50">
          {saving ? 'Đang lưu...' : 'Đổi mật khẩu'}
        </button>
      </> : <p>Liên kết đặt lại mật khẩu đã hết hạn hoặc không hợp lệ.</p>}
      {message && <p role="status">{message}</p>}
      <Link href="/" className="block text-center underline">Về trang đăng nhập</Link>
    </form>
  </main>;
}
