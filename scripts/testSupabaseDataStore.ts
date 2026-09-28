import { randomUUID } from 'node:crypto';
import { deleteApp, initializeApp } from 'firebase/app';
import { collection as firebaseCollection, getDocs as firebaseGetDocs, getFirestore } from 'firebase/firestore';
import { getSupabaseClient } from '../lib/supabase-client';
import { collection, db, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from '../lib/data-store';

if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED !== 'true') throw new Error('Supabase mode is not enabled');
const app = initializeApp({
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
}, 'supabase-data-store-smoke');

async function main() {
  const source = await firebaseGetDocs(firebaseCollection(getFirestore(app), 'users'));
  const account = source.docs.find(item => item.data().role === 'admin')?.data();
  if (!account) throw new Error('Missing admin account');
  const client = getSupabaseClient();
  const login = await client.auth.signInWithPassword({ email: account.email, password: account.password });
  if (login.error) throw new Error('Supabase login failed');
  const courses = await getDocs(collection(db, 'courses'));
  if (courses.size !== 15) throw new Error(`Expected 15 courses, got ${courses.size}`);
  const first = courses.docs[0];
  const byId = await getDoc(doc(db, 'courses', first.id));
  if (!byId.exists() || byId.id !== first.id) throw new Error('Document read failed');
  const filtered = await getDocs(query(collection(db, 'courses'), where('__name__', '==', first.id)));
  if (filtered.size !== 1) throw new Error('Query filter failed');
  const id = `supabase_adapter_${randomUUID()}`;
  const ref = doc(db, 'progress', id);
  try {
    await setDoc(ref, { id, userId: source.docs.find(item => item.data().role === 'admin')!.id, watchedSeconds: 1 });
    await updateDoc(ref, { watchedSeconds: 2 });
    const read = await getDoc(ref);
    if (!read.exists() || read.data().watchedSeconds !== 2) throw new Error('Adapter write failed');
    process.stdout.write('Supabase data store read/query/write: PASS\n');
  } finally {
    await deleteDoc(ref);
    await client.auth.signOut();
  }
}

main().catch(error => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}).finally(async () => { await deleteApp(app); });
