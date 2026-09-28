'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { Award, BadgeCheck, BarChart3, BookOpen, Building2, CheckCircle2, ChevronDown, ClipboardCheck, Folder, FolderKanban, GraduationCap, Headphones, Home, List, LogOut, PlayCircle, Settings, Shield, Sparkles, Users } from 'lucide-react';
import { CourseEnrollment } from '@/components/student/CourseEnrollment';
import { StudentCertificates } from '@/components/student/StudentCertificates';
import { StudentSettings } from '@/components/student/StudentSettings';
import { StudentLibrary } from '@/components/student/StudentLibrary';
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

type Section =
  | 'overview'
  | 'courses'
  | 'programs'
  | 'certificates'
  | 'library'
  | 'settings';

export default function StudentPage() {
  const { userProfile, loading, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [stats, setStats] = useState<LearningStats>(emptyStats);
  const [loadingStats, setLoadingStats] = useState(true);
  const [toastMsg, setToastMsg] = useState('');
  const [accountOpen, setAccountOpen] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const accountRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!accountOpen) return;
    const close = (event: MouseEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [accountOpen]);

  useEffect(() => {
    const hash = window.location.hash.replace('#', '');
    if (hash === 'course-list') setSection('courses');
    if (hash === 'certificates') setSection('certificates');
    if (hash === 'library') setSection('library');
    if (hash === 'settings') setSection('settings');
    if (hash === 'programs') setSection('programs');
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f8fc] text-[#63708a]">
        {t('common.loading')}
      </div>
    );
  }

  if (!userProfile || (userProfile.role !== 'student' && userProfile.role !== 'staff')) return null;

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const showSoon = () => {
    setToastMsg(t('student.academy.navSoon'));
    window.setTimeout(() => setToastMsg(''), 2200);
  };

  const navBtn = (active: boolean) =>
    active
      ? 'bg-[#18701C] text-white shadow-[inset_3px_0_#EDB409]'
      : 'text-[#e4f5e8] hover:bg-[#18701C]/45';

  const initials = (userProfile.displayName || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');
  const statCards = [
    { label: t('student.videoPoints'), value: stats.points, icon: Sparkles, iconBg: 'bg-[#eff6ff] text-[#1B7A1E]' },
    { label: t('student.completedVideos'), value: stats.completedVideos, icon: CheckCircle2, iconBg: 'bg-[#edfbf8] text-[#07965f]' },
    { label: t('student.inProgressVideos'), value: stats.inProgressVideos, icon: PlayCircle, iconBg: 'bg-[#eff6ff] text-[#1B7A1E]' },
    { label: t('student.passedQuizzes'), value: stats.passedQuizzes, icon: ClipboardCheck, iconBg: 'bg-[#fff6e9] text-[#df8b00]' },
  ];

  const headerTitle =
    section === 'certificates' ? t('student.academy.navCertificates')
      : section === 'library' ? t('student.academy.navLibrary')
        : section === 'settings' ? t('student.academy.navSettings')
          : section === 'programs' ? t('student.academy.navPrograms')
            : section === 'courses' ? t('student.academy.courses')
              : t('student.dashboardTitle');

  return (
    <div className="flex min-h-screen bg-[#f5f8fc] font-sans text-[#111b38]">
      <aside className="sticky top-0 hidden h-screen w-[204px] shrink-0 flex-col bg-gradient-to-b from-[#0a2f12] via-[#0f3d18] to-[#145616] text-[#eef8ef] lg:flex">
        <div className="flex h-[72px] items-center justify-center bg-white px-2">
          <img src="/logo.png" alt="BioKama" className="h-12 w-auto max-w-[168px] object-contain" />
        </div>
        <nav className="flex-1 space-y-1 overflow-auto px-2.5 py-2">
          <button type="button" onClick={() => setSection('overview')} className={`flex min-h-[38px] w-full items-center gap-3 rounded px-2.5 text-left text-[12px] ${navBtn(section === 'overview')}`}>
            <Home size={18} />
            {t('student.academy.overview')}
          </button>
          <button type="button" onClick={() => setSection('courses')} className={`flex min-h-[38px] w-full items-center gap-3 rounded px-2.5 text-left text-[12px] ${navBtn(section === 'courses')}`}>
            <BookOpen size={18} />
            {t('student.academy.courses')}
          </button>
          <button type="button" onClick={() => setSection('programs')} className={`flex min-h-[38px] w-full items-center gap-3 rounded px-2.5 text-left text-[12px] ${navBtn(section === 'programs')}`}>
            <GraduationCap size={18} />
            {t('student.academy.navPrograms')}
          </button>
          {[
            { icon: Users, label: t('student.academy.navStudents') },
            { icon: FolderKanban, label: t('student.academy.navProjects') },
            { icon: Building2, label: t('student.academy.navDepartments') },
            { icon: Award, label: t('student.academy.navPositions') },
            { icon: ClipboardCheck, label: t('student.academy.navAssessment') },
          ].map(item => (
            <button key={item.label} type="button" onClick={showSoon} className="flex min-h-[38px] w-full items-center gap-3 rounded px-2.5 text-left text-[12px] text-[#e4f5e8] hover:bg-[#18701C]/45">
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
          <button type="button" onClick={() => setSection('library')} className={`flex min-h-[38px] w-full items-center gap-3 rounded px-2.5 text-left text-[12px] ${navBtn(section === 'library')}`}>
            <Folder size={18} />
            {t('student.academy.navLibrary')}
          </button>
          <button type="button" onClick={showSoon} className="flex min-h-[38px] w-full items-center gap-3 rounded px-2.5 text-left text-[12px] text-[#e4f5e8] hover:bg-[#18701C]/45">
            <BarChart3 size={18} />
            {t('student.academy.navReports')}
          </button>
          <button type="button" onClick={() => setSection('certificates')} className={`flex min-h-[38px] w-full items-center gap-3 rounded px-2.5 text-left text-[12px] ${navBtn(section === 'certificates')}`}>
            <BadgeCheck size={18} />
            {t('student.academy.navCertificates')}
          </button>
          <p className="mx-2 mb-1 mt-3 border-t border-white/15 pt-3 text-[11px] text-[#b7dfc0]">{t('student.academy.navSystem')}</p>
          {[
            { icon: Users, label: t('student.academy.navUsers') },
            { icon: Shield, label: t('student.academy.navPermissions') },
            { icon: List, label: t('student.academy.navActivity') },
          ].map(item => (
            <button key={item.label} type="button" onClick={showSoon} className="flex min-h-[38px] w-full items-center gap-3 rounded px-2.5 text-left text-[12px] text-[#e4f5e8] hover:bg-[#18701C]/45">
              <item.icon size={18} />
              {item.label}
            </button>
          ))}
          <button type="button" onClick={() => setSection('settings')} className={`flex min-h-[38px] w-full items-center gap-3 rounded px-2.5 text-left text-[12px] ${navBtn(section === 'settings')}`}>
            <Settings size={18} />
            {t('student.academy.navSettings')}
          </button>
        </nav>
        <div className="border-t border-white/15 px-3 py-4">
          <div className="rounded-md bg-[#0c3a16]/80 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2.5">
              <Headphones size={18} />
              <span>
                <b className="block text-[12px]">{t('student.academy.supportTitle')}</b>
                <small className="block text-[10px] text-[#c5e6cc]">{t('student.academy.supportHint')}</small>
              </span>
            </div>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-[54px] shrink-0 items-center gap-3 border-b border-[#ecf0f6] bg-white px-4">
          <div className="min-w-0">
            <b className="block truncate text-[13px]">{headerTitle}</b>
            <small className="block text-[10px] text-[#66718b]">{t('student.myLearning')}</small>
          </div>
          <div className="flex-1" />
          <LanguageSwitcher className="!h-8 !rounded-md !px-2 !py-0 !text-[11px]" />
          <div className="relative" ref={accountRef}>
            <button
              type="button"
              onClick={() => setAccountOpen(open => !open)}
              className="flex h-9 items-center gap-2 rounded-md px-1.5 text-left hover:bg-[#f4f7fb]"
              aria-expanded={accountOpen}
              aria-haspopup="menu"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#e8eef8] text-[11px] font-bold text-[#1d3b73]">
                {initials}
              </span>
              <span className="hidden min-w-0 sm:block">
                <b className="block max-w-[160px] truncate text-[12px] leading-tight text-[#111b38]">{userProfile.displayName}</b>
                <small className="block text-[10px] leading-tight text-[#66718b]">
                  {userProfile.role === 'staff' ? t('student.academy.staffRole') : t('student.academy.studentRole')}
                </small>
              </span>
              <ChevronDown size={14} className={`hidden text-[#63708a] sm:block ${accountOpen ? 'rotate-180' : ''}`} />
            </button>
            {accountOpen && (
              <div role="menu" className="absolute right-0 top-[calc(100%+6px)] z-30 w-[240px] rounded-lg border border-[#e7edf5] bg-white p-1.5 shadow-[0_12px_32px_rgba(24,48,93,0.12)]">
                <div className="border-b border-[#eef2f7] px-2.5 py-2">
                  <b className="block truncate text-[12px] text-[#111b38]">{userProfile.displayName}</b>
                  <small className="block truncate text-[11px] text-[#66718b]">{userProfile.email}</small>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleSignOut}
                  className="mt-1 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[12px] text-[#9b2c2c] hover:bg-[#fff5f5]"
                >
                  <LogOut size={14} />
                  {t('common.logout')}
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="mx-auto max-w-[1500px] space-y-4 px-4 py-4">
          {section === 'overview' && (
            <>
              <section className="bg-white px-4 py-4 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                <h2 className="mb-1 text-[21px] font-bold tracking-tight">
                  {t('student.welcomeShort', { name: userProfile.displayName || userProfile.email || '' })}
                </h2>
                <p className="text-[12px] text-[#53617b]">{t('student.welcomeSub')}</p>
                <p className="mt-2 text-[12px] text-[#1B7A1E]">{t('student.videoPointsRule', { points: VIDEO_POINTS_PER_LESSON })}</p>
              </section>

              <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t('student.learningStats')}>
                {statCards.map(card => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="bg-white p-4 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                      <div className={`mb-3 inline-flex rounded p-2 ${card.iconBg}`}><Icon className="h-4 w-4" /></div>
                      <p className="text-[22px] font-bold tabular-nums">{loadingStats ? '—' : card.value}</p>
                      <p className="mt-1 text-[11px] text-[#63708a]">{card.label}</p>
                    </div>
                  );
                })}
              </section>

              <div id="course-list">
                <CourseEnrollment />
              </div>
            </>
          )}

          {(section === 'courses' || section === 'programs') && (
            <div id="course-list">
              <div className="mb-4">
                <h1 className="m-0 text-[24px] font-bold text-[#111b38]">
                  {section === 'programs' ? t('student.academy.navPrograms') : t('student.academy.courses')}
                </h1>
                <p className="mt-1 text-[13px] text-[#63708a]">
                  {section === 'programs' ? t('student.deptCoursesHint') : t('student.yourCourses')}
                </p>
              </div>
              <CourseEnrollment />
            </div>
          )}

          {section === 'certificates' && <StudentCertificates />}
          {section === 'library' && <StudentLibrary />}
          {section === 'settings' && <StudentSettings />}
        </main>
      </div>
      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md bg-[#111b38] px-4 py-2 text-[12px] text-white shadow-lg">{toastMsg}</div>
      )}
    </div>
  );
}
