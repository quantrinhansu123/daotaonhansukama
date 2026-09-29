'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';

export default function AdminPage() {
  const { userProfile, loading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!userProfile) {
      router.replace('/');
      return;
    }
    if (userProfile.role === 'admin' || userProfile.role === 'staff') {
      // Cùng giao diện học viên
      router.replace('/student');
      return;
    }
    router.replace('/');
  }, [userProfile, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#f5f8fc]">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-slate-600">{t('common.redirecting')}</p>
      </div>
    </div>
  );
}
