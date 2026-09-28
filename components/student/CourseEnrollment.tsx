'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { Course } from '@/types/course';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import {
  Award,
  BarChart3,
  BookOpen,
  Filter,
  GraduationCap,
  LayoutGrid,
  Lightbulb,
  List,
  Search,
} from 'lucide-react';
import { CourseCard } from './CourseCard';

interface CourseEnrollmentProps {
  heading?: string;
  showHero?: boolean;
}

export const CourseEnrollment: React.FC<CourseEnrollmentProps> = ({
  heading,
  showHero = true,
}) => {
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [lessonCounts, setLessonCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    void loadCourses();
  }, [userProfile?.departmentId]);

  const loadCourses = async () => {
    try {
      setLoading(true);

      const [deptSnapshot, coursesSnapshot, lessonsSnapshot] = await Promise.all([
        getDocs(collection(db, 'departments')),
        getDocs(collection(db, 'courses')),
        getDocs(collection(db, 'lessons')),
      ]);

      setDepartments(
        deptSnapshot.docs.map(docSnap => ({
          id: docSnap.id,
          name: docSnap.data().name,
        }))
      );

      let coursesData = coursesSnapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
        updatedAt: docSnap.data().updatedAt?.toDate(),
      })) as Course[];

      if (userProfile?.departmentId) {
        coursesData = coursesData.filter(
          course => course.departmentId === 'all' || course.departmentId === userProfile.departmentId
        );
      } else {
        coursesData = coursesData.filter(course => course.departmentId === 'all');
      }

      const counts: Record<string, number> = {};
      lessonsSnapshot.docs.forEach(docSnap => {
        const courseId = docSnap.data().courseId as string | undefined;
        if (!courseId) return;
        counts[courseId] = (counts[courseId] || 0) + 1;
      });

      setLessonCounts(counts);
      setCourses(coursesData);
    } catch (error) {
      console.error('Error loading courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredCourses = useMemo(() => {
    let filtered = courses;
    if (filterLevel !== 'all') {
      filtered = filtered.filter(course => course.level === filterLevel);
    }
    if (searchTerm.trim()) {
      const keyword = searchTerm.trim().toLowerCase();
      filtered = filtered.filter(
        course =>
          course.title.toLowerCase().includes(keyword) ||
          course.category?.toLowerCase().includes(keyword) ||
          course.teacherName?.toLowerCase().includes(keyword) ||
          course.description?.toLowerCase().includes(keyword)
      );
    }
    return filtered;
  }, [courses, searchTerm, filterLevel]);

  const handleViewCourse = (courseId: string) => {
    router.push(`/student/courses/${courseId}`);
  };

  if (loading) {
    return (
      <div className="grid min-h-[240px] place-items-center rounded-2xl border border-[#e7edf5] bg-white text-[13px] text-[#63708a]">
        {t('common.loading')}
      </div>
    );
  }

  const features = [
    {
      icon: BookOpen,
      tone: 'bg-[#fff1e6] text-[#e08920]',
      title: t('student.coursesHero.featureTopics'),
      desc: t('student.coursesHero.featureTopicsDesc'),
    },
    {
      icon: BarChart3,
      tone: 'bg-[#eaf3ff] text-[#2b6de5]',
      title: t('student.coursesHero.featureFlexible'),
      desc: t('student.coursesHero.featureFlexibleDesc'),
    },
    {
      icon: Award,
      tone: 'bg-[#edfbf4] text-[#18701C]',
      title: t('student.coursesHero.featureSkills'),
      desc: t('student.coursesHero.featureSkillsDesc'),
    },
  ];

  return (
    <div className="space-y-5">
      {showHero && (
        <section className="relative overflow-hidden rounded-b-3xl rounded-t-2xl bg-gradient-to-br from-[#0a2f12] via-[#145616] to-[#1B7A1E] px-5 py-8 text-white shadow-[0_16px_40px_rgba(20,86,22,0.28)] sm:px-8 sm:py-10">
          <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-[#EDB409]/15 blur-3xl" />
          <div className="pointer-events-none absolute bottom-0 right-8 hidden opacity-90 lg:block">
            <div className="relative grid h-40 w-40 place-items-center rounded-full bg-white/10 backdrop-blur-sm">
              <Lightbulb className="absolute -top-2 text-[#EDB409]" size={36} />
              <BookOpen className="text-white/90" size={54} />
              <GraduationCap className="absolute -right-3 bottom-4 text-white/80" size={28} />
            </div>
          </div>

          <div className="relative max-w-3xl">
            <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#EDB409]">
              BioKama Academy
            </p>
            <h1 className="mt-2 text-[34px] font-bold tracking-tight sm:text-[40px]">
              {heading || t('student.coursesHero.title')}
            </h1>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-white/85">
              {t('student.coursesHero.subtitle')}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {features.map(item => (
                <div key={item.title} className="flex items-start gap-3 rounded-2xl bg-white/10 px-3 py-3 backdrop-blur-sm">
                  <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${item.tone}`}>
                    <item.icon size={18} />
                  </span>
                  <span>
                    <b className="block text-[13px] leading-snug">{item.title}</b>
                    <small className="mt-0.5 block text-[11px] text-white/75">{item.desc}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 rounded-2xl border border-[#e7edf5] bg-white p-3 shadow-[0_8px_24px_rgba(24,48,93,0.05)] sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#99a4b5]" size={18} />
          <input
            type="text"
            placeholder={t('student.searchCourses')}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-[#e7edf5] bg-[#f8fafc] py-3 pl-11 pr-4 text-[14px] text-[#111b38] outline-none placeholder:text-[#99a4b5] focus:border-[#18701C] focus:bg-white"
          />
        </div>
        <div className="relative">
          <Filter className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#63708a]" size={15} />
          <select
            value={filterLevel}
            onChange={e => setFilterLevel(e.target.value as typeof filterLevel)}
            className="min-w-[160px] appearance-none rounded-xl border border-[#e7edf5] bg-white py-3 pl-9 pr-8 text-[13px] font-semibold text-[#111b38] outline-none focus:border-[#18701C]"
          >
            <option value="all">{t('student.allLevels')}</option>
            <option value="beginner">{t('student.levelBeginner')}</option>
            <option value="intermediate">{t('student.levelIntermediate')}</option>
            <option value="advanced">{t('student.levelAdvanced')}</option>
          </select>
        </div>
        <div className="flex overflow-hidden rounded-xl border border-[#e7edf5]">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`grid h-11 w-11 place-items-center transition ${
              viewMode === 'grid' ? 'bg-[#18701C] text-white' : 'bg-white text-[#63708a] hover:bg-[#f4faf6]'
            }`}
            aria-label="Grid"
          >
            <LayoutGrid size={18} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`grid h-11 w-11 place-items-center transition ${
              viewMode === 'list' ? 'bg-[#18701C] text-white' : 'bg-white text-[#63708a] hover:bg-[#f4faf6]'
            }`}
            aria-label="List"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      <div className="flex items-end justify-between gap-3 px-0.5">
        <div>
          <h2 className="m-0 text-[18px] font-bold text-[#111b38]">{t('student.yourCourses')}</h2>
          <p className="mt-1 text-[12px] text-[#63708a]">
            {userProfile?.departmentId ? t('student.deptCoursesHint') : t('student.noDeptHint')}
          </p>
        </div>
        <b className="text-[13px] text-[#18701C]">
          {filteredCourses.length} {t('student.academy.courses').toLowerCase()}
        </b>
      </div>

      {filteredCourses.length === 0 ? (
        <div className="rounded-2xl border border-[#e7edf5] bg-white py-14 text-center shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
          <BookOpen className="mx-auto mb-4 h-12 w-12 text-[#99a4b5]" />
          <p className="text-[14px] text-[#63708a]">{t('student.noCoursesFound')}</p>
        </div>
      ) : (
        <div
          className={
            viewMode === 'grid'
              ? 'grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3'
              : 'grid grid-cols-1 gap-4'
          }
        >
          {filteredCourses.map(course => (
            <CourseCard
              key={course.id}
              course={course}
              layout={viewMode}
              lessonCount={lessonCounts[course.id] || 0}
              onView={handleViewCourse}
              departmentName={
                course.departmentId
                  ? departments.find(d => d.id === course.departmentId)?.name
                  : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
};
