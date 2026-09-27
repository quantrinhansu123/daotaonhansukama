'use client';

import React, { useState, useEffect, useRef } from 'react';
import { collection, getDocs, query, where, doc, runTransaction } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Course } from '@/types/course';
import { Lesson, QuizResult } from '@/types/lesson';
import type Hls from 'hls.js';
import { LessonProgress } from '@/types/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Play, Pause, Lock, CheckCircle, Clock, FileText, HelpCircle, Maximize, RotateCcw, Rewind, Menu, X, ChevronDown, ChevronUp } from 'lucide-react';
import { QuizTaker } from './QuizTaker';
import { BunnyVideoPlayer } from '@/components/shared/BunnyVideoPlayer';
import { getLessonCompletionPercent, getViewedSeconds, mergeWatchedRanges, VIDEO_COMPLETION_RATIO, VIDEO_POINTS_PER_LESSON, WatchedRange } from '@/lib/learning-progress';

interface CourseViewerProps {
  course: Course;
  onBack: () => void;
}

export const CourseViewer: React.FC<CourseViewerProps> = ({ course, onBack }) => {
  const { userProfile } = useAuth();
  const { t } = useLanguage();
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
  const [showSidebar, setShowSidebar] = useState(true); // Toggle sidebar visibility - default to true
  const [showQuizSection, setShowQuizSection] = useState(true); // Toggle quiz section visibility - default to true
  const videoRef = useRef<HTMLVideoElement>(null);
  const lastProgressSaveAt = useRef(0);
  const hlsRef = useRef<Hls | null>(null);
  const attentionCheckTimer = useRef<NodeJS.Timeout | null>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const CDN_HOSTNAME = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;

  // Check if user is staff (needs anti-cheat features)
  const isStaff = userProfile?.role === 'staff';

  // Get all unique tags from lessons
  const allTags = Array.from(new Set(lessons.flatMap(lesson => lesson.tags || []))).sort();

  // Get current course info
  const currentCourse = allCourses.find(c => c.id === selectedCourseId) || course;

  // Reset banner error when course changes or banner URL changes
  useEffect(() => {
    setBannerError(false);
    console.log('🔄 Banner error reset, course banner:', course.banner);
  }, [course.id, course.banner]);

  useEffect(() => {
    loadUserCourses();
  }, [userProfile]);

  useEffect(() => {
    if (selectedCourseId) {
      setProgressLoaded(false);
      setProgress({});
      loadLessons();
      loadProgress();
      loadQuizResults();
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
    if (selectedLesson && selectedLesson.videoId && progressLoaded) {
      lastProgressSaveAt.current = 0;
      initializeVideo();
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (attentionCheckTimer.current) {
        clearTimeout(attentionCheckTimer.current);
      }
    };
  }, [selectedLesson?.id, progressLoaded]);

  // Anti-cheat: Detect tab visibility change (staff only)
  useEffect(() => {
    if (!isStaff) return;

    const handleVisibilityChange = () => {
      if (document.hidden && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        console.log('⚠️ Video paused: Tab switched');
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isStaff]);

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
  }, [isStaff, selectedLesson?.id]);

  const initializeVideo = async () => {
    if (!selectedLesson || !videoRef.current) return;

    const videoUrl = selectedLesson.videoId && CDN_HOSTNAME
      ? `https://${CDN_HOSTNAME}/${selectedLesson.videoId}/playlist.m3u8`
      : (selectedLesson.videoUrl
          ? (CDN_HOSTNAME ? selectedLesson.videoUrl.replace(/https:\/\/[^/]+\.b-cdn\.net\//, `https://${CDN_HOSTNAME}/`) : selectedLesson.videoUrl)
          : '');
    const savedProgress = progress[selectedLesson.id];

    console.log('🎬 Initializing video for lesson:', selectedLesson.title);
    console.log('📊 Saved progress:', savedProgress);

    // Check if HLS is supported
    if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      videoRef.current.src = videoUrl;

      // Set start time after video loads
      if (savedProgress && savedProgress.watchedSeconds > 5) {
        console.log('⏩ Will seek to:', savedProgress.watchedSeconds, 'seconds');
        videoRef.current.addEventListener('loadedmetadata', () => {
          if (videoRef.current) {
            console.log('✅ Seeking now to:', savedProgress.watchedSeconds);
            videoRef.current.currentTime = savedProgress.watchedSeconds;
          }
        }, { once: true });
      }
    } else {
      // Use HLS.js for other browsers
      const Hls = (await import('hls.js')).default;

      if (Hls.isSupported()) {
        if (hlsRef.current) {
          hlsRef.current.destroy();
        }

        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
        });

        hls.loadSource(videoUrl);
        hls.attachMedia(videoRef.current);
        hlsRef.current = hls;

        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          console.log('📺 HLS manifest parsed');
          // Video is ready, seek to saved position if > 5 seconds
          if (savedProgress && savedProgress.watchedSeconds > 5 && videoRef.current) {
            console.log('⏩ Will seek to:', savedProgress.watchedSeconds, 'seconds');
            setTimeout(() => {
              if (videoRef.current) {
                console.log('✅ Seeking now to:', savedProgress.watchedSeconds);
                videoRef.current.currentTime = savedProgress.watchedSeconds;
              }
            }, 500);
          }
        });

        hls.on(Hls.Events.ERROR, (event, data) => {
          console.error('❌ HLS error:', data);
        });
      }
    }
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
      setLoading(true);
      const lessonsRef = collection(db, 'lessons');
      const q = query(lessonsRef, where('courseId', '==', selectedCourseId));
      const snapshot = await getDocs(q);
      const lessonsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lesson[];

      // Sort in memory instead of using orderBy
      lessonsData.sort((a, b) => a.order - b.order);
      setLessons(lessonsData);

      // Auto select first lesson
      if (lessonsData.length > 0) {
        setSelectedLesson(lessonsData[0]);
        // Set view mode based on what's available
        if (lessonsData[0].videoId) {
          setViewMode('video');
        } else if (lessonsData[0].documentUrl) {
          setViewMode('document');
        } else if (lessonsData[0].hasQuiz) {
          setViewMode('quiz');
        }
      }
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

  const isLessonLocked = (lesson: Lesson, index: number): boolean => {
    // First lesson is never locked
    if (index === 0) return false;

    // Get previous lesson
    const previousLesson = filteredLessons[index - 1];
    if (!previousLesson) return false;

    // If previous lesson has quiz, check if passed with 70%
    if (previousLesson.hasQuiz) {
      const quizResult = quizResults[previousLesson.id];
      if (!quizResult || quizResult.score < 70) {
        return true;
      }
    }

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

  if (loading) {
    return <div className="text-center py-8 text-white">{t("common.loading")}</div>;
  }

  // Debug: Log banner info
  const hasBanner = course.banner && course.banner.trim() !== '';
  const willShowBanner = hasBanner && !bannerError;
  
  console.log('🖼️ Banner Debug:', {
    hasBanner,
    bannerUrl: course.banner,
    bannerType: typeof course.banner,
    bannerLength: course.banner?.length || 0,
    bannerError,
    willShowBanner,
    courseId: course.id,
    courseTitle: course.title,
    bannerTrimmed: course.banner?.trim() || ''
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0b1424] via-[#111d30] to-[#0b1424]">
      {/* Banner Section - Wider */}
      <div className="w-full relative overflow-hidden min-h-[500px]">
        {course.banner && course.banner.trim() !== '' && !bannerError ? (
          <>
            {/* Banner Image with Parallax Effect */}
            <div className="absolute inset-0">
              <img
                key={`banner-${course.id}-${course.updatedAt?.getTime() || Date.now()}`}
                src={(() => {
                  if (!course.banner) return '';
                  
                  // If already proxy URL, use directly
                  if (course.banner.startsWith('/api/banner')) {
                    console.log('✅ Using existing proxy URL:', course.banner);
                    return course.banner;
                  }
                  
                  // If storage URL, convert to proxy
                  if (course.banner.includes('storage.bunnycdn.com')) {
                    const proxyUrl = `/api/banner?url=${encodeURIComponent(course.banner)}`;
                    console.log('🔄 Converting storage URL to proxy:', course.banner, '→', proxyUrl);
                    return proxyUrl;
                  }
                  
                  // If CDN URL, convert to proxy
                  if (course.banner.includes('b-cdn.net')) {
                    const proxyUrl = `/api/banner?url=${encodeURIComponent(course.banner)}`;
                    console.log('🔄 Converting CDN URL to proxy:', course.banner, '→', proxyUrl);
                    return proxyUrl;
                  }
                  
                  // Otherwise, use as is (might be a different URL format)
                  console.log('⚠️ Using banner URL as-is:', course.banner);
                  return course.banner;
                })()}
                alt={`Banner ${course.title}`}
                className="w-full h-full object-cover"
                style={{ minHeight: '500px' }}
                onError={(e) => {
                  const currentSrc = e.currentTarget.src;
                  console.error('❌ Banner load error:', {
                    originalBanner: course.banner,
                    currentSrc: currentSrc,
                    isProxyUrl: currentSrc.includes('/api/banner')
                  });
                  
                  // If already using proxy and still fails, show fallback
                  if (currentSrc.includes('/api/banner')) {
                    console.error('❌ Proxy API also failed, showing fallback');
                    setBannerError(true);
                    e.currentTarget.style.display = 'none';
                    return;
                  }
                  
                  // Try proxy API route if direct URL fails
                  if (course.banner && !course.banner.includes('/api/banner')) {
                    const proxyUrl = `/api/banner?url=${encodeURIComponent(course.banner)}`;
                    console.log('🔄 Retrying with proxy API:', proxyUrl);
                    e.currentTarget.src = proxyUrl;
                    return;
                  }
                  
                  // Set error state to show fallback
                  setBannerError(true);
                  e.currentTarget.style.display = 'none';
                }}
                onLoad={() => {
                  console.log('✅ Banner loaded successfully:', course.banner);
                  // Clear error if banner loads successfully
                  if (bannerError) {
                    setBannerError(false);
                  }
                }}
              />
              {/* Multi-layer Gradient Overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/50 to-[#0b1424]"></div>
              <div className="absolute inset-0 bg-gradient-to-r from-[#0b1424]/80 via-transparent to-[#0b1424]/60"></div>
            </div>

            {/* Content Overlay - Compact top left */}
            <div className="relative z-10 max-w-7xl mx-auto px-4 py-4">
              <div className="flex items-start gap-4">
                <button
                  onClick={onBack}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded-lg transition-all text-sm border border-white/20"
                >
                  ← {t("common.back")}
                </button>

                <div>
                  <h1 className="text-xl font-bold mb-1 text-white drop-shadow-lg">
                    {course.title}
                  </h1>
                  <p className="text-sm text-white mb-2 drop-shadow-md">
                    {course.description}
                  </p>

                  {/* Course Meta Info - Compact */}
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="px-2 py-1 bg-white/10 backdrop-blur-md rounded text-xs border border-white/20">
                      <span className="text-white">{course.duration} {t("student.hoursUnit")}</span>
                    </div>

                    <div className="px-2 py-1 bg-white/10 backdrop-blur-md rounded text-xs border border-white/20">
                      <span className="text-white">{course.teacherName}</span>
                    </div>

                    <div className={`px-2 py-1 backdrop-blur-md rounded text-xs border ${course.level === 'beginner' ? 'bg-green-500/20 border-green-400/30 text-white' :
                      course.level === 'intermediate' ? 'bg-yellow-500/20 border-yellow-400/30 text-white' :
                        'bg-red-500/20 border-red-400/30 text-white'
                      }`}>
                      <span>
                        {course.level === 'beginner' ? t('student.levelBeginner') :
                          course.level === 'intermediate' ? t('student.levelIntermediate') : t('student.levelAdvanced')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          // Fallback gradient background if no banner or banner error
          <div className="bg-gradient-to-br from-[#0b1424] via-[#111d30] to-[#0b1424] text-white shadow-2xl min-h-[500px]">
            <div className="max-w-7xl mx-auto px-4 py-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={onBack}
                  className="px-2.5 py-1 bg-white/10 hover:bg-white/20 backdrop-blur-md text-white rounded text-xs border border-white/20"
                >
                  ← {t("common.back")}
                </button>

                <h1 className="text-lg font-bold text-white drop-shadow-lg">
                  {course.title}
                </h1>
                <span className="text-xs text-white">•</span>
                <p className="text-xs text-white drop-shadow-md">
                  {course.description}
                </p>

                {/* Course Meta Info - Inline compact */}
                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="px-1.5 py-0.5 bg-white/10 backdrop-blur-md rounded text-[10px] border border-white/20 text-white">
                    {course.duration} {t("student.hoursUnit")}
                  </span>
                  <span className="px-1.5 py-0.5 bg-white/10 backdrop-blur-md rounded text-[10px] border border-white/20 text-white">
                    {course.teacherName}
                  </span>
                  <span className={`px-1.5 py-0.5 backdrop-blur-md rounded text-[10px] border text-white ${course.level === 'beginner' ? 'bg-green-500/20 border-green-400/30' :
                    course.level === 'intermediate' ? 'bg-yellow-500/20 border-yellow-400/30' :
                      'bg-red-500/20 border-red-400/30'
                    }`}>
                    {course.level === 'beginner' ? t('student.levelBeginner') :
                          course.level === 'intermediate' ? t('student.levelIntermediate') : t('student.levelAdvanced')}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Demo Video */}
      {course.demoVideoId && !selectedLesson && (
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="bg-gradient-to-br from-[#111d30] to-[#0b1424] backdrop-blur-md rounded-xl p-6 mb-6 border border-[#223852] shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-4">{t("student.introVideo")}</h2>
            <div className="aspect-video bg-black rounded-lg overflow-hidden border border-white/10">
              <BunnyVideoPlayer videoId={course.demoVideoId} cdnHostname={CDN_HOSTNAME} className="w-full h-full" />
            </div>
          </div>
        </div>
      )}

      {/* Video View - Special layout when video is playing */}
      {viewMode === 'video' && selectedLesson && selectedLesson.videoId ? (
        <div className="max-w-[98vw] mx-auto px-2 py-4">
          <div className="relative">
            {/* Toggle Sidebar Button */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">{selectedLesson.title}</h2>
              <div className="flex items-center gap-2">
                {/* Quiz Button - Small button above video */}
                {selectedLesson.hasQuiz && (
                  <button
                    onClick={() => {
                      if (!takingQuiz) {
                        setTakingQuiz(true);
                        setShowQuizSection(true);
                      } else {
                        setShowQuizSection(!showQuizSection);
                      }
                    }}
                    className="px-3 py-1.5 bg-gradient-to-br from-[#111d30] to-[#0b1424] hover:from-[#223852] hover:to-[#0b1424] rounded-lg border border-[#223852] text-white transition-colors text-xs font-medium shadow-lg flex items-center gap-1.5"
                    title={t("student.quiz")}
                  >
                    <HelpCircle size={14} />
                    {takingQuiz ? (showQuizSection ? t('student.hideQuiz') : t('student.showQuiz')) : t('student.takeQuizShort')}
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowSidebar(!showSidebar);
                  }}
                  className="p-2 bg-gradient-to-br from-[#111d30] to-[#0b1424] hover:from-[#223852] hover:to-[#111d30] rounded-lg border border-[#223852] text-white transition-colors z-50 relative shadow-lg"
                  title={showSidebar ? t("student.hideLessonList") : t("student.showLessonList")}
                >
                  {showSidebar ? <X size={20} /> : <Menu size={20} />}
                </button>
              </div>
            </div>
            
            {/* Video Container - Always large */}
            <div
              ref={videoContainerRef}
              className="bg-black rounded-xl overflow-hidden relative border border-white/10 shadow-2xl w-full"
              style={{ 
                paddingTop: '45%'  // Large video always
              }}
            >
              {/* Quiz Section - Floating above video */}
              {selectedLesson.hasQuiz && takingQuiz && (
                <div className="absolute top-4 left-4 z-50 bg-gradient-to-br from-[#111d30] to-[#0b1424] backdrop-blur-md rounded-lg border border-[#223852] shadow-2xl max-w-md w-full">
                  <div className="flex items-center justify-between p-3 border-b border-[#223852]/50">
                    <div className="flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-[#53cafd]" />
                      <h3 className="text-sm font-bold text-white">{t("student.quizSection")}</h3>
                    </div>
                    <button
                      onClick={() => {
                        setShowQuizSection(!showQuizSection);
                      }}
                      className="p-1 hover:bg-white/10 rounded transition-colors text-white"
                      title={showQuizSection ? t("student.collapse") : t("student.expand")}
                    >
                      {showQuizSection ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>
                  {showQuizSection && (
                    <div className="p-3">
                      <QuizTaker
                        lessonId={selectedLesson.id}
                        courseId={selectedCourseId}
                        quizDuration={selectedLesson.quizDuration}
                        quizDocumentUrl={selectedLesson.quizDocumentUrl}
                        quizDocumentName={selectedLesson.quizDocumentName}
                        onComplete={() => {
                          setTakingQuiz(false);
                          setShowQuizSection(false);
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Video wrapper to contain both video and sidebar */}
              <div className="absolute inset-0">
                <video
                  ref={videoRef}
                  className="absolute inset-0 w-full h-full cursor-pointer"
                  controls={!isStaff}
                  controlsList="nodownload"
                  onTimeUpdate={handleTimeUpdate}
                  onPause={handleVideoPause}
                  onEnded={handleVideoEnded}
                  playsInline
                  onContextMenu={(e) => isStaff && e.preventDefault()}
                  onDoubleClick={handleFullscreen}
                  style={isStaff ? { pointerEvents: 'none' } : {}}
                >
                  <source
                    src={selectedLesson.videoId && CDN_HOSTNAME
                      ? `https://${CDN_HOSTNAME}/${selectedLesson.videoId}/playlist.m3u8`
                      : (selectedLesson.videoUrl
                          ? (CDN_HOSTNAME ? selectedLesson.videoUrl.replace(/https:\/\/[^/]+\.b-cdn\.net\//, `https://${CDN_HOSTNAME}/`) : selectedLesson.videoUrl)
                          : '')}
                    type="application/x-mpegURL"
                  />
                  {t("student.videoNotSupported")}
                </video>

                  {/* Custom Controls for Staff */}
                  {isStaff && (
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4" style={{ pointerEvents: 'auto' }}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {/* Restart Button */}
                          <button
                            onClick={handleRestart}
                            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors backdrop-blur-sm"
                            title={t("student.replayFromStart")}
                          >
                            <RotateCcw size={18} />
                          </button>

                          {/* Rewind 10s */}
                          <button
                            onClick={handleRewind}
                            className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors backdrop-blur-sm"
                            title={t("student.rewind10")}
                          >
                            <Rewind size={18} />
                          </button>

                          {/* Play/Pause */}
                          <button
                            onClick={handlePlayPause}
                            className="w-12 h-12 bg-[#53cafd] hover:bg-[#3db9f5] rounded-full flex items-center justify-center text-white transition-colors shadow-lg shadow-[#53cafd]/25"
                          >
                            {isPlaying ? <Pause size={24} /> : <Play size={24} />}
                          </button>

                          <span className="text-white text-sm ml-2 font-medium">
                            {isPlaying ? t('student.playing') : t('student.paused')}
                          </span>
                        </div>

                        {/* Fullscreen */}
                        <button
                          onClick={handleFullscreen}
                          className="w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors backdrop-blur-sm"
                          title={t("student.fullscreen")}
                        >
                          <Maximize size={20} />
                        </button>
                      </div>
                      <div className="mt-2 text-center">
                        <span className="text-white text-xs">
                          {t("student.videoControlsHint")}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Fullscreen button for students (floating) */}
                  {!isStaff && (
                    <button
                      onClick={handleFullscreen}
                      className="absolute top-4 right-4 w-10 h-10 bg-black/50 hover:bg-black/70 rounded-lg flex items-center justify-center text-white transition-colors backdrop-blur-sm z-10"
                      title={t("student.fullscreenOrDblClick")}
                    >
                      <Maximize size={20} />
                    </button>
                  )}

                  {/* Sidebar - Slide in/out from right - Same height as video */}
                  <div
                    className={`absolute top-0 right-0 h-full w-80 bg-[#111d30] backdrop-blur-md border-l border-[#223852] shadow-2xl z-40 transition-transform duration-300 ease-in-out overflow-y-auto custom-scrollbar ${
                      showSidebar ? 'translate-x-0' : 'translate-x-full'
                    }`}
                    style={{ willChange: 'transform' }}
                  >
                  <div className="p-3 border-b border-[#223852]/50 sticky top-0 bg-[#111d30] z-10">
                    <h3 className="font-bold text-white text-sm">{t("student.courseContent")}</h3>
                    <p className="text-xs text-white mt-1 line-clamp-1">{currentCourse.title}</p>
                    <p className="text-xs text-white mt-1">
                      {selectedTag === 'all' ? t('student.lessonsCount', { count: lessons.length }) : t('student.lessonsFiltered', { filtered: filteredLessons.length, total: lessons.length })}
                    </p>
                  </div>

                  <div className="p-3">
                    {filteredLessons.length === 0 ? (
                      <div className="text-center text-white py-4">
                        <p className="text-xs">
                          {selectedTag === 'all' ? t('student.noLessonsYet') : t('student.noLessonsWithTag', { tag: selectedTag })}
                        </p>
                      </div>
                    ) : (
                      <div className="divide-y divide-[#223852]/30">
                        {filteredLessons.map((lesson, index) => {
                          const hasContent = lesson.videoId || lesson.documentUrl || lesson.hasQuiz;
                          const locked = isLessonLocked(lesson, index);
                          const previousLesson = index > 0 ? filteredLessons[index - 1] : null;

                          return (
                            <button
                              key={lesson.id}
                              onClick={() => {
                                if (locked) {
                                  alert(t("student.unlockLessonAlert", { title: previousLesson?.title || "" }));
                                  return;
                                }
                                if (hasContent) {
                                  setSelectedLesson(lesson);
                                  if (lesson.videoId) setViewMode('video');
                                  else if (lesson.documentUrl) setViewMode('document');
                                  else if (lesson.hasQuiz) setViewMode('quiz');
                                }
                              }}
                              disabled={!hasContent || locked}
                              className={`w-full p-2.5 text-left transition-colors ${selectedLesson?.id === lesson.id ? 'bg-[#223852]/50 border-l-4 border-[#53cafd]' : ''
                                } ${locked ? 'opacity-50 cursor-not-allowed bg-white/5' : 'hover:bg-[#223852]/40'} ${!hasContent && !locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <div className="flex items-start gap-2">
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold relative ${locked ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white'
                                  }`}>
                                  {locked ? <Lock size={14} /> : lesson.order}
                                  {!locked && progress[lesson.id]?.completed && (
                                    <CheckCircle size={10} className="absolute -top-1 -right-1 text-green-400 bg-[#111d30] rounded-full" />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <h4 className={`font-medium mb-0.5 line-clamp-2 text-xs ${locked ? 'text-white' : 'text-white'}`}>
                                    {lesson.title}
                                    {locked && (
                                      <span className="ml-1 text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full border border-red-500/30">
                                        {t("student.needPassPrevious")}
                                      </span>
                                    )}
                                  </h4>
                                  {!locked && progress[lesson.id] && (
                                    <div className="mb-0.5">
                                      <div className="w-full h-0.5 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-[#53cafd]"
                                          style={{
                                            width: `${getLessonCompletionPercent(progress[lesson.id])}%`
                                          }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex items-center gap-1.5 text-[10px] text-white flex-wrap">
                                    {lesson.videoId && (
                                      <span className="flex items-center gap-0.5">
                                        <Play size={10} />
                                        Video
                                      </span>
                                    )}
                                    {lesson.documentUrl && (
                                      <span className="flex items-center gap-0.5 text-[#53cafd]">
                                        <FileText size={10} />
                                        {t("student.documents")}
                                      </span>
                                    )}
                                    {lesson.hasQuiz && (
                                      <span className="flex items-center gap-0.5 text-purple-300">
                                        <HelpCircle size={10} />
                                        Quiz
                                      </span>
                                    )}
                                    {!hasContent && (
                                      <span className="flex items-center gap-0.5">
                                        <Lock size={10} />
                                        {t("student.notAvailable")}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Lesson info below video */}
                {selectedLesson && (
                  <div className="bg-gradient-to-br from-[#111d30]/40 to-[#0b1424]/40 backdrop-blur-md rounded-lg p-3 mt-4 border border-[#223852]/50 shadow-lg">
                    <h2 className="text-base font-bold text-white mb-1">{selectedLesson.title}</h2>
                    <p className="text-xs text-white/90 mb-2">{selectedLesson.description}</p>
                    <div className="flex items-center gap-3 text-xs">
                      {selectedLesson.duration && (
                        <div className="flex items-center gap-1.5 text-white">
                          <Clock size={12} />
                          <span>{t("student.durationLabel")}: {formatDuration(selectedLesson.duration)}</span>
                        </div>
                      )}
                      {progress[selectedLesson.id] && (
                        <div className="flex items-center gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[10px] text-white">
                                {t("student.watchedLabel")}: {formatDuration(progress[selectedLesson.id].viewedSeconds ?? progress[selectedLesson.id].watchedSeconds)}
                              </span>
                              {progress[selectedLesson.id].completed && (
                                <CheckCircle size={12} className="text-green-400" />
                              )}
                            </div>
                            <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#53cafd] transition-all"
                                style={{
                                  width: `${getLessonCompletionPercent(progress[selectedLesson.id])}%`
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                      {selectedLesson.videoId && progress[selectedLesson.id]?.completed && (
                        <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-medium text-emerald-300">
                          {t('student.videoPointsEarned', { points: VIDEO_POINTS_PER_LESSON })}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Default layout for non-video views or video without videoId */
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
            {/* Content Area */}
            <div className="lg:col-span-2">
              {selectedLesson && (
                <div className="bg-gradient-to-br from-[#111d30] to-[#0b1424] backdrop-blur-md rounded-xl p-4 mb-4 border border-[#223852] shadow-2xl">
                  <div className="flex items-center gap-2">
                    {selectedLesson.videoId && (
                      <button
                        onClick={() => setViewMode('video')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${viewMode === 'video'
                          ? 'bg-[#53cafd] text-white shadow-lg shadow-[#53cafd]/25'
                          : 'bg-white/10 text-white hover:bg-white/20'
                          }`}
                      >
                        <Play size={16} />
                        Video
                      </button>
                    )}
                    {selectedLesson.documentUrl && (
                      <button
                        onClick={() => setViewMode('document')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${viewMode === 'document'
                          ? 'bg-[#53cafd] text-white shadow-lg shadow-[#53cafd]/25'
                          : 'bg-white/10 text-white hover:bg-white/20'
                          }`}
                      >
                        <FileText size={16} />
                        {t("student.documents")}
                      </button>
                    )}
                    {selectedLesson.hasQuiz && (
                      <button
                        onClick={() => setViewMode('quiz')}
                        className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${viewMode === 'quiz'
                          ? 'bg-[#53cafd] text-white shadow-lg shadow-[#53cafd]/25'
                          : 'bg-white/10 text-white hover:bg-white/20'
                          }`}
                      >
                        <HelpCircle size={16} />
                        {t("student.quizSection")}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {viewMode === 'video' && !selectedLesson?.videoId ? (
                <div className="bg-gradient-to-br from-[#111d30] to-[#0b1424] backdrop-blur-md rounded-xl relative border border-[#223852] shadow-2xl" style={{ paddingTop: '56.25%' }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-white">
                      <Play className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p>{t("student.noVideoYet")}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Document View */}
            {viewMode === 'document' && selectedLesson && selectedLesson.documentUrl ? (
              <div className="bg-gradient-to-br from-[#111d30] to-[#0b1424] backdrop-blur-md rounded-xl p-8 border border-[#223852] shadow-2xl">
                <div className="text-center">
                  <FileText className="w-16 h-16 text-[#53cafd] mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-white mb-2">{t("student.lessonDocuments")}</h3>
                  <p className="text-white mb-4">{selectedLesson.documentName}</p>
                  <a
                    href={selectedLesson.documentUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block px-6 py-3 bg-[#53cafd] text-white rounded-lg hover:bg-[#3db9f5] transition-all shadow-lg shadow-[#53cafd]/25"
                  >
                    {t("student.downloadDocument")}
                  </a>
                </div>
              </div>
            ) : viewMode === 'document' ? (
              <div className="bg-gradient-to-br from-[#111d30] to-[#0b1424] backdrop-blur-md rounded-xl p-8 text-center border border-[#223852] shadow-2xl">
                <FileText className="w-16 h-16 text-white mx-auto mb-4" />
                <p className="text-white">{t("student.noDocumentYet")}</p>
              </div>
            ) : null}

            {/* Quiz View - Removed, now shown in bottom bar of lesson info */}

            {selectedLesson && (
              <div className="bg-gradient-to-br from-[#111d30]/40 to-[#0b1424]/40 backdrop-blur-md rounded-lg p-3 mt-4 border border-[#223852]/50 shadow-lg">
                <h2 className="text-base font-bold text-white mb-1">{selectedLesson.title}</h2>
                <p className="text-xs text-white/90 mb-2">{selectedLesson.description}</p>
                <div className="flex items-center gap-3 text-xs">
                  {selectedLesson.duration && (
                    <div className="flex items-center gap-1.5 text-white">
                      <Clock size={12} />
                      <span>{t("student.durationLabel")}: {formatDuration(selectedLesson.duration)}</span>
                    </div>
                  )}
                  {progress[selectedLesson.id] && (
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-[10px] text-white">
                            {t("student.watchedLabel")}: {formatDuration(progress[selectedLesson.id].viewedSeconds ?? progress[selectedLesson.id].watchedSeconds)}
                          </span>
                          {progress[selectedLesson.id].completed && (
                            <CheckCircle size={12} className="text-green-400" />
                          )}
                        </div>
                        <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-[#53cafd] transition-all"
                            style={{
                              width: `${getLessonCompletionPercent(progress[selectedLesson.id])}%`
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {selectedLesson.videoId && progress[selectedLesson.id]?.completed && (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 font-medium text-emerald-300">
                      {t('student.videoPointsEarned', { points: VIDEO_POINTS_PER_LESSON })}
                    </span>
                  )}
                </div>

                {/* Quiz Section - Bottom Bar */}
                {selectedLesson.hasQuiz && (
                  <div className="border-t border-white/10 pt-4 mt-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <HelpCircle className="w-6 h-6 text-[#53cafd]" />
                        <div>
                          <h3 className="text-lg font-bold text-white">{t("student.quizSection")}</h3>
                          <p className="text-sm text-white">{t("student.quizSectionHint")}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowQuizSection(!showQuizSection)}
                        className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white hover:text-white"
                        title={showQuizSection ? t("student.collapse") : t("student.expand")}
                      >
                        {showQuizSection ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                      </button>
                    </div>
                    <div
                      className={`overflow-hidden transition-all duration-300 ease-in-out ${
                        showQuizSection ? 'max-h-[1000px] opacity-100' : 'max-h-0 opacity-0'
                      }`}
                    >
                      <div>
                        {takingQuiz ? (
                          <QuizTaker
                            lessonId={selectedLesson.id}
                            courseId={course.id}
                            quizDuration={selectedLesson.quizDuration}
                            quizDocumentUrl={selectedLesson.quizDocumentUrl}
                            quizDocumentName={selectedLesson.quizDocumentName}
                            onComplete={() => setTakingQuiz(false)}
                          />
                        ) : (
                          <div className="flex justify-end">
                            <button
                              onClick={() => setTakingQuiz(true)}
                              className="px-6 py-3 bg-[#53cafd] text-white rounded-lg hover:bg-[#3db9f5] transition-all shadow-lg shadow-[#53cafd]/25 font-medium"
                            >
                              {t("student.startQuiz")}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Left Sidebar - Tag Filter (Hạng mục) */}
          <div className={`lg:col-span-1 transition-all duration-300 ${
            selectedLesson && viewMode === 'video' && !showSidebar 
              ? 'hidden lg:hidden' 
              : 'block'
          }`}>
            <div className="bg-[#111d30] backdrop-blur-md rounded-xl border border-[#223852] overflow-hidden sticky top-24 shadow-lg">
              <div className="p-3 border-b border-[#223852]/50">
                <h3 className="font-bold text-white text-sm">{t("student.categories")}</h3>
                <p className="text-xs text-white mt-1">
                  {t("student.topicsCount", { count: allTags.length })}
                </p>
              </div>

              <div className="p-3 space-y-1 max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
                {allTags.length > 0 ? (
                  <>
                    <button
                      onClick={() => setSelectedTag('all')}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${selectedTag === 'all'
                          ? 'bg-[#53cafd] text-white shadow-lg shadow-[#53cafd]/25'
                          : 'text-white hover:bg-[#223852]/40'
                        }`}
                    >
                      {t("student.allWithCount", { count: lessons.length })}
                    </button>
                    {allTags.map((tag) => {
                      const count = lessons.filter(l => l.tags?.includes(tag)).length;
                      return (
                        <button
                          key={tag}
                          onClick={() => setSelectedTag(tag)}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors ${selectedTag === tag
                              ? 'bg-[#53cafd] text-white shadow-lg shadow-[#53cafd]/25'
                              : 'text-white hover:bg-[#223852]/40'
                            }`}
                        >
                          {tag} ({count})
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <p className="text-xs text-white">{t('student.noTags')}</p>
                )}
              </div>
            </div>
          </div>

          {/* Lesson List - Moved to Right */}
          <div className={`lg:col-span-1 transition-all duration-300 ${
            selectedLesson && viewMode === 'video' && !showSidebar 
              ? 'hidden lg:hidden' 
              : 'block'
          }`}>
            <div className="bg-[#111d30] backdrop-blur-md rounded-xl border border-[#223852] overflow-hidden sticky top-24 shadow-lg">
              <div className="p-3 border-b border-[#223852]/50">
                <h3 className="font-bold text-white text-sm">{t("student.courseContent")}</h3>
                <p className="text-xs text-white mt-1 line-clamp-1">{currentCourse.title}</p>
                <p className="text-xs text-white mt-1">
                  {selectedTag === 'all' ? t('student.lessonsCount', { count: lessons.length }) : t('student.lessonsFiltered', { filtered: filteredLessons.length, total: lessons.length })}
                </p>
              </div>

              <div className="max-h-[calc(100vh-200px)] overflow-y-auto custom-scrollbar">
                {filteredLessons.length === 0 ? (
                  <div className="p-4 text-center text-white">
                    <p className="text-xs">
                      {selectedTag === 'all' ? t('student.noLessonsYet') : t('student.noLessonsWithTag', { tag: selectedTag })}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-[#223852]/30">
                    {filteredLessons.map((lesson, index) => {
                      const hasContent = lesson.videoId || lesson.documentUrl || lesson.hasQuiz;
                      const locked = isLessonLocked(lesson, index);
                      const previousLesson = index > 0 ? filteredLessons[index - 1] : null;

                      return (
                        <button
                          key={lesson.id}
                          onClick={() => {
                            if (locked) {
                              alert(t("student.unlockLessonAlert", { title: previousLesson?.title || "" }));
                              return;
                            }
                            if (hasContent) {
                              setSelectedLesson(lesson);
                              // Auto select view mode
                              if (lesson.videoId) setViewMode('video');
                              else if (lesson.documentUrl) setViewMode('document');
                              else if (lesson.hasQuiz) setViewMode('quiz');
                            }
                          }}
                          disabled={!hasContent || locked}
                          className={`w-full p-2.5 text-left transition-colors ${selectedLesson?.id === lesson.id ? 'bg-[#223852]/50 border-l-3 border-[#53cafd]' : ''
                            } ${locked ? 'opacity-50 cursor-not-allowed bg-[#0b1424]/30' : 'hover:bg-[#223852]/40'} ${!hasContent && !locked ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 text-xs font-bold relative ${locked ? 'bg-red-500/30 text-red-300' : 'bg-white/15 text-white'
                              }`}>
                              {locked ? <Lock size={12} /> : lesson.order}
                              {!locked && progress[lesson.id]?.completed && (
                                <CheckCircle size={10} className="absolute -top-0.5 -right-0.5 text-green-400 bg-[#111d30] rounded-full" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className={`font-medium mb-0.5 line-clamp-2 ${locked ? 'text-white' : 'text-white'} text-xs leading-tight`}>
                                {lesson.title}
                                {locked && (
                                  <span className="ml-1 text-[10px] bg-red-500/30 text-red-300 px-1.5 py-0.5 rounded border border-red-500/40">
                                    70%
                                  </span>
                                )}
                              </h4>
                              {!locked && progress[lesson.id] && (
                                <div className="mb-1">
                                  <div className="w-full h-0.5 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-[#53cafd]"
                                      style={{
                                        width: `${getLessonCompletionPercent(progress[lesson.id])}%`
                                      }}
                                    />
                                  </div>
                                </div>
                              )}
                              <div className="flex items-center gap-1.5 text-[10px] text-white flex-wrap">
                                {lesson.videoId && (
                                  <span className="flex items-center gap-0.5">
                                    <Play size={10} />
                                    Video
                                  </span>
                                )}
                                {lesson.documentUrl && (
                                  <span className="flex items-center gap-0.5 text-[#53cafd]">
                                    <FileText size={10} />
                                    {t("student.documents")}
                                  </span>
                                )}
                                {lesson.hasQuiz && (
                                  <span className="flex items-center gap-0.5 text-purple-300">
                                    <HelpCircle size={10} />
                                    Quiz
                                  </span>
                                )}
                                {!hasContent && (
                                  <span className="flex items-center gap-0.5">
                                    <Lock size={10} />
                                    {t("student.notAvailable")}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Sidebar - Course Switcher (if multiple courses) */}
          {allCourses.length > 1 && (
            <div className={`lg:col-span-1 transition-all duration-300 ${
              selectedLesson && viewMode === 'video' && !showSidebar 
                ? 'hidden lg:hidden' 
                : 'block'
            }`}>
              <div className="bg-[#111d30] backdrop-blur-md rounded-xl border border-[#223852] p-3 sticky top-24 shadow-lg">
                <h3 className="font-bold text-white text-sm mb-3">{t("student.otherCourses")}</h3>
                <div className="space-y-1">
                  {allCourses.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => {
                        setSelectedCourseId(c.id);
                        setSelectedTag('all');
                        setSelectedLesson(null);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${selectedCourseId === c.id
                          ? 'bg-[#223852]/50 text-[#53cafd] font-medium border border-[#53cafd]/30'
                          : 'text-white hover:bg-[#223852]/40'
                        }`}
                    >
                      <div className="line-clamp-2">{c.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Attention Check Popup (Staff only) */}
      {showAttentionCheck && isStaff && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#1e1e2d] border border-white/10 rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4 text-center">
            <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-yellow-500/30">
              <svg className="w-8 h-8 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-white mb-2">{t("student.stillWatching")}</h3>
            <p className="text-white mb-6">
              {t("student.stillWatchingHint")}
            </p>
            <button
              onClick={handleAttentionCheckContinue}
              className="w-full px-6 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-medium text-lg transition-colors shadow-lg shadow-green-500/25"
            >
              {t("student.continueWatching")}
            </button>
            <p className="text-xs text-white mt-4">
              {t("student.autoPauseHint")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
