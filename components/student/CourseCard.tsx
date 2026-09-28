'use client';

import React from 'react';
import { Course } from '@/types/course';
import { ArrowUpRight, BookOpen, Clock, Play } from 'lucide-react';
import { Button } from '@/components/Button';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import { resolveDemoVideo } from '@/lib/demo-video';

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
      beginner: 'bg-[#edfbf8] text-[#07965f]',
      intermediate: 'bg-[#fff6e9] text-[#df8b00]',
      advanced: 'bg-[#fff1f1] text-[#d14343]'
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
    <article className="group overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_32px_rgba(24,48,93,0.1)]">
      <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-[#113e30]">
        <div className="absolute inset-0">
          {course.thumbnail ? (
            <img src={proxyBunnyUrl(course.thumbnail)} alt={course.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <BookOpen className="h-12 w-12 text-white/40" />
            </div>
          )}
        </div>

        {resolveDemoVideo(course.demoVideoKey, course.demoVideoId) && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <div className="rounded-full bg-white p-3 text-[#1B7A1E]">
              <Play className="h-6 w-6" fill="currentColor" />
            </div>
          </div>
        )}
      </div>

      <div className="p-5">
        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 flex-1 text-[16px] font-bold tracking-tight text-[#111b38]">{course.title}</h3>
          {getLevelBadge(course.level)}
        </div>

        {course.description && (
          <p className="mb-3 line-clamp-2 text-[12px] text-[#53617b]">{course.description}</p>
        )}

        <div className="mb-4 flex items-center gap-3 text-[11px] text-[#63708a]">
          {course.duration > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock size={14} />
              {course.duration}h
            </span>
          )}
          {departmentName && <span>{departmentName}</span>}
        </div>

        {onView && (
          <Button
            onClick={() => onView(course.id)}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-[#18701C] bg-[#18701C] text-white shadow-[0_8px_18px_rgba(24,112,28,0.28)] hover:bg-[#145616]"
          >
            {t('student.startLearning')} <ArrowUpRight size={16} />
          </Button>
        )}
      </div>
    </article>
  );
};
