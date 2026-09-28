'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as firebaseSignOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from '@/lib/data-store';
import { auth, db } from '@/lib/firebase';
import { getSupabaseClient } from '@/lib/supabase-client';
import { UserProfile, UserRole } from '@/types/user';

interface AuthContextType {
  userProfile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<UserProfile>;
  signUp: (email: string, password: string, displayName: string, role: UserRole, additionalInfo?: Partial<UserProfile>) => Promise<UserProfile>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}

async function loadProfile(uid: string): Promise<UserProfile> {
  const snapshot = await getDoc(doc(db, 'users', uid));
  if (!snapshot.exists()) throw new Error('Không tìm thấy hồ sơ tài khoản. Liên hệ quản trị viên.');
  const profile = snapshot.data() as UserProfile;
  if (profile.role !== 'admin' && profile.approved === false) throw new Error('Tài khoản chưa được duyệt. Vui lòng liên hệ quản trị viên.');
  return { ...profile, uid };
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Kết nối Firestore quá thời gian chờ.')), milliseconds);
    promise.then(
      value => { clearTimeout(timeout); resolve(value); },
      error => { clearTimeout(timeout); reject(error); },
    );
  });
}

const FirebaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    localStorage.removeItem('currentUser');
    return onAuthStateChanged(auth, async firebaseUser => {
      if (!firebaseUser) {
        setUserProfile(null);
        setLoading(false);
        return;
      }
      try {
        const profile = await loadProfile(firebaseUser.uid);
        if (auth.currentUser?.uid === firebaseUser.uid) setUserProfile(profile);
      } catch {
        if (auth.currentUser?.uid === firebaseUser.uid) {
          setUserProfile(null);
          await firebaseSignOut(auth);
        }
      } finally {
        setLoading(false);
      }
    });
  }, []);

  const signIn = async (email: string, password: string) => {
    const credential = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    try {
      const profile = await loadProfile(credential.user.uid);
      setUserProfile(profile);
      return profile;
    } catch (error) {
      await firebaseSignOut(auth);
      throw error;
    }
  };

  const signUp = async () => {
    throw new Error('Tài khoản mới do quản trị viên tạo. Vui lòng liên hệ quản trị viên.');
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setUserProfile(null);
  };

  return <AuthContext.Provider value={{ userProfile, loading, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
};

async function loadSupabaseProfile(authUid: string): Promise<UserProfile> {
  const { data, error } = await getSupabaseClient().from('app_documents')
    .select('id,data').eq('collection', 'users').eq('auth_uid', authUid).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Không tìm thấy hồ sơ tài khoản. Liên hệ quản trị viên.');
  const profile = data.data as UserProfile;
  if (profile.role !== 'admin' && profile.approved === false) {
    throw new Error('Tài khoản chưa được duyệt. Vui lòng liên hệ quản trị viên.');
  }
  return { ...profile, uid: data.id };
}

const SupabaseAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    localStorage.removeItem('currentUser');
    const client = getSupabaseClient();
    let active = true;
    const refresh = async () => {
      const { data: { user }, error } = await client.auth.getUser();
      if (!active) return;
      if (error || !user) {
        setUserProfile(null);
        setLoading(false);
        return;
      }
      try {
        setUserProfile(await loadSupabaseProfile(user.id));
      } catch {
        setUserProfile(null);
        await client.auth.signOut();
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setUserProfile(null);
        setLoading(false);
      } else {
        // Supabase recommends moving client API calls outside this callback.
        setTimeout(() => { if (active) void refresh(); }, 0);
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  const signIn = async (email: string, password: string) => {
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    if (error || !data.user) throw new Error('Email hoặc mật khẩu không đúng.');
    try {
      const profile = await loadSupabaseProfile(data.user.id);
      setUserProfile(profile);
      return profile;
    } catch (error) {
      await client.auth.signOut();
      throw error;
    }
  };

  const signUp = async (): Promise<UserProfile> => {
    throw new Error('Tài khoản mới do quản trị viên tạo. Vui lòng liên hệ quản trị viên.');
  };

  const signOut = async () => {
    await getSupabaseClient().auth.signOut();
    setUserProfile(null);
  };

  return <AuthContext.Provider value={{ userProfile, loading, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
};

// Keeps existing sessions working until the Firebase Auth accounts and rules
// have been migrated. Remove this provider after the production cutover.
const LegacyAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('currentUser');
      if (saved) setUserProfile(JSON.parse(saved));
    } catch {
      localStorage.removeItem('currentUser');
    } finally {
      setLoading(false);
    }
  }, []);

  const signIn = async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase();
    const usersRef = collection(db, 'users');
    const queried = await withTimeout(getDocs(query(usersRef, where('email', '==', normalizedEmail))), 5000).catch(() => null);
    let userDoc = queried?.docs[0];
    if (!userDoc) {
      const allUsers = await withTimeout(getDocs(usersRef), 10000);
      userDoc = allUsers.docs.find(item => String(item.data().email || '').trim().toLowerCase() === normalizedEmail);
    }
    const profile = userDoc?.data() as UserProfile | undefined;
    if (!profile || profile.password?.trim() !== password.trim()) throw new Error('Email hoặc mật khẩu không đúng');
    if (profile.role !== 'admin' && profile.approved === false) throw new Error('Tài khoản chưa được duyệt.');
    localStorage.setItem('currentUser', JSON.stringify(profile));
    setUserProfile(profile);
    return profile;
  };

  const signUp = async (email: string, password: string, displayName: string, role: UserRole, additionalInfo?: Partial<UserProfile>) => {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = await getDocs(query(collection(db, 'users'), where('email', '==', normalizedEmail)));
    if (!existing.empty) throw new Error('Email đã được sử dụng');
    const profile: UserProfile = {
      ...additionalInfo,
      uid: `user_${Date.now()}`,
      email: normalizedEmail,
      password,
      displayName,
      role,
      approved: role === 'admin',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await setDoc(doc(db, 'users', profile.uid), profile);
    localStorage.setItem('currentUser', JSON.stringify(profile));
    setUserProfile(profile);
    return profile;
  };

  const signOut = async () => {
    localStorage.removeItem('currentUser');
    setUserProfile(null);
  };

  return <AuthContext.Provider value={{ userProfile, loading, signIn, signUp, signOut }}>{children}</AuthContext.Provider>;
};

export const AuthProvider = process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true'
  ? SupabaseAuthProvider
  : process.env.NEXT_PUBLIC_FIREBASE_AUTH_ENABLED === 'true' ? FirebaseAuthProvider : LegacyAuthProvider;
