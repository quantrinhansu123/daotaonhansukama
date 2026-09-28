import { deleteApp, initializeApp } from 'firebase/app';
import { collection, getDocs, getFirestore } from 'firebase/firestore';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('Thiếu Supabase URL hoặc publishable key.');

const firebaseApp = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
});

async function main() {
  const source = await getDocs(collection(getFirestore(firebaseApp), 'users'));
  const admin = source.docs.find(item => item.data().role === 'admin');
  const student = source.docs.find(item => item.data().role === 'student');
  if (!admin || !student) throw new Error('Thiếu tài khoản admin hoặc học viên để thử.');

  const anonymous = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymousResult = await anonymous.from('app_documents').select('id').limit(1);
  if (!anonymousResult.error && anonymousResult.data?.length) {
    throw new Error('Người chưa đăng nhập đọc được app_documents.');
  }
  process.stdout.write('anonymous: BLOCKED\n');

  for (const [name, document, expectedUsers] of [
    ['student', student, 1],
    ['admin', admin, source.size],
  ] as const) {
    const account = document.data();
    const client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: loginError } = await client.auth.signInWithPassword({
      email: account.email,
      password: account.password,
    });
    if (loginError) throw new Error(`${name}: đăng nhập Supabase thất bại (${loginError.name}).`);

    const users = await client.from('app_documents').select('id').eq('collection', 'users');
    const courses = await client.from('app_documents').select('id').eq('collection', 'courses');
    if (users.error || courses.error || users.data?.length !== expectedUsers || courses.data?.length !== 15) {
      throw new Error(`${name}: quyền đọc hồ sơ hoặc khóa học không đúng.`);
    }
    if (name === 'student') {
      const id = `supabase_smoke_${randomUUID()}`;
      const ownProgress = { id, userId: document.id, courseId: 'smoke', lessonId: 'smoke', watchedSeconds: 1 };
      try {
        const created = await client.from('app_documents').insert({ collection: 'progress', id, data: ownProgress });
        if (created.error) throw new Error(`student: không tạo được tiến độ của mình (${created.error.code}).`);
        const read = await client.from('app_documents').select('data,version')
          .eq('collection', 'progress').eq('id', id).single();
        if (read.error || read.data.data.userId !== document.id) throw new Error('student: không đọc được tiến độ vừa tạo.');
        const update = await client.from('app_documents').update({ data: { ...ownProgress, watchedSeconds: 2 } })
          .eq('collection', 'progress').eq('id', id).eq('version', read.data.version).select('version');
        if (update.error || update.data?.length !== 1 || update.data[0].version !== read.data.version + 1) {
          throw new Error('student: không cập nhật được tiến độ có kiểm soát phiên bản.');
        }
        const wrongOwner = await client.from('app_documents').update({ data: { ...ownProgress, userId: admin.id } })
          .eq('collection', 'progress').eq('id', id);
        if (!wrongOwner.error) throw new Error('student: đổi chủ sở hữu tiến độ vẫn được phép.');
        const self = users.data?.[0];
        if (!self) throw new Error('student: thiếu hồ sơ.');
        const attemptedRole = await client.from('app_documents').update({ data: { ...document.data(), role: 'admin' } })
          .eq('collection', 'users').eq('id', self.id);
        if (!attemptedRole.error) throw new Error('student: tự tăng quyền vẫn được phép.');
      } finally {
        const removed = await client.from('app_documents').delete().eq('collection', 'progress').eq('id', id);
        if (removed.error) throw new Error(`student: không dọn được tiến độ thử (${removed.error.code}).`);
      }
      process.stdout.write('student: progress CRUD and role guard PASS\n');
    }
    process.stdout.write(`${name}: users=${users.data.length}, courses=${courses.data.length}\n`);
    await client.auth.signOut();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await deleteApp(firebaseApp);
});
