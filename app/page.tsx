"use client";

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Auth } from '@/components/Auth';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

const App: React.FC = () => {
  const { userProfile, loading } = useAuth();
  const { t, dateLocale } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (!loading && userProfile) {
      // Đã đăng nhập -> chuyển hướng theo role
      switch (userProfile.role) {
        case 'admin':
          router.push('/admin');
          break;
        case 'staff':
          router.push('/admin');
          break;
        case 'teacher':
          router.push('/teacher');
          break;
        case 'student':
          router.push('/student');
          break;
        default:
          router.push('/admin');
      }
    }
  }, [userProfile, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Nếu đã đăng nhập, hiển thị loading trong khi chuyển hướng
  if (userProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">{t('common.redirecting')}</p>
        </div>
      </div>
    );
  }

  // Chưa đăng nhập -> hiển thị trang đăng nhập
  return (
    <Auth
      initialMode="login"
      onBack={() => {}} // Không cần nút back vì không có landing page
    />
  );
};

export default App;