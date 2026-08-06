'use client';

import React, { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { GraduationCap, LogOut } from 'lucide-react';
import { Button } from '@/components/Button';
import { MyCourses } from '@/components/teacher/MyCourses';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

export default function TeacherPage() {
  const { userProfile, loading, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (!loading) {
      if (!userProfile) {
        router.push('/');
      } else if (userProfile.role !== 'teacher') {
        router.push('/');
      }
    }
  }, [userProfile, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#311898]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#53cafd] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!userProfile || userProfile.role !== 'teacher') {
    return null;
  }

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-[#5e3ed0]/20 backdrop-blur-md border-b border-white/10 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-[#53cafd]/20 p-2 rounded-lg">
                <GraduationCap className="w-6 h-6 text-[#53cafd]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{t('teacher.dashboard')}</h1>
                <p className="text-xs text-slate-300">{t('teacher.subtitle')}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <LanguageSwitcher variant="light" />
              <div className="text-right">
                <p className="text-sm font-medium text-white">{userProfile.displayName}</p>
                <p className="text-xs text-slate-300">{userProfile.email}</p>
              </div>
              <Button onClick={handleSignOut} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border-none">
                <LogOut size={16} />
                {t('common.logout')}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="bg-gradient-to-r from-[#5e3ed0]/40 to-[#53cafd]/40 backdrop-blur-md border border-white/10 rounded-2xl p-8 text-white mb-8">
          <h2 className="text-3xl font-bold mb-2">{t('teacher.welcome', { name: userProfile.displayName })}</h2>
          <p className="text-slate-200">{t('teacher.welcomeSub')}</p>
        </div>

        {/* My Courses */}
        <MyCourses />
      </main>
    </div>
  );
}
