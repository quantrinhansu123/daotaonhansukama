'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { Course } from '@/types/course';
import { CourseViewer } from '@/components/student/CourseViewer';

export default function CourseDetailPage() {
  const { userProfile, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const courseId = params.courseId as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading) {
      if (!userProfile) {
        router.push('/');
      } else if (userProfile.role !== 'student' && userProfile.role !== 'staff') {
        router.push('/');
      }
    }
  }, [userProfile, authLoading, router]);

  useEffect(() => {
    if (courseId && userProfile?.uid) {
      void loadCourse();
    }
  }, [courseId, userProfile?.uid]);

  const loadCourse = async () => {
    const isFirstLoad = !course || course.id !== courseId;
    try {
      if (isFirstLoad) setLoading(true);
      setError(null);

      const courseRef = doc(db, 'courses', courseId);
      const courseSnap = await getDoc(courseRef);

      if (!courseSnap.exists()) {
        setError(t('student.courseNotFound'));
        return;
      }

      const courseData = {
        ...courseSnap.data(),
        id: courseSnap.id,
        createdAt: courseSnap.data().createdAt?.toDate(),
        updatedAt: courseSnap.data().updatedAt?.toDate(),
        banner: courseSnap.data().banner || undefined,
        demoVideoKey: courseSnap.data().demoVideoKey || undefined,
        demoVideoId: courseSnap.data().demoVideoId || undefined,
      } as Course;

      if (userProfile?.role !== 'staff' && !courseData.students?.includes(userProfile?.uid || '')) {
        setError(t('student.notEnrolled'));
        return;
      }

      setCourse(courseData);
    } catch (err) {
      console.error('Error loading course:', err);
      setError(t('student.loadCourseError'));
    } finally {
      if (isFirstLoad) setLoading(false);
    }
  };

  const handleBack = () => {
    // Use router.back() to go back in history, which works better with browser back button
    router.back();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f8fc]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#1B7A1E] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-[#63708a]">{t("common.loading")}</p>
        </div>
      </div>
    );
  }

  if (!userProfile || (userProfile.role !== 'student' && userProfile.role !== 'staff')) {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f8fc]">
        <div className="text-center bg-white p-8 rounded-2xl shadow-[0_4px_16px_rgba(24,48,93,0.06)]">
          <p className="text-red-500 mb-4 text-lg font-medium">{error}</p>
          <button
            onClick={handleBack}
            className="px-6 py-2 bg-[#18701C] text-white rounded-lg hover:bg-[#1B7A1E] transition-colors"
          >
            {t("common.backToDashboard")}
          </button>
        </div>
      </div>
    );
  }

  if (!course) {
    return null;
  }

  return <CourseViewer course={course} onBack={handleBack} />;
}
