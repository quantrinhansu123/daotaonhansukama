'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Course } from '@/types/course';
import { ArrowLeft, PlayCircle, Users, UserPlus, Trash2 } from 'lucide-react';
import { LessonManagement } from '@/components/teacher/LessonManagement';
import { CourseDetail } from '@/components/teacher/CourseDetail';
import { CourseStudents } from '@/components/admin/CourseStudents';
import { doc, getDoc, deleteDoc } from '@/lib/data-store';
import { db } from '@/lib/data-store';

interface CourseDetailPageProps {
  course: Course;
  onBack: () => void;
  isAdmin?: boolean;
  onDelete?: () => void;
}

export const CourseDetailPage: React.FC<CourseDetailPageProps> = ({
  course,
  onBack,
  isAdmin = false,
  onDelete
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'lessons' | 'students'>('lessons');
  const [showStudentManagement, setShowStudentManagement] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [currentCourse, setCurrentCourse] = useState<Course>(course);

  useEffect(() => {
    setCurrentCourse(course);
  }, [course]);

  const loadCourseData = async () => {
    try {
      const courseRef = doc(db, 'courses', course.id);
      const courseSnap = await getDoc(courseRef);
      if (courseSnap.exists()) {
        const courseData = {
          id: courseSnap.id,
          ...courseSnap.data()
        } as Course;
        setCurrentCourse(courseData);
        return courseData;
      }
      return currentCourse;
    } catch (error) {
      console.error('Error loading course:', error);
      return currentCourse;
    }
  };

  const handleDeleteCourse = async () => {
    if (!isAdmin) {
      alert(t('admin.courseDetail.adminOnlyDelete'));
      return;
    }

    if (!confirm(t('admin.courseDetail.confirmDeleteCourse', { title: currentCourse.title }))) {
      return;
    }

    try {
      // Delete course from Firestore
      await deleteDoc(doc(db, 'courses', currentCourse.id));
      alert(t('admin.courseDetail.deleteSuccess'));
      
      // Call onDelete callback if provided, otherwise just go back
      if (onDelete) {
        onDelete();
      } else {
        onBack();
      }
    } catch (error) {
      console.error('Error deleting course:', error);
      alert(t('admin.courseDetail.deleteError'));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-xl border border-[#1B7A1E]">
        <div className="p-6">
          <button
            onClick={onBack}
            className="text-[#1B7A1E] hover:text-[#156318] flex items-center gap-2 font-medium mb-4"
          >
            <ArrowLeft size={20} />
            {t('admin.courseDetail.backToList')}
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#111b38] mb-1">{currentCourse.title}</h2>
              <p className="text-[#66718b]">{currentCourse.description}</p>
              <div className="flex items-center gap-3 mt-2 text-sm text-[#66718b]">
                <span>{t('admin.courseDetail.category', { name: currentCourse.category })}</span>
                <span>•</span>
                <span>{t('admin.courseDetail.duration', { hours: currentCourse.duration })}</span>
                <span>•</span>
                <span>{t('admin.courseDetail.studentCount', { count: currentCourse.students?.length || 0 })}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <span className="px-3 py-1 bg-red-50 text-red-600 text-xs font-medium rounded-full border border-red-200">
                    {t('admin.courseDetail.adminMode')}
                  </span>
                  <button
                    onClick={handleDeleteCourse}
                    className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-300 rounded-lg transition-all flex items-center gap-2 font-medium"
                    title={t('admin.courses.deleteCourse')}
                  >
                    <Trash2 size={18} />
                    {t('admin.courseDetail.deleteClass')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex border-t border-[#1B7A1E]/30">
          <button
            onClick={() => setActiveTab('lessons')}
            className={`flex-1 px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'lessons'
                ? 'text-[#1B7A1E] border-b-2 border-[#1B7A1E] bg-[#edf7ee]'
                : 'text-[#66718b] hover:text-[#111b38] hover:bg-[#f3faf4]'
              }`}
          >
            <PlayCircle size={20} />
            {t('admin.courseDetail.manageLessons')}
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`flex-1 px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'students'
                ? 'text-[#1B7A1E] border-b-2 border-[#1B7A1E] bg-[#edf7ee]'
                : 'text-[#66718b] hover:text-[#111b38] hover:bg-[#f3faf4]'
              }`}
          >
            <Users size={20} />
            {t('admin.courseDetail.studentsStats')}
          </button>
        </div>
      </div>

      {/* Student Management Button */}
      {activeTab === 'students' && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowStudentManagement(true)}
            className="px-4 py-2 bg-[#1B7A1E] text-white rounded-lg hover:bg-[#156318] transition-all shadow-md flex items-center gap-2 font-medium"
          >
            <UserPlus size={18} />
            {t('admin.courseDetail.manageStudents')}
          </button>
        </div>
      )}

      {/* Content */}
      <div>
        {activeTab === 'lessons' ? (
          <LessonManagement course={currentCourse} onBack={() => { }} />
        ) : (
          <CourseDetail 
            key={refreshKey} 
            course={currentCourse} 
            onBack={() => { }} 
            onStudentUnenrolled={async () => {
              // Reload course data when student is unenrolled
              await loadCourseData();
              setRefreshKey(prev => prev + 1);
            }}
          />
        )}
      </div>

      {/* Student Management Modal */}
      {showStudentManagement && (
        <CourseStudents
          course={currentCourse}
          onClose={() => setShowStudentManagement(false)}
          onUpdate={async () => {
            // Reload course data to get latest students list
            await loadCourseData();
            setRefreshKey(prev => prev + 1);
            setShowStudentManagement(false);
          }}
        />
      )}
    </div>
  );
};
