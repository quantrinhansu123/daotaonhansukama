'use client';

import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Course } from '@/types/course';
import { ArrowLeft, PlayCircle, Users, X } from 'lucide-react';
import { LessonManagement } from '@/components/teacher/LessonManagement';
import { CourseDetail } from '@/components/teacher/CourseDetail';

interface ClassDetailManagementProps {
  course: Course;
  onClose: () => void;
  isAdmin?: boolean;
}

export const ClassDetailManagement: React.FC<ClassDetailManagementProps> = ({ 
  course, 
  onClose,
  isAdmin = false 
}) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<'lessons' | 'students'>('lessons');

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-slate-50 rounded-2xl w-full max-w-7xl my-8 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <button 
                onClick={onClose} 
                className="text-blue-600 hover:text-blue-700 flex items-center gap-2 font-medium"
              >
                <ArrowLeft size={20} />
                {t('admin.courseDetail.back')}
              </button>
              <button 
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600 p-2 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <X size={24} />
              </button>
            </div>
            
            <div>
              <h2 className="text-2xl font-bold text-slate-900 mb-1">{course.title}</h2>
              <p className="text-slate-600">{t('admin.courseDetail.teacher', { name: course.teacherName })}</p>
              {isAdmin && (
                <span className="inline-block mt-2 px-3 py-1 bg-red-100 text-red-700 text-xs font-medium rounded-full">
                  {t('admin.courseDetail.adminMode')}
                </span>
              )}
            </div>
          </div>
          
          <div className="flex border-t border-slate-200">
            <button
              onClick={() => setActiveTab('lessons')}
              className={`flex-1 px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'lessons'
                  ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <PlayCircle size={20} />
              {t('admin.courseDetail.manageLessons')}
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`flex-1 px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2 ${
                activeTab === 'students'
                  ? 'text-brand-600 border-b-2 border-brand-600 bg-brand-50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Users size={20} />
              {t('admin.courseDetail.teacherStats')}
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {activeTab === 'lessons' ? (
            <LessonManagement course={course} onBack={onClose} />
          ) : (
            <CourseDetail course={course} onBack={() => {}} />
          )}
        </div>
      </div>
    </div>
  );
};
