'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where, doc, runTransaction } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { Course } from '@/types/course';
import { Lesson, QuizResult } from '@/types/lesson';
import { LessonProgress } from '@/types/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Play, Pause, Lock, Clock, FileText, HelpCircle, Maximize, RotateCcw, Rewind, Menu, ChevronDown, Bookmark, Search, Bell, Award, Lightbulb, Headphones, Home, BookOpen, Users, Calendar, Clapperboard, GraduationCap, FolderKanban, Building2, ClipboardCheck, Folder, BarChart3, BadgeCheck, Shield, List, Settings, Layers, Signal, UserRound, CheckCircle2, CirclePlay, Square, CheckSquare, Upload } from 'lucide-react';
import { QuizTaker } from './QuizTaker';
import { DemoVideoView } from '@/components/shared/DemoVideoView';
import { resolveDemoVideo } from '@/lib/demo-video';
import { ProfileModal } from '@/components/ProfileModal';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import { cloudflyVideoUrl } from '@/lib/cloudfly-video';
import { getViewedSeconds, mergeWatchedRanges, VIDEO_COMPLETION_RATIO, VIDEO_POINTS_PER_LESSON, WatchedRange } from '@/lib/learning-progress';
import { LessonManagement } from '@/components/teacher/LessonManagement';

interface CourseViewerProps {
  course: Course;
  onBack: () => void;
}

