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
    return <div className="py-8 text-center text-[#63708a]">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-8">
      {/* All Available Courses */}
      <div>
        <div className="mb-6">
          <h2 className="mb-1 text-[16px] font-bold text-[#111b38]">{t("student.yourCourses")}</h2>
          {userProfile?.departmentId ? (
            <p className="text-[12px] text-[#63708a]">
              {t("student.deptCoursesHint")}
            </p>
          ) : (
            <p className="text-[12px] text-[#63708a]">
              {t("student.noDeptHint")}
            </p>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99a4b5]" size={18} />
            <input
              type="text"
              placeholder={t("student.searchCourses")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-md border border-[#e7edf5] bg-white py-2.5 pl-10 pr-4 text-[13px] text-[#111b38] outline-none placeholder:text-[#99a4b5] focus:border-[#0759e8]"
            />
          </div>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as typeof filterLevel)}
            className="rounded-md border border-[#e7edf5] bg-white px-4 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#0759e8]"
          >
            <option value="all">{t("student.allLevels")}</option>
            <option value="beginner">{t("student.levelBeginner")}</option>
            <option value="intermediate">{t("student.levelIntermediate")}</option>
            <option value="advanced">{t("student.levelAdvanced")}</option>
          </select>
        </div>

        {filteredCourses.length === 0 ? (
          <div className="bg-white py-12 text-center shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
            <BookOpen className="mx-auto mb-4 h-12 w-12 text-[#99a4b5]" />
            <p className="text-[13px] text-[#63708a]">{t("student.noCoursesFound")}</p>
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
