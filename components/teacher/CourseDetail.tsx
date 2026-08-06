'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, getDoc, arrayRemove } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Course } from '@/types/course';
import { Lesson } from '@/types/lesson';
import { LessonProgress } from '@/types/progress';
import { UserProfile } from '@/types/user';
import { ArrowLeft, Users, Clock, CheckCircle, TrendingUp, BookOpen, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

interface CourseDetailProps {
  course: Course;
  onBack: () => void;
  onStudentUnenrolled?: () => void;
}

export const CourseDetail: React.FC<CourseDetailProps> = ({ course, onBack, onStudentUnenrolled }) => {
  const { userProfile: currentUser } = useAuth();
  const { t } = useLanguage();
  const [currentCourse, setCurrentCourse] = useState<Course>(course);
  const [students, setStudents] = useState<UserProfile[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Record<string, LessonProgress[]>>({});
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState<UserProfile | null>(null);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null);

  useEffect(() => {
    setCurrentCourse(course);
  }, [course]);

  useEffect(() => {
    loadData();
  }, [currentCourse.id, currentCourse.students?.length]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load students and staff
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const allUsers = usersSnapshot.docs.map(doc => {
        const data = doc.data() as UserProfile;
        return {
          ...data,
          uid: data.uid || doc.id,
          docId: doc.id // Store doc.id for comparison
        } as UserProfile & { docId: string };
      });
      
      // Get enrolled student IDs from course (normalize all variations)
      const enrolledIdsFromCourse = (currentCourse.students || []).map(id => String(id).trim()).filter(Boolean);
      const enrolledIdSet = new Set<string>();
      enrolledIdsFromCourse.forEach(id => {
        enrolledIdSet.add(id);
        enrolledIdSet.add(String(id)); // Also add original
      });
      
      // Find ALL enrolled users (regardless of role) by checking both uid and docId
      const enrolledUsers: UserProfile[] = [];
      const enrolledSet = new Set<string>(); // Track to avoid duplicates
      
      allUsers.forEach(user => {
        const uid = user.uid || '';
        const uidStr = String(uid).trim();
        const docId = (user as any).docId || '';
        
        // Check if user is enrolled (by uid or docId)
        const isEnrolled = uid && (
          enrolledIdSet.has(uidStr) || 
          enrolledIdSet.has(uid) ||
          (docId && enrolledIdSet.has(docId))
        );
        
        if (isEnrolled && uid && !enrolledSet.has(uid)) {
          enrolledUsers.push(user);
          enrolledSet.add(uid);
        }
      });
      
      console.log('[CourseDetail] Course ID:', currentCourse.id);
      console.log('[CourseDetail] Enrolled IDs from course:', enrolledIdsFromCourse);
      console.log('[CourseDetail] Found enrolled students:', enrolledUsers.length);
      console.log('[CourseDetail] Total users in DB:', allUsers.length);
      
      setStudents(enrolledUsers);

      // Load lessons
      const lessonsRef = collection(db, 'lessons');
      const lessonsQuery = query(lessonsRef, where('courseId', '==', currentCourse.id));
      const lessonsSnapshot = await getDocs(lessonsQuery);
      const lessonsData = lessonsSnapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lesson[];
      lessonsData.sort((a, b) => a.order - b.order);
      setLessons(lessonsData);

      // Load progress
      const progressRef = collection(db, 'progress');
      const progressQuery = query(progressRef, where('courseId', '==', currentCourse.id));
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

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
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

  const handleUnenrollStudent = async (studentId: string, studentName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent selecting the student when clicking the button
    
    if (!confirm(t("teacher.confirmUnenroll", { name: studentName }))) {
      return;
    }

    try {
      setRemovingStudentId(studentId);
      
      // Remove from UI immediately for better UX
      setStudents(prev => prev.filter(s => s.uid !== studentId));
      
      // Clear selected student if it was the one removed
      if (selectedStudent?.uid === studentId) {
        setSelectedStudent(null);
      }
      
      // Update Firestore
      const courseRef = doc(db, 'courses', currentCourse.id);
      await updateDoc(courseRef, {
        students: arrayRemove(studentId.trim())
      });
      
      // Reload course data from Firestore
      const courseSnap = await getDoc(courseRef);
      if (courseSnap.exists()) {
        const updatedCourseData = {
          id: courseSnap.id,
          ...courseSnap.data()
        } as Course;
        setCurrentCourse(updatedCourseData);
      }
      
      // Reload all data to ensure consistency
      await loadData();
      
      // Notify parent component to reload course data
      if (onStudentUnenrolled) {
        onStudentUnenrolled();
      }
      
      alert(t('teacher.unenrollSuccess'));
    } catch (error) {
      console.error('Error unenrolling student:', error);
      alert(t('teacher.unenrollError'));
      // Reload on error to restore correct state
      await loadData();
    } finally {
      setRemovingStudentId(null);
    }
  };

  if (loading) {
    return <div className="text-center py-8">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-6">

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-[#5e3ed0]/20 rounded-xl p-4 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-blue-500/20 p-2 rounded-lg border border-blue-500/30">
              <Users size={20} className="text-blue-400" />
            </div>
            <span className="text-2xl font-bold text-white">{students.length}</span>
          </div>
          <p className="text-sm text-slate-300">{t("teacher.totalStudents")}</p>
        </div>

        <div className="bg-[#5e3ed0]/20 rounded-xl p-4 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-green-500/20 p-2 rounded-lg border border-green-500/30">
              <BookOpen size={20} className="text-green-400" />
            </div>
            <span className="text-2xl font-bold text-white">{lessons.filter(l => l.videoId).length}</span>
          </div>
          <p className="text-sm text-slate-300">{t("teacher.lessons")}</p>
        </div>

        <div className="bg-[#5e3ed0]/20 rounded-xl p-4 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-purple-500/20 p-2 rounded-lg border border-purple-500/30">
              <Clock size={20} className="text-purple-400" />
            </div>
            <span className="text-2xl font-bold text-white">
              {formatDuration(Object.values(progress).flat().reduce((sum, p) => sum + p.watchedSeconds, 0))}
            </span>
          </div>
          <p className="text-sm text-slate-300">{t("teacher.totalLearningTime")}</p>
        </div>

        <div className="bg-[#5e3ed0]/20 rounded-xl p-4 border border-white/10 backdrop-blur-md">
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-orange-500/20 p-2 rounded-lg border border-orange-500/30">
              <CheckCircle size={20} className="text-orange-400" />
            </div>
            <span className="text-2xl font-bold text-white">
              {Object.values(progress).flat().filter(p => p.completed).length}
            </span>
          </div>
          <p className="text-sm text-slate-300">{t("teacher.completedLessons")}</p>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="bg-[#5e3ed0]/20 rounded-xl p-12 text-center border border-white/10 backdrop-blur-md">
          <Users className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-300">{t("teacher.noStudentsEnrolled")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Student List */}
          <div className="lg:col-span-1">
            <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 overflow-hidden backdrop-blur-md">
              <div className="p-4 border-b border-white/10 bg-white/5">
                <h3 className="font-bold text-white">{t("teacher.studentList")}</h3>
              </div>
              <div className="divide-y divide-white/10 max-h-[600px] overflow-y-auto">
                {students.map((student) => {
                  const stats = getStudentStats(student.uid);
                  const isSelected = selectedStudent?.uid === student.uid;
                  const isRemoving = removingStudentId === student.uid;

                  return (
                    <div
                      key={student.uid}
                      className={`w-full p-4 hover:bg-white/5 transition-colors ${isSelected ? 'bg-[#53cafd]/10 border-l-4 border-[#53cafd]' : ''
                        }`}
                    >
                      <button
                        onClick={() => setSelectedStudent(student)}
                        className="w-full text-left"
                      >
                        <div className="flex items-center gap-3 mb-2">
                          <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold shadow-lg shadow-green-500/30">
                            {student.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-white truncate">{student.displayName}</p>
                            <p className="text-xs text-slate-400 truncate">{student.email}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="flex items-center gap-1 text-[#53cafd]">
                            <Clock size={12} />
                            {formatDuration(stats.totalWatched)}
                          </span>
                          <span className="flex items-center gap-1 text-green-400">
                            <CheckCircle size={12} />
                            {stats.completedLessons}/{stats.totalLessons}
                          </span>
                        </div>
                        <div className="mt-2">
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-green-500 to-green-400"
                              style={{ width: `${stats.completionRate}%` }}
                            />
                          </div>
                        </div>
                      </button>
                      {/* Unenroll Button */}
                      {(currentUser?.role === 'admin' || currentUser?.role === 'teacher') && (
                        <div className="mt-2 pt-2 border-t border-white/10">
                          <button
                            onClick={(e) => handleUnenrollStudent(student.uid, student.displayName, e)}
                            disabled={isRemoving}
                            className="w-full px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded-lg transition-colors flex items-center justify-center gap-2 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <X size={14} />
                            {isRemoving ? t('common.processing') : t('teacher.unenroll')}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Student Detail */}
          <div className="lg:col-span-2">
            {selectedStudent ? (
              <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 overflow-hidden backdrop-blur-md">
                <div className="p-6 border-b border-white/10 bg-gradient-to-r from-[#53cafd]/10 to-purple-500/10">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-green-500/30">
                      {selectedStudent.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">{selectedStudent.displayName}</h3>
                      <p className="text-slate-300">{selectedStudent.email}</p>
                    </div>
                  </div>

                  {(() => {
                    const stats = getStudentStats(selectedStudent.uid);
                    return (
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center">
                          <div className="text-2xl font-bold text-[#53cafd]">{formatDuration(stats.totalWatched)}</div>
                          <div className="text-xs text-slate-300">{t("teacher.totalTime")}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-green-400">{stats.completedLessons}/{stats.totalLessons}</div>
                          <div className="text-xs text-slate-300">{t("teacher.completed")}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-2xl font-bold text-purple-400">{stats.completionRate.toFixed(0)}%</div>
                          <div className="text-xs text-slate-300">{t("common.progress")}</div>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="p-6">
                  <h4 className="font-bold text-white mb-4">{t("teacher.lessonDetails")}</h4>
                  <div className="space-y-3">
                    {lessons.filter(l => l.videoId).map((lesson) => {
                      const studentProgress = progress[selectedStudent.uid] || [];
                      const lessonProgress = studentProgress.find(p => p.lessonId === lesson.id);
                      const watchedPercent = lessonProgress
                        ? (lessonProgress.watchedSeconds / lessonProgress.totalSeconds) * 100
                        : 0;

                      return (
                        <div key={lesson.id} className="p-4 border border-white/10 rounded-lg hover:border-[#53cafd]/50 transition-colors bg-white/5">
                          <div className="flex items-start gap-3">
                            <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center text-sm font-bold text-white flex-shrink-0">
                              {lesson.order}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between mb-2">
                                <h5 className="font-medium text-white">{lesson.title}</h5>
                                {lessonProgress?.completed && (
                                  <CheckCircle size={20} className="text-green-400 flex-shrink-0 ml-2" />
                                )}
                              </div>
                              {lessonProgress ? (
                                <>
                                  <div className="flex items-center gap-2 mb-2">
                                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-[#53cafd] to-purple-500"
                                        style={{ width: `${Math.min(100, watchedPercent)}%` }}
                                      />
                                    </div>
                                    <span className="text-xs text-slate-300 whitespace-nowrap">
                                      {watchedPercent.toFixed(0)}%
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 text-xs text-slate-400">
                                    <span>{t("teacher.watched")}: {formatDuration(lessonProgress.watchedSeconds)}</span>
                                    <span>•</span>
                                    <span>{t("teacher.total")}: {formatDuration(lessonProgress.totalSeconds)}</span>
                                  </div>
                                </>
                              ) : (
                                <p className="text-sm text-slate-500">{t("teacher.notWatched")}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 p-12 text-center backdrop-blur-md">
                <TrendingUp className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                <p className="text-slate-300">{t("teacher.selectStudentHint")}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
