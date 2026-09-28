'use client';

import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { initSSOListener } from './sso-listener';
import { auth, db } from './firebase';
import { getSupabaseClient } from './supabase-client';

async function handleLogin(email: string, password: string) {
  if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true') {
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
    return;
  }
  if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_ENABLED !== 'true') {
    const snapshot = await getDocs(query(collection(db, 'users'), where('email', '==', email)));
    const profile = snapshot.docs[0]?.data();
    if (!profile || profile.password !== password) throw new Error('Email hoặc mật khẩu không đúng');
    if (profile.role !== 'admin' && profile.approved === false) throw new Error('Tài khoản chưa được duyệt.');
    localStorage.setItem('currentUser', JSON.stringify(profile));
    window.location.reload();
    return;
  }
  const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
  const snapshot = await getDoc(doc(db, 'users', credential.user.uid));
  if (!snapshot.exists() || (snapshot.data().role !== 'admin' && snapshot.data().approved === false)) {
    await signOut(auth);
    throw new Error('Tài khoản chưa được duyệt hoặc không có hồ sơ.');
  }
  window.location.reload();
}

async function handleLogout() {
  if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true') await getSupabaseClient().auth.signOut();
  else if (process.env.NEXT_PUBLIC_FIREBASE_AUTH_ENABLED === 'true') await signOut(auth);
  else localStorage.removeItem('currentUser');
  window.location.href = '/';
}

if (typeof window !== 'undefined') initSSOListener({ onLogin: handleLogin, onLogout: handleLogout });
