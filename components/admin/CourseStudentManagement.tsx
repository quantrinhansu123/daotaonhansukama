'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, getDocs, doc, updateDoc, getDoc, arrayUnion, arrayRemove } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { Course } from '@/types/course';
import { UserProfile } from '@/types/user';
import { UserPlus, X, Search, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/Button';

interface CourseStudentManagementProps {
  course: Course;
  onUpdate: () => void;
}

export const CourseStudentManagement: React.FC<CourseStudentManagementProps> = ({
  course,
  onUpdate
}) => {
  const { t, dateLocale } = useLanguage();
  const [currentCourse, setCurrentCourse] = useState<Course>(course);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [courseStudents, setCourseStudents] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);

  useEffect(() => {
    setCurrentCourse(course);
    loadData(course);
  }, [course.id]);

  const loadCourseData = async (courseId: string): Promise<Course | null> => {
    try {
      const courseRef = doc(db, 'courses', courseId);
      const courseSnap = await getDoc(courseRef);
      if (courseSnap.exists()) {
        const courseData = {
          id: courseSnap.id,
          ...courseSnap.data()
        } as Course;
        return courseData;
      }
      return null;
    } catch (error) {
      console.error('Error loading course:', error);
      return null;
    }
  };

  const loadData = async (courseToLoad?: Course) => {
    try {
      setLoading(true);

      // Use provided course or current course
      const courseData = courseToLoad || currentCourse;

      // Load all users (không phân biệt role)
      const usersRef = collection(db, 'users');
      const usersSnapshot = await getDocs(usersRef);
      const usersData = usersSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          uid: data.uid || doc.id, // Ensure uid is always present
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate()
        };
      }) as UserProfile[];
      
      // Filter out users without uid
      const validUsersData = usersData.filter(user => user.uid);
      setAllUsers(validUsersData);

      // Load current course students
      const currentStudentIds = courseData.students || [];
      const currentStudents = validUsersData.filter(user => currentStudentIds.includes(user.uid));
      setCourseStudents(currentStudents);
      
      // Update current course state only if new data was provided
      if (courseToLoad && courseToLoad.id === currentCourse.id) {
        setCurrentCourse(courseToLoad);
      }
    } catch (error) {
      console.error('Error loading users:', error);
      alert(t('admin.courseStudents.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddStudents = async () => {
    if (selectedUserIds.length === 0) {
      alert(t('admin.courseStudents.selectAtLeastOne'));
      return;
    }

    // Filter out any undefined or empty values
    const validUserIds = selectedUserIds.filter(id => id && id.trim() !== '');
    if (validUserIds.length === 0) {
      alert(t('admin.courseStudents.noValidUserIds'));
      return;
    }

    try {
      const courseRef = doc(db, 'courses', currentCourse.id);

      // Thêm từng user vào mảng students
      for (const userId of validUserIds) {
        const validUserId = userId.trim();
        await updateDoc(courseRef, {
          students: arrayUnion(validUserId),
          updatedAt: new Date()
        });
      }

      alert(t('admin.courseStudents.addSuccess', { count: validUserIds.length }));
      setShowModal(false);
      setSelectedUserIds([]);
      // Reload course data and students list
      const updatedCourse = await loadCourseData(currentCourse.id);
      if (updatedCourse) {
        await loadData(updatedCourse);
      }
      onUpdate();
    } catch (error) {
      console.error('Error adding students:', error);
      alert(t('admin.courseStudents.addError'));
    }
  };

  const handleRemoveStudent = async (userId: string) => {
    if (!userId || userId.trim() === '') {
      alert(t('admin.courseStudents.invalidUserId'));
      return;
    }

    if (!confirm(t('admin.courseStudents.confirmRemove'))) {
      return;
    }

    try {
      const courseRef = doc(db, 'courses', currentCourse.id);
      await updateDoc(courseRef, {
        students: arrayRemove(userId.trim()),
        updatedAt: new Date()
      });

      alert(t('admin.courseStudents.removeSuccess'));
      // Reload course data and students list
      const updatedCourse = await loadCourseData(currentCourse.id);
      if (updatedCourse) {
        await loadData(updatedCourse);
      }
      onUpdate();
    } catch (error) {
      console.error('Error removing student:', error);
      alert(t('admin.courseStudents.removeError'));
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'student':
        return t('admin.users.roles.student');
      case 'staff':
        return t('admin.users.roles.staff');
      case 'teacher':
        return t('admin.users.roles.teacherAlt');
      case 'admin':
        return t('admin.users.roles.admin');
      default:
        return role;
    }
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  const availableUsers = allUsers.filter(user =>
    !courseStudents.some(cs => cs.uid === user.uid) &&
    (user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  if (loading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  return (
    <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 p-6 backdrop-blur-md">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <Users size={24} />
            {t('admin.courseStudents.titleAlt')}
          </h3>
          <p className="text-sm text-slate-300 mt-1">
            {t('admin.courseStudents.subtitleAlt')}
          </p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-[#1B7A1E] hover:bg-[#156318] border-none text-white shadow-[#1B7A1E]/25"
        >
          <UserPlus size={18} />
          {t('admin.courseStudents.addStudent')}
        </Button>
      </div>

      {/* Current Students List */}
      {courseStudents.length === 0 ? (
        <div className="text-center py-12 bg-white/5 rounded-lg border border-white/10">
          <Users className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <p className="text-slate-300">{t('admin.courseStudents.noStudents')}</p>
          <p className="text-sm text-slate-400 mt-1">{t('admin.courseStudents.startHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {courseStudents.map((student) => (
            <div
              key={student.uid}
              className="border border-white/10 rounded-lg p-4 hover:bg-white/5 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="font-semibold text-white">{student.displayName}</h4>
                  <p className="text-sm text-slate-400 mt-1">{student.email}</p>
                  <span className={`inline-block mt-2 px-2 py-1 text-xs font-medium rounded-full ${student.role === 'student' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                      student.role === 'staff' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                        student.role === 'teacher' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                          'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                    }`}>
                    {getRoleLabel(student.role)}
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveStudent(student.uid)}
                  className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                  title={t('admin.courseStudents.removeFromCourse')}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Students Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0E3A16] border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">{t('admin.courseStudents.addToCourse')}</h3>
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedUserIds([]);
                  setSearchTerm('');
                }}
                className="text-slate-400 hover:text-white"
              >
                <X size={24} />
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                type="text"
                placeholder={t('admin.courseStudents.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white placeholder-slate-400"
              />
            </div>

            {/* Users List */}
            <div className="flex-1 overflow-y-auto mb-4 space-y-2">
              {availableUsers.length === 0 ? (
                <div className="text-center py-8 text-slate-400">
                  {searchTerm ? t('admin.courseStudents.noMatchUsers') : t('admin.courseStudents.noAvailableUsers')}
                </div>
              ) : (
                availableUsers.map((user) => (
                  <label
                    key={user.uid}
                    className={`flex items-center gap-3 p-4 border rounded-lg cursor-pointer transition-all ${selectedUserIds.includes(user.uid)
                        ? 'border-[#1B7A1E] bg-[#1B7A1E]/10'
                        : 'border-white/10 hover:border-white/20 hover:bg-white/5'
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.uid)}
                      onChange={() => toggleUserSelection(user.uid)}
                      className="w-4 h-4 text-[#1B7A1E] rounded focus:ring-[#1B7A1E] bg-white/10 border-white/20"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-white">{user.displayName}</div>
                      <div className="text-sm text-slate-400">{user.email}</div>
                    </div>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${user.role === 'student' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                        user.role === 'staff' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                          user.role === 'teacher' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                            user.role === 'admin' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                              'bg-slate-500/20 text-slate-400 border border-slate-500/30'
                      }`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </label>
                ))
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-white/10">
              <Button
                onClick={handleAddStudents}
                className="flex-1 bg-[#1B7A1E] hover:bg-[#156318] border-none text-white shadow-[#1B7A1E]/25"
                disabled={selectedUserIds.length === 0}
              >
                {t('admin.courseStudents.addSelected')}{selectedUserIds.length > 0 && ` (${selectedUserIds.length})`}
              </Button>
              <button
                onClick={() => {
                  setShowModal(false);
                  setSelectedUserIds([]);
                  setSearchTerm('');
                }}
                className="flex-1 px-4 py-2 border border-white/10 rounded-lg hover:bg-white/5 text-white transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
