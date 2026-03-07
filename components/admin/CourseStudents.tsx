'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, getDoc, arrayUnion, arrayRemove, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Course } from '@/types/course';
import { UserProfile } from '@/types/user';
import { Search, UserPlus, UserCheck, UserX, X } from 'lucide-react';
import { Button } from '@/components/Button';
import { useAuth } from '@/contexts/AuthContext';

interface CourseStudentsProps {
  course: Course;
  onClose: () => void;
  onUpdate: () => void;
}

export const CourseStudents: React.FC<CourseStudentsProps> = ({ course, onClose, onUpdate }) => {
  const { userProfile: currentUser } = useAuth();
  const [currentCourse, setCurrentCourse] = useState<Course>(course);
  const [allStudents, setAllStudents] = useState<UserProfile[]>([]);
  const [pendingStudents, setPendingStudents] = useState<UserProfile[]>([]);
  const [enrolledStudents, setEnrolledStudents] = useState<UserProfile[]>([]);
  const [availableStudents, setAvailableStudents] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; projects?: string[] }>>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    setCurrentCourse(course);
    loadStudents(course);
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

  const loadStudents = async (courseToLoad?: Course) => {
    try {
      setLoading(true);
      
      // Use provided course or current course
      const courseData = courseToLoad || currentCourse;
      
      // Load departments to check department projects
      const departmentsRef = collection(db, 'departments');
      const departmentsSnapshot = await getDocs(departmentsRef);
      const departmentsData = departmentsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Array<{ id: string; projects?: string[] }>;
      setDepartments(departmentsData);
      
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const allUsersData = snapshot.docs.map(doc => {
        const data = doc.data() as UserProfile;
        // Ensure uid is always present and store doc.id for comparison
        return {
          ...data,
          uid: data.uid || doc.id,
          docId: doc.id // Store doc.id for comparison
        } as UserProfile & { docId: string };
      });

      // Filter for staff and student roles only, ensure uid exists, and only approved users (for available list)
      let studentsData = allUsersData.filter(u => 
        (u.role === 'staff' || u.role === 'student') && u.uid && u.approved
      );

      // Nếu không phải admin, chỉ hiển thị nhân viên trong phòng của trưởng phòng
      if (currentUser?.role !== 'admin' && currentUser?.position === 'Trưởng phòng' && currentUser?.departmentId) {
        studentsData = studentsData.filter(u => u.departmentId === currentUser.departmentId);
      }

      setAllStudents(studentsData);

      // Get ALL users who are enrolled or pending (regardless of role)
      // This ensures we show all students that were added to the course
      // Normalize all IDs from course (both original and trimmed versions)
      const enrolledIdsFromCourse = courseData.students || [];
      const pendingIdsFromCourse = courseData.pendingStudents || [];
      
      // Create sets with all possible ID variations
      const allEnrolledIds = new Set<string>();
      const allPendingIds = new Set<string>();
      
      enrolledIdsFromCourse.forEach(id => {
        const idStr = String(id).trim();
        if (idStr) {
          allEnrolledIds.add(idStr);
          allEnrolledIds.add(String(id)); // Also add original
        }
      });
      
      pendingIdsFromCourse.forEach(id => {
        const idStr = String(id).trim();
        if (idStr) {
          allPendingIds.add(idStr);
          allPendingIds.add(String(id)); // Also add original
        }
      });
      
      // Create a map of all users by their possible IDs (uid and docId)
      const userMap = new Map<string, UserProfile>();
      allUsersData.forEach(user => {
        const uid = user.uid || '';
        const docId = (user as any).docId || '';
        if (uid) {
          userMap.set(String(uid).trim(), user);
          userMap.set(String(uid), user);
        }
        if (docId && docId !== uid) {
          userMap.set(String(docId).trim(), user);
          userMap.set(String(docId), user);
        }
      });
      
      // Find enrolled students - check all possible ID variations
      const enrolled: UserProfile[] = [];
      const enrolledSet = new Set<string>(); // Track to avoid duplicates
      
      allEnrolledIds.forEach(id => {
        const user = userMap.get(id);
        if (user && user.uid && !enrolledSet.has(user.uid)) {
          enrolled.push(user);
          enrolledSet.add(user.uid);
        }
      });
      
      // Find pending students - check all possible ID variations
      const pending: UserProfile[] = [];
      const pendingSet = new Set<string>(); // Track to avoid duplicates
      
      allPendingIds.forEach(id => {
        const user = userMap.get(id);
        if (user && user.uid && !pendingSet.has(user.uid)) {
          pending.push(user);
          pendingSet.add(user.uid);
        }
      });
      
      // Available students: only staff/student roles that are not enrolled or pending
      // AND have projects matching course projects (if course has projects)
      const courseProjects = courseData.projects || [];
      const courseProjectsNormalized = courseProjects.map(p => String(p).trim()).filter(Boolean);
      
      const available = studentsData.filter(s => {
        if (!s.uid) return false;
        const uid = String(s.uid).trim();
        
        // Check if already enrolled or pending
        if (allEnrolledIds.has(uid) || allEnrolledIds.has(String(s.uid)) ||
            allPendingIds.has(uid) || allPendingIds.has(String(s.uid))) {
          return false;
        }
        
        // If course has no projects, show all available students
        if (courseProjectsNormalized.length === 0) {
          return true;
        }
        
        // Check if user has projects matching course projects
        const userProjects = (s.projects || []).map(p => String(p).trim()).filter(Boolean);
        let hasMatchingProject = false;
        
        // Check user's direct projects
        if (userProjects.length > 0) {
          hasMatchingProject = userProjects.some(projectId => {
            const normalizedProjectId = String(projectId).trim();
            return courseProjectsNormalized.includes(normalizedProjectId) || 
                   courseProjectsNormalized.some(cp => String(cp).trim() === normalizedProjectId) ||
                   courseProjects.some(cp => String(cp).trim() === normalizedProjectId);
          });
        }
        
        // Also check department projects if user doesn't have direct projects
        if (!hasMatchingProject && s.departmentId) {
          const userDept = departments.find(d => d.id === s.departmentId);
          if (userDept?.projects && userDept.projects.length > 0) {
            const deptProjects = (userDept.projects || []).map(p => String(p).trim()).filter(Boolean);
            hasMatchingProject = deptProjects.some(projectId => {
              const normalizedProjectId = String(projectId).trim();
              return courseProjectsNormalized.includes(normalizedProjectId) ||
                     courseProjectsNormalized.some(cp => String(cp).trim() === normalizedProjectId) ||
                     courseProjects.some(cp => String(cp).trim() === normalizedProjectId);
            });
            }
          }
        
        // Chỉ hiển thị nhân viên có dự án khớp với dự án của khóa học
        return hasMatchingProject;
      });

      // Debug logging
      console.log('[CourseStudents] Course ID:', courseData.id);
      console.log('[CourseStudents] Course projects (raw):', courseProjects);
      console.log('[CourseStudents] Course projects (normalized):', courseProjectsNormalized);
      console.log('[CourseStudents] Enrolled IDs from course:', Array.from(allEnrolledIds));
      console.log('[CourseStudents] Pending IDs from course:', Array.from(allPendingIds));
      console.log('[CourseStudents] Total users in DB:', allUsersData.length);
      console.log('[CourseStudents] Users with staff/student role:', studentsData.length);
      console.log('[CourseStudents] Found enrolled students:', enrolled.length);
      console.log('[CourseStudents] Found pending students:', pending.length);
      console.log('[CourseStudents] Found available students:', available.length);
      console.log('[CourseStudents] Departments loaded:', departments.length);
      console.log('[CourseStudents] Available students details:', available.map(s => ({
        uid: s.uid,
        name: s.displayName,
        email: s.email,
        userProjects: s.projects || [],
        departmentId: s.departmentId,
        deptProjects: departments.find(d => d.id === s.departmentId)?.projects || []
      })));
      console.log('[CourseStudents] All studentsData (before filter):', studentsData.map(s => ({
        uid: s.uid,
        name: s.displayName,
        userProjects: s.projects || [],
        departmentId: s.departmentId,
        isEnrolled: allEnrolledIds.has(String(s.uid).trim()) || allEnrolledIds.has(s.uid || ''),
        isPending: allPendingIds.has(String(s.uid).trim()) || allPendingIds.has(s.uid || '')
      })));
      
      setPendingStudents(pending);
      setEnrolledStudents(enrolled);
      setAvailableStudents(available);
      
      // Update current course state only if new data was provided
      if (courseToLoad && courseToLoad.id === currentCourse.id) {
        setCurrentCourse(courseToLoad);
      }
    } catch (error) {
      console.error('Error loading students:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (studentId: string) => {
    if (!studentId || studentId.trim() === '') {
      alert('Lỗi: ID học viên không hợp lệ');
      return;
    }

    try {
      setProcessing(studentId);
      const courseRef = doc(db, 'courses', currentCourse.id);
      const validStudentId = studentId.trim();
      await updateDoc(courseRef, {
        pendingStudents: arrayRemove(validStudentId),
        students: arrayUnion(validStudentId)
      });
      alert('Đã phê duyệt nhân viên!');
      // Reload course data and students list
      const updatedCourse = await loadCourseData(currentCourse.id);
      if (updatedCourse) {
        await loadStudents(updatedCourse);
      }
      onUpdate();
    } catch (error) {
      console.error('Error approving:', error);
      alert('Lỗi khi phê duyệt');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (studentId: string) => {
    if (!studentId || studentId.trim() === '') {
      alert('Lỗi: ID học viên không hợp lệ');
      return;
    }

    try {
      setProcessing(studentId);
      const courseRef = doc(db, 'courses', currentCourse.id);
      await updateDoc(courseRef, {
        pendingStudents: arrayRemove(studentId.trim())
      });
      alert('Đã từ chối yêu cầu!');
      // Reload course data and students list
      const updatedCourse = await loadCourseData(currentCourse.id);
      if (updatedCourse) {
        await loadStudents(updatedCourse);
      }
      onUpdate();
    } catch (error) {
      console.error('Error rejecting:', error);
      alert('Lỗi khi từ chối');
    } finally {
      setProcessing(null);
    }
  };

  const handleRemove = async (studentId: string) => {
    if (!studentId || studentId.trim() === '') {
      alert('Lỗi: ID học viên không hợp lệ');
      return;
    }

    if (!confirm('Bạn có chắc muốn xóa học sinh này khỏi khóa học?')) return;

    try {
      setProcessing(studentId);
      const courseRef = doc(db, 'courses', currentCourse.id);
      await updateDoc(courseRef, {
        students: arrayRemove(studentId.trim())
      });
      alert('Đã xóa nhân viên!');
      // Reload course data and students list
      const updatedCourse = await loadCourseData(currentCourse.id);
      if (updatedCourse) {
        await loadStudents(updatedCourse);
      }
      onUpdate();
    } catch (error) {
      console.error('Error removing:', error);
      alert('Lỗi khi xóa học sinh');
    } finally {
      setProcessing(null);
    }
  };

  const handleAddStudent = async (studentId: string) => {
    if (!studentId || studentId.trim() === '') {
      alert('Lỗi: ID học viên không hợp lệ');
      return;
    }

    try {
      setProcessing(studentId);
      const courseRef = doc(db, 'courses', currentCourse.id);
      await updateDoc(courseRef, {
        students: arrayUnion(studentId.trim())
      });
      alert('Đã thêm nhân viên vào khóa học!');
      // Reload course data and students list
      const updatedCourse = await loadCourseData(currentCourse.id);
      if (updatedCourse) {
        await loadStudents(updatedCourse);
      }
      onUpdate();
    } catch (error) {
      console.error('Error adding student:', error);
      alert('Lỗi khi thêm học sinh');
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6">
          <p>Đang tải...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#311898] border border-white/10 rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-2xl font-bold text-white">{currentCourse.title}</h3>
            <p className="text-slate-300">Quản lý nhân viên</p>
            {currentUser?.role !== 'admin' && currentUser?.position === 'Trưởng phòng' && (
              <p className="text-sm text-[#53cafd] mt-1">
                🏢 Chỉ hiển thị nhân viên trong phòng ban của bạn
              </p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={24} />
          </button>
        </div>

        {/* Pending Approvals */}
        {pendingStudents.length > 0 && (
          <div className="mb-6">
            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
              <span className="bg-yellow-500/20 text-yellow-400 px-2 py-1 rounded-full text-sm border border-yellow-500/30">
                {pendingStudents.length}
              </span>
              Chờ phê duyệt
            </h4>
            <div className="space-y-2">
              {pendingStudents.map((student) => (
                <div key={student.uid} className="flex items-center justify-between p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full flex items-center justify-center text-white font-bold">
                      {student.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-white">{student.displayName}</p>
                      <p className="text-sm text-slate-400">{student.email}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(student.uid)}
                      disabled={processing === student.uid}
                      className="px-3 py-1.5 bg-green-500/20 text-green-400 border border-green-500/50 rounded-lg hover:bg-green-500/30 disabled:opacity-50 flex items-center gap-1 text-sm"
                    >
                      <UserCheck size={14} />
                      Duyệt
                    </button>
                    <button
                      onClick={() => handleReject(student.uid)}
                      disabled={processing === student.uid}
                      className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 disabled:opacity-50 flex items-center gap-1 text-sm"
                    >
                      <UserX size={14} />
                      Từ chối
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enrolled Students */}
        <div className="mb-6">
          <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
            <span className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-sm border border-green-500/30">
              {enrolledStudents.length}
            </span>
            Đã đăng ký
          </h4>
          {enrolledStudents.length === 0 ? (
            <p className="text-slate-400 text-center py-4">Chưa có nhân viên nào</p>
          ) : (
            <div className="space-y-2">
              {enrolledStudents.map((student) => (
                <div key={student.uid} className="flex items-center justify-between p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold">
                      {student.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-white">{student.displayName}</p>
                      <p className="text-sm text-slate-400">{student.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemove(student.uid)}
                    disabled={processing === student.uid}
                    className="px-3 py-1.5 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg hover:bg-red-500/30 disabled:opacity-50 flex items-center gap-1 text-sm"
                  >
                    <UserX size={14} />
                    Xóa
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Available Students */}
        <div>
          <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
            <span className="bg-[#53cafd]/20 text-[#53cafd] px-2 py-1 rounded-full text-sm border border-[#53cafd]/30">
              {availableStudents.length}
            </span>
            Thêm nhân viên
          </h4>
          {availableStudents.length === 0 ? (
            <p className="text-slate-400 text-center py-4">Không còn nhân viên nào</p>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {availableStudents.map((student) => (
                <div key={student.uid} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-slate-500 to-slate-600 rounded-full flex items-center justify-center text-white font-bold">
                      {student.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-white">{student.displayName}</p>
                      <p className="text-sm text-slate-400">{student.email}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleAddStudent(student.uid)}
                    disabled={processing === student.uid}
                    className="px-3 py-1.5 bg-[#53cafd] text-white rounded-lg hover:bg-[#3db9f5] disabled:opacity-50 flex items-center gap-1 text-sm shadow-[#53cafd]/25"
                  >
                    <UserPlus size={14} />
                    Thêm
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-6 pt-6 border-t border-white/10">
          <Button onClick={onClose} className="w-full bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white shadow-[#53cafd]/25">
            Đóng
          </Button>
        </div>
      </div>
    </div>
  );
};
