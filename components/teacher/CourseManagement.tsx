'use client';

import React, { useState } from 'react';
import { Course } from '@/types/course';
import { ArrowLeft, PlayCircle, Users } from 'lucide-react';
import { LessonManagement } from './LessonManagement';
import { CourseDetail } from './CourseDetail';
import { useLanguage } from '@/contexts/LanguageContext';

interface CourseManagementProps {
  course: Course;
  onBack: () => void;
}

export const CourseManagement: React.FC<CourseManagementProps> = ({ course, onBack }) => {
  const [activeTab, setActiveTab] = useState<'lessons' | 'students'>('lessons');
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <div>
        <button onClick={onBack} className="text-[#1B7A1E] hover:text-[#156318] mb-4 flex items-center gap-2 transition-colors">
          <ArrowLeft size={20} />
          {t('teacher.backToCourses')}
        </button>

        <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 overflow-hidden backdrop-blur-md">
          <div className="p-6 border-b border-white/10">
            <h2 className="text-2xl font-bold text-white">{course.title}</h2>
            <p className="text-slate-300">{course.teacherName}</p>
          </div>

          <div className="flex border-b border-white/10">
            <button
              onClick={() => setActiveTab('lessons')}
              className={`flex-1 px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'lessons'
                  ? 'text-[#1B7A1E] border-b-2 border-[#1B7A1E] bg-[#1B7A1E]/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
            >
              <PlayCircle size={20} />
              {t('teacher.manageLessons')}
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`flex-1 px-6 py-4 font-medium transition-colors flex items-center justify-center gap-2 ${activeTab === 'students'
                  ? 'text-[#1B7A1E] border-b-2 border-[#1B7A1E] bg-[#1B7A1E]/10'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
            >
              <Users size={20} />
              {t('teacher.studentsAndStats')}
            </button>
          </div>
        </div>
      </div>

      <div>
        {activeTab === 'lessons' ? (
          <LessonManagement course={course} onBack={() => { }} />
        ) : (
          <CourseDetail course={course} onBack={() => { }} />
        )}
      </div>
    </div>
  );
};
