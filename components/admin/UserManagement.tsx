'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, query, where } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { UserProfile, UserRole, Position } from '@/types/user';
import { Search, Plus, Edit2, Trash2, X, Save, CheckCircle, XCircle, Shield, Users, BookOpen } from 'lucide-react';
import { Button } from '@/components/Button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { syncEmploymentToUsers } from '@/lib/syncEmployment';
import { authenticatedJson } from '@/lib/authenticated-fetch';

interface Department {
  id: string;
  name: string;
  managerId?: string;
  managerName?: string;
  projects?: string[];
}

export const UserManagement: React.FC = () => {
  const { userProfile: currentUser } = useAuth();
  const { t, dateLocale } = useLanguage(); // User hiện tại đang đăng nhập
  const [users, setUsers] = useState<(UserProfile & { docId?: string })[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<(UserProfile & { docId?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPosition, setFilterPosition] = useState<Position | 'all' | 'none'>('all');
  const [filterDepartment, setFilterDepartment] = useState('all');
  const [filterBranch, setFilterBranch] = useState('all');
  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [showModal, setShowModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [viewingUser, setViewingUser] = useState<(UserProfile & { docId?: string }) | null>(null);
  const [editingUser, setEditingUser] = useState<(UserProfile & { docId?: string }) | null>(null);
  const [showBirthdays, setShowBirthdays] = useState(false);
  const [userLearningStats, setUserLearningStats] = useState<{
    totalCourses: number;
    completedCourses: number;
    inProgressCourses: number;
    averageProgress: number;
    totalQuizzes: number;
    averageQuizScore: number;
    recentCourses: Array<{ title: string; progress: number; courseId: string }>;
  } | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [syncingEmployment, setSyncingEmployment] = useState(false);
  const [showPendingUsers, setShowPendingUsers] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    displayName: '',
    role: 'staff' as UserRole,
    position: '' as Position | '',
    departmentId: '',
    monthlySalary: 0,
    dateOfBirth: '',
    address: '',
    country: '',
    phoneNumber: '',
    workLocation: '',
    photoURL: '',
    employmentStatus: '',
    employmentStartDate: '',
    employmentMaritalStatus: '',
    employmentBranch: '',
    employmentTeam: '',
    employmentSalaryPercentage: 100,
    employmentActive: true,
    projects: [] as string[],
  });

  const POSITIONS: Position[] = [
    'Nhân viên',
    'Trưởng nhóm',
    'Phó phòng',
    'Trưởng phòng',
    'Phó giám đốc',
    'Giám đốc'
  ];

  const getPositionLabel = (pos?: string) => {
    const map: Record<string, string> = {
      'Nhân viên': t('admin.users.positions.staff'),
      'Trưởng nhóm': t('admin.users.positions.teamLead'),
      'Phó phòng': t('admin.users.positions.deputyManager'),
      'Trưởng phòng': t('admin.users.positions.manager'),
      'Phó giám đốc': t('admin.users.positions.deputyDirector'),
      'Giám đốc': t('admin.users.positions.director'),
    };
    return pos ? (map[pos] || pos) : t('admin.users.noPosition');
  };

  useEffect(() => {
    loadUsers();
  }, []);

  useEffect(() => {
    filterUsers();
  }, [users, searchTerm, filterPosition, filterDepartment, filterBranch, filterProjectId, departments, currentUser]);

  // Function to calculate total learning time from progress
  const calculateLearningTime = async (userId: string | undefined): Promise<number> => {
    // Return 0 if userId is undefined or empty
    if (!userId) {
      return 0;
    }

    try {
      const progressRef = collection(db, 'progress');
      const q = query(progressRef, where('userId', '==', userId));
      const snapshot = await getDocs(q);

      let totalSeconds = 0;
      let lessonCount = 0;

      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const watchedSeconds = data.watchedSeconds || 0;
        totalSeconds += watchedSeconds;
        lessonCount++;
      });

      // Debug log
      if (lessonCount > 0) {
        console.log(`User ${userId}: ${lessonCount} lessons, ${totalSeconds} seconds (${(totalSeconds / 3600).toFixed(2)} hours)`);
      }

      // Convert seconds to hours
      return totalSeconds / 3600;
    } catch (error) {
      console.error('Error calculating learning time for user', userId, error);
      return 0;
    }
  };

  const loadUsers = async () => {
    try {
      setLoading(true);

      // Load users
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const usersData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          ...data,
          uid: data.uid || doc.id, // Ensure uid exists, fallback to doc.id
          docId: doc.id, // Store document ID for direct updates
          createdAt: data.createdAt?.toDate(),
          updatedAt: data.updatedAt?.toDate()
        };
      }) as (UserProfile & { docId?: string })[];

      // Load projects first
      const projectsSnapshot = await getDocs(collection(db, 'projects'));
      const projectsData = projectsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          name: String(doc.data().name || doc.data().title || doc.id),
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
      setProjects(projectsData);

      // Calculate learning time for each user
      const usersWithLearningTime = await Promise.all(
        usersData.map(async (user) => {
          const learningHours = await calculateLearningTime(user.uid);
          return {
            ...user,
            totalLearningHours: learningHours
          };
        })
      );

      // Enrich users with project names
      const usersWithProjects = usersWithLearningTime.map(user => {
        const projectNames = user.projects?.map(projectId => {
          const project = projectsData.find(p => p.id === projectId);
          return project?.name || '';
        }).filter(Boolean) || [];
        return {
          ...user,
          projectNames,
        };
      });

      setUsers(usersWithProjects);

      // Load departments - Load đầy đủ thông tin bao gồm managerId và projects
      const deptSnapshot = await getDocs(collection(db, 'departments'));
      const depts = deptSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name,
        managerId: doc.data().managerId,
        managerName: doc.data().managerName,
        projects: doc.data().projects || []
      }));
      setDepartments(depts);
    } catch (error) {
      console.error('Error loading users:', error);
      alert(t('admin.users.loadError'));
    } finally {
      setLoading(false);
    }
  };

  // Đồng bộ dữ liệu employment từ hệ thống chấm công/nhân sự
  const handleSyncEmployment = async () => {
    try {
      setSyncingEmployment(true);
      await syncEmploymentToUsers();
      alert(t('admin.users.syncSuccess'));
      await loadUsers();
    } catch (error) {
      console.error('Error syncing employment:', error);
      alert(t('admin.users.syncError'));
    } finally {
      setSyncingEmployment(false);
    }
  };

  const filterUsers = () => {
    // Chỉ lấy user đã duyệt hoặc admin
    let filtered = users.filter(user => user.role === 'admin' || user.approved);

    // Kiểm tra xem currentUser có phải trưởng phòng không
    const isManager = departments.some(d => d.managerId === currentUser?.uid);

    // Nếu là trưởng phòng, CHỈ lọc theo departmentId (đơn giản)
    if (isManager && currentUser?.departmentId) {
      filtered = filtered.filter(user => user.departmentId === currentUser.departmentId);
    }

    // Position filter
    if (filterPosition !== 'all') {
      if (filterPosition === 'none') {
        filtered = filtered.filter(user => !user.position);
      } else {
        filtered = filtered.filter(user => user.position === filterPosition);
      }
    }

    // Department filter
    if (filterDepartment !== 'all') {
      if (filterDepartment === 'none') {
        filtered = filtered.filter(user => !user.departmentId);
      } else {
        filtered = filtered.filter(user => user.departmentId === filterDepartment);
      }
    }

    // Branch filter (chi nhánh lấy từ employmentBranch)
    if (filterBranch !== 'all') {
      filtered = filtered.filter(user =>
        (user.employmentBranch || user.employment?.branch) === filterBranch
      );
    }

    // Project filter - Lọc users dựa trên projects của chính họ hoặc department của họ có chứa project đó
    if (filterProjectId) {
      filtered = filtered.filter(user => {
        // Kiểm tra projects trực tiếp của user
        if (user.projects && user.projects.includes(filterProjectId)) {
          return true;
        }
        // Kiểm tra projects của department
        if (user.departmentId) {
          const userDept = departments.find(d => d.id === user.departmentId);
          return userDept && userDept.projects && userDept.projects.includes(filterProjectId);
        }
        return false;
      });
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(user =>
        user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredUsers(filtered);
    setCurrentPage(1);
  };

  // Lấy danh sách chờ duyệt
  const pendingUsers = users.filter(user => user.role !== 'admin' && !user.approved);

  const handleAdd = () => {
    setEditingUser(null);
    setFormData({
      email: '',
      password: '',
      displayName: '',
      role: 'staff',
      position: '',
      departmentId: '',
      monthlySalary: 0,
      dateOfBirth: '',
      address: '',
      country: '',
      phoneNumber: '',
      workLocation: '',
      photoURL: '',
      employmentStatus: '',
      employmentStartDate: '',
      employmentMaritalStatus: '',
      employmentBranch: '',
      employmentTeam: '',
      employmentSalaryPercentage: 100,
      employmentActive: true,
      projects: [],
    });
    setShowModal(true);
  };

  const handleEdit = (user: UserProfile & { docId?: string }) => {
    // Không cho sửa admin
    if (user.role === 'admin') {
      alert(t('admin.users.cannotEditAdmin'));
      return;
    }

    // Ensure user has uid
    if (!user.uid) {
      console.error('User missing uid:', user);
      alert(t('admin.users.missingUid'));
      return;
    }

    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      displayName: user.displayName,
      role: user.role,
      position: user.position || '',
      departmentId: user.departmentId || '',
      monthlySalary: user.monthlySalary || 0,
      dateOfBirth: user.dateOfBirth || '',
      address: user.address || '',
      country: user.country || '',
      phoneNumber: user.phoneNumber || '',
      workLocation: user.workLocation || '',
      photoURL: user.photoURL || user.employment?.avatarURL || '',
      employmentStatus: user.employmentStatus || user.employment?.employmentStatus || '',
      employmentStartDate: user.employmentStartDate || user.employment?.startDate || '',
      employmentMaritalStatus: user.employmentMaritalStatus || user.employment?.maritalStatus || '',
      employmentBranch: user.employmentBranch || user.employment?.branch || '',
      employmentTeam: user.employmentTeam || user.employment?.team || '',
      employmentSalaryPercentage:
        user.employmentSalaryPercentage ||
        user.employment?.salaryPercentage ||
        100,
      employmentActive:
        typeof user.employmentActive === 'boolean'
          ? user.employmentActive
          : typeof user.employment?.active === 'boolean'
            ? user.employment.active
            : true,
      projects: Array.isArray(user.projects) ? user.projects : [],
    });
    setShowModal(true);
  };

  const getDepartmentName = (deptId?: string) => {
    if (!deptId) return '-';
    const dept = departments.find(d => d.id === deptId);
    return dept?.name || '-';
  };

  const loadUserLearningStats = async (userId: string) => {
    try {
      setLoadingStats(true);
      console.log('Loading stats for user:', userId);

      // Load progress (tiến độ học từng bài)
      const progressRef = collection(db, 'progress');
      const progressQuery = query(progressRef, where('userId', '==', userId));
      const progressSnapshot = await getDocs(progressQuery);
      const progressData = progressSnapshot.docs.map(doc => doc.data());
      console.log('Progress data:', progressData);

      // Load enrollments (đăng ký khóa học)
      const enrollmentsRef = collection(db, 'enrollments');
      const enrollmentsQuery = query(enrollmentsRef, where('userId', '==', userId));
      const enrollmentsSnapshot = await getDocs(enrollmentsQuery);
      const enrollments = enrollmentsSnapshot.docs.map(doc => doc.data());
      console.log('Enrollments data:', enrollments);

      // Load quiz results
      const quizRef = collection(db, 'quizResults');
      const quizQuery = query(quizRef, where('userId', '==', userId));
      const quizSnapshot = await getDocs(quizQuery);
      const quizResults = quizSnapshot.docs.map(doc => doc.data());
      console.log('Quiz results:', quizResults);

      // Load courses for recent courses
      const coursesRef = collection(db, 'courses');
      const coursesSnapshot = await getDocs(coursesRef);
      const courses = coursesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));

      // Sử dụng enrollments nếu có, nếu không thì dùng progress để tính
      let totalCourses = 0;
      let completedCourses = 0;
      let inProgressCourses = 0;
      let totalProgress = 0;
      let recentCourses: Array<{ title: string; progress: number; courseId: string }> = [];

      if (enrollments.length > 0) {
        // Có enrollments - dùng enrollments
        totalCourses = enrollments.length;
        completedCourses = enrollments.filter(e => e.progress >= 100).length;
        inProgressCourses = enrollments.filter(e => e.progress > 0 && e.progress < 100).length;
        totalProgress = enrollments.reduce((sum, e) => sum + (e.progress || 0), 0);

        recentCourses = enrollments
          .map(e => {
            const course = courses.find(c => c.id === e.courseId);
            return {
              title: course?.title || t('admin.users.unknownCourse'),
              progress: e.progress || 0,
              courseId: e.courseId
            };
          })
          .sort((a, b) => b.progress - a.progress)
          .slice(0, 5);
      } else if (progressData.length > 0) {
        // Không có enrollments - tính từ progress
        const courseIds = [...new Set(progressData.map(p => p.courseId))];
        totalCourses = courseIds.length;

        courseIds.forEach(courseId => {
          const courseLessons = progressData.filter(p => p.courseId === courseId);
          const completedLessons = courseLessons.filter(p => p.completed).length;
          const courseProgress = courseLessons.length > 0 ? (completedLessons / courseLessons.length) * 100 : 0;

          if (courseProgress >= 100) completedCourses++;
          else if (courseProgress > 0) inProgressCourses++;

          totalProgress += courseProgress;

          const course = courses.find(c => c.id === courseId);
          recentCourses.push({
            title: course?.title || t('admin.users.unknownCourse'),
            progress: courseProgress,
            courseId: courseId
          });
        });

        recentCourses = recentCourses.sort((a, b) => b.progress - a.progress).slice(0, 5);
      }

      const averageProgress = totalCourses > 0 ? totalProgress / totalCourses : 0;

      const totalQuizzes = quizResults.length;
      const totalQuizScore = quizResults.reduce((sum, q) => sum + q.score, 0);
      const averageQuizScore = totalQuizzes > 0 ? totalQuizScore / totalQuizzes : 0;

      console.log('Final stats:', {
        totalCourses,
        completedCourses,
        inProgressCourses,
        averageProgress,
        totalQuizzes,
        averageQuizScore,
        recentCourses
      });

      setUserLearningStats({
        totalCourses,
        completedCourses,
        inProgressCourses,
        averageProgress,
        totalQuizzes,
        averageQuizScore,
        recentCourses
      });
    } catch (error) {
      console.error('Error loading user learning stats:', error);
    } finally {
      setLoadingStats(false);
    }
  };

  // Helper function to remove undefined values from object
  const removeUndefined = (obj: any): any => {
    if (obj === null || typeof obj !== 'object' || obj instanceof Date || Array.isArray(obj)) {
      return obj;
    }

    const cleaned: Record<string, any> = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];
        if (value !== undefined) {
          cleaned[key] = removeUndefined(value);
        }
      }
    }
    return cleaned;
  };

  const handleSave = async () => {
    try {
      if (!formData.email || (!editingUser && !formData.password) || !formData.displayName) {
        alert(t('admin.users.fillRequired'));
        return;
      }

      if (!editingUser && formData.password.trim().length < 6) {
        alert(t('admin.users.passwordMinLength'));
        return;
      }

      if (editingUser && formData.password && formData.password.trim().length < 6) {
        alert(t('admin.users.passwordMinLength'));
        return;
      }

      if (editingUser) {
        // Update existing user - Use document ID directly if available, otherwise query by uid
        let userDocId: string | null = null;

        if (editingUser.docId) {
          // Use stored document ID directly
          userDocId = editingUser.docId;
        } else if (editingUser.uid) {
          // Fallback: Query by uid field
          const usersRef = collection(db, 'users');
          const q = query(usersRef, where('uid', '==', editingUser.uid));
          const snapshot = await getDocs(q);

          if (snapshot.empty) {
            console.error('User not found by uid:', editingUser.uid);
            alert(t('admin.users.userNotFound'));
            return;
          }

          userDocId = snapshot.docs[0].id;
        } else {
          alert(t('admin.users.userInfoNotFound'));
          console.error('Editing user missing both docId and uid:', editingUser);
          return;
        }

        const updateData: Record<string, any> = {
          email: String(formData.email || '').trim().toLowerCase(),
          displayName: String(formData.displayName || ''),
          role: String(formData.role || 'staff'),
          updatedAt: new Date()
        };

        if (formData.password.trim()) {
          updateData.password = formData.password.trim();
        }

        // Preserve/ghi đè photoURL nếu có
        if (formData.photoURL) {
          updateData.photoURL = formData.photoURL;
        } else if (editingUser.photoURL) {
          updateData.photoURL = editingUser.photoURL;
        }

        // Only add optional fields if they have values
        if (formData.position) {
          updateData.position = formData.position;
        }
        if (formData.departmentId) {
          updateData.departmentId = formData.departmentId;
        }
        if (formData.monthlySalary && formData.monthlySalary > 0) {
          updateData.monthlySalary = formData.monthlySalary;
        }
        if (formData.dateOfBirth) {
          updateData.dateOfBirth = formData.dateOfBirth;
        }
        if (formData.address) {
          updateData.address = formData.address;
        }
        if (formData.country) {
          updateData.country = formData.country;
        }
        if (formData.phoneNumber) {
          updateData.phoneNumber = formData.phoneNumber;
        }
        if (formData.workLocation) {
          updateData.workLocation = formData.workLocation;
        }
        if (formData.employmentStatus) {
          updateData.employmentStatus = formData.employmentStatus;
        }
        if (formData.employmentStartDate) {
          updateData.employmentStartDate = formData.employmentStartDate;
        }
        if (formData.employmentMaritalStatus) {
          updateData.employmentMaritalStatus = formData.employmentMaritalStatus;
        }
        if (formData.employmentBranch) {
          updateData.employmentBranch = formData.employmentBranch;
        }
        if (formData.employmentTeam) {
          updateData.employmentTeam = formData.employmentTeam;
        }
        if (formData.employmentSalaryPercentage) {
          updateData.employmentSalaryPercentage = formData.employmentSalaryPercentage;
        }
        if (typeof formData.employmentActive === 'boolean') {
          updateData.employmentActive = formData.employmentActive;
        }
        if (Array.isArray(formData.projects)) {
          updateData.projects = formData.projects;
        }

        // Remove undefined values before saving
        const cleanedData = removeUndefined(updateData);
        
        // Final check - remove any keys with undefined values
        const finalData: Record<string, any> = {};
        for (const key in cleanedData) {
          if (cleanedData[key] !== undefined) {
            finalData[key] = cleanedData[key];
          }
        }

        await authenticatedJson(`/api/admin/users/${encodeURIComponent(userDocId)}`, 'PATCH', finalData);
        alert(t('admin.users.updateSuccess'));
      } else {
        // Check if email exists
        const normalizedEmail = formData.email.trim().toLowerCase();
        if (!normalizedEmail) {
          alert(t('admin.users.emailRequired'));
          return;
        }

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', normalizedEmail));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          alert(t('admin.users.emailExists'));
          return;
        }

        const newUser: Record<string, any> = {
          email: normalizedEmail,
          password: formData.password.trim(),
          displayName: String(formData.displayName || '').trim(),
          role: String(formData.role || 'staff'),
        };

        // Only add optional fields if they have values
        if (formData.position) {
          newUser.position = formData.position;
        }
        if (formData.departmentId) {
          newUser.departmentId = formData.departmentId;
        }
        if (formData.monthlySalary && formData.monthlySalary > 0) {
          newUser.monthlySalary = formData.monthlySalary;
        }
        if (formData.dateOfBirth) {
          newUser.dateOfBirth = formData.dateOfBirth;
        }
        if (formData.address) {
          newUser.address = formData.address;
        }
        if (formData.country) {
          newUser.country = formData.country;
        }
        if (formData.phoneNumber) {
          newUser.phoneNumber = formData.phoneNumber;
        }
        if (formData.workLocation) {
          newUser.workLocation = formData.workLocation;
        }
        if (formData.photoURL) {
          newUser.photoURL = formData.photoURL;
        }
        if (formData.employmentStatus) {
          newUser.employmentStatus = formData.employmentStatus;
        }
        if (formData.employmentStartDate) {
          newUser.employmentStartDate = formData.employmentStartDate;
        }
        if (formData.employmentMaritalStatus) {
          newUser.employmentMaritalStatus = formData.employmentMaritalStatus;
        }
        if (formData.employmentBranch) {
          newUser.employmentBranch = formData.employmentBranch;
        }
        if (formData.employmentTeam) {
          newUser.employmentTeam = formData.employmentTeam;
        }
        if (formData.employmentSalaryPercentage) {
          newUser.employmentSalaryPercentage = formData.employmentSalaryPercentage;
        }
        if (typeof formData.employmentActive === 'boolean') {
          newUser.employmentActive = formData.employmentActive;
        }
        if (Array.isArray(formData.projects)) {
          newUser.projects = formData.projects;
        }

        // Remove undefined values before saving
        const cleanedNewUser = removeUndefined(newUser);
        
        // Final check - remove any keys with undefined values
        const finalNewUser: Record<string, any> = {};
        for (const key in cleanedNewUser) {
          if (cleanedNewUser[key] !== undefined) {
            finalNewUser[key] = cleanedNewUser[key];
          }
        }

        await authenticatedJson('/api/admin/users', 'POST', finalNewUser);
        alert(t('admin.users.createSuccess'));
      }

      setShowModal(false);
      loadUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      const message = error instanceof Error && error.message
        ? error.message
        : t('admin.users.saveError');
      alert(message);
    }
  };

  const handleDelete = async (user: UserProfile & { docId?: string }) => {
    // Không cho xóa admin
    if (user.role === 'admin') {
      alert(t('admin.users.cannotDeleteAdmin'));
      return;
    }

    // Không cho tự xóa chính mình
    if (user.uid === currentUser?.uid) {
      alert(t('admin.users.cannotDeleteSelf'));
      return;
    }

    if (!confirm(t('admin.users.confirmDelete', { name: user.displayName }))) {
      return;
    }

    try {
      // Use document ID directly if available, otherwise query by uid
      let userDocId: string | null = null;

      if (user.docId) {
        userDocId = user.docId;
      } else if (user.uid) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('uid', '==', user.uid));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          alert(t('admin.users.userNotFoundShort'));
          return;
        }

        userDocId = snapshot.docs[0].id;
      } else {
        alert(t('admin.users.userInfoNotFound'));
        return;
      }

      await authenticatedJson(`/api/admin/users/${encodeURIComponent(userDocId)}`, 'DELETE');
      alert(t('admin.users.deleteSuccess'));
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert(t('admin.users.deleteError'));
    }
  };

  const getRoleBadge = (role: UserRole) => {
    const styles = {
      admin: 'bg-red-100 text-red-700',
      staff: 'bg-blue-100 text-blue-700',
      student: 'bg-green-100 text-green-700'
    };
    const labels = {
      admin: t('admin.users.roles.admin'),
      staff: t('admin.users.roles.staff'),
      student: t('admin.users.roles.studentAlt')
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[role as keyof typeof styles] || 'bg-gray-100 text-gray-700'}`}>
        {labels[role as keyof typeof labels] || role}
      </span>
    );
  };

  const handleApprove = async (user: UserProfile & { docId?: string }, approve: boolean) => {
    try {
      // Use document ID directly if available, otherwise query by uid
      let userDocId: string | null = null;

      if (user.docId) {
        userDocId = user.docId;
      } else if (user.uid) {
        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('uid', '==', user.uid));
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          alert(t('admin.users.userNotFoundShort'));
          return;
        }

        userDocId = snapshot.docs[0].id;
      } else {
        alert(t('admin.users.userInfoNotFound'));
        return;
      }

      if (process.env.NEXT_PUBLIC_SUPABASE_ENABLED === 'true') {
        await authenticatedJson(`/api/admin/users/${encodeURIComponent(userDocId)}/approval`, 'PATCH', { approved: approve });
      } else {
        const userRef = doc(db, 'users', userDocId);
        await updateDoc(userRef, { approved: approve, updatedAt: new Date() });
      }

      alert(approve ? t('admin.users.approveSuccess') : t('admin.users.rejectSuccess'));
      loadUsers();
    } catch (error) {
      console.error('Error approving user:', error);
      alert(t('admin.users.approveError'));
    }
  };

  if (loading) {
    return <div className="text-center py-8">{t('common.loading')}</div>;
  }

  return (
    <div className="min-h-screen space-y-6 bg-white p-8 text-[#111b38]">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-[#111b38]">{t('admin.users.title')}</h2>
          {currentUser?.role !== 'admin' && currentUser?.position === 'Trưởng phòng' ? (
            <p className="mt-1 text-sm text-[#1B7A1E]">
              🏢 {t('admin.users.viewingDepartmentStaff', { department: departments.find(d => d.id === currentUser.departmentId)?.name ?? '' })}
            </p>
          ) : (
            <p className="mt-1 text-sm text-[#66718b]">
              {t('admin.users.learningTimeHint')}
            </p>
          )}
        </div>
        <div className="flex gap-3">
          {/* Chỉ admin mới được đồng bộ & thêm người dùng */}
          {currentUser?.role === 'admin' && (
            <>
              <Button
                variant="outline"
                onClick={handleSyncEmployment}
                disabled={syncingEmployment}
                className="flex items-center gap-2 border-[#1B7A1E] text-[#1B7A1E] hover:bg-[#edf7ee]"
              >
                {syncingEmployment ? t('admin.users.syncing') : t('admin.users.syncEmployment')}
              </Button>
              <Button onClick={handleAdd} className="flex items-center gap-2 border-none bg-[#1B7A1E] text-white shadow-lg shadow-[#1B7A1E]/20 hover:bg-[#156318]">
                <Plus size={18} />
                {t('admin.users.addUser')}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={20} />
          <input
            type="text"
            placeholder={t('admin.users.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-[#1B7A1E] bg-white py-2 pl-10 pr-4 text-[#111b38] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
          />
        </div>
        <select
          value={filterPosition}
          onChange={(e) => setFilterPosition(e.target.value as Position | 'all' | 'none')}
          className="rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
        >
          <option value="all">{t('admin.users.allPositions')}</option>
          <option value="none">{t('admin.users.noPosition')}</option>
          {POSITIONS.map(pos => (
            <option key={pos} value={pos}>{getPositionLabel(pos)}</option>
          ))}
        </select>
        <select
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          className="rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
        >
          <option value="all">{t('admin.users.allDepartments')}</option>
          <option value="none">{t('admin.users.noDepartment')}</option>
          {departments.map(dept => (
            <option key={dept.id} value={dept.id}>{dept.name}</option>
          ))}
        </select>
        <select
          value={filterBranch}
          onChange={(e) => setFilterBranch(e.target.value)}
          className="rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
        >
          <option value="all">{t('admin.users.allBranches')}</option>
          {Array.from(
            new Set(
              users
                .map(u => u.employmentBranch || u.employment?.branch)
                .filter((b): b is string => !!b)
            )
          ).map(branch => (
            <option key={branch} value={branch}>{branch}</option>
          ))}
        </select>
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
        >
          <option value="">{t('admin.users.allProjects')}</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </div>

      {/* Birthday Section */}
      {(() => {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const birthdayUsers = users.filter(u => {
          if (!u.dateOfBirth) return false;
          const birthDate = new Date(u.dateOfBirth);
          return birthDate.getMonth() + 1 === currentMonth;
        }).sort((a, b) => {
          const aDay = new Date(a.dateOfBirth!).getDate();
          const bDay = new Date(b.dateOfBirth!).getDate();
          return aDay - bDay;
        });

        if (birthdayUsers.length === 0) return null;

        return (
          <div className="bg-gradient-to-r from-pink-50 to-purple-50 border-2 border-pink-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setShowBirthdays(!showBirthdays)}
              className="w-full p-4 flex items-center justify-between hover:bg-pink-100/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className="text-2xl">🎂</span>
                <h3 className="text-lg font-bold text-pink-900">
                  {t('admin.users.birthdayMonthTitle', { month: currentMonth, count: birthdayUsers.length })}
                </h3>
              </div>
              <svg
                className={`w-5 h-5 text-pink-900 transition-transform ${showBirthdays ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showBirthdays && (
              <div className="p-6 pt-0">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {birthdayUsers.map(user => {
                    const birthDate = new Date(user.dateOfBirth!);
                    const day = birthDate.getDate();
                    const isToday = day === now.getDate();
                    const dept = departments.find(d => d.id === user.departmentId);

                    return (
                      <div
                        key={user.uid}
                        className={`bg-white rounded-lg p-4 border-2 ${isToday ? 'border-pink-400 shadow-lg' : 'border-pink-200'}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white ${isToday ? 'bg-pink-500 animate-pulse' : 'bg-pink-400'}`}>
                            {day}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-900 flex items-center gap-2">
                              {user.displayName}
                              {isToday && <span className="text-xs bg-pink-500 text-white px-2 py-0.5 rounded-full">{t('admin.users.today')}</span>}
                            </p>
                            <p className="text-xs text-[#94a3b8]">{dept?.name || t('admin.users.noDepartment')}</p>
                            <p className="text-xs text-[#66718b]">{getPositionLabel(user.position)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {POSITIONS.map((position) => {
          const count = users.filter(u => (u.role === 'admin' || u.approved) && u.position === position).length;
          return (
            <div key={position} className="rounded-xl border border-[#1B7A1E] bg-white p-4 transition-colors hover:bg-[#f3faf4]">
              <p className="text-sm text-[#66718b]">{getPositionLabel(position)}</p>
              <p className="text-2xl font-bold text-[#1B7A1E]">{count}</p>
            </div>
          );
        })}
      </div>

      {/* Pending Users Section */}
      {pendingUsers.length > 0 && (
        <div className="bg-orange-500/10 backdrop-blur-md border border-orange-500/30 rounded-2xl overflow-hidden">
          <button
            onClick={() => setShowPendingUsers(!showPendingUsers)}
            className="w-full flex items-center justify-between p-4 hover:bg-orange-500/20 transition-colors"
          >
            <div className="flex items-center gap-2">
              <XCircle className="text-orange-400" size={24} />
              <h3 className="text-lg font-bold text-orange-300">
                {t('admin.users.pendingAccounts', { count: pendingUsers.length })}
              </h3>
            </div>
            <svg
              className={`w-5 h-5 text-orange-600 transition-transform ${showPendingUsers ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showPendingUsers && (
            <div className="p-4 pt-0">
              <div className="overflow-hidden rounded-xl border border-[#1B7A1E] bg-white">
                <table className="w-full">
                  <thead className="border-b border-[#1B7A1E]/30 bg-[#edf7ee]">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.name')}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.role')}</th>
                      <th className="px-6 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.registeredDate')}</th>
                      <th className="px-6 py-3 text-right text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#d8ecd9]">
                    {pendingUsers.map((user) => (
                      <tr key={user.uid} className="bg-white hover:bg-[#f3faf4]">
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="font-medium text-[#111b38]">{user.displayName}</div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-[#475569]">{user.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{getRoleBadge(user.role)}</td>
                        <td className="whitespace-nowrap px-6 py-4 text-[#475569]">
                          {user.createdAt?.toLocaleDateString(dateLocale)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleApprove(user, true)}
                            className="text-green-600 hover:text-green-800 mr-3 inline-flex items-center gap-1 px-3 py-1 bg-green-100 rounded-lg font-medium"
                            title={t('admin.users.approveAccount')}
                          >
                            <CheckCircle size={16} />
                            {t('admin.users.approve')}
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            className="text-red-600 hover:text-red-800 inline-flex items-center gap-1 px-3 py-1 bg-red-100 rounded-lg font-medium"
                            title={t('admin.users.rejectAccount')}
                          >
                            <Trash2 size={16} />
                            {t('admin.users.reject')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Approved Users Table */}
      <div>
        <h3 className="mb-4 text-lg font-bold text-[#111b38]">{t('admin.users.userList')}</h3>
        <div className="overflow-hidden rounded-xl border border-[#1B7A1E] bg-white">
          <div className="max-h-[600px] overflow-auto">
            <table className="w-full min-w-[980px] border-collapse bg-white">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b border-[#1B7A1E]">
                  <th className="bg-white px-4 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.name')}</th>
                  <th className="bg-white px-4 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">Email</th>
                  <th className="bg-white px-4 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.role')}</th>
                  <th className="bg-white px-4 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.position')}</th>
                  <th className="bg-white px-4 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.department')}</th>
                  <th className="bg-white px-4 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.project')}</th>
                  <th className="bg-white px-4 py-3 text-center text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.learningHours')}</th>
                  <th className="bg-white px-4 py-3 text-left text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.createdDate')}</th>
                  <th className="bg-white px-4 py-3 text-right text-xs font-semibold uppercase text-[#1B7A1E]">{t('admin.users.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers
                  .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                  .map((user) => (
                    <tr
                      key={user.uid}
                      onClick={() => {
                        setViewingUser(user);
                        setShowDetailModal(true);
                        loadUserLearningStats(user.uid);
                      }}
                      className="cursor-pointer border-b border-[#d8ecd9] bg-white transition-colors hover:bg-[#f3faf4]"
                    >
                      <td className="whitespace-nowrap bg-white px-4 py-4">
                        <div className="font-medium text-[#1B7A1E]">{user.displayName}</div>
                      </td>
                      <td className="whitespace-nowrap bg-white px-4 py-4 text-sm text-[#475569]">{user.email}</td>
                      <td className="whitespace-nowrap bg-white px-4 py-4">{getRoleBadge(user.role)}</td>
                      <td className="whitespace-nowrap bg-white px-4 py-4">
                        {user.position ? (
                          <div className="flex items-center gap-1">
                            <span className="rounded-full bg-[#edf7ee] px-2 py-1 text-xs font-medium text-[#1B7A1E]">
                              {getPositionLabel(user.position)}
                            </span>
                            {user.departmentId && departments.find(d => d.managerId === user.uid) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7ee] px-2 py-1 text-xs font-medium text-[#1B7A1E]">
                                <Users size={12} />
                                {t('admin.users.managerBadge')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#94a3b8]">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap bg-white px-4 py-4 text-sm text-[#475569]">
                        {getDepartmentName(user.departmentId)}
                      </td>
                      <td className="bg-white px-4 py-4">
                        {user.projectNames && user.projectNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.projectNames.map((projectName, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center rounded-md bg-[#edf7ee] px-2 py-1 text-xs font-medium text-[#1B7A1E]"
                              >
                                {projectName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-sm text-[#94a3b8]">-</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap bg-white px-4 py-4 text-center">
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7ee] px-2 py-1 text-xs font-medium text-[#1B7A1E]">
                          {(user.totalLearningHours || 0).toFixed(1)}h
                        </span>
                      </td>
                      <td className="whitespace-nowrap bg-white px-4 py-4 text-sm text-[#475569]">
                        {user.createdAt?.toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit' })}
                      </td>
                      <td className="whitespace-nowrap bg-white px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        {currentUser?.role === 'admin' ? (
                          user.role === 'admin' ? (
                            <div className="inline-flex items-center gap-1 rounded-lg bg-[#edf7ee] px-3 py-1 text-sm text-[#1B7A1E]">
                              <Shield size={14} />
                              <span className="font-medium">{t('admin.users.protected')}</span>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(user);
                                }}
                                className="mr-3 text-[#1B7A1E] hover:text-[#156318]"
                                title={t('common.edit')}
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(user);
                                }}
                                className="text-red-600 hover:text-red-800"
                                title={t('common.delete')}
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          )
                        ) : (
                          <span className="text-sm text-[#94a3b8]">{t('admin.users.viewOnly')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Pagination */}
        {filteredUsers.length > PAGE_SIZE && (
          <div className="flex items-center justify-between mt-4 text-sm text-slate-600">
            <div>
              {t('admin.users.paginationShowing', {
                from: (currentPage - 1) * PAGE_SIZE + 1,
                to: Math.min(currentPage * PAGE_SIZE, filteredUsers.length),
                total: filteredUsers.length,
              })}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                {t('common.prev')}
              </button>
              {Array.from({ length: Math.ceil(filteredUsers.length / PAGE_SIZE) }).map((_, idx) => {
                const page = idx + 1;
                // Chỉ hiển thị vài trang quanh currentPage cho gọn
                if (
                  page === 1 ||
                  page === Math.ceil(filteredUsers.length / PAGE_SIZE) ||
                  Math.abs(page - currentPage) <= 1
                ) {
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={`px-3 py-1 rounded-lg border text-sm ${page === currentPage
                        ? 'bg-brand-500 text-white border-brand-500'
                        : 'border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      {page}
                    </button>
                  );
                }
                if (page === currentPage - 2 || page === currentPage + 2) {
                  return (
                    <span key={page} className="px-1">
                      ...
                    </span>
                  );
                }
                return null;
              })}
              <button
                onClick={() =>
                  setCurrentPage((p) =>
                    Math.min(Math.ceil(filteredUsers.length / PAGE_SIZE), p + 1)
                  )
                }
                disabled={currentPage === Math.ceil(filteredUsers.length / PAGE_SIZE)}
                className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white border border-[#1B7A1E] rounded-2xl shadow-2xl w-full max-w-4xl my-8 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-6 border-b border-[#1B7A1E]/30 bg-[#edf7ee]">
              <h3 className="text-xl font-bold text-[#111b38]">
                {editingUser ? t('admin.users.editUser') : t('admin.users.addUserNew')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-[#edf7ee] rounded-lg transition-colors text-[#66718b]">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Left Column */}
                <div className="space-y-4 md:col-span-1">
                  <h4 className="text-sm font-semibold text-[#1B7A1E] border-b border-[#1B7A1E]/30 pb-2">{t('admin.users.accountInfo')}</h4>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.fullName')} *</label>
                    <input
                      type="text"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.password')}{editingUser ? ' (để trống nếu không đổi)' : ' *'}</label>
                    <input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      {...(!editingUser ? { minLength: 6, placeholder: t('admin.users.passwordPlaceholder') } : {})}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.role')}</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38] [&>option]:bg-white [&>option]:text-[#111b38]"
                    >
                      <option value="staff">{t('admin.users.roles.staff')}</option>
                      <option value="teacher">{t('admin.users.roles.teacherAlt')}</option>
                      <option value="student">{t('admin.users.roles.student')}</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.position')}</label>
                    <select
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value as Position | '' })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38] [&>option]:bg-white [&>option]:text-[#111b38]"
                    >
                      <option value="">{t('admin.users.selectPosition')}</option>
                      {POSITIONS.map(pos => (
                        <option key={pos} value={pos}>{getPositionLabel(pos)}</option>
                      ))}
                    </select>
                  </div>

                  {formData.role === 'staff' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.department')}</label>
                        <select
                          value={formData.departmentId}
                          onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                          className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38] [&>option]:bg-white [&>option]:text-[#111b38]"
                        >
                          <option value="">{t('admin.users.selectDepartment')}</option>
                          {departments.map(dept => (
                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-2">
                      {t('admin.users.selectProjects')}
                      {formData.projects.length > 0 && (
                        <span className="ml-2 text-xs text-[#1B7A1E]">
                          ({t('admin.courses.selectedProjectsCount', { count: formData.projects.length })})
                        </span>
                      )}
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-[#1B7A1E] rounded-lg p-2 bg-white">
                      {projects.length === 0 ? (
                        <p className="text-xs text-[#94a3b8] text-center py-4">{t('admin.courses.noProjectsYet')}</p>
                      ) : (
                        projects.map(project => {
                          const isChecked = formData.projects.includes(project.id);
                          return (
                            <label
                              key={project.id}
                              className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-[#edf7ee] border border-[#1B7A1E]/30'
                                  : 'hover:bg-[#f3faf4] border border-transparent'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setFormData({
                                      ...formData,
                                      projects: [...formData.projects, project.id],
                                    });
                                  } else {
                                    setFormData({
                                      ...formData,
                                      projects: formData.projects.filter(id => id !== project.id),
                                    });
                                  }
                                }}
                                className="w-4 h-4 text-[#1B7A1E] bg-white border-[#1B7A1E] rounded focus:ring-[#1B7A1E] focus:ring-2"
                              />
                              <span className={`text-sm flex-1 ${isChecked ? 'text-[#1B7A1E] font-medium' : 'text-[#475569]'}`}>
                                {project.name}
                              </span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Column - Thông tin cá nhân & avatar */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-[#1B7A1E] border-b border-[#1B7A1E]/30 pb-2">{t('admin.users.personalInfo')}</h4>

                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
                      {formData.photoURL ? (
                        <img
                          src={formData.photoURL}
                          alt={formData.displayName || 'Avatar'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[#94a3b8] text-sm">
                          {formData.displayName ? formData.displayName.charAt(0).toUpperCase() : '?'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-[#475569] mb-1">Avatar URL</label>
                      <input
                        type="text"
                        value={formData.photoURL}
                        onChange={(e) => setFormData({ ...formData, photoURL: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38] text-xs"
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.dateOfBirth')}</label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.phone')}</label>
                    <input
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                      placeholder="0123456789"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.address')}</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                      placeholder={t('admin.users.addressPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.country')}</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                      placeholder={t('admin.users.countryPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.workLocation')}</label>
                    <input
                      type="text"
                      value={formData.workLocation}
                      onChange={(e) => setFormData({ ...formData, workLocation: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                      placeholder={t('admin.users.workLocationPlaceholder')}
                    />
                  </div>
                </div>

                {/* Third Column - Thông tin nhân sự */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-[#1B7A1E] border-b border-[#1B7A1E]/30 pb-2">{t('admin.users.employmentInfo')}</h4>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.employmentStatus')}</label>
                    <input
                      type="text"
                      value={formData.employmentStatus}
                      onChange={(e) => setFormData({ ...formData, employmentStatus: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                      placeholder={t('admin.users.employmentStatusPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.employmentStartDate')}</label>
                    <input
                      type="date"
                      value={formData.employmentStartDate}
                      onChange={(e) => setFormData({ ...formData, employmentStartDate: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.maritalStatus')}</label>
                    <input
                      type="text"
                      value={formData.employmentMaritalStatus}
                      onChange={(e) => setFormData({ ...formData, employmentMaritalStatus: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                      placeholder={t('admin.users.maritalStatusPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.branch')}</label>
                    <input
                      type="text"
                      value={formData.employmentBranch}
                      onChange={(e) => setFormData({ ...formData, employmentBranch: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                      placeholder={t('admin.users.branchPlaceholder')}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-[#475569] mb-1">{t('admin.users.team')}</label>
                    <input
                      type="text"
                      value={formData.employmentTeam}
                      onChange={(e) => setFormData({ ...formData, employmentTeam: e.target.value })}
                      className="w-full px-4 py-2 bg-white border border-[#1B7A1E] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-[#111b38]"
                      placeholder={t('admin.users.teamPlaceholder')}
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      id="employmentActive"
                      type="checkbox"
                      checked={formData.employmentActive}
                      onChange={(e) => setFormData({ ...formData, employmentActive: e.target.checked })}
                      className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                    />
                    <label htmlFor="employmentActive" className="text-sm text-[#475569]">
                      {t('admin.users.employmentActiveInHrSystem')}
                    </label>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-[#1B7A1E]/30 bg-[#edf7ee]">
              <Button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 bg-[#1B7A1E] hover:bg-[#156318] text-white border-none shadow-lg shadow-[#1B7A1E]/20">
                <Save size={18} />
                {editingUser ? t('common.update') : t('common.create')}
              </Button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-[#1B7A1E] rounded-lg hover:bg-[#edf7ee] bg-white text-[#1B7A1E]"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {showDetailModal && viewingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#1B7A1E] rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="p-6 border-b border-[#1B7A1E]/30 bg-[#edf7ee]">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {viewingUser.photoURL ? (
                    <img
                      src={viewingUser.photoURL}
                      alt={viewingUser.displayName}
                      className="w-16 h-16 rounded-full object-cover border-4 border-white shadow-lg"
                    />
                  ) : (
                    <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-lg">
                      {viewingUser.displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <h3 className="text-2xl font-bold text-[#111b38]">{viewingUser.displayName}</h3>
                    <p className="text-[#475569]">{viewingUser.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-[#edf7ee] rounded-lg transition-colors text-[#66718b]"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="text-lg font-bold text-[#111b38] mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#1B7A1E]" />
                  {t('admin.users.basicInfo')}
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white p-4 rounded-xl border border-[#1B7A1E]">
                    <p className="text-sm text-[#475569] mb-1">{t('admin.users.role')}</p>
                    <div>{getRoleBadge(viewingUser.role)}</div>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-[#1B7A1E]">
                    <p className="text-sm text-[#475569] mb-1">{t('admin.users.position')}</p>
                    {viewingUser.position ? (
                      <div className="flex flex-col gap-2">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium inline-block w-fit">
                          {getPositionLabel(viewingUser.position)}
                        </span>
                        {viewingUser.position === 'Trưởng phòng' && viewingUser.departmentId && (
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium inline-flex items-center gap-1 w-fit">
                            <Users size={14} />
                            {t('admin.users.departmentManager')}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[#66718b]">{t('admin.dashboard.noneYet')}</p>
                    )}
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-[#1B7A1E]">
                    <p className="text-sm text-[#475569] mb-1">{t('admin.users.department')}</p>
                    <p className="font-medium text-[#111b38]">{getDepartmentName(viewingUser.departmentId)}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-[#1B7A1E]">
                    <p className="text-sm text-[#475569] mb-1">{t('admin.users.status')}</p>
                    {viewingUser.role === 'admin' ? (
                      <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                        {t('admin.users.roles.admin')}
                      </span>
                    ) : viewingUser.approved ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        {t('common.approved')}
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                        {t('common.pending')}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Learning Stats */}
              <div>
                <h4 className="text-lg font-bold text-[#111b38] mb-4 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#1B7A1E]" />
                  {t('admin.users.learningStats')}
                </h4>
                {loadingStats ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 border-4 border-[#1B7A1E] border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-[#475569] mt-2">{t('common.loading')}</p>
                  </div>
                ) : userLearningStats ? (
                  <div className="space-y-4">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-[#edf7ee] p-4 rounded-xl border border-[#1B7A1E]">
                        <p className="text-xs text-[#475569] mb-1">{t('admin.dashboard.totalCourses')}</p>
                        <p className="text-2xl font-bold text-[#1B7A1E]">{userLearningStats.totalCourses}</p>
                      </div>
                      <div className="bg-[#edf7ee] p-4 rounded-xl border border-[#1B7A1E]">
                        <p className="text-xs text-[#475569] mb-1">{t('admin.dashboard.completed')}</p>
                        <p className="text-2xl font-bold text-[#1B7A1E]">{userLearningStats.completedCourses}</p>
                      </div>
                      <div className="bg-[#edf7ee] p-4 rounded-xl border border-[#1B7A1E]">
                        <p className="text-xs text-[#475569] mb-1">{t('admin.users.inProgress')}</p>
                        <p className="text-2xl font-bold text-[#1B7A1E]">{userLearningStats.inProgressCourses}</p>
                      </div>
                      <div className="bg-[#edf7ee] p-4 rounded-xl border border-[#1B7A1E]">
                        <p className="text-xs text-[#475569] mb-1">{t('admin.dashboard.avgProgress')}</p>
                        <p className="text-2xl font-bold text-[#1B7A1E]">{userLearningStats.averageProgress.toFixed(0)}%</p>
                      </div>
                    </div>

                    {/* Learning Time & Salary */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#edf7ee] p-6 rounded-xl border border-[#1B7A1E]">
                        <p className="text-sm text-[#475569] mb-2">{t('admin.users.totalLearningTime')}</p>
                        {(() => {
                          const totalHours = viewingUser.totalLearningHours || 0;
                          const hours = Math.floor(totalHours);
                          const minutes = Math.floor((totalHours % 1) * 60);

                          return (
                            <div className="flex items-baseline gap-2">
                              <p className="text-3xl font-bold text-[#1B7A1E]">{hours}</p>
                              <span className="text-base font-semibold text-[#475569]">{t('common.hours')}</span>
                              <p className="text-2xl font-bold text-[#1B7A1E]">{minutes}</p>
                              <span className="text-base font-semibold text-[#475569]">{t('common.minutes')}</span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="bg-[#edf7ee] p-6 rounded-xl border border-[#1B7A1E]">
                        <p className="text-sm text-[#475569] mb-2">{t('admin.users.salary')}</p>
                        <p className="text-2xl font-bold text-[#1B7A1E]">
                          {viewingUser.monthlySalary ? `${viewingUser.monthlySalary.toLocaleString(dateLocale)}đ` : t('admin.dashboard.noneYet')}
                        </p>
                      </div>
                    </div>

                    {/* Quiz Stats */}
                    {userLearningStats.totalQuizzes > 0 && (
                      <div className="bg-[#edf7ee] p-4 rounded-xl border border-[#1B7A1E]">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-[#475569] mb-1">{t('admin.users.quizTests')}</p>
                            <p className="text-xl font-bold text-[#111b38]">{userLearningStats.totalQuizzes} {t('admin.users.quizUnit')}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-[#475569] mb-1">{t('admin.users.averageScore')}</p>
                            <p className="text-xl font-bold text-[#111b38]">{userLearningStats.averageQuizScore.toFixed(1)}/100</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Recent Courses */}
                    {userLearningStats.recentCourses.length > 0 && (
                      <div>
                        <h5 className="text-sm font-bold text-[#475569] mb-3">{t('admin.users.recentCourses')}</h5>
                        <div className="space-y-2">
                          {userLearningStats.recentCourses.map((course, index) => (
                            <div key={course.courseId || `course-${index}`} className="bg-white p-3 rounded-lg border border-[#1B7A1E]">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium text-[#111b38] line-clamp-1">{course.title}</p>
                                <span className="text-sm font-bold text-[#1B7A1E]">{course.progress.toFixed(0)}%</span>
                              </div>
                              <div className="w-full bg-[#d8ecd9] rounded-full h-2">
                                <div
                                  className="bg-[#1B7A1E] h-2 rounded-full transition-all"
                                  style={{ width: `${course.progress}%` }}
                                ></div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-white rounded-xl border border-[#1B7A1E]">
                    <p className="text-[#475569]">{t('admin.users.noLearningData')}</p>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-lg font-bold text-[#111b38] mb-4">{t('common.time')}</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-[#1B7A1E]">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#111b38]">{t('admin.users.createdDate')}</p>
                      <p className="text-sm text-[#475569]">
                        {viewingUser.createdAt?.toLocaleDateString(dateLocale, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-[#1B7A1E]">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#111b38]">{t('admin.users.lastUpdated')}</p>
                      <p className="text-sm text-[#475569]">
                        {viewingUser.updatedAt?.toLocaleDateString(dateLocale, {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-[#1B7A1E]/30 bg-[#edf7ee] flex gap-3">
              {viewingUser.role !== 'admin' && (
                <Button
                  onClick={() => {
                    setShowDetailModal(false);
                    handleEdit(viewingUser);
                  }}
                  className="flex-1 bg-[#1B7A1E] hover:bg-[#156318] border-none text-white"
                >
                  {t('admin.users.editAction')}
                </Button>
              )}
              <Button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 bg-white hover:bg-[#edf7ee] border border-[#1B7A1E] text-[#1B7A1E]"
              >
                {t('common.close')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
