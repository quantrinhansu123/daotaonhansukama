'use client';

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { Award, BadgeCheck, BarChart3, BookOpen, Building2, CheckCircle2, ChevronDown, ClipboardCheck, Folder, FolderKanban, GraduationCap, Headphones, Home, LayoutDashboard, List, LogOut, PlayCircle, Settings, Shield, Sparkles, Users } from 'lucide-react';
import Link from 'next/link';
import { CourseEnrollment } from '@/components/student/CourseEnrollment';
import { StudentCertificates } from '@/components/student/StudentCertificates';
import { StudentSettings } from '@/components/student/StudentSettings';
import { StudentLibrary } from '@/components/student/StudentLibrary';
import { StudentLearners } from '@/components/student/StudentLearners';
import { StudentProjects } from '@/components/student/StudentProjects';
import { StudentDepartments } from '@/components/student/StudentDepartments';
import { StudentPositions } from '@/components/student/StudentPositions';
import { StudentAssessment } from '@/components/student/StudentAssessment';
import { StudentAccountUser } from '@/components/student/StudentAccountUser';
import { StudentPermissions } from '@/components/student/StudentPermissions';
import { StudentActivityLog } from '@/components/student/StudentActivityLog';
import { DashboardSimple } from '@/components/admin/DashboardSimple';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { collection, query, where, getDocs } from '@/lib/data-store';
import { db } from '@/lib/data-store';
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
  | 'learners'
  | 'projects'
  | 'departments'
  | 'positions'
  | 'assessment'
  | 'account'
  | 'permissions'
  | 'activity'
  | 'certificates'
  | 'library'
  | 'reports'
  | 'settings';

