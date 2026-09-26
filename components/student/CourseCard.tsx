'use client';

import React, { useState } from 'react';
import { Course } from '@/types/course';
import { BookOpen, Clock, Play } from 'lucide-react';
import { Button } from '@/components/Button';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';

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

  return (
    <div
      className={`bg-[#5e3ed0]/20 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden transition-all duration-300 ${isHovered ? 'shadow-2xl scale-105 z-10 border-[#53cafd]/50' : 'shadow-sm hover:shadow-lg hover:bg-[#5e3ed0]/30'
        }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="aspect-video bg-gradient-to-br from-[#53cafd] to-blue-600 flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0">
          {course.thumbnail ? (
            <img src={proxyBunnyUrl(course.thumbnail)} alt={course.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen className="w-16 h-16 text-white" />
            </div>
          )}
        </div>

        {course.demoVideoId && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <div className="bg-white/90 rounded-full p-4">
              <Play className="w-8 h-8 text-[#53cafd]" fill="currentColor" />
            </div>
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-white line-clamp-2 flex-1">{course.title}</h3>
          {getLevelBadge(course.level)}
        </div>

        {course.description && (
          <p className="text-sm text-slate-300 line-clamp-2 mb-3">{course.description}</p>
        )}

        <div className="flex items-center gap-3 text-xs text-slate-400 mb-4">
          {course.duration > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock size={14} />
              {course.duration}h
            </span>
          )}
          {departmentName && <span>{departmentName}</span>}
        </div>

        {onView && (
          <Button onClick={() => onView(course.id)} className="w-full">
            {t('student.startLearning')}
          </Button>
        )}
      </div>
    </div>
  );
};
