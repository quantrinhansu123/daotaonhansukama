'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { UserProfile, UserRole, Position } from '@/types/user';
import { Search, Plus, Edit2, Trash2, X, Save, CheckCircle, XCircle, Shield, Users, BookOpen } from 'lucide-react';
import { Button } from '@/components/Button';
import { useAuth } from '@/contexts/AuthContext';
import { syncEmploymentToUsers } from '@/lib/syncEmployment';

interface Department {
  id: string;
  name: string;
  managerId?: string;
  managerName?: string;
  projects?: string[];
}

export const UserManagement: React.FC = () => {
  const { userProfile: currentUser } = useAuth(); // User hiện tại đang đăng nhập
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
      const projectsData = projectsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || '',
      }));
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
      alert('Lỗi khi tải danh sách người dùng');
    } finally {
      setLoading(false);
    }
  };

  // Đồng bộ dữ liệu employment từ hệ thống chấm công/nhân sự
  const handleSyncEmployment = async () => {
    try {
      setSyncingEmployment(true);
      await syncEmploymentToUsers();
      alert('Đồng bộ dữ liệu nhân sự thành công!');
      await loadUsers();
    } catch (error) {
      console.error('Error syncing employment:', error);
      alert('Lỗi khi đồng bộ dữ liệu nhân sự');
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
      alert('Không thể chỉnh sửa tài khoản Admin!');
      return;
    }

    // Ensure user has uid
    if (!user.uid) {
      console.error('User missing uid:', user);
      alert('Lỗi: Người dùng không có UID! Vui lòng refresh trang và thử lại.');
      return;
    }

    setEditingUser(user);
    setFormData({
      email: user.email,
      password: user.password,
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
              title: course?.title || 'Khóa học không xác định',
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
            title: course?.title || 'Khóa học không xác định',
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
      if (!formData.email || !formData.password || !formData.displayName) {
        alert('Vui lòng điền đầy đủ thông tin');
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
            alert('Không tìm thấy người dùng! Vui lòng refresh trang và thử lại.');
            return;
          }

          userDocId = snapshot.docs[0].id;
        } else {
          alert('Lỗi: Không tìm thấy thông tin người dùng!');
          console.error('Editing user missing both docId and uid:', editingUser);
          return;
        }

        const userRef = doc(db, 'users', userDocId);

        const updateData: Record<string, any> = {
          email: String(formData.email || ''),
          password: String(formData.password || ''),
          displayName: String(formData.displayName || ''),
          role: String(formData.role || 'staff'),
          updatedAt: new Date()
        };

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

        await updateDoc(userRef, finalData);
        alert('Cập nhật người dùng thành công!');
      } else {
        // Check if email exists
        if (!formData.email || formData.email.trim() === '') {
          alert('Email không được để trống!');
          return;
        }

        const usersRef = collection(db, 'users');
        const q = query(usersRef, where('email', '==', formData.email.trim()));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          alert('Email đã tồn tại!');
          return;
        }

        // Add new user with uid as custom field
        const newUserId = `user_${Date.now()}`;
        const newUser: Record<string, any> = {
          uid: newUserId,
          email: String(formData.email || ''),
          password: String(formData.password || ''),
          displayName: String(formData.displayName || ''),
          role: String(formData.role || 'staff'),
          approved: formData.role === 'admin' ? true : false, // Admin tự động duyệt
          totalLearningHours: 0, // Mặc định 0 giờ
          createdAt: new Date(),
          updatedAt: new Date()
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

        // Use setDoc with custom ID instead of addDoc
        await setDoc(doc(db, 'users', newUserId), finalNewUser);
        alert('Thêm người dùng thành công!');
      }

      setShowModal(false);
      loadUsers();
    } catch (error) {
      console.error('Error saving user:', error);
      alert('Lỗi khi lưu người dùng');
    }
  };

  const handleDelete = async (user: UserProfile & { docId?: string }) => {
    // Không cho xóa admin
    if (user.role === 'admin') {
      alert('Không thể xóa tài khoản Admin!');
      return;
    }

    // Không cho tự xóa chính mình
    if (user.uid === currentUser?.uid) {
      alert('Không thể xóa chính tài khoản của bạn!');
      return;
    }

    if (!confirm(`Bạn có chắc muốn xóa người dùng "${user.displayName}"?`)) {
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
          alert('Không tìm thấy người dùng!');
          return;
        }

        userDocId = snapshot.docs[0].id;
      } else {
        alert('Lỗi: Không tìm thấy thông tin người dùng!');
        return;
      }

      await deleteDoc(doc(db, 'users', userDocId));
      alert('Xóa người dùng thành công!');
      loadUsers();
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Lỗi khi xóa người dùng');
    }
  };

  const getRoleBadge = (role: UserRole) => {
    const styles = {
      admin: 'bg-red-100 text-red-700',
      staff: 'bg-blue-100 text-blue-700',
      student: 'bg-green-100 text-green-700'
    };
    const labels = {
      admin: 'Admin',
      staff: 'Nhân viên',
      student: 'Học sinh'
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
          alert('Không tìm thấy người dùng!');
          return;
        }

        userDocId = snapshot.docs[0].id;
      } else {
        alert('Lỗi: Không tìm thấy thông tin người dùng!');
        return;
      }

      const userRef = doc(db, 'users', userDocId);

      await updateDoc(userRef, {
        approved: approve,
        updatedAt: new Date()
      });

      alert(approve ? 'Đã duyệt tài khoản!' : 'Đã từ chối tài khoản!');
      loadUsers();
    } catch (error) {
      console.error('Error approving user:', error);
      alert('Lỗi khi duyệt tài khoản');
    }
  };

  if (loading) {
    return <div className="text-center py-8">Đang tải...</div>;
  }

  return (
    <div className="p-8 space-y-6 min-h-screen">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Quản lý người dùng</h2>
          {currentUser?.role !== 'admin' && currentUser?.position === 'Trưởng phòng' ? (
            <p className="text-sm text-[#53cafd] mt-1">
              🏢 Bạn đang xem nhân viên của phòng ban: <strong>{departments.find(d => d.id === currentUser.departmentId)?.name}</strong>
            </p>
          ) : (
            <p className="text-sm text-slate-300 mt-1">
              Thời gian học được tính từ progress của các bài học
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
                className="flex items-center gap-2 border-white/10 text-white hover:bg-white/10"
              >
                {syncingEmployment ? 'Đang đồng bộ...' : 'Đồng bộ nhân sự'}
              </Button>
              <Button onClick={handleAdd} className="flex items-center gap-2 bg-[#53cafd] hover:bg-[#3db9f5] text-white border-none shadow-lg shadow-[#53cafd]/20">
                <Plus size={18} />
                Thêm người dùng
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Tìm kiếm theo tên hoặc email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white placeholder-slate-400"
          />
        </div>
        <select
          value={filterPosition}
          onChange={(e) => setFilterPosition(e.target.value as Position | 'all' | 'none')}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
        >
          <option value="all">Tất cả chức vụ</option>
          <option value="none">Chưa có chức vụ</option>
          {POSITIONS.map(pos => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>
        <select
          value={filterDepartment}
          onChange={(e) => setFilterDepartment(e.target.value)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
        >
          <option value="all">Tất cả phòng ban</option>
          <option value="none">Chưa có phòng ban</option>
          {departments.map(dept => (
            <option key={dept.id} value={dept.id}>{dept.name}</option>
          ))}
        </select>
        <select
          value={filterBranch}
          onChange={(e) => setFilterBranch(e.target.value)}
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
        >
          <option value="all">Tất cả chi nhánh</option>
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
          className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
        >
          <option value="">Tất cả dự án</option>
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
                  Sinh nhật tháng {currentMonth} ({birthdayUsers.length} người)
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
                              {isToday && <span className="text-xs bg-pink-500 text-white px-2 py-0.5 rounded-full">Hôm nay!</span>}
                            </p>
                            <p className="text-xs text-slate-500">{dept?.name || 'Chưa có phòng ban'}</p>
                            <p className="text-xs text-slate-400">{user.position || 'Chưa có chức vụ'}</p>
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
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {POSITIONS.map((position, index) => {
          const colors = [
            'text-purple-600',
            'text-blue-600',
            'text-indigo-600',
            'text-cyan-600',
            'text-emerald-600',
            'text-green-600'
          ];
          const count = users.filter(u => (u.role === 'admin' || u.approved) && u.position === position).length;
          return (
            <div key={position} className="bg-[#5e3ed0]/20 backdrop-blur-md p-4 rounded-xl border border-white/10 hover:bg-[#5e3ed0]/30 transition-colors">
              <p className="text-sm text-slate-300">{position}</p>
              <p className={`text-2xl font-bold ${colors[index]}`}>{count}</p>
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
                Tài khoản chờ duyệt ({pendingUsers.length})
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
              <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full">
                  <thead className="bg-orange-500/20 border-b border-white/10">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-orange-200 uppercase">Tên</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-orange-200 uppercase">Email</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-orange-200 uppercase">Vai trò</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-orange-200 uppercase">Ngày đăng ký</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-orange-200 uppercase">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {pendingUsers.map((user) => (
                      <tr key={user.uid} className="hover:bg-white/5">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="font-medium text-white">{user.displayName}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-300">{user.email}</td>
                        <td className="px-6 py-4 whitespace-nowrap">{getRoleBadge(user.role)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-slate-300">
                          {user.createdAt?.toLocaleDateString('vi-VN')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <button
                            onClick={() => handleApprove(user, true)}
                            className="text-green-600 hover:text-green-800 mr-3 inline-flex items-center gap-1 px-3 py-1 bg-green-100 rounded-lg font-medium"
                            title="Duyệt tài khoản"
                          >
                            <CheckCircle size={16} />
                            Duyệt
                          </button>
                          <button
                            onClick={() => handleDelete(user)}
                            className="text-red-600 hover:text-red-800 inline-flex items-center gap-1 px-3 py-1 bg-red-100 rounded-lg font-medium"
                            title="Từ chối"
                          >
                            <Trash2 size={16} />
                            Từ chối
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
        <h3 className="text-lg font-bold text-white mb-4">Danh sách người dùng</h3>
        <div className="bg-[#5e3ed0]/20 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full">
              <thead className="bg-[#5e3ed0]/40 border-b border-white/10 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase sticky left-0 bg-[#311898]">Tên</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Email</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Vai trò</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Chức vụ</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Phòng ban</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Dự án</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-slate-300 uppercase">Giờ học</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase">Lương</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-slate-300 uppercase">Ngày tạo</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-slate-300 uppercase sticky right-0 bg-[#311898]">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
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
                      className="hover:bg-white/5 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-4 whitespace-nowrap sticky left-0 bg-[#311898]">
                        <div className="font-medium text-[#53cafd]">{user.displayName}</div>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-slate-300 text-sm">{user.email}</td>
                      <td className="px-4 py-4 whitespace-nowrap">{getRoleBadge(user.role)}</td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {user.position ? (
                          <div className="flex items-center gap-1">
                            <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
                              {user.position}
                            </span>
                            {user.departmentId && departments.find(d => d.managerId === user.uid) && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium flex items-center gap-1">
                                <Users size={12} />
                                TP
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-slate-300 text-sm">
                        {getDepartmentName(user.departmentId)}
                      </td>
                      <td className="px-4 py-4">
                        {user.projectNames && user.projectNames.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {user.projectNames.map((projectName, idx) => (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-1 bg-purple-500/20 text-purple-300 rounded-md text-xs font-medium"
                              >
                                {projectName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-sm">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-center">
                        <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                          {(user.totalLearningHours || 0).toFixed(1)}h
                        </span>
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right text-white font-medium text-sm">
                        {user.monthlySalary ? `${(user.monthlySalary / 1000000).toFixed(1)}tr` : '-'}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-slate-300 text-sm">
                        {user.createdAt?.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })}
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap text-right sticky right-0 bg-[#311898]" onClick={(e) => e.stopPropagation()}>
                        {currentUser?.role === 'admin' ? (
                          // Admin có thể sửa/xóa
                          user.role === 'admin' ? (
                            <div className="inline-flex items-center gap-1 px-3 py-1 bg-red-50 text-red-600 rounded-lg text-sm">
                              <Shield size={14} />
                              <span className="font-medium">Được bảo vệ</span>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleEdit(user);
                                }}
                                className="text-blue-600 hover:text-blue-800 mr-3"
                                title="Chỉnh sửa"
                              >
                                <Edit2 size={18} />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDelete(user);
                                }}
                                className="text-red-600 hover:text-red-800"
                                title="Xóa"
                              >
                                <Trash2 size={18} />
                              </button>
                            </>
                          )
                        ) : (
                          // Trưởng phòng chỉ xem
                          <span className="text-slate-400 text-sm">Chỉ xem</span>
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
              Hiển thị{' '}
              <span className="font-semibold">
                {(currentPage - 1) * PAGE_SIZE + 1}-
                {Math.min(currentPage * PAGE_SIZE, filteredUsers.length)}
              </span>{' '}
              trong tổng số <span className="font-semibold">{filteredUsers.length}</span> người dùng
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1 rounded-lg border border-slate-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                Trước
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
                Sau
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-[#311898]/90 backdrop-blur-xl rounded-2xl shadow-2xl w-full max-w-4xl my-8 max-h-[90vh] overflow-hidden flex flex-col border border-white/10">
            <div className="flex justify-between items-center p-6 border-b border-white/10 bg-[#5e3ed0]/20">
              <h3 className="text-xl font-bold text-white">
                {editingUser ? 'Chỉnh sửa người dùng' : 'Thêm người dùng mới'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white">
                <X size={24} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Left Column */}
                <div className="space-y-4 md:col-span-1">
                  <h4 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-2">Thông tin tài khoản</h4>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Họ và tên *</label>
                    <input
                      type="text"
                      value={formData.displayName}
                      onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Email *</label>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Mật khẩu *</label>
                    <input
                      type="text"
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Vai trò</label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898]"
                    >
                      <option value="staff">Nhân viên</option>
                      <option value="teacher">Giáo viên</option>
                      <option value="student">Học viên</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Chức vụ</label>
                    <select
                      value={formData.position}
                      onChange={(e) => setFormData({ ...formData, position: e.target.value as Position | '' })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898]"
                    >
                      <option value="">-- Chọn chức vụ --</option>
                      {POSITIONS.map(pos => (
                        <option key={pos} value={pos}>{pos}</option>
                      ))}
                    </select>
                  </div>

                  {formData.role === 'staff' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Phòng ban</label>
                        <select
                          value={formData.departmentId}
                          onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898]"
                        >
                          <option value="">-- Chọn phòng ban --</option>
                          {departments.map(dept => (
                            <option key={dept.id} value={dept.id}>{dept.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1">Lương tháng (VNĐ)</label>
                        <input
                          type="number"
                          value={formData.monthlySalary}
                          onChange={(e) => setFormData({ ...formData, monthlySalary: Number(e.target.value) })}
                          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                          placeholder="Ví dụ: 10000000"
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Right Column - Thông tin cá nhân & avatar */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-2">Thông tin cá nhân</h4>

                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center">
                      {formData.photoURL ? (
                        <img
                          src={formData.photoURL}
                          alt={formData.displayName || 'Avatar'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-slate-500 text-sm">
                          {formData.displayName ? formData.displayName.charAt(0).toUpperCase() : '?'}
                        </span>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-slate-300 mb-1">Avatar URL</label>
                      <input
                        type="text"
                        value={formData.photoURL}
                        onChange={(e) => setFormData({ ...formData, photoURL: e.target.value })}
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white text-xs"
                        placeholder="https://..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Ngày sinh</label>
                    <input
                      type="date"
                      value={formData.dateOfBirth}
                      onChange={(e) => setFormData({ ...formData, dateOfBirth: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Số điện thoại</label>
                    <input
                      type="tel"
                      value={formData.phoneNumber}
                      onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                      placeholder="0123456789"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Địa chỉ</label>
                    <input
                      type="text"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                      placeholder="123 Đường ABC, Quận 1"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Quốc gia</label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                      placeholder="Việt Nam"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Vị trí làm việc</label>
                    <input
                      type="text"
                      value={formData.workLocation}
                      onChange={(e) => setFormData({ ...formData, workLocation: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                      placeholder="Văn phòng HN"
                    />
                  </div>
                </div>

                {/* Third Column - Thông tin nhân sự */}
                <div className="space-y-4">
                  <h4 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-2">Thông tin nhân sự (tùy chọn)</h4>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Trạng thái làm việc</label>
                    <input
                      type="text"
                      value={formData.employmentStatus}
                      onChange={(e) => setFormData({ ...formData, employmentStatus: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                      placeholder="Nhân viên chính thức / Thử việc / Thực tập..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Ngày bắt đầu làm</label>
                    <input
                      type="date"
                      value={formData.employmentStartDate}
                      onChange={(e) => setFormData({ ...formData, employmentStartDate: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Tình trạng hôn nhân</label>
                    <input
                      type="text"
                      value={formData.employmentMaritalStatus}
                      onChange={(e) => setFormData({ ...formData, employmentMaritalStatus: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                      placeholder="Độc thân / Đã kết hôn..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Chi nhánh</label>
                    <input
                      type="text"
                      value={formData.employmentBranch}
                      onChange={(e) => setFormData({ ...formData, employmentBranch: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                      placeholder="Hà Nội / Hồ Chí Minh..."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Team</label>
                    <input
                      type="text"
                      value={formData.employmentTeam}
                      onChange={(e) => setFormData({ ...formData, employmentTeam: e.target.value })}
                      className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                      placeholder="Frontend Team, Backend Team..."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-1">% lương</label>
                      <input
                        type="number"
                        value={formData.employmentSalaryPercentage}
                        onChange={(e) => setFormData({ ...formData, employmentSalaryPercentage: Number(e.target.value) })}
                        className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                        placeholder="Ví dụ: 100"
                      />
                    </div>
                    <div className="flex items-center gap-2 mt-6">
                      <input
                        id="employmentActive"
                        type="checkbox"
                        checked={formData.employmentActive}
                        onChange={(e) => setFormData({ ...formData, employmentActive: e.target.checked })}
                        className="w-4 h-4 text-brand-600 rounded focus:ring-brand-500"
                      />
                      <label htmlFor="employmentActive" className="text-sm text-slate-300">
                        Đang active trong hệ thống nhân sự
                      </label>
                    </div>
                  </div>

                  {/* Projects Section */}
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <h4 className="text-sm font-semibold text-slate-300 mb-4">Dự án</h4>
                    <div>
                      <label className="block text-sm font-medium text-slate-300 mb-2">
                        Chọn dự án
                        {formData.projects.length > 0 && (
                          <span className="ml-2 text-xs text-[#53cafd]">
                            ({formData.projects.length} dự án đã chọn)
                          </span>
                        )}
                      </label>
                      <div className="space-y-2 max-h-48 overflow-y-auto border border-white/10 rounded-lg p-2 bg-white/5">
                        {projects.length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-4">Chưa có dự án nào. Vui lòng tạo dự án trước.</p>
                        ) : (
                          projects.map(project => {
                            const isChecked = formData.projects.includes(project.id);
                            return (
                              <label
                                key={project.id}
                                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                                  isChecked 
                                    ? 'bg-[#53cafd]/20 border border-[#53cafd]/30' 
                                    : 'hover:bg-white/10 border border-transparent'
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
                                  className="w-4 h-4 text-[#53cafd] bg-white/5 border-white/20 rounded focus:ring-[#53cafd] focus:ring-2"
                                />
                                <span className={`text-sm flex-1 ${isChecked ? 'text-white font-medium' : 'text-slate-300'}`}>
                                  {project.name}
                                </span>
                                {isChecked && (
                                  <span className="text-xs text-[#53cafd]">✓</span>
                                )}
                              </label>
                            );
                          })
                        )}
                      </div>
                      {formData.projects.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {formData.projects.map(projectId => {
                            const project = projects.find(p => p.id === projectId);
                            return project ? (
                              <span
                                key={projectId}
                                className="inline-flex items-center px-2 py-1 bg-[#53cafd]/20 text-[#53cafd] rounded-md text-xs font-medium"
                              >
                                {project.name}
                              </span>
                            ) : null;
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t border-white/10 bg-[#5e3ed0]/20">
              <Button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 bg-[#53cafd] hover:bg-[#3db9f5] text-white border-none shadow-lg shadow-[#53cafd]/20">
                <Save size={18} />
                {editingUser ? 'Cập nhật' : 'Thêm mới'}
              </Button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-white/10 rounded-lg hover:bg-white/10 bg-white/5 text-white"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {/* User Detail Modal */}
      {showDetailModal && viewingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#311898]/90 backdrop-blur-xl rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-white/10">
            {/* Header */}
            <div className="p-6 border-b border-white/10 bg-[#5e3ed0]/20">
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
                    <h3 className="text-2xl font-bold text-white">{viewingUser.displayName}</h3>
                    <p className="text-slate-300">{viewingUser.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#53cafd]" />
                  Thông tin cơ bản
                </h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <p className="text-sm text-slate-300 mb-1">Vai trò</p>
                    <div>{getRoleBadge(viewingUser.role)}</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <p className="text-sm text-slate-300 mb-1">Chức vụ</p>
                    {viewingUser.position ? (
                      <div className="flex flex-col gap-2">
                        <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium inline-block w-fit">
                          {viewingUser.position}
                        </span>
                        {viewingUser.position === 'Trưởng phòng' && viewingUser.departmentId && (
                          <span className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium inline-flex items-center gap-1 w-fit">
                            <Users size={14} />
                            Quản lý phòng ban
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-400">Chưa có</p>
                    )}
                  </div>
                  <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <p className="text-sm text-slate-300 mb-1">Phòng ban</p>
                    <p className="font-medium text-white">{getDepartmentName(viewingUser.departmentId)}</p>
                  </div>
                  <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                    <p className="text-sm text-slate-300 mb-1">Trạng thái</p>
                    {viewingUser.role === 'admin' ? (
                      <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                        Admin
                      </span>
                    ) : viewingUser.approved ? (
                      <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        Đã duyệt
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-medium">
                        Chờ duyệt
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Learning Stats */}
              <div>
                <h4 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-[#53cafd]" />
                  Thống kê học tập
                </h4>
                {loadingStats ? (
                  <div className="text-center py-8">
                    <div className="w-12 h-12 border-4 border-[#53cafd] border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <p className="text-slate-300 mt-2">Đang tải...</p>
                  </div>
                ) : userLearningStats ? (
                  <div className="space-y-4">
                    {/* Stats Cards */}
                    <div className="grid grid-cols-4 gap-3">
                      <div className="bg-[#5e3ed0]/20 p-4 rounded-xl border border-white/10">
                        <p className="text-xs text-slate-300 mb-1">Tổng khóa học</p>
                        <p className="text-2xl font-bold text-white">{userLearningStats.totalCourses}</p>
                      </div>
                      <div className="bg-[#5e3ed0]/20 p-4 rounded-xl border border-white/10">
                        <p className="text-xs text-slate-300 mb-1">Hoàn thành</p>
                        <p className="text-2xl font-bold text-white">{userLearningStats.completedCourses}</p>
                      </div>
                      <div className="bg-[#5e3ed0]/20 p-4 rounded-xl border border-white/10">
                        <p className="text-xs text-slate-300 mb-1">Đang học</p>
                        <p className="text-2xl font-bold text-white">{userLearningStats.inProgressCourses}</p>
                      </div>
                      <div className="bg-[#5e3ed0]/20 p-4 rounded-xl border border-white/10">
                        <p className="text-xs text-slate-300 mb-1">Tiến độ TB</p>
                        <p className="text-2xl font-bold text-white">{userLearningStats.averageProgress.toFixed(0)}%</p>
                      </div>
                    </div>

                    {/* Learning Time & Salary */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-[#5e3ed0]/20 p-6 rounded-xl border border-white/10">
                        <p className="text-sm text-slate-300 mb-2">Tổng thời gian học</p>
                        {(() => {
                          const totalHours = viewingUser.totalLearningHours || 0;
                          const hours = Math.floor(totalHours);
                          const minutes = Math.floor((totalHours % 1) * 60);

                          return (
                            <div className="flex items-baseline gap-2">
                              <p className="text-3xl font-bold text-white">{hours}</p>
                              <span className="text-base font-semibold text-slate-300">giờ</span>
                              <p className="text-2xl font-bold text-white">{minutes}</p>
                              <span className="text-base font-semibold text-slate-300">phút</span>
                            </div>
                          );
                        })()}
                      </div>
                      <div className="bg-[#5e3ed0]/20 p-6 rounded-xl border border-white/10">
                        <p className="text-sm text-slate-300 mb-2">Lương tháng</p>
                        <p className="text-2xl font-bold text-white">
                          {viewingUser.monthlySalary ? `${viewingUser.monthlySalary.toLocaleString('vi-VN')}đ` : 'Chưa có'}
                        </p>
                      </div>
                    </div>

                    {/* Quiz Stats */}
                    {userLearningStats.totalQuizzes > 0 && (
                      <div className="bg-[#5e3ed0]/20 p-4 rounded-xl border border-white/10">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm text-slate-300 mb-1">Bài kiểm tra</p>
                            <p className="text-xl font-bold text-white">{userLearningStats.totalQuizzes} bài</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm text-slate-300 mb-1">Điểm trung bình</p>
                            <p className="text-xl font-bold text-white">{userLearningStats.averageQuizScore.toFixed(1)}/100</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Recent Courses */}
                    {userLearningStats.recentCourses.length > 0 && (
                      <div>
                        <h5 className="text-sm font-bold text-slate-300 mb-3">Khóa học gần đây</h5>
                        <div className="space-y-2">
                          {userLearningStats.recentCourses.map((course, index) => (
                            <div key={course.courseId || `course-${index}`} className="bg-white/5 p-3 rounded-lg border border-white/10">
                              <div className="flex items-center justify-between mb-2">
                                <p className="text-sm font-medium text-white line-clamp-1">{course.title}</p>
                                <span className="text-sm font-bold text-[#53cafd]">{course.progress.toFixed(0)}%</span>
                              </div>
                              <div className="w-full bg-white/10 rounded-full h-2">
                                <div
                                  className="bg-[#53cafd] h-2 rounded-full transition-all"
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
                  <div className="text-center py-8 bg-white/5 rounded-xl border border-white/10">
                    <p className="text-slate-300">Chưa có dữ liệu học tập</p>
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div>
                <h4 className="text-lg font-bold text-white mb-4">Thời gian</h4>
                <div className="space-y-3">
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">Ngày tạo</p>
                      <p className="text-sm text-slate-300">
                        {viewingUser.createdAt?.toLocaleDateString('vi-VN', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                    <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-white">Cập nhật lần cuối</p>
                      <p className="text-sm text-slate-300">
                        {viewingUser.updatedAt?.toLocaleDateString('vi-VN', {
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
            <div className="p-6 border-t border-white/10 bg-[#5e3ed0]/20 flex gap-3">
              {viewingUser.role !== 'admin' && (
                <Button
                  onClick={() => {
                    setShowDetailModal(false);
                    handleEdit(viewingUser);
                  }}
                  className="flex-1 bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white"
                >
                  Chỉnh sửa
                </Button>
              )}
              <Button
                onClick={() => setShowDetailModal(false)}
                className="flex-1 bg-white/10 hover:bg-white/20 border-none text-white"
              >
                Đóng
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
