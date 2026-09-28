import { deleteApp, initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});
const base = process.env.TEST_APP_URL || 'http://localhost:3210';

async function main() {
  const source = await getDocs(collection(getFirestore(app), 'users'));
  for (const [role, expected] of [['student', 403], ['admin', 400]] as const) {
    const account = source.docs.find(item => item.data().role === role)?.data();
    if (!account) throw new Error(`Missing ${role} source user`);
    const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const login = await client.auth.signInWithPassword({ email: account.email, password: account.password });
    if (login.error || !login.data.session) throw new Error(`${role} login failed`);
    const linked = await client.from('app_documents').select('data').eq('collection', 'users').eq('auth_uid', login.data.user.id).maybeSingle();
    if (linked.error || !linked.data) throw new Error(`${role} profile lookup failed`);
    if (linked.data.data.role !== role) throw new Error(`${role} token linked to ${linked.data.data.role}`);
    const response = await fetch(`${base}/api/cloudfly/video/upload`, {
      method: 'POST', headers: { Authorization: `Bearer ${login.data.session.access_token}`, 'Content-Type': 'text/plain' },
      body: 'invalid video',
    });
    if (response.status !== expected) throw new Error(`${role} upload status ${response.status}, expected ${expected}: ${(await response.json()).error || 'unknown'}`);
    process.stdout.write(`${role} upload route: ${response.status}\n`);
    if (role === 'admin') {
      const email = `smoke_${randomUUID()}@example.com`;
      const authorization = { Authorization: `Bearer ${login.data.session.access_token}`, 'Content-Type': 'application/json' };
      let uid: string | undefined;
      try {
        const created = await fetch(`${base}/api/admin/users`, {
          method: 'POST', headers: authorization,
          body: JSON.stringify({ email, password: randomUUID(), displayName: 'Smoke Test', role: 'student' }),
        });
        const payload = await created.json();
        if (created.status !== 201 || !payload.uid) throw new Error(`admin create user failed (${created.status})`);
        uid = payload.uid;
        const updated = await fetch(`${base}/api/admin/users/${encodeURIComponent(uid!)}`, {
          method: 'PATCH', headers: authorization,
          body: JSON.stringify({ email, displayName: 'Smoke Test Updated', role: 'student' }),
        });
        if (updated.status !== 200) throw new Error(`admin update user failed (${updated.status})`);
        const approved = await fetch(`${base}/api/admin/users/${encodeURIComponent(uid!)}/approval`, {
          method: 'PATCH', headers: authorization, body: JSON.stringify({ approved: true }),
        });
        if (approved.status !== 200) throw new Error(`admin approve user failed (${approved.status})`);
        const profile = await client.from('app_documents').select('data').eq('collection', 'users').eq('id', uid!).single();
        if (profile.error || profile.data.data.approved !== true) throw new Error('admin approval not stored');
        process.stdout.write('admin user create/update: PASS\n');
      } finally {
        if (uid) {
          const removed = await fetch(`${base}/api/admin/users/${encodeURIComponent(uid)}`, {
            method: 'DELETE', headers: authorization,
          });
          if (removed.status !== 200) throw new Error(`admin cleanup user failed (${removed.status})`);
          process.stdout.write('admin user cleanup: PASS\n');
        }
      }
    }
    await client.auth.signOut();
  }
  const anonymous = await fetch(`${base}/api/cloudfly/video/upload`, {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'invalid video',
  });
  if (anonymous.status !== 401) throw new Error(`anonymous upload status ${anonymous.status}, expected 401`);
  process.stdout.write('anonymous upload route: 401\n');
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(async () => { await deleteApp(app); });
