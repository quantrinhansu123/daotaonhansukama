'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { BookOpen, CheckCircle2, ClipboardCheck, LogOut, PlayCircle, Sparkles } from 'lucide-react';
import { Button } from '@/components/Button';
import { CourseEnrollment } from '@/components/student/CourseEnrollment';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getVideoPoints, VIDEO_POINTS_PER_LESSON } from '@/lib/learning-progress';

interface LearningStats {
  points: number;
  completedVideos: number;
  inProgressVideos: number;
  passedQuizzes: number;
}

const emptyStats: LearningStats = {
  points: 0,
  completedVideos: 0,
  inProgressVideos: 0,
  passedQuizzes: 0,
};

export default function StudentPage() {
  const { userProfile, loading, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [stats, setStats] = useState<LearningStats>(emptyStats);
  const [loadingStats, setLoadingStats] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!userProfile || (userProfile.role !== 'student' && userProfile.role !== 'staff')) {
      router.push('/');
      return;
    }

    let active = true;
    const loadLearningStats = async () => {
      try {
        setLoadingStats(true);
        const [progressSnapshot, quizSnapshot] = await Promise.all([
          getDocs(query(collection(db, 'progress'), where('userId', '==', userProfile.uid))),
          getDocs(query(collection(db, 'quizResults'), where('userId', '==', userProfile.uid))),
        ]);

        // A lesson may have old duplicate records; count each video only once.
        const videos = new Map<string, { lessonId: string; completed: boolean }>();
        progressSnapshot.docs.forEach(snapshot => {
          const record = snapshot.data();
          if (!record.lessonId) return;
          const previous = videos.get(record.lessonId);
          videos.set(record.lessonId, {
            lessonId: record.lessonId,
            completed: Boolean(previous?.completed || record.completed),
          });
        });
        const videoProgress = Array.from(videos.values());

        const passedLessons = new Set<string>();
        quizSnapshot.docs.forEach(snapshot => {
          const result = snapshot.data();
          if (result.lessonId && result.score >= 70) passedLessons.add(result.lessonId);
        });

        if (active) {
          setStats({
            points: getVideoPoints(videoProgress),
            completedVideos: videoProgress.filter(video => video.completed).length,
            inProgressVideos: videoProgress.filter(video => !video.completed).length,
            passedQuizzes: passedLessons.size,
          });
        }
      } catch (error) {
        console.error('Error loading learning stats:', error);
      } finally {
        if (active) setLoadingStats(false);
      }
    };
    void loadLearningStats();
    return () => { active = false; };
  }, [userProfile, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#080d19] text-slate-300">
        {t('common.loading')}
      </div>
    );
  }

  if (!userProfile || (userProfile.role !== 'student' && userProfile.role !== 'staff')) return null;

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const statCards = [
    { label: t('student.videoPoints'), value: stats.points, icon: Sparkles, accent: 'text-cyan-300', iconBg: 'bg-cyan-400/10' },
    { label: t('student.completedVideos'), value: stats.completedVideos, icon: CheckCircle2, accent: 'text-emerald-300', iconBg: 'bg-emerald-400/10' },
    { label: t('student.inProgressVideos'), value: stats.inProgressVideos, icon: PlayCircle, accent: 'text-blue-300', iconBg: 'bg-blue-400/10' },
    { label: t('student.passedQuizzes'), value: stats.passedQuizzes, icon: ClipboardCheck, accent: 'text-violet-300', iconBg: 'bg-violet-400/10' },
  ];

  return (
    <div className="min-h-screen bg-[#080d19] text-slate-100">
      <header className="sticky top-0 z-50 border-b border-slate-800/80 bg-[#0a1220]/95 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex min-h-16 items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="rounded-xl border border-cyan-400/20 bg-cyan-400/10 p-2.5">
              <BookOpen className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-white truncate">{t('student.dashboardTitle')}</h1>
              <p className="text-xs text-slate-400">{t('student.myLearning')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageSwitcher variant="light" />
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-slate-100">{userProfile.displayName}</p>
              <p className="text-xs text-slate-400">{userProfile.email}</p>
            </div>
            <Button onClick={handleSignOut} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700">
              <LogOut size={16} />
              <span className="hidden sm:inline">{t('common.logout')}</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        <section className="relative overflow-hidden rounded-3xl border border-slate-700/60 bg-gradient-to-br from-[#14243c] via-[#101b2e] to-[#0c1525] p-6 sm:p-8">
          <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
              <Sparkles size={13} /> {t('student.myLearning')}
            </div>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-2">
              {t('student.welcomeShort', { name: userProfile.displayName || userProfile.email || '' })}
            </h2>
            <p className="text-slate-300">{t('student.welcomeSub')}</p>
            <p className="mt-5 text-sm text-cyan-200">{t('student.videoPointsRule', { points: VIDEO_POINTS_PER_LESSON })}</p>
          </div>
        </section>

        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4" aria-label={t('student.learningStats')}>
          {statCards.map(card => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="rounded-2xl border border-slate-800 bg-[#111b2b] p-4 sm:p-5 shadow-xl shadow-black/10">
                <div className={`mb-5 inline-flex rounded-xl p-2.5 ${card.iconBg}`}><Icon className={`w-5 h-5 ${card.accent}`} /></div>
                <p className="text-2xl sm:text-3xl font-semibold tabular-nums text-white">{loadingStats ? '—' : card.value}</p>
                <p className="mt-1 text-xs sm:text-sm text-slate-400">{card.label}</p>
              </div>
            );
          })}
        </section>

        <CourseEnrollment />
      </main>
    </div>
  );
}
