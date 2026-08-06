'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Course } from '@/types/course';
import { Lesson } from '@/types/lesson';
import { LessonProgress } from '@/types/progress';
import { UserProfile } from '@/types/user';
import { X, Clock, CheckCircle, TrendingUp } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface StudentProgressProps {
  course: Course;
  onClose: () => void;
}

export const StudentProgress: React.FC<StudentProgressProps> = ({ course, onClose }) => {
  const { t } = useLanguage();
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Record<string, LessonProgress[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [course.id]);

  const loadData = async () => {
    try {
      setLoading(true);

      const usersRef = collection(db, 'users');
      const studentsQuery = query(usersRef, where('role', '==', 'staff'));
      const studentsSnapshot = await getDocs(studentsQuery);
      const allStudents = studentsSnapshot.docs.map(doc => doc.data()) as UserProfile[];
      const enrolledStudents = allStudents.filter(s => course.students?.includes(s.uid));
      setStudents(enrolledStudents);

      const lessonsRef = collection(db, 'lessons');
      const lessonsQuery = query(lessonsRef, where('courseId', '==', course.id));
      const lessonsSnapshot = await getDocs(lessonsQuery);
      const lessonsData = lessonsSnapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lesson[];
      lessonsData.sort((a, b) => a.order - b.order);
      setLessons(lessonsData);

      const progressRef = collection(db, 'progress');
      const progressQuery = query(progressRef, where('courseId', '==', course.id));
      const progressSnapshot = await getDocs(progressQuery);

      const progressMap: Record<string, LessonProgress[]> = {};
      progressSnapshot.docs.forEach(doc => {
        const data = doc.data() as LessonProgress;
        if (!progressMap[data.userId]) {
          progressMap[data.userId] = [];
        }
        progressMap[data.userId].push(data);
      });

      setProgress(progressMap);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStudentStats = (studentId: string) => {
    const studentProgress = progress[studentId] || [];
    const totalWatched = studentProgress.reduce((sum, p) => sum + p.watchedSeconds, 0);
    const completedLessons = studentProgress.filter(p => p.completed).length;
    const totalLessons = lessons.filter(l => l.videoId).length;
    const completionRate = totalLessons > 0 ? (completedLessons / totalLessons) * 100 : 0;

    return {
      totalWatched,
      completedLessons,
      totalLessons,
      completionRate
    };
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6">
          <p>{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl p-6 w-full max-w-6xl my-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-2xl font-bold text-white">{course.title}</h3>
            <p className="text-slate-600">{t('teacher.studentStatsTitle')}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        {students.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <p>{t('teacher.noTeachersEnrolled')}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {students.map((student) => {
              const stats = getStudentStats(student.uid);
              const studentProgress = progress[student.uid] || [];

              return (
                <div key={student.uid} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                        {student.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-white">{student.displayName}</h4>
                        <p className="text-sm text-slate-500">{student.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-blue-600 font-semibold">
                          <Clock size={16} />
                          {formatDuration(stats.totalWatched)}
                        </div>
                        <p className="text-xs text-slate-500">{t('teacher.totalTime')}</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-green-600 font-semibold">
                          <CheckCircle size={16} />
                          {stats.completedLessons}/{stats.totalLessons}
                        </div>
                        <p className="text-xs text-slate-500">{t('teacher.completed')}</p>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center gap-1 text-purple-600 font-semibold">
                          <TrendingUp size={16} />
                          {stats.completionRate.toFixed(0)}%
                        </div>
                        <p className="text-xs text-slate-500">{t('common.progress')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="mb-3">
                    <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all"
                        style={{ width: `${stats.completionRate}%` }}
                      />
                    </div>
                  </div>

                  <details className="group">
                    <summary className="cursor-pointer text-sm text-blue-600 hover:text-blue-700 font-medium">
                      {t('teacher.viewLessonDetails')}
                    </summary>
                    <div className="mt-3 space-y-2">
                      {lessons.filter(l => l.videoId).map((lesson) => {
                        const lessonProgress = studentProgress.find(p => p.lessonId === lesson.id);
                        const watchedPercent = lessonProgress
                          ? (lessonProgress.watchedSeconds / lessonProgress.totalSeconds) * 100
                          : 0;

                        return (
                          <div key={lesson.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg text-sm">
                            <div className="w-6 h-6 bg-slate-200 rounded flex items-center justify-center text-xs font-bold text-slate-600">
                              {lesson.order}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-white truncate">{lesson.title}</p>
                              {lessonProgress ? (
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex-1 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                    <div
                                      className="h-full bg-green-500"
                                      style={{ width: `${Math.min(100, watchedPercent)}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-500 whitespace-nowrap">
                                    {formatDuration(lessonProgress.watchedSeconds)} / {formatDuration(lessonProgress.totalSeconds)}
                                  </span>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-400 mt-1">{t('teacher.notWatched')}</p>
                              )}
                            </div>
                            {lessonProgress?.completed && (
                              <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-6 pt-6 border-t border-slate-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-slate-200 rounded-lg hover:bg-slate-50"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};
