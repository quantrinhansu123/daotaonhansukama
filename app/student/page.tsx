'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { BookOpen, LogOut } from 'lucide-react';
import { Button } from '@/components/Button';
import { CourseEnrollment } from '@/components/student/CourseEnrollment';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export default function StudentPage() {
  const { userProfile, loading, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [stats, setStats] = useState({
    totalCourses: 0,
    completedCourses: 0,
    inProgressCourses: 0,
    totalLearningTime: 0,
    averageProgress: 0,
    certificatesEarned: 0
  });
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (!loading) {
      if (!userProfile) {
        router.push('/');
      } else if (userProfile.role !== 'student' && userProfile.role !== 'staff') {
        router.push('/');
      } else {
        loadLearningStats();
      }
    }
  }, [userProfile, loading, router]);

  const loadLearningStats = async () => {
    if (!userProfile?.uid) return;

    try {
      setLoadingStats(true);

      const enrollmentsRef = collection(db, 'enrollments');
      const q = query(enrollmentsRef, where('userId', '==', userProfile.uid));
      const snapshot = await getDocs(q);

      let totalProgress = 0;
      let completed = 0;
      let inProgress = 0;
      let totalTime = 0;
      let certificates = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const progress = data.progress || 0;
        totalProgress += progress;

        if (progress >= 100) {
          completed++;
          certificates++;
        } else if (progress > 0) {
          inProgress++;
        }

        totalTime += (progress / 100) * 10;
      });

      setStats({
        totalCourses: snapshot.docs.length,
        completedCourses: completed,
        inProgressCourses: inProgress,
        totalLearningTime: Math.round(totalTime),
        averageProgress: snapshot.docs.length > 0 ? Math.round(totalProgress / snapshot.docs.length) : 0,
        certificatesEarned: certificates
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

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

  if (!userProfile || (userProfile.role !== 'student' && userProfile.role !== 'staff')) {
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
                <BookOpen className="w-6 h-6 text-[#53cafd]" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">{t('student.dashboardTitle')}</h1>
                <p className="text-xs text-slate-300">{t('student.myLearning')}</p>
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
          <h2 className="text-3xl font-bold mb-2">{t('student.welcomeShort', { name: userProfile.displayName })}</h2>
          <p className="text-slate-200">{t('student.welcomeSub')}</p>
        </div>

        {/* Course Enrollment */}
        <CourseEnrollment />
      </main>
    </div>
  );
}
