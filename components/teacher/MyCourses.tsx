'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Course } from '@/types/course';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { BookOpen } from 'lucide-react';
import { CourseDetailPage } from '@/components/admin/CourseDetailPage';

export const MyCourses: React.FC = () => {
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);

  useEffect(() => {
    if (userProfile) {
      loadMyCourses();
    }
  }, [userProfile]);

  const loadMyCourses = async () => {
    if (!userProfile) return;

    try {
      setLoading(true);

      const coursesRef = collection(db, 'courses');
      const q = query(coursesRef, where('teacherId', '==', userProfile.uid));
      const snapshot = await getDocs(q);
      const coursesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Course[];
      setCourses(coursesData);
    } catch (error) {
      console.error('Error loading courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const getLevelBadge = (level: string) => {
    const styles = {
      beginner: 'bg-green-500/20 text-green-400',
      intermediate: 'bg-yellow-500/20 text-yellow-400',
      advanced: 'bg-pink-500/20 text-pink-400'
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

  if (loading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  if (selectedCourse) {
    return (
      <CourseDetailPage
        course={selectedCourse}
        onBack={() => setSelectedCourse(null)}
        isAdmin={false}
      />
    );
  }

  if (courses.length === 0) {
    return (
      <div className="text-center py-12 bg-[#5e3ed0]/20 rounded-xl border border-white/10 backdrop-blur-md">
        <BookOpen className="w-16 h-16 text-slate-500 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-white mb-2">{t('teacher.noCoursesTitle')}</h3>
        <p className="text-slate-300">{t('teacher.noCoursesHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-white">{t('teacher.myCourses')}</h2>

      <div className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-white/5 border-b border-white/10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  {t('teacher.courseCol')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  {t('teacher.categoryCol')}
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                  {t('teacher.levelCol')}
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                  {t('teacher.studentsCol')}
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                  {t('teacher.durationCol')}
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">
                  {t('teacher.actionsCol')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {courses.map((course) => (
                <tr key={course.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-white">{course.title}</div>
                      <div className="text-sm text-slate-400 line-clamp-1">{course.description}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-300">
                    {course.category}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {getLevelBadge(course.level)}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="font-medium text-slate-300">{course.students?.length || 0}</span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-slate-300">
                    {course.duration}h
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => setSelectedCourse(course)}
                      className="px-5 py-2.5 bg-gradient-to-r from-[#1B7A1E] to-blue-600 text-white rounded-lg hover:from-[#156318] hover:to-blue-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-medium ml-auto"
                    >
                      <BookOpen size={16} />
                      {t('teacher.manageClass')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
