'use client';

import React, { useState, useEffect } from 'react';
import { Course } from '@/types/course';
import { ArrowLeft, PlayCircle, Users, UserPlus, Trash2 } from 'lucide-react';
import { LessonManagement } from '@/components/teacher/LessonManagement';
import { CourseDetail } from '@/components/teacher/CourseDetail';
import { CourseStudents } from '@/components/admin/CourseStudents';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
      alert('Chỉ admin mới có quyền xóa khóa học');
      return;
    }

    const confirmMessage = `Bạn có chắc muốn xóa khóa học "${currentCourse.title}"?\n\nLưu ý: Hành động này không thể hoàn tác và sẽ xóa:\n- Tất cả bài học trong khóa học\n- Tất cả tiến độ học tập của học viên\n- Tất cả dữ liệu liên quan`;
    
    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      // Delete course from Firestore
      await deleteDoc(doc(db, 'courses', currentCourse.id));
      alert('Xóa khóa học thành công!');
      
      // Call onDelete callback if provided, otherwise just go back
      if (onDelete) {
        onDelete();
      } else {
        onBack();
      }
    } catch (error) {
      console.error('Error deleting course:', error);
      alert('Lỗi khi xóa khóa học');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 backdrop-blur-md">
        <div className="p-6">
          <button
            onClick={onBack}
            className="text-[#53cafd] hover:text-[#3db9f5] flex items-center gap-2 font-medium mb-4"
          >
            <ArrowLeft size={20} />
            Quay lại danh sách
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">{currentCourse.title}</h2>
              <p className="text-slate-300">{currentCourse.description}</p>
              <div className="flex items-center gap-3 mt-2 text-sm text-slate-400">
                <span>Danh mục: {currentCourse.category}</span>
                <span>•</span>
                <span>Thời lượng: {currentCourse.duration}h</span>
                <span>•</span>
                <span>Học viên: {currentCourse.students?.length || 0}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isAdmin && (
                <>
                  <span className="px-3 py-1 bg-red-500/20 text-red-400 text-xs font-medium rounded-full border border-red-500/30">
                    Chế độ Admin
                  </span>
                  <button
                    onClick={handleDeleteCourse}
                    className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded-lg transition-all flex items-center gap-2 font-medium"
                    title="Xóa khóa học"
                  >
                    <Trash2 size={18} />
                    Xóa lớp
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex border-t border-white/10">
          <button
            onClick={() => setActiveTab('lessons')}
            className={`flex-1 px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'lessons'
                ? 'text-[#53cafd] border-b-2 border-[#53cafd] bg-[#53cafd]/10'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
          >
            <PlayCircle size={20} />
            Quản lý bài học
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`flex-1 px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'students'
                ? 'text-[#53cafd] border-b-2 border-[#53cafd] bg-[#53cafd]/10'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
          >
            <Users size={20} />
            Học viên & Thống kê
          </button>
        </div>
      </div>

      {/* Student Management Button */}
      {activeTab === 'students' && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowStudentManagement(true)}
            className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg hover:from-green-600 hover:to-green-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-medium"
          >
            <UserPlus size={18} />
            Quản lý học viên
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
