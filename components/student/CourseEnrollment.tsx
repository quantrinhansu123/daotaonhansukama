'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Course } from '@/types/course';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { Search, BookOpen } from 'lucide-react';
import { CourseCard } from './CourseCard';

export const CourseEnrollment: React.FC = () => {
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string, name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');

  useEffect(() => {
    loadCourses();
  }, []);

  useEffect(() => {
    filterCourses();
  }, [courses, searchTerm, filterLevel]);

  const loadCourses = async () => {
    try {
      setLoading(true);

      // Load departments
      const deptSnapshot = await getDocs(collection(db, 'departments'));
      const depts = deptSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      setDepartments(depts);

      // Load courses
      const coursesRef = collection(db, 'courses');
      const snapshot = await getDocs(coursesRef);
      let coursesData = snapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Course[];

      // Lọc khóa học theo phòng ban của user
      if (userProfile?.departmentId) {
        // Chỉ hiển thị khóa học của phòng ban mình + khóa học chung
        coursesData = coursesData.filter(course =>
          course.departmentId === 'all' || course.departmentId === userProfile.departmentId
        );
      } else {
        // Nếu user không có phòng ban, chỉ hiển thị khóa học chung
        coursesData = coursesData.filter(course => course.departmentId === 'all');
      }

      setCourses(coursesData);
    } catch (error) {
      console.error('Error loading courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterCourses = () => {
    let filtered = courses;

    if (filterLevel !== 'all') {
      filtered = filtered.filter(course => course.level === filterLevel);
    }

    if (searchTerm) {
      filtered = filtered.filter(course =>
        course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.teacherName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredCourses(filtered);
  };

  const handleViewCourse = (courseId: string) => {
    router.push(`/student/courses/${courseId}`);
  };

  if (loading) {
    return <div className="text-center py-8 text-slate-400">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-8">
      {/* All Available Courses */}
      <div>
        <div className="mb-6">
          <h2 className="text-2xl font-semibold text-white mb-2">{t("student.yourCourses")}</h2>
          {userProfile?.departmentId ? (
            <p className="text-slate-400 text-sm">
              {t("student.deptCoursesHint")}
            </p>
          ) : (
            <p className="text-slate-400 text-sm">
              {t("student.noDeptHint")}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder={t("student.searchCourses")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-[#111b2b] border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40 text-white placeholder-slate-500"
            />
          </div>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as typeof filterLevel)}
            className="px-4 py-2.5 bg-[#111b2b] border border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-cyan-400/40 text-white [&>option]:bg-[#111b2b]"
          >
            <option value="all">{t("student.allLevels")}</option>
            <option value="beginner">{t("student.levelBeginner")}</option>
            <option value="intermediate">{t("student.levelIntermediate")}</option>
            <option value="advanced">{t("student.levelAdvanced")}</option>
          </select>
        </div>

        {filteredCourses.length === 0 ? (
          <div className="text-center py-12 bg-[#111b2b] rounded-2xl border border-slate-800">
            <BookOpen className="w-16 h-16 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">{t("student.noCoursesFound")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourses.map((course) => (
              <CourseCard
                key={course.id}
                course={course}
                onView={handleViewCourse}
                departmentName={course.departmentId ? departments.find(d => d.id === course.departmentId)?.name : undefined}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
