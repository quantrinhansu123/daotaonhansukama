'use client';

import React from 'react';
import { Course } from '@/types/course';
import { BookOpen, Clock, FileText, Play } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import { resolveDemoVideo } from '@/lib/demo-video';

interface CourseCardProps {
  course: Course;
  onView?: (courseId: string) => void;
  departmentName?: string;
  lessonCount?: number;
  layout?: 'grid' | 'list';
}

export const CourseCard: React.FC<CourseCardProps> = ({
  course,
  onView,
  departmentName,
  lessonCount = 0,
  layout = 'grid',
}) => {
  const { t } = useLanguage();

  const levelStyles = {
    beginner: 'bg-[#edfbf4] text-[#14661a]',
    intermediate: 'bg-[#fff6e9] text-[#df8b00]',
    advanced: 'bg-[#fff1f1] text-[#d14343]',
  };
  const levelLabels = {
    beginner: t('student.levelBeginner'),
    intermediate: t('student.levelIntermediate'),
    advanced: t('student.levelAdvanced'),
  };

  const thumb = course.thumbnail || course.banner;
  const hasDemo = Boolean(resolveDemoVideo(course.demoVideoKey, course.demoVideoId));
  const isList = layout === 'list';

  return (
    <article
      className={`group overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_16px_36px_rgba(24,48,93,0.12)] ${
        isList ? 'grid gap-0 sm:grid-cols-[240px_minmax(0,1fr)]' : 'flex flex-col'
      }`}
    >
      <div className={`relative overflow-hidden bg-[#113e30] ${isList ? 'aspect-[16/11] sm:aspect-auto sm:min-h-full' : 'aspect-[16/10]'}`}>
        {thumb ? (
          <img
            src={proxyBunnyUrl(thumb)}
            alt={course.title}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="grid h-full min-h-[160px] place-items-center">
            <BookOpen className="h-12 w-12 text-white/40" />
          </div>
        )}

        <span
          className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[11px] font-bold shadow-sm ${
            levelStyles[course.level]
          }`}
        >
          {levelLabels[course.level]}
        </span>

        {hasDemo && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 transition group-hover:opacity-100">
            <span className="grid h-12 w-12 place-items-center rounded-full bg-white text-[#18701C] shadow-lg">
              <Play size={20} fill="currentColor" />
            </span>
          </div>
        )}
      </div>

      <div className={`flex flex-1 flex-col p-5 ${isList ? 'justify-center' : ''}`}>
        <h3 className="m-0 line-clamp-2 text-[17px] font-bold tracking-tight text-[#111b38]">
          {course.title}
        </h3>

        {course.description ? (
          <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-[#53617b]">
            {course.description}
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-[#63708a]">
          {course.duration > 0 && (
            <span className="inline-flex items-center gap-1">
              <Clock size={14} className="text-[#18701C]" />
              {course.duration} {t('student.hoursUnit')}
            </span>
          )}
          {lessonCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <FileText size={14} className="text-[#18701C]" />
              {t('student.academy.lessonsUnit', { count: lessonCount })}
            </span>
          )}
          {departmentName && <span>· {departmentName}</span>}
        </div>

        {onView && (
          <button
            type="button"
            onClick={() => onView(course.id)}
            className={`mt-4 inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-[#18701C] px-4 text-[14px] font-bold text-white shadow-[0_8px_18px_rgba(24,112,28,0.28)] transition hover:-translate-y-0.5 hover:bg-[#145616] hover:shadow-[0_12px_22px_rgba(24,112,28,0.34)] ${
              isList ? 'w-full sm:w-auto sm:self-start sm:px-6' : 'w-full'
            }`}
          >
            <Play size={15} fill="currentColor" />
            {t('student.startLearning')}
          </button>
        )}
      </div>
    </article>
  );
};
