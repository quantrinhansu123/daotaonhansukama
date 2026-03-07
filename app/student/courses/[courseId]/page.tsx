'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Course } from '@/types/course';
import { CourseViewer } from '@/components/student/CourseViewer';

export default function CourseDetailPage() {
  const { userProfile, loading: authLoading } = useAuth();
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
    if (courseId && userProfile) {
      loadCourse();
    }
  }, [courseId, userProfile]);

  // Reload course when window gets focus (to get latest banner)
  useEffect(() => {
    const handleFocus = () => {
      if (courseId && userProfile) {
        loadCourse();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [courseId, userProfile]);

  const loadCourse = async () => {
    try {
      setLoading(true);
      setError(null);

      const courseRef = doc(db, 'courses', courseId);
      const courseSnap = await getDoc(courseRef);

      if (!courseSnap.exists()) {
        setError('Không tìm thấy khóa học');
        return;
      }

      const courseData = {
        ...courseSnap.data(),
        id: courseSnap.id,
        createdAt: courseSnap.data().createdAt?.toDate(),
        updatedAt: courseSnap.data().updatedAt?.toDate(),
        banner: courseSnap.data().banner || undefined // Ensure banner is preserved
      } as Course;

      // Debug: Log banner info
      console.log('📚 Course loaded:', {
        id: courseData.id,
        title: courseData.title,
        banner: courseData.banner,
        bannerType: typeof courseData.banner,
        bannerLength: courseData.banner?.length || 0,
        hasBanner: !!courseData.banner,
        bannerTrimmed: courseData.banner?.trim() || '',
        updatedAt: courseData.updatedAt,
        rawBanner: courseSnap.data().banner
      });

      // Check if user is enrolled (staff can access all courses)
      if (userProfile?.role !== 'staff' && !courseData.students?.includes(userProfile?.uid || '')) {
        setError('Bạn chưa đăng ký khóa học này');
        return;
      }

      setCourse(courseData);
    } catch (err) {
      console.error('Error loading course:', err);
      setError('Lỗi khi tải khóa học');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    // Use router.back() to go back in history, which works better with browser back button
    router.back();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#311898]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#53cafd] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white/80">Đang tải...</p>
        </div>
      </div>
    );
  }

  if (!userProfile || (userProfile.role !== 'student' && userProfile.role !== 'staff')) {
    return null;
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#311898]">
        <div className="text-center bg-[#5e3ed0]/20 backdrop-blur-md p-8 rounded-2xl border border-white/10">
          <p className="text-red-400 mb-4 text-lg font-medium">{error}</p>
          <button
            onClick={handleBack}
            className="px-6 py-2 bg-[#53cafd] text-white rounded-lg hover:bg-[#3db9f5] transition-colors shadow-lg shadow-[#53cafd]/25"
          >
            Quay lại Dashboard
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
