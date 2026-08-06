'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Course } from '@/types/course';
import { BookOpen, Clock, Play } from 'lucide-react';
import { Button } from '@/components/Button';
import { useLanguage } from '@/contexts/LanguageContext';

interface CourseCardProps {
  course: Course;
  onView?: (courseId: string) => void;
  departmentName?: string;
}

export const CourseCard: React.FC<CourseCardProps> = ({
  course,
  onView,
  departmentName
}) => {
  const { t } = useLanguage();
  const [isHovered, setIsHovered] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const CDN_HOSTNAME = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;

  useEffect(() => {
    if (isHovered && course.demoVideoId && videoRef.current) {
      // Delay video play slightly for smooth transition
      hoverTimeoutRef.current = setTimeout(() => {
        videoRef.current?.play().catch(err => {
          console.log('Video autoplay prevented:', err);
        });
      }, 300);
    } else if (!isHovered && videoRef.current) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }

    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, [isHovered, course.demoVideoId]);

  const getLevelBadge = (level: string) => {
    const styles = {
      beginner: 'bg-green-100 text-green-700',
      intermediate: 'bg-yellow-100 text-yellow-700',
      advanced: 'bg-red-100 text-red-700'
    };
    const labels = {
      beginner: t('student.levelBeginner'),
      intermediate: t('student.levelIntermediate'),
      advanced: t('student.levelAdvanced')
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[level as keyof typeof styles]}`}>
        {labels[level as keyof typeof labels]}
      </span>
    );
  };

  const getBorderColor = () => {
    return 'border-white/10';
  };

  return (
    <div
      className={`bg-[#5e3ed0]/20 backdrop-blur-md rounded-xl border ${getBorderColor()} overflow-hidden transition-all duration-300 ${isHovered ? 'shadow-2xl scale-105 z-10 border-[#53cafd]/50' : 'shadow-sm hover:shadow-lg hover:bg-[#5e3ed0]/30'
        }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Thumbnail/Video Area */}
      <div className="aspect-video bg-gradient-to-br from-[#53cafd] to-blue-600 flex items-center justify-center relative overflow-hidden">
        {/* Video Demo (shows on hover) */}
        {course.demoVideoId && (
          <video
            ref={videoRef}
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${isHovered ? 'opacity-100' : 'opacity-0'
              }`}
            muted
            loop
            playsInline

          >
            <source
              src={`https://${CDN_HOSTNAME}/${course.demoVideoId}/playlist.m3u8`}
              type="application/x-mpegURL"
            />
          </video>
        )}

        {/* Thumbnail (shows when not hovering) */}
        <div
          className={`absolute inset-0 transition-opacity duration-300 ${isHovered && course.demoVideoId ? 'opacity-0' : 'opacity-100'
            }`}
        >
          {course.thumbnail ? (
            <img src={course.thumbnail} alt={course.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen className="w-16 h-16 text-white" />
            </div>
          )}
        </div>

        {/* Play Icon Overlay */}
        {course.demoVideoId && !isHovered && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="bg-white/90 rounded-full p-4">
              <Play className="w-8 h-8 text-[#53cafd]" fill="currentColor" />
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-bold text-white line-clamp-2 flex-1">{course.title}</h3>
          {getLevelBadge(course.level)}
        </div>
        <p className="text-sm text-slate-300 mb-2 line-clamp-2">{course.description}</p>
        <div className="flex items-center justify-between text-sm text-slate-400 mb-2">
          <span>👨‍🏫 {course.teacherName}</span>
          <span className="text-slate-400">{course.category}</span>
        </div>

        <div className="mb-3 flex items-center gap-2">
          {course.departmentId === 'all' ? (
            <span className="inline-block px-2 py-1 bg-green-500/20 text-green-300 rounded-full text-xs font-medium border border-green-500/30">
              🌐 {t("student.general")}
            </span>
          ) : departmentName ? (
            <span className="inline-block px-2 py-1 bg-purple-500/20 text-purple-300 rounded-full text-xs font-medium border border-purple-500/30">
              🏢 {departmentName}
            </span>
          ) : null}
          {course.students && course.students.length > 0 && (
            <span className="inline-block px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full text-xs font-medium border border-blue-500/30">
              👥 {t("student.studentsCount", { count: course.students.length })}
            </span>
          )}
        </div>

        <div className="flex items-center text-sm mb-3">
          <span className="text-slate-400 flex items-center gap-1">
            <Clock size={14} />
            {course.duration}h
          </span>
        </div>

        {/* Action Button */}
        <Button
          onClick={() => onView?.(course.id)}
          className="w-full bg-[#53cafd] hover:bg-[#3db9f5] text-white shadow-lg shadow-[#53cafd]/20"
        >
          {t("student.learnNow")}
        </Button>
      </div>
    </div>
  );
};