export default function StudentPage() {
  const { userProfile, loading, signOut } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [stats, setStats] = useState<LearningStats>(emptyStats);
  const [loadingStats, setLoadingStats] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [section, setSection] = useState<Section>('overview');
  const accountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loading) return;
    if (!userProfile || (userProfile.role !== 'student' && userProfile.role !== 'staff' && userProfile.role !== 'admin')) {
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
    const isAdmin = userProfile?.role === 'admin';
    if (hash === 'course-list') setSection('courses');
    if (hash === 'programs') setSection('programs');
    if (!isAdmin) {
      if (hash && !['course-list', 'programs', ''].includes(hash)) setSection('overview');
      return;
    }
    if (hash === 'learners' || hash === 'students') setSection('learners');
    if (hash === 'projects') setSection('projects');
    if (hash === 'departments') setSection('departments');
    if (hash === 'positions') setSection('positions');
    if (hash === 'assessment') setSection('assessment');
    if (hash === 'account' || hash === 'users') setSection('account');
    if (hash === 'permissions') setSection('permissions');
    if (hash === 'activity') setSection('activity');
    if (hash === 'certificates') setSection('certificates');
    if (hash === 'library') setSection('library');
    if (hash === 'reports') setSection('reports');
    if (hash === 'settings') setSection('settings');
  }, [userProfile?.role]);

  useEffect(() => {
    if (!userProfile || userProfile.role === 'admin') return;
    if (section !== 'overview' && section !== 'courses' && section !== 'programs') {
      setSection('overview');
    }
  }, [userProfile, section]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f8fc] text-[#63708a]">
        {t('common.loading')}
      </div>
    );
  }

  if (!userProfile || (userProfile.role !== 'student' && userProfile.role !== 'staff' && userProfile.role !== 'admin')) return null;

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const navBtn = (active: boolean) =>
    `flex min-h-[44px] w-full items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 text-left text-[15px] font-extrabold leading-none ${
      active
        ? 'bg-[#18701C] text-white shadow-[inset_3px_0_#EDB409]'
        : 'text-[#e4f5e8] hover:bg-[#18701C]/45'
    }`;

  const navIconClass = 'h-[18px] w-[18px] shrink-0';

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
        : section === 'reports' ? t('student.academy.navReports')
        : section === 'settings' ? t('student.academy.navSettings')
          : section === 'programs' ? t('student.academy.navPrograms')
            : section === 'learners' ? t('student.academy.navStudents')
              : section === 'projects' ? t('student.academy.navProjects')
                : section === 'departments' ? t('student.academy.navDepartments')
                  : section === 'positions' ? t('student.academy.navPositions')
                    : section === 'assessment' ? t('student.academy.navAssessment')
                      : section === 'account' ? t('student.academy.navUsers')
                        : section === 'permissions' ? t('student.academy.navPermissions')
                          : section === 'activity' ? t('student.academy.navActivity')
                            : section === 'courses' ? t('student.academy.courses')
                              : t('student.dashboardTitle');

  return (
    <div className="flex min-h-screen bg-[#f5f8fc] font-sans text-[#111b38]">
      <aside className="sticky top-0 hidden h-screen w-[268px] shrink-0 flex-col bg-gradient-to-b from-[#0a2f12] via-[#0f3d18] to-[#145616] text-[#eef8ef] lg:flex">
        <div className="flex h-[72px] items-center justify-center bg-white px-2">
          <img src="/logo.png" alt="BioKama" className="h-12 w-auto max-w-[168px] object-contain" />
        </div>
        <nav className="flex-1 space-y-1 overflow-auto px-2.5 py-2">
          <button type="button" onClick={() => setSection('overview')} className={navBtn(section === 'overview')}>
            <Home className={navIconClass} />
            {t('student.academy.overview')}
          </button>
          <button type="button" onClick={() => setSection('courses')} className={navBtn(section === 'courses')}>
            <BookOpen className={navIconClass} />
            {t('student.academy.courses')}
          </button>
          <button type="button" onClick={() => setSection('programs')} className={navBtn(section === 'programs')}>
            <GraduationCap className={navIconClass} />
            {t('student.academy.navPrograms')}
          </button>
          {userProfile.role === 'admin' && (
            <>
              <button type="button" onClick={() => setSection('learners')} className={navBtn(section === 'learners')}>
                <Users className={navIconClass} />
                {t('student.academy.navStudents')}
              </button>
              <button type="button" onClick={() => setSection('projects')} className={navBtn(section === 'projects')}>
                <FolderKanban className={navIconClass} />
                {t('student.academy.navProjects')}
              </button>
              <button type="button" onClick={() => setSection('departments')} className={navBtn(section === 'departments')}>
                <Building2 className={navIconClass} />
                {t('student.academy.navDepartments')}
              </button>
              <button type="button" onClick={() => setSection('positions')} className={navBtn(section === 'positions')}>
                <Award className={navIconClass} />
                {t('student.academy.navPositions')}
              </button>
              <button type="button" onClick={() => setSection('assessment')} className={navBtn(section === 'assessment')}>
                <ClipboardCheck className={navIconClass} />
                {t('student.academy.navAssessment')}
              </button>
              <button type="button" onClick={() => setSection('library')} className={navBtn(section === 'library')}>
                <Folder className={navIconClass} />
                {t('student.academy.navLibrary')}
              </button>
              <button type="button" onClick={() => setSection('reports')} className={navBtn(section === 'reports')}>
                <BarChart3 className={navIconClass} />
                {t('student.academy.navReports')}
              </button>
              <button type="button" onClick={() => setSection('certificates')} className={navBtn(section === 'certificates')}>
                <BadgeCheck className={navIconClass} />
                {t('student.academy.navCertificates')}
              </button>
              <p className="mx-2 mb-1 mt-3 border-t border-white/15 pt-3 text-[13px] font-bold uppercase tracking-wide text-[#c5e6cc]">{t('student.academy.navSystem')}</p>
              <Link href="/admin/users" className={navBtn(false)}>
                <LayoutDashboard className={navIconClass} />
                {t('student.academy.openAdminConsole')}
              </Link>
              <button type="button" onClick={() => setSection('account')} className={navBtn(section === 'account')}>
                <Users className={navIconClass} />
                {t('student.academy.navUsers')}
              </button>
              <button type="button" onClick={() => setSection('permissions')} className={navBtn(section === 'permissions')}>
                <Shield className={navIconClass} />
                {t('student.academy.navPermissions')}
              </button>
              <button type="button" onClick={() => setSection('activity')} className={navBtn(section === 'activity')}>
                <List className={navIconClass} />
                {t('student.academy.navActivity')}
              </button>
              <button type="button" onClick={() => setSection('settings')} className={navBtn(section === 'settings')}>
                <Settings className={navIconClass} />
                {t('student.academy.navSettings')}
              </button>
            </>
          )}
        </nav>
        <div className="border-t border-white/15 px-3 py-4">
          <div className="rounded-md bg-[#0c3a16]/80 p-3 ring-1 ring-white/10">
            <div className="flex items-center gap-2.5">
              <Headphones size={22} />
              <span>
                <b className="block text-[15px] font-bold">{t('student.academy.supportTitle')}</b>
                <small className="block text-[12px] font-semibold text-[#c5e6cc]">{t('student.academy.supportHint')}</small>
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

              <section className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label={t('student.learningStats')}>
                {statCards.map(card => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="bg-white px-3 py-2.5 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                      <div className={`mb-1.5 inline-flex rounded p-1.5 ${card.iconBg}`}><Icon className="h-5 w-5" strokeWidth={2.5} /></div>
                      <p className="text-[28px] font-extrabold leading-none tabular-nums tracking-tight">{loadingStats ? '—' : card.value}</p>
                      <p className="mt-1.5 text-[13px] font-bold text-[#53617b]">{card.label}</p>
                    </div>
                  );
                })}
              </section>

              <div id="course-list">
                <CourseEnrollment showHero={false} />
              </div>
            </>
          )}

          {(section === 'courses' || section === 'programs') && (
            <div id="course-list">
              <CourseEnrollment
                showHero
                heading={
                  section === 'programs'
                    ? t('student.academy.navPrograms').toUpperCase()
                    : undefined
                }
              />
            </div>
          )}

          {userProfile.role === 'admin' && section === 'learners' && <StudentLearners />}
          {userProfile.role === 'admin' && section === 'projects' && <StudentProjects />}
          {userProfile.role === 'admin' && section === 'departments' && <StudentDepartments />}
          {userProfile.role === 'admin' && section === 'positions' && <StudentPositions />}
          {userProfile.role === 'admin' && section === 'assessment' && <StudentAssessment />}
          {userProfile.role === 'admin' && section === 'account' && <StudentAccountUser />}
          {userProfile.role === 'admin' && section === 'permissions' && <StudentPermissions />}
          {userProfile.role === 'admin' && section === 'activity' && <StudentActivityLog />}
          {userProfile.role === 'admin' && section === 'certificates' && <StudentCertificates />}
          {userProfile.role === 'admin' && section === 'library' && <StudentLibrary />}
          {userProfile.role === 'admin' && section === 'reports' && <DashboardSimple />}
          {userProfile.role === 'admin' && section === 'settings' && <StudentSettings />}
        </main>
      </div>
    </div>
  );
}