export const CourseViewer: React.FC<CourseViewerProps> = ({ course, onBack }) => {
  const { userProfile } = useAuth();
  const { t, dateLocale } = useLanguage();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [filteredLessons, setFilteredLessons] = useState<Lesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<Lesson | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<Record<string, LessonProgress>>({});
  const [progressLoaded, setProgressLoaded] = useState(false);
  const [viewMode, setViewMode] = useState<'video' | 'document' | 'quiz'>('video');
  const [takingQuiz, setTakingQuiz] = useState(false);
  const [showAttentionCheck, setShowAttentionCheck] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [selectedCourseId, setSelectedCourseId] = useState<string>(course.id);
  const [allCourses, setAllCourses] = useState<Course[]>([]);
  const [quizResults, setQuizResults] = useState<Record<string, QuizResult>>({});
  const [bannerError, setBannerError] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'docs' | 'qa' | 'reviews' | 'news'>('info');
  const [playerOpen, setPlayerOpen] = useState(false);
  const [introOpen, setIntroOpen] = useState(false);
  const [playSession, setPlaySession] = useState(0);
  const [certOpen, setCertOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [mobileNav, setMobileNav] = useState(false);
  const [saved, setSaved] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const [lessonQuery, setLessonQuery] = useState('');
  const [showProfile, setShowProfile] = useState(false);
  const [managingContent, setManagingContent] = useState(false);
  const toastTimer = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastProgressSaveAt = useRef(0);
  const attentionCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLDivElement>(null);

  // Check if user is staff (needs anti-cheat features)
  const isStaff = userProfile?.role === 'staff';
  const canManageContent = userProfile?.role === 'admin';

  // Prefer fresh course prop from the page so admin updates (demo video) are not overwritten by a stale allCourses cache.
  const listedCourse = allCourses.find(c => c.id === selectedCourseId);
  const currentCourse = selectedCourseId === course.id
    ? { ...(listedCourse || {}), ...course, id: course.id }
    : (listedCourse || course);

  useEffect(() => {
    setSelectedCourseId(course.id);
  }, [course.id]);

  useEffect(() => {
    setAllCourses(prev => {
      if (!prev.length) return prev;
      const index = prev.findIndex(item => item.id === course.id);
      if (index < 0) return prev;
      const next = [...prev];
      next[index] = { ...next[index], ...course, id: course.id };
      return next;
    });
  }, [course]);

  // Reset banner error when course changes or banner URL changes
  useEffect(() => {
    setBannerError(false);
  }, [currentCourse.id, currentCourse.banner, currentCourse.demoVideoKey]);

  useEffect(() => {
    loadUserCourses();
  }, [userProfile]);

  useEffect(() => {
    if (selectedCourseId) {
      setProgressLoaded(false);
      setProgress({});
      void loadLessons();
      void loadProgress();
      void loadQuizResults();
    }
  }, [selectedCourseId]);

  useEffect(() => {
    if (selectedTag === 'all') {
      setFilteredLessons(lessons);
    } else {
      setFilteredLessons(lessons.filter(lesson => lesson.tags?.includes(selectedTag)));
    }
  }, [lessons, selectedTag]);

  useEffect(() => {
    const canPlayCloudFly = Boolean(selectedLesson && resolveDemoVideo(selectedLesson.videoKey, selectedLesson.videoId || selectedLesson.videoUrl)?.kind === 'cloudfly');
    if (playerOpen && canPlayCloudFly && progressLoaded && viewMode === 'video') {
      lastProgressSaveAt.current = 0;
      const timer = window.setTimeout(() => {
        void initializeVideo();
      }, 60);
      return () => {
        window.clearTimeout(timer);
        if (attentionCheckTimer.current) {
          clearTimeout(attentionCheckTimer.current);
        }
      };
    }

    return () => {
      if (attentionCheckTimer.current) {
        clearTimeout(attentionCheckTimer.current);
      }
    };
  }, [selectedLesson?.id, selectedLesson?.videoKey, selectedLesson?.videoId, selectedLesson?.videoUrl, progressLoaded, playerOpen, viewMode, playSession]);

  // Pause whenever the browser tab is hidden (all roles).
  useEffect(() => {
    const pauseAllVideos = () => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
      heroRef.current?.querySelectorAll('video').forEach(video => {
        if (!video.paused) video.pause();
      });
    };

    const handleVisibilityChange = () => {
      if (document.hidden) pauseAllVideos();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Anti-cheat: Attention check every 30 seconds (staff only)
  useEffect(() => {
    if (!isStaff || !videoRef.current) return;

    const startAttentionCheck = () => {
      if (attentionCheckTimer.current) {
        clearTimeout(attentionCheckTimer.current);
      }

      attentionCheckTimer.current = setTimeout(() => {
        if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
          setShowAttentionCheck(true);
          console.log('⚠️ Attention check triggered');
        }
      }, 30000); // 30 seconds
    };

    const video = videoRef.current;

    const handlePlay = () => {
      setIsPlaying(true);
      startAttentionCheck();
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (attentionCheckTimer.current) {
        clearTimeout(attentionCheckTimer.current);
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      if (attentionCheckTimer.current) {
        clearTimeout(attentionCheckTimer.current);
      }
    };
  }, [isStaff, selectedLesson?.id, playerOpen]);

  const initializeVideo = () => {
    if (!selectedLesson || !videoRef.current) return;
    const source = resolveDemoVideo(selectedLesson.videoKey, selectedLesson.videoId || selectedLesson.videoUrl);
    if (source?.kind !== 'cloudfly') return;
    const video = videoRef.current;
    const nextSrc = cloudflyVideoUrl(source.key);
    // Avoid reloading the same stream (looks like the page keeps refreshing).
    if (video.getAttribute('src') === nextSrc || video.src.endsWith(nextSrc)) {
      return;
    }
    const savedProgress = progress[selectedLesson.id];
    if (savedProgress && savedProgress.watchedSeconds > 5) {
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = savedProgress.watchedSeconds;
      }, { once: true });
    }
    video.src = nextSrc;
    video.load();
  };

  const loadUserCourses = async () => {
    if (!userProfile) return;

    try {
      const coursesRef = collection(db, 'courses');
      const snapshot = await getDocs(coursesRef);
      const coursesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Course[];

      // Filter courses that user is enrolled in
      const userCourses = coursesData.filter(c =>
        (userProfile.uid && c.students?.includes(userProfile.uid)) || userProfile.role === 'admin'
      );

      setAllCourses(userCourses);
    } catch (error) {
      console.error('Error loading user courses:', error);
    }
  };

  const loadLessons = async () => {
    try {
      const isFirstLoad = lessons.length === 0;
      if (isFirstLoad) setLoading(true);
      const lessonsRef = collection(db, 'lessons');
      const q = query(lessonsRef, where('courseId', '==', selectedCourseId));
      const snapshot = await getDocs(q);
      const lessonsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lesson[];

      lessonsData.sort((a, b) => a.order - b.order);
      setLessons(lessonsData);

      setSelectedLesson(prev => {
        if (prev && lessonsData.some(item => item.id === prev.id)) {
          return prev;
        }
        return lessonsData[0] || null;
      });
    } catch (error) {
      console.error('Error loading lessons:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProgress = async () => {
    if (!userProfile || !userProfile.uid) {
      setProgressLoaded(true);
      return;
    }

    try {
      const progressRef = collection(db, 'progress');
      const q = query(
        progressRef,
        where('userId', '==', userProfile.uid),
        where('courseId', '==', selectedCourseId)
      );
      const snapshot = await getDocs(q);
      const progressMap: Record<string, LessonProgress> = {};

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        progressMap[data.lessonId] = {
          ...data,
          lastWatchedAt: data.lastWatchedAt?.toDate ? data.lastWatchedAt.toDate() : new Date()
        } as LessonProgress;
      });

      setProgress(progressMap);
      setProgressLoaded(true);
    } catch (error) {
      console.error('Error loading progress:', error);
      setProgressLoaded(true);
    }
  };

  const loadQuizResults = async () => {
    if (!userProfile || !userProfile.uid) return;

    try {
      const resultsRef = collection(db, 'quizResults');
      const q = query(
        resultsRef,
        where('userId', '==', userProfile.uid),
        where('courseId', '==', selectedCourseId)
      );
      const snapshot = await getDocs(q);
      const resultsMap: Record<string, QuizResult> = {};

      snapshot.docs.forEach(doc => {
        const data = doc.data() as QuizResult;
        resultsMap[data.lessonId] = data;
      });

      setQuizResults(resultsMap);
    } catch (error) {
      console.error('Error loading quiz results:', error);
    }
  };

  const isLessonLocked = (_lesson: Lesson, _index: number): boolean => {
    // Open every lesson; no sequential quiz lock.
    return false;
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current || !selectedLesson) return;

    const video = videoRef.current;
    const currentTime = video.currentTime;
    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    const playedRanges = getPlayedRanges(video);
    const completionReached = !progress[selectedLesson.id]?.completed &&
      getViewedSeconds(mergeWatchedRanges(playedRanges, duration)) / duration >= VIDEO_COMPLETION_RATIO;

    // Persist every 30 seconds, and immediately when the video reaches 90% viewed.
    const saveInterval = completionReached ? 5000 : 30000;
    if (Date.now() - lastProgressSaveAt.current >= saveInterval) {
      lastProgressSaveAt.current = Date.now();
      void saveProgress(currentTime, duration, playedRanges);
    }
  };

  const getPlayedRanges = (video: HTMLVideoElement): WatchedRange[] => {
    const ranges: WatchedRange[] = [];
    for (let index = 0; index < video.played.length; index++) {
      ranges.push({ start: video.played.start(index), end: video.played.end(index) });
    }
    return ranges;
  };

  const handleVideoPause = () => {
    const video = videoRef.current;
    if (video && !video.ended) {
      void saveProgress(video.currentTime, video.duration, getPlayedRanges(video));
    }
  };

  const handleVideoEnded = () => {
    const video = videoRef.current;
    if (video) {
      void saveProgress(video.currentTime, video.duration, getPlayedRanges(video));
    }
  };

  const handleAttentionCheckContinue = () => {
    setShowAttentionCheck(false);
    if (videoRef.current) {
      videoRef.current.play();
    }
  };

  const handlePlayPause = () => {
    if (!videoRef.current) return;

    if (videoRef.current.paused) {
      videoRef.current.play();
      setIsPlaying(true);
    } else {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const handleFullscreen = async () => {
    if (!videoContainerRef.current) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await videoContainerRef.current.requestFullscreen();
      }
    } catch (error) {
      console.error('Fullscreen error:', error);
    }
  };

  const handleRewind = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
  };

  const handleRestart = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play();
    setIsPlaying(true);
  };

  const saveProgress = async (watchedSeconds: number, totalSeconds: number, playedRanges: WatchedRange[]) => {
    if (!selectedLesson || !userProfile || !userProfile.uid) return;
    if (!Number.isFinite(totalSeconds) || totalSeconds <= 0 || !Number.isFinite(watchedSeconds)) return;

    try {
      const progressId = `${userProfile.uid}_${selectedLesson.id}`;
      const progressRef = doc(db, 'progress', progressId);
      const lessonId = selectedLesson.id;
      const userId = userProfile.uid;
      const progressData = await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(progressRef);
        const existingProgress = snapshot.exists() ? snapshot.data() as Partial<LessonProgress> : null;
        const watchedRanges = mergeWatchedRanges(
          [...(existingProgress?.watchedRanges || []), ...playedRanges],
          totalSeconds
        );
        const viewedSeconds = getViewedSeconds(watchedRanges);
        const finalWatchedSeconds = Math.max(
          Math.floor(Math.min(watchedSeconds, totalSeconds)),
          existingProgress?.watchedSeconds || 0
        );
        const completed = Boolean(existingProgress?.completed) || viewedSeconds / totalSeconds >= VIDEO_COMPLETION_RATIO;

        const data: LessonProgress = {
          id: progressId,
          userId,
          courseId: selectedCourseId,
          lessonId,
          watchedSeconds: finalWatchedSeconds,
          totalSeconds: Math.floor(totalSeconds),
          viewedSeconds,
          watchedRanges,
          completed,
          lastWatchedAt: new Date()
        };
        if (existingProgress?.completed === completed &&
            existingProgress?.watchedSeconds === finalWatchedSeconds &&
            existingProgress?.viewedSeconds === viewedSeconds) {
          return data;
        }
        transaction.set(progressRef, data);
        return data;
      });

      setProgress(prev => ({
        ...prev,
        [lessonId]: progressData
      }));
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    setSaved(window.localStorage.getItem(`course-saved-${currentCourse.id}`) === '1');
  }, [currentCourse.id]);

  const chapters = useMemo(() => {
    const grouped = new Map<string, Lesson[]>();
    filteredLessons.forEach(lesson => {
      const name = lesson.tags?.[0] || t('student.courseContent');
      const bucket = grouped.get(name) || [];
      bucket.push(lesson);
      grouped.set(name, bucket);
    });
    return Array.from(grouped.entries()).map(([name, items]) => ({ name, items }));
  }, [filteredLessons, t]);

  const showToast = (message: string) => {
    setToastMsg(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(''), 3200);
  };

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center bg-[#f5f8fc] text-[#63708a]">
        {t('common.loading')}
      </div>
    );
  }

  const lessonIndex = (lesson: Lesson) => filteredLessons.findIndex(item => item.id === lesson.id);
  const completedCount = lessons.filter(lesson => progress[lesson.id]?.completed).length;
  const percent = lessons.length ? Math.round((completedCount / lessons.length) * 100) : 0;

  const openLesson = (lesson: Lesson, index: number) => {
    const safeIndex = index < 0 ? lessonIndex(lesson) : index;
    if (safeIndex > 0 && isLessonLocked(lesson, safeIndex)) {
      const previousLesson = filteredLessons[safeIndex - 1];
      alert(t('student.unlockLessonAlert', { title: previousLesson?.title || '' }));
      return;
    }

    const isSameLesson = selectedLesson?.id === lesson.id && playerOpen;
    setSelectedLesson(lesson);
    setMobileNav(false);
    setTakingQuiz(false);
    setIntroOpen(false);
    setViewMode('video');
    setPlayerOpen(true);
    if (!isSameLesson) {
      setPlaySession(value => value + 1);
    }

    const chapterName = chapters.find(chapter => chapter.items.some(item => item.id === lesson.id))?.name;
    if (chapterName) {
      setCollapsed(prev => ({ ...prev, [chapterName]: false }));
    }

    window.setTimeout(() => heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

    if (!resolveDemoVideo(lesson.videoKey, lesson.videoId || lesson.videoUrl)) {
      if (lesson.hasQuiz) {
        setActiveTab('qa');
        setTakingQuiz(true);
      }
      showToast(t('student.noVideoYet'));
    }
  };

  const handleContinue = () => {
    const next = filteredLessons.find((lesson, index) => !progress[lesson.id]?.completed && !isLessonLocked(lesson, index))
      || selectedLesson
      || filteredLessons[0];
    if (!next) return;
    openLesson(next, lessonIndex(next));
  };

  const handleIntro = () => {
    if (resolveDemoVideo(currentCourse.demoVideoKey, currentCourse.demoVideoId)) {
      setPlayerOpen(false);
      setIntroOpen(true);
      window.setTimeout(() => heroRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      return;
    }
    const firstVideo = filteredLessons.find(lesson => resolveDemoVideo(lesson.videoKey, lesson.videoId || lesson.videoUrl));
    if (firstVideo) {
      openLesson(firstVideo, lessonIndex(firstVideo));
      return;
    }
    showToast(t('student.academy.introMissing'));
  };

  const handleMarkComplete = () => {
    if (!selectedLesson) {
      handleContinue();
      return;
    }
    if (progress[selectedLesson.id]?.completed) {
      showToast(t('student.academy.alreadyComplete'));
      return;
    }
    const lessonVideo = resolveDemoVideo(selectedLesson.videoKey, selectedLesson.videoId || selectedLesson.videoUrl);
    if (lessonVideo) {
      setViewMode('video');
      setPlayerOpen(true);
    }
    showToast(t('student.academy.markNeedWatch'));
  };

  const goNextLesson = () => {
    if (!selectedLesson) return;
    const index = lessonIndex(selectedLesson);
    const next = filteredLessons[index + 1];
    if (!next) {
      setPlayerOpen(false);
      showToast(percent === 100 ? t('student.academy.certificateReady') : t('student.academy.certificatePending'));
      return;
    }
    openLesson(next, index + 1);
  };

  const toggleSaved = () => {
    const next = !saved;
    setSaved(next);
    window.localStorage.setItem(`course-saved-${currentCourse.id}`, next ? '1' : '0');
    showToast(t(next ? 'student.academy.savedCourse' : 'student.academy.unsavedCourse'));
  };

  const lastStamp = Object.values(progress).reduce((max, item) => {
    const time = item.lastWatchedAt ? new Date(item.lastWatchedAt).getTime() : 0;
    return Math.max(max, time);
  }, 0);
  const totalSeconds = lessons.reduce((sum, lesson) => sum + (lesson.duration || 0), 0);
  const durationText = totalSeconds > 0
    ? `${Math.floor(totalSeconds / 3600) > 0 ? `${Math.floor(totalSeconds / 3600)} ${t('student.academy.hours')} ` : ''}${Math.floor((totalSeconds % 3600) / 60)} ${t('student.academy.minutes')}`
    : `${currentCourse.duration || 0} ${t('student.hoursUnit')}`;
  const learnerCount = currentCourse.students?.length || 0;
  const learnerLabel = learnerCount >= 1000 ? `${(learnerCount / 1000).toFixed(1).replace(/\.0$/, '')}K+` : String(learnerCount);
  const documents = lessons.flatMap(lesson => {
    const rows: { key: string; title: string; href: string }[] = [];
    if (lesson.documentUrl) {
      rows.push({
        key: `${lesson.id}-doc`,
        title: lesson.documentName || lesson.title,
        href: proxyBunnyUrl(lesson.documentUrl),
      });
    }
    if (lesson.quizDocumentUrl) {
      rows.push({
        key: `${lesson.id}-quiz`,
        title: lesson.quizDocumentName || lesson.title,
        href: proxyBunnyUrl(lesson.quizDocumentUrl),
      });
    }
    return rows;
  });
  const quizLessons = lessons.filter(lesson => lesson.hasQuiz);
  const banner = currentCourse.banner || currentCourse.thumbnail;
  const bannerSrc = banner && !bannerError
    ? (banner.startsWith('/api/') ? banner : proxyBunnyUrl(banner))
    : '';
  const initials = (userProfile?.displayName || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');
  const roleLabel = userProfile?.position
    || (userProfile?.role === 'admin'
      ? t('student.academy.adminRole')
      : userProfile?.role === 'staff'
        ? t('student.academy.staffRole')
        : t('student.academy.studentRole'));
  const levelLabel = currentCourse.level === 'beginner'
    ? t('student.levelBeginner')
    : currentCourse.level === 'intermediate'
      ? t('student.levelIntermediate')
      : t('student.levelAdvanced');
  const allCollapsed = chapters.length > 0 && chapters.every(chapter => collapsed[chapter.name]);
  const tabs = [
    { id: 'info' as const, label: t('student.academy.courseInfo') },
    { id: 'docs' as const, label: t('student.academy.documentsTab', { count: documents.length }) },
    { id: 'qa' as const, label: t('student.academy.qaTab', { count: quizLessons.length }) },
    { id: 'reviews' as const, label: t('student.academy.reviewsTab') },
    { id: 'news' as const, label: t('student.academy.newsTab') },
  ];

  return (
    <div className="flex min-h-screen bg-[#f5f8fc] font-sans text-[#111b38]">
      {mobileNav && (
        <button
          className="fixed inset-0 z-30 bg-[#031323]/55 lg:hidden"
          aria-label={t('student.academy.close')}
          onClick={() => setMobileNav(false)}
        />
      )}

      <aside className={`fixed top-0 z-40 flex h-screen w-[248px] shrink-0 flex-col bg-gradient-to-b from-[#0a2f12] via-[#0f3d18] to-[#145616] text-[#eef8ef] transition-transform lg:sticky ${mobileNav ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex h-[72px] items-center justify-center bg-white px-2">
          <img src="/logo.png" alt="BioKama" className="h-12 w-auto max-w-[168px] object-contain" />
        </div>
        <nav className="flex-1 space-y-1 overflow-auto px-2.5 py-2" aria-label={t('student.academy.courses')}>
          <Link href="/student" className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45">
            <Home size={22} />
            {t('student.academy.overview')}
          </Link>
          <div className="flex min-h-[48px] items-center gap-3 rounded-md bg-[#18701C] px-3 text-[18px] font-extrabold leading-snug text-white shadow-[inset_3px_0_#EDB409]">
            <BookOpen size={22} />
            {t('student.academy.courses')}
          </div>
          <Link
            href="/student#course-list"
            className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
          >
            <GraduationCap size={22} />
            {t('student.academy.navPrograms')}
          </Link>
          {userProfile?.role === 'admin' && (
            <>
              <Link
                href="/student#learners"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <Users size={22} />
                {t('student.academy.navStudents')}
              </Link>
              <Link
                href="/student#projects"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <FolderKanban size={22} />
                {t('student.academy.navProjects')}
              </Link>
              <Link
                href="/student#departments"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <Building2 size={22} />
                {t('student.academy.navDepartments')}
              </Link>
              <Link
                href="/student#positions"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <Award size={22} />
                {t('student.academy.navPositions')}
              </Link>
              <Link
                href="/student#assessment"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <ClipboardCheck size={22} />
                {t('student.academy.navAssessment')}
              </Link>
              <Link
                href="/student#library"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <Folder size={22} />
                {t('student.academy.navLibrary')}
              </Link>
              <button onClick={() => showToast(t('student.academy.navSoon'))} className="flex min-h-[48px] w-full items-center gap-3 rounded-md px-3 text-left text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45">
                <BarChart3 size={22} />
                {t('student.academy.navReports')}
              </button>
              <Link
                href="/student#certificates"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <BadgeCheck size={22} />
                {t('student.academy.navCertificates')}
              </Link>
              <p className="mx-2 mb-1 mt-3 border-t border-white/15 pt-3 text-[13px] font-bold uppercase tracking-wide text-[#c5e6cc]">{t('student.academy.navSystem')}</p>
              <Link
                href="/student#account"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <Users size={22} />
                {t('student.academy.navUsers')}
              </Link>
              <Link
                href="/student#permissions"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <Shield size={22} />
                {t('student.academy.navPermissions')}
              </Link>
              <Link
                href="/student#activity"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <List size={22} />
                {t('student.academy.navActivity')}
              </Link>
              <Link
                href="/student#settings"
                className="flex min-h-[48px] items-center gap-3 rounded-md px-3 text-[18px] font-extrabold leading-snug text-[#e4f5e8] hover:bg-[#18701C]/45"
              >
                <Settings size={22} />
                {t('student.academy.navSettings')}
              </Link>
            </>
          )}
          {allCourses.length > 0 && (
            <div className="pt-3">
              <p className="mx-2 mb-2 border-t border-white/15 pt-3 text-[13px] font-bold uppercase tracking-wide text-[#c5e6cc]">{t('student.academy.navPrograms')}</p>
              {allCourses.map(item => (
                <button
                  key={item.id}
                  onClick={() => {
                    setSelectedCourseId(item.id);
                    setSelectedTag('all');
                    setSelectedLesson(null);
                    setPlayerOpen(false);
                    setMobileNav(false);
                  }}
                  className={`mb-1 flex w-full items-center gap-2 truncate rounded-md px-3 py-2.5 text-left text-[15px] font-bold ${selectedCourseId === item.id ? 'bg-[#18701C] text-white shadow-[inset_3px_0_#EDB409]' : 'text-[#e4f5e8] hover:bg-[#18701C]/45'}`}
                >
                  <GraduationCap size={14} className="shrink-0 opacity-80" />
                  <span className="truncate">{item.title}</span>
                </button>
              ))}
            </div>
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
            <button
              onClick={() => showToast(t('student.academy.supportSent'))}
              className="mt-3 w-full rounded bg-[#f7faff] px-2 py-1.5 text-[11px] font-bold text-[#18701C]"
            >
              {t('student.academy.sendRequest')}
            </button>
          </div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-[54px] items-center gap-3 border-b border-[#ecf0f6] bg-white px-4">
          <button className="p-1 lg:hidden" aria-label="Menu" onClick={() => setMobileNav(true)}>
            <Menu size={20} />
          </button>
          <label className="flex h-[35px] w-full max-w-[460px] items-center gap-2 rounded-md border border-[#eff2f7] bg-[#f7f9fc] px-3 text-[#65718a]">
            <Search size={16} />
            <input
              value={lessonQuery}
              onChange={event => setLessonQuery(event.target.value)}
              onKeyDown={event => {
                if (event.key !== 'Enter') return;
                const keyword = lessonQuery.trim().toLowerCase();
                if (!keyword) return;
                const match = lessons.find(lesson => lesson.title.toLowerCase().includes(keyword));
                if (!match) {
                  showToast(t('student.academy.lessonNotFound'));
                  return;
                }
                setCollapsed({});
                openLesson(match, lessonIndex(match));
                showToast(t('student.academy.lessonFound', { title: match.title }));
              }}
              placeholder={t('student.academy.searchPlaceholder')}
              aria-label={t('student.academy.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[11px] text-[#111b38] outline-none placeholder:text-[#99a4b5]"
            />
          </label>
          <div className="flex-1" />
          <LanguageSwitcher />
          <button className="p-1.5 text-[#2a3650]" aria-label={t('student.academy.newsTab')} onClick={() => showToast(t('student.academy.noNotifications'))}>
            <Bell size={18} />
          </button>
          <button className="flex items-center gap-2 text-left" onClick={() => setShowProfile(true)}>
            <span className="grid h-[31px] w-[31px] place-items-center rounded-full bg-gradient-to-br from-[#eadac7] to-[#acc0d6] text-[11px] font-bold text-[#2a3550]">
              {initials}
            </span>
            <span className="hidden sm:block">
              <b className="block text-[11px]">{userProfile?.displayName}</b>
              <small className="block text-[10px] text-[#66718b]">{roleLabel}</small>
            </span>
            <ChevronDown size={15} className="hidden text-[#111b38] sm:block" />
          </button>
        </header>

        <main className="mx-auto max-w-[1500px] px-4 py-3 pb-8">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[#66758e]">
            <button onClick={onBack} className="text-[#537394]">{`← ${t('student.academy.backToCourses')}`}</button>
            <span>›</span>
            <span className="truncate">{currentCourse.title}</span>
            {canManageContent && (
              <button
                type="button"
                onClick={() => setManagingContent(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-[#18701C] px-3.5 py-1.5 text-[12px] font-bold text-white shadow-[0_6px_14px_rgba(24,112,28,0.25)] hover:bg-[#145616]"
              >
                <Upload size={14} />
                {t('student.academy.manageContent')}
              </button>
            )}
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
            <div className="min-w-0">
              <div ref={heroRef} className="relative aspect-[636/355] overflow-hidden rounded bg-[#113e30] shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                {introOpen && resolveDemoVideo(currentCourse.demoVideoKey, currentCourse.demoVideoId) ? (
                  <DemoVideoView
                    key={`${currentCourse.demoVideoKey || ''}:${currentCourse.demoVideoId || ''}`}
                    videoKey={currentCourse.demoVideoKey}
                    legacyId={currentCourse.demoVideoId}
                    autoPlay
                    className="h-full w-full bg-black object-contain"
                  />
                ) : playerOpen && selectedLesson ? (() => {
                  const lessonVideo = resolveDemoVideo(selectedLesson.videoKey, selectedLesson.videoId || selectedLesson.videoUrl);
                  if (!lessonVideo) {
                    return (
                      <div key={`empty-${selectedLesson.id}-${playSession}`} className="grid h-full place-items-center bg-[#0b1424] text-white">
                        <div className="text-center">
                          <Play className="mx-auto mb-2 opacity-60" />
                          <p className="mb-1 text-[14px] font-semibold">{selectedLesson.title}</p>
                          <p>{t('student.noVideoYet')}</p>
                          {canManageContent && (
                            <button
                              type="button"
                              onClick={() => setManagingContent(true)}
                              className="mt-4 inline-flex items-center gap-2 rounded-full bg-[#18701C] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#145616]"
                            >
                              <Upload size={15} />
                              {t('student.academy.manageContent')}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  }
                  if (lessonVideo.kind !== 'cloudfly') {
                    return (
                      <DemoVideoView
                        key={`legacy-${selectedLesson.id}-${playSession}`}
                        videoKey={selectedLesson.videoKey}
                        legacyId={selectedLesson.videoId || selectedLesson.videoUrl}
                        autoPlay
                        className="h-full w-full bg-black object-contain"
                      />
                    );
                  }
                  return (
                    <div key={`cf-${selectedLesson.id}-${playSession}`} ref={videoContainerRef} className="relative h-full w-full bg-black">
                      <video
                        ref={videoRef}
                        className="h-full w-full"
                        controls={!isStaff}
                        controlsList="nodownload"
                        onTimeUpdate={handleTimeUpdate}
                        onPause={handleVideoPause}
                        onEnded={handleVideoEnded}
                        playsInline
                        onContextMenu={event => isStaff && event.preventDefault()}
                        onDoubleClick={handleFullscreen}
                        style={isStaff ? { pointerEvents: 'none' } : undefined}
                      >
                        {t('student.videoNotSupported')}
                      </video>
                      {isStaff && (
                        <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent p-3" style={{ pointerEvents: 'auto' }}>
                          <div className="flex items-center gap-2">
                            <button onClick={handleRestart} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white" title={t('student.replayFromStart')}><RotateCcw size={16} /></button>
                            <button onClick={handleRewind} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white" title={t('student.rewind10')}><Rewind size={16} /></button>
                            <button onClick={handlePlayPause} className="grid h-11 w-11 place-items-center rounded-full bg-[#18701C] text-white">{isPlaying ? <Pause size={18} /> : <Play size={18} />}</button>
                          </div>
                          <button onClick={handleFullscreen} className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-white"><Maximize size={16} /></button>
                        </div>
                      )}
                      {!isStaff && (
                        <button onClick={handleFullscreen} className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded bg-black/50 text-white">
                          <Maximize size={16} />
                        </button>
                      )}
                    </div>
                  );
                })() : (
                  <>
                    {bannerSrc ? (
                      <img
                        src={bannerSrc}
                        alt={currentCourse.title}
                        className="h-full w-full object-cover"
                        onError={() => setBannerError(true)}
                      />
                    ) : (
                      <div className="absolute inset-0 bg-gradient-to-br from-[#0a4136] to-[#0a1c2f]" />
                    )}
                    <button
                      onClick={handleIntro}
                      className="absolute inset-0 flex items-center justify-center bg-black/15 text-white"
                      aria-label={t('student.academy.watchIntro')}
                    >
                      <span className="flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-[12px] font-bold text-[#1B7A1E] shadow">
                        <Play size={16} fill="currentColor" />
                        {t('student.academy.watchIntro')}
                      </span>
                    </button>
                  </>
                )}
              </div>

              {(introOpen || (playerOpen && selectedLesson)) && (
                <div className="flex flex-wrap items-center gap-2 border-b border-[#e7edf5] bg-white px-3 py-2.5 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                  <div className="min-w-0 flex-1">
                    <b className="block truncate text-[13px] text-[#111b38]">
                      {introOpen ? t('student.introVideo') : selectedLesson?.title}
                    </b>
                    {!introOpen && selectedLesson && progress[selectedLesson.id] && (
                      <small className="text-[11px] text-[#63708a]">
                        {t('student.watchedLabel')}: {formatDuration(progress[selectedLesson.id].viewedSeconds ?? progress[selectedLesson.id].watchedSeconds)}
                        {progress[selectedLesson.id].completed ? ` · ${t('student.videoPointsEarned', { points: VIDEO_POINTS_PER_LESSON })}` : ''}
                      </small>
                    )}
                  </div>
                  {!introOpen && selectedLesson?.hasQuiz && (
                    <button
                      onClick={() => {
                        setPlayerOpen(false);
                        setActiveTab('qa');
                        setTakingQuiz(true);
                      }}
                      className="rounded border border-[#bbc6d4] px-3 py-1.5 text-[11px]"
                    >
                      {t('student.startQuiz')}
                    </button>
                  )}
                  {!introOpen && selectedLesson && (
                    <button onClick={goNextLesson} className="rounded bg-[#18701C] px-3 py-1.5 text-[11px] text-white">
                      {t('student.academy.nextLesson')} →
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setPlayerOpen(false);
                      setIntroOpen(false);
                      if (videoRef.current) {
                        videoRef.current.pause();
                        videoRef.current.removeAttribute('src');
                        videoRef.current.load();
                      }
                    }}
                    className="rounded border border-[#dbe5f0] px-3 py-1.5 text-[11px] text-[#52617c]"
                  >
                    {t('student.academy.close')}
                  </button>
                </div>
              )}

              <div className="mt-0 flex h-[47px] items-stretch gap-5 overflow-x-auto bg-white px-3 shadow-[0_4px_16px_rgba(24,48,93,0.045)]" role="tablist">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={activeTab === tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`shrink-0 border-b-2 text-[11px] ${activeTab === tab.id ? 'border-[#1B7A1E] font-bold text-[#1B7A1E]' : 'border-transparent text-[#313d57]'}`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {activeTab === 'info' && (
                <>
                  <section className="bg-white px-3 py-4 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                    <div className="flex items-start gap-3">
                      <h1 className="m-0 flex-1 text-[21px] font-bold leading-tight tracking-tight">{currentCourse.title}</h1>
                      <button
                        onClick={toggleSaved}
                        aria-label={t('student.academy.savedCourse')}
                        className={`grid h-[33px] w-[33px] place-items-center rounded border ${saved ? 'border-[#1B7A1E] bg-[#eaf4ff] text-[#1B7A1E]' : 'border-[#dbe5f0] bg-white text-[#1B7A1E]'}`}
                      >
                        <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    <p className="mb-5 mt-2 max-w-[640px] text-[12px] text-[#53617b]">{currentCourse.description}</p>
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e3ccd0] text-[10px] text-[#493e48]">
                          {(currentCourse.teacherName || 'GV').slice(0, 2).toUpperCase()}
                        </span>
                        <span>
                          <small className="block text-[10px] text-[#67758d]">{t('student.academy.instructor')}</small>
                          <b className="block text-[11px]">{currentCourse.teacherName}</b>
                        </span>
                      </div>
                      {[
                        { icon: Clock, label: t('student.academy.duration'), value: durationText, tone: 'bg-[#eff6ff] text-[#1B7A1E]' },
                        { icon: Clapperboard, label: t('student.academy.lessonCount'), value: t('student.academy.lessonsUnit', { count: lessons.length }), tone: 'bg-[#eff6ff] text-[#1B7A1E]' },
                        { icon: Users, label: t('student.academy.learners'), value: learnerLabel, tone: 'bg-[#eff6ff] text-[#1B7A1E]' },
                        { icon: Calendar, label: t('student.academy.updated'), value: currentCourse.updatedAt ? new Date(currentCourse.updatedAt).toLocaleDateString(dateLocale) : '—', tone: 'bg-[#fff6e9] text-[#df8b00]' },
                      ].map(fact => (
                        <div key={fact.label} className="flex min-w-0 items-center gap-2">
                          <span className={`grid h-7 w-7 shrink-0 place-items-center rounded ${fact.tone}`}>
                            <fact.icon size={15} />
                          </span>
                          <span className="min-w-0">
                            <small className="block text-[10px] text-[#67758d]">{fact.label}</small>
                            <b className="block truncate text-[11px]">{fact.value}</b>
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="mt-2.5 bg-white px-3 py-3.5 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                    <h2 className="m-0 mb-1.5 text-[16px]">{t('student.academy.about')}</h2>
                    <p className="m-0 text-[12px] leading-relaxed text-[#52617c]">{currentCourse.description}</p>
                  </section>

                  <section className="mt-2.5 rounded-2xl border border-[#e7edf5] bg-white px-4 py-5 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
                    <h2 className="m-0 text-[20px] font-bold text-[#18701C]">{t('student.academy.whatYouLearn')}</h2>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {(lessons.length ? lessons.slice(0, 8) : []).map((lesson, index) => (
                        <div
                          key={lesson.id}
                          className="group flex items-start gap-3 rounded-xl border border-[#e8f0e9] bg-[#f7fbf8] px-3.5 py-3.5 transition hover:-translate-y-0.5 hover:border-[#18701C]/35 hover:bg-white hover:shadow-[0_10px_22px_rgba(24,112,28,0.12)]"
                        >
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#18701C] text-[16px] font-bold leading-none text-white shadow-[0_4px_12px_rgba(24,112,28,0.28)] transition group-hover:scale-105">
                            {index + 1}
                          </span>
                          <span className="pt-1.5 text-[15px] font-semibold leading-snug text-[#145616]">
                            {lesson.title}
                          </span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="mt-2.5 bg-white px-3 py-3.5 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                    <h2 className="m-0 text-[16px] font-bold">{t('student.academy.suitableFor')}</h2>
                    <div className="mt-3 grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
                      {[
                        {
                          label: currentCourse.category || t('student.general'),
                          icon: Layers,
                          tone: 'bg-[#eff8f0] text-[#18701C]',
                        },
                        {
                          label: levelLabel,
                          icon: Signal,
                          tone: 'bg-[#eff6ff] text-[#1B7A1E]',
                        },
                        {
                          label: currentCourse.teacherName,
                          icon: UserRound,
                          tone: 'bg-[#fff6e9] text-[#df8b00]',
                        },
                      ].filter(item => Boolean(item.label)).map(item => (
                        <div key={String(item.label)} className="flex flex-col items-center gap-1.5">
                          <span className={`grid h-10 w-10 place-items-center rounded-xl ${item.tone}`}>
                            <item.icon size={20} strokeWidth={2.1} />
                          </span>
                          <b className="text-[12px] font-bold leading-snug text-[#111b38]">{item.label}</b>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="mt-2.5 bg-white px-3 py-3.5 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                    <h2 className="m-0 mb-2 text-[16px] font-bold">{t('student.academy.requirements')}</h2>
                    {[t('student.academy.requirementWatch'), t('student.academy.requirementQuiz')].map(line => (
                      <div key={line} className="mt-1.5 flex items-start gap-2 text-[12px] font-semibold text-[#243552]">
                        <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#16ab70]" strokeWidth={2.25} />
                        <span>{line}</span>
                      </div>
                    ))}
                  </section>
                </>
              )}

              {activeTab === 'docs' && (
                <section className="mt-2.5 min-h-[300px] bg-white px-3 py-3.5 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                  <h2 className="m-0 text-[16px]">{t('student.academy.documentsTab', { count: documents.length })}</h2>
                  {documents.length === 0 ? (
                    <p className="mt-3 text-[12px] text-[#52617c]">{t('student.academy.noDocuments')}</p>
                  ) : documents.map((item, index) => (
                    <a
                      key={item.key}
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 flex items-center justify-between gap-3 rounded border border-[#e7edf5] px-3 py-3 text-[13px] hover:bg-[#f6faff]"
                    >
                      <span className="flex items-center gap-2"><FileText size={16} className="text-[#1B7A1E]" />{index + 1}. {item.title}</span>
                      <span className="text-[#1B7A1E]">{t('student.downloadDocument')}</span>
                    </a>
                  ))}
                </section>
              )}

              {activeTab === 'qa' && (
                <section className="mt-2.5 min-h-[300px] bg-white px-3 py-3.5 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                  <h2 className="m-0 text-[16px]">{t('student.academy.qaTab', { count: quizLessons.length })}</h2>
                  {quizLessons.length === 0 ? (
                    <p className="mt-3 text-[12px] text-[#52617c]">{t('student.academy.noQa')}</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {quizLessons.map(lesson => (
                        <button
                          key={lesson.id}
                          onClick={() => {
                            setSelectedLesson(lesson);
                            setTakingQuiz(true);
                          }}
                          className={`flex w-full items-center justify-between rounded border px-3 py-3 text-left text-[13px] ${selectedLesson?.id === lesson.id ? 'border-[#1B7A1E] bg-[#f6faff]' : 'border-[#e7edf5] hover:bg-[#f6faff]'}`}
                        >
                          <span className="flex items-center gap-2"><HelpCircle size={16} className="text-[#1B7A1E]" />{lesson.title}</span>
                          <span className="text-[#1B7A1E]">{quizResults[lesson.id] ? `${quizResults[lesson.id].score}%` : t('student.startQuiz')}</span>
                        </button>
                      ))}
                      {selectedLesson?.hasQuiz && takingQuiz && (
                        <div className="pt-3">
                          <QuizTaker
                            lessonId={selectedLesson.id}
                            courseId={selectedCourseId}
                            quizDuration={selectedLesson.quizDuration}
                            quizDocumentUrl={selectedLesson.quizDocumentUrl}
                            quizDocumentName={selectedLesson.quizDocumentName}
                            onComplete={() => {
                              setTakingQuiz(false);
                              void loadQuizResults();
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </section>
              )}

              {activeTab === 'reviews' && (
                <section className="mt-2.5 min-h-[220px] bg-white px-3 py-3.5 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                  <h2 className="m-0 text-[16px]">{t('student.academy.reviewsTab')}</h2>
                  <p className="mt-3 text-[12px] text-[#52617c]">{t('student.academy.noReviews')}</p>
                </section>
              )}

              {activeTab === 'news' && (
                <section className="mt-2.5 min-h-[220px] bg-white px-3 py-3.5 shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
                  <h2 className="m-0 text-[16px]">{t('student.academy.newsTab')}</h2>
                  <p className="mt-3 text-[12px] text-[#52617c]">{t('student.academy.noNews')}</p>
                </section>
              )}
            </div>

            <aside className="min-w-0 space-y-3.5">
              <section className="rounded-2xl border border-[#e7edf5] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(24,48,93,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(24,48,93,0.1)]">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-[15px] font-bold text-[#111b38]">{t('student.academy.learningProgress')}</b>
                  <strong className="text-[28px] font-bold tabular-nums leading-none text-[#18701C]">{percent}%</strong>
                </div>
                <div className="my-3 h-3 overflow-hidden rounded-full bg-[#e9edf3] shadow-inner">
                  <span className="block h-full rounded-full bg-gradient-to-r from-[#145616] to-[#1B7A1E] transition-all" style={{ width: `${percent}%` }} />
                </div>
                <p className="m-0 text-[13px] font-semibold text-[#52617c]">
                  {t('student.academy.completedOf', { done: completedCount, total: lessons.length })}
                </p>
                <button
                  onClick={handleContinue}
                  className="mt-4 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[#18701C] bg-[#18701C] text-[14px] font-bold text-white shadow-[0_8px_18px_rgba(24,112,28,0.28)] transition hover:-translate-y-0.5 hover:bg-[#145616] hover:shadow-[0_12px_22px_rgba(24,112,28,0.34)]"
                >
                  <Play size={16} fill="currentColor" />
                  {t('student.continueLearningBtn')}
                </button>
                <button
                  onClick={handleMarkComplete}
                  className="mt-2.5 flex min-h-[46px] w-full items-center justify-center gap-2 rounded-xl border border-[#d5deea] bg-white text-[14px] font-bold text-[#293957] shadow-[0_2px_8px_rgba(24,48,93,0.04)] transition hover:-translate-y-0.5 hover:border-[#1B7A1E] hover:bg-[#f6faf7] hover:text-[#18701C] hover:shadow-[0_8px_18px_rgba(24,48,93,0.08)]"
                >
                  <Bookmark size={16} />
                  {t('student.markComplete')}
                </button>
                <p className="mt-3.5 text-[12px] font-medium text-[#6a758d]">
                  {lastStamp
                    ? t('student.academy.lastLearned', { time: new Date(lastStamp).toLocaleString(dateLocale) })
                    : t('student.academy.notStartedYet')}
                </p>
              </section>

              <section className="rounded-2xl border border-[#e7edf5] bg-white px-3.5 py-4 shadow-[0_8px_24px_rgba(24,48,93,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_32px_rgba(24,48,93,0.1)]">
                <div className="mb-3 flex items-center justify-between gap-2 px-1">
                  <b className="text-[15px] font-bold text-[#111b38]">{t('student.courseContent')} ({lessons.length})</b>
                  <button
                    className="text-[12px] font-bold text-[#1B7A1E] hover:underline"
                    onClick={() => {
                      if (allCollapsed) {
                        setCollapsed({});
                        return;
                      }
                      const next: Record<string, boolean> = {};
                      chapters.forEach(chapter => { next[chapter.name] = true; });
                      setCollapsed(next);
                    }}
                  >
                    {allCollapsed ? t('student.academy.expandAll') : t('student.academy.collapseAll')}
                  </button>
                </div>
                {chapters.length === 0 && (
                  <p className="px-2 py-4 text-center text-[13px] text-[#63708a]">{t('student.noLessonsYet')}</p>
                )}
                {chapters.map((chapter, chapterIndex) => {
                  const doneInChapter = chapter.items.filter(lesson => progress[lesson.id]?.completed).length;
                  const isCollapsed = Boolean(collapsed[chapter.name]);
                  return (
                    <div
                      key={chapter.name}
                      className="mb-2.5 overflow-hidden rounded-xl border border-[#e8eef5] bg-white shadow-[0_2px_10px_rgba(24,48,93,0.04)]"
                    >
                      <button
                        className="flex min-h-[48px] w-full items-center gap-2.5 bg-[#f7fafc] px-3 py-2.5 text-left transition hover:bg-[#eef6ff]"
                        aria-expanded={!isCollapsed}
                        onClick={() => setCollapsed(prev => ({ ...prev, [chapter.name]: !prev[chapter.name] }))}
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#e8f5ea] text-[12px] font-bold text-[#18701C] shadow-sm">
                          {chapterIndex + 1}
                        </span>
                        <span className="flex-1 text-[13px] font-bold text-[#111b38]">{chapter.name}</span>
                        <span className="flex items-center gap-1 text-[12px] font-bold text-[#2f3c57]">
                          {doneInChapter === chapter.items.length && chapter.items.length > 0 ? (
                            <CheckCircle2 size={15} className="text-[#11a76a]" />
                          ) : null}
                          {doneInChapter}/{chapter.items.length}
                        </span>
                        <ChevronDown size={16} className={`text-[#5e6880] transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
                      </button>
                      {!isCollapsed && chapter.items.map(lesson => {
                        const index = lessonIndex(lesson);
                        const locked = isLessonLocked(lesson, index);
                        const done = Boolean(progress[lesson.id]?.completed);
                        const selected = selectedLesson?.id === lesson.id;
                        return (
                          <button
                            key={lesson.id}
                            onClick={() => openLesson(lesson, index)}
                            className={`relative grid min-h-[48px] w-full grid-cols-[24px_30px_minmax(0,1fr)_auto_20px] items-center gap-1.5 border-t border-[#eef2f7] px-3 py-2.5 text-left transition ${
                              selected
                                ? 'bg-[#eff8f0] shadow-[inset_0_0_0_1px_rgba(24,112,28,0.14)]'
                                : 'bg-white hover:bg-[#f5faf6]'
                            } ${locked ? 'opacity-60' : ''}`}
                          >
                            {selected && <span className="absolute bottom-1 left-0 top-1 w-[3px] rounded-r bg-[#1B7A1E]" />}
                            <span className="grid place-items-center">
                              {selected ? (
                                <CirclePlay size={18} className="text-[#1B7A1E]" fill="currentColor" strokeWidth={1.5} />
                              ) : done ? (
                                <CheckSquare size={16} className="text-[#11a76a]" strokeWidth={2.2} />
                              ) : locked ? (
                                <Lock size={14} className="text-[#9aa7b8]" strokeWidth={2.2} />
                              ) : (
                                <Square size={16} className="text-[#a4b1c2]" strokeWidth={2} />
                              )}
                            </span>
                            <span className="text-[12px] font-semibold text-[#5e6880]">{lesson.order || index + 1}</span>
                            <span className={`truncate text-[14px] leading-snug ${selected || done ? 'font-semibold text-[#18701C]' : 'font-medium text-[#243552]'}`}>{lesson.title}</span>
                            <span className="whitespace-nowrap text-right text-[11px] font-semibold text-[#53617a]">
                              {lesson.duration ? formatDuration(lesson.duration) : ''}
                            </span>
                            <span className={`grid h-5 w-5 place-items-center justify-self-center rounded-full border ${done ? 'border-[#13ab71] bg-[#13ab71] text-white shadow-sm' : 'border-[#a4b1c2] text-[#a4b1c2]'}`}>
                              {locked ? <Lock size={10} /> : done ? <CheckCircle2 size={12} strokeWidth={3} /> : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </section>

              <section className="flex gap-3 rounded-2xl border border-[#f0dfb0] bg-[#fff9ec] p-4 text-[13px] shadow-[0_8px_24px_rgba(24,48,93,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(24,48,93,0.09)]">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#fff1d0] text-[#e2a020] shadow-sm">
                  <Lightbulb size={22} />
                </span>
                <div>
                  <b className="text-[14px] font-bold text-[#111b38]">{t('student.academy.noteTitle')}</b>
                  <p className="m-0 mt-1.5 text-[13px] font-medium leading-relaxed text-[#56627a]">{t('student.academy.noteBody')}</p>
                </div>
              </section>

              <section className="flex flex-wrap gap-3 rounded-2xl border border-[#c6ebd4] bg-[#edfbf8] p-4 text-[13px] shadow-[0_8px_24px_rgba(24,48,93,0.06)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(24,48,93,0.09)]">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#d5f7e9] text-[#07965f] shadow-sm">
                  <Award size={22} />
                </span>
                <div className="min-w-0 flex-1">
                  <b className="text-[14px] font-bold text-[#111b38]">{t('student.academy.certificate')}</b>
                  <p className="m-0 mt-1.5 text-[13px] font-medium leading-relaxed text-[#56627a]">{t('student.academy.certificateHint')}</p>
                </div>
                <button
                  onClick={() => setCertOpen(true)}
                  className="w-full rounded-xl border border-[#c6ebd4] bg-white px-3 py-2.5 text-[13px] font-bold text-[#18701C] shadow-sm transition hover:-translate-y-0.5 hover:bg-[#f4faf6] hover:shadow-md"
                >
                  <span className="inline-flex items-center gap-2">
                    <BadgeCheck size={16} />
                    {t('student.academy.viewCertificate')}
                  </span>
                </button>
              </section>
            </aside>
          </div>
        </main>
      </div>

      {certOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[rgba(2,15,35,0.65)] p-4" onClick={() => setCertOpen(false)}>
          <div className="relative w-full max-w-[560px] rounded-[10px] bg-white p-5" onClick={event => event.stopPropagation()}>
            <button className="absolute right-3 top-3 grid h-7 w-7 place-items-center rounded bg-[#f1f4f8]" onClick={() => setCertOpen(false)}>×</button>
            <h2 className="mb-3 mr-8 text-[20px] font-bold">{t('student.academy.certificate')}</h2>
            <div className="border-8 border-double border-[#10a972] bg-[#f4fffb] px-4 py-8 text-center">
              <p className="text-[22px] font-bold text-[#087552]">BioKama Academy</p>
              <p className="mt-2 text-[12px] tracking-wide text-[#087552]">{t('student.academy.certificateSample')}</p>
              <h3 className="mt-3 text-[20px] font-bold text-[#111b38]">{currentCourse.title}</h3>
              <p className="mt-2 text-[13px] text-[#52617c]">{userProfile?.displayName}</p>
              <p className="mt-2 text-[12px] text-[#52617c]">{t('student.academy.certificateFor')}</p>
            </div>
            <p className="mt-3 text-[12px] text-[#52617c]">
              {percent === 100 ? t('student.academy.certificateReady') : t('student.academy.certificatePending')}
            </p>
          </div>
        </div>
      )}

      {showAttentionCheck && isStaff && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center">
            <h3 className="mb-2 text-2xl font-bold">{t('student.stillWatching')}</h3>
            <p className="mb-6 text-[#52617c]">{t('student.stillWatchingHint')}</p>
            <button onClick={handleAttentionCheckContinue} className="w-full rounded-lg bg-[#12a66d] px-6 py-3 font-medium text-white">
              {t('student.continueWatching')}
            </button>
          </div>
        </div>
      )}

      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-[70] rounded-md bg-[#162c47] px-4 py-2.5 text-[12px] text-white shadow-lg">
          {toastMsg}
        </div>
      )}

      {managingContent && canManageContent && (
        <div className="fixed inset-0 z-[80] overflow-y-auto bg-[#0b1424]/70 p-3 sm:p-6">
          <div className="mx-auto max-w-5xl rounded-2xl bg-slate-950 p-3 shadow-2xl ring-1 ring-white/10 sm:p-5">
            <LessonManagement
              course={currentCourse}
              onBack={() => {
                setManagingContent(false);
                void loadLessons();
              }}
            />
          </div>
        </div>
      )}

      <ProfileModal isOpen={showProfile} onClose={() => setShowProfile(false)} />
    </div>
  );
};
