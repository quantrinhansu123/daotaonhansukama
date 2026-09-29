'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
    } catch (err) {
      await client.auth.signOut();
      throw err;
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
