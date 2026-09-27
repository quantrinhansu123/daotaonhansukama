'use client';

import React from 'react';
import { Course } from '@/types/course';
import { ArrowUpRight, BookOpen, Clock, Play } from 'lucide-react';
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
  const getLevelBadge = (level: string) => {
    const styles = {
      beginner: 'bg-emerald-400/10 text-emerald-300 border border-emerald-400/20',
      intermediate: 'bg-amber-400/10 text-amber-300 border border-amber-400/20',
      advanced: 'bg-rose-400/10 text-rose-300 border border-rose-400/20'
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
    <article className="group rounded-2xl border border-slate-800 bg-[#111b2b] overflow-hidden shadow-xl shadow-black/10 transition-all duration-200 hover:-translate-y-1 hover:border-cyan-400/40 hover:shadow-cyan-950/20">
      <div className="aspect-video bg-gradient-to-br from-[#172e49] to-[#0a1729] flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0">
          {course.thumbnail ? (
            <img src={proxyBunnyUrl(course.thumbnail)} alt={course.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <BookOpen className="w-14 h-14 text-cyan-300/40" />
            </div>
          )}
        </div>

        {course.demoVideoId && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="bg-slate-950/80 border border-white/20 rounded-full p-3.5 backdrop-blur-sm">
              <Play className="w-7 h-7 text-cyan-300" fill="currentColor" />
            </div>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-white line-clamp-2 flex-1 group-hover:text-cyan-100">{course.title}</h3>
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
          <Button onClick={() => onView(course.id)} className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-cyan-400 hover:text-slate-950 text-cyan-100 border border-slate-700 hover:border-cyan-300">
            {t('student.startLearning')} <ArrowUpRight size={16} />
          </Button>
        )}
      </div>
    </article>
  );
};
