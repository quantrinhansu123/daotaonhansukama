'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { Course } from '@/types/course';
import { Search, Plus, Edit2, Trash2, X, Save, BookOpen, Users, Clock, Layers, Signal, GraduationCap, Filter } from 'lucide-react';
import { Button } from '@/components/Button';
import { CourseDetailPage } from './CourseDetailPage';
import { BunnyImageUpload } from '@/components/shared/BunnyImageUpload';
import { CloudFlyVideoUpload } from '@/components/shared/CloudFlyVideoUpload';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';

interface CourseManagementProps {
  onNavigateToApproval?: () => void;
}

export const CourseManagement: React.FC<CourseManagementProps> = () => {
  const { userProfile: currentUser } = useAuth();
  const { hasPermission } = usePermissions();
  const { t, dateLocale } = useLanguage();
  const [courses, setCourses] = useState<Course[]>([]);
  const [filteredCourses, setFilteredCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterProjectId, setFilterProjectId] = useState<string>('');
  const [showModal, setShowModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [detailCourse, setDetailCourse] = useState<Course | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '',
    level: 'beginner' as 'beginner' | 'intermediate' | 'advanced',
    duration: 0,
    price: 0,
    thumbnail: '',
    banner: '',
    demoVideoId: '',
    demoVideoKey: '',
    departmentId: '',
    projects: [] as string[]
  });
  const [departments, setDepartments] = useState<Array<{ id: string, name: string, managerId?: string, managerName?: string }>>([]);
  const [users, setUsers] = useState<Array<{ uid: string, departmentId?: string }>>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const canManageCourses = currentUser?.role === 'admin' || hasPermission('manage_courses');
  const isDepartmentLead = ['Trưởng phòng', 'Phó phòng', 'TrÆ°á»Ÿng phÃ²ng', 'PhÃ³ phÃ²ng'].includes(currentUser?.position || '');

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterCourses();
  }, [courses, searchTerm, filterLevel, filterCategory, filterProjectId, users, currentUser?.role, currentUser?.position, currentUser?.departmentId]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load projects first
      const projectsSnapshot = await getDocs(collection(db, 'projects'));
      const projectsData = projectsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || '',
      }));
      setProjects(projectsData);

      const coursesRef = collection(db, 'courses');
      const coursesSnapshot = await getDocs(coursesRef);
      const coursesData = coursesSnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Course[];

      // Enrich courses with project names
      const enrichedCourses = coursesData.map(course => {
        const projectNames = course.projects?.map(projectId => {
          const project = projectsData.find(p => p.id === projectId);
          return project?.name || '';
        }).filter(Boolean) || [];
        return {
          ...course,
          projectNames,
        };
      });

      setCourses(enrichedCourses);

      // Load departments
      const deptSnapshot = await getDocs(collection(db, 'departments'));
      const depts = deptSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name
      }));
      setDepartments(depts);

      // Load users (chỉ cần uid và departmentId)
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        uid: doc.data().uid,
        departmentId: doc.data().departmentId
      }));
      setUsers(usersData);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterCourses = () => {
    let filtered = courses;

    // Nếu là trưởng phòng (không phải admin), chỉ thấy khóa học có nhân viên phòng mình được add vào
    if (currentUser?.role !== 'admin' && isDepartmentLead && currentUser?.departmentId) {
      filtered = filtered.filter(course => {
        if (course.departmentId === currentUser.departmentId) return true;
        // Kiểm tra xem có nhân viên nào trong phòng được add vào khóa học này không
        if (course.students && course.students.length > 0) {
          return course.students.some(studentId => {
            const user = users.find(u => u.uid === studentId);
            return user && user.departmentId === currentUser.departmentId;
          });
        }
        return false;
      });
    }

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(course =>
        course.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        course.description.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Level filter
    if (filterLevel !== 'all') {
      filtered = filtered.filter(course => course.level === filterLevel);
    }

    // Category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(course => course.category === filterCategory);
    }

    // Project filter
    if (filterProjectId) {
      filtered = filtered.filter(course =>
        course.projects && course.projects.includes(filterProjectId)
      );
    }

    setFilteredCourses(filtered);
  };

  const getCategories = () => {
    const cats = new Set(courses.map(c => c.category));
    return Array.from(cats).sort();
  };

  const categories = getCategories();

  const handleAdd = () => {
    if (!canManageCourses) return;
    setEditingCourse(null);

    // Nếu là trưởng phòng, mặc định chọn phòng ban của mình
    const isManager = currentUser?.role !== 'admin' && isDepartmentLead && currentUser?.departmentId;
    const defaultDepartmentId = isManager ? currentUser.departmentId : '';

    setFormData({
      title: '',
      description: '',
      category: '',
      level: 'beginner',
      duration: 0,
      price: 0,
      thumbnail: '',
      banner: '',
      demoVideoId: '',
      demoVideoKey: '',
      departmentId: defaultDepartmentId || '',
      projects: []
    });
    setShowModal(true);
  };

  const handleEdit = (course: Course) => {
    if (!canManageCourses) return;
    setEditingCourse(course);
    setFormData({
      title: course.title || '',
      description: course.description || '',
      category: course.category || '',
      level: course.level || 'beginner',
      duration: course.duration || 0,
      price: course.price || 0,
      thumbnail: course.thumbnail || '',
      banner: course.banner || '',
      demoVideoId: course.demoVideoId || '',
      demoVideoKey: course.demoVideoKey || '',
      departmentId: course.departmentId || '',
      projects: Array.isArray(course.projects) ? course.projects : []
    });
    setShowModal(true);
  };

  const getStudentsForDepartment = async (departmentId: string): Promise<string[]> => {
    try {
      const usersRef = collection(db, 'users');
      const snapshot = await getDocs(usersRef);
      const users = snapshot.docs.map(doc => doc.data());

      console.log('📊 Total users in database:', users.length);
      console.log('🎯 Selected departmentId:', departmentId);

      if (departmentId === 'all') {
        // Chung: lấy tất cả nhân viên (staff, teacher, student) đã được duyệt hoặc admin
        const allUsers = users.filter(u => {
          const isValidRole = u.role === 'staff' || u.role === 'teacher' || u.role === 'student' || u.role === 'admin';
          const isApproved = u.role === 'admin' || u.approved === true;
          return isValidRole && isApproved;
        });
        console.log('🌐 Chung - Found users:', allUsers.length);
        return allUsers.map(u => u.uid);
      } else if (departmentId) {
        // Phòng ban cụ thể: lấy nhân viên của phòng ban đó (đã duyệt)
        const deptUsers = users.filter(u => {
          const matchDept = u.departmentId === departmentId;
          const isApproved = u.role === 'admin' || u.approved === true;
          return matchDept && isApproved;
        });
        console.log(`🏢 Phòng ban ${departmentId} - Found users:`, deptUsers.length);
        console.log('Users:', deptUsers.map(u => ({ uid: u.uid, name: u.displayName, dept: u.departmentId })));
        return deptUsers.map(u => u.uid);
      } else {
        // Không chọn: không có học viên nào
        console.log('🔒 Nháp - No users');
        return [];
      }
    } catch (error) {
      console.error('❌ Error getting students:', error);
      return [];
    }
  };

  // Helper function to remove undefined values from object - improved version
  const removeUndefined = (obj: any): any => {
    if (obj === null || obj === undefined) {
      return null;
    }
    if (Array.isArray(obj)) {
      return obj.map(item => removeUndefined(item));
    }
    if (obj instanceof Date) {
      return obj;
    }
    if (typeof obj !== 'object') {
      return obj;
    }
    
    const cleaned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (value !== undefined) {
          cleaned[key] = removeUndefined(value);
        }
      }
    }
    return cleaned;
  };

  const handleSave = async () => {
    if (!canManageCourses) return;
    try {
      if (!formData.title || !formData.category) {
        alert(t('admin.courses.fillRequired'));
        return;
      }

      console.log('💾 Saving course with departmentId:', formData.departmentId);
      console.log('🖼️ Thumbnail URL:', formData.thumbnail);
      console.log('🎨 Banner URL:', formData.banner);
      console.log('📦 Full formData:', formData);

      // Tự động cập nhật danh sách students dựa trên departmentId
      const students = await getStudentsForDepartment(formData.departmentId || '');

      console.log('✅ Students to be saved:', students.length, students);

      if (editingCourse) {
        const courseRef = doc(db, 'courses', editingCourse.id);
        
        // Build updateData with explicit values, no undefined allowed
        const updateData: Record<string, any> = {};
        
        // Required fields
        updateData.title = String(formData.title || '');
        updateData.description = String(formData.description || '');
        updateData.category = String(formData.category || '');
        updateData.level = String(formData.level || 'beginner');
        updateData.duration = Number(formData.duration) || 0;
        updateData.price = Number(formData.price) || 0;
        updateData.thumbnail = String(formData.thumbnail || '');
        updateData.students = Array.isArray(students) ? students : [];
        updateData.projects = Array.isArray(formData.projects) ? formData.projects : [];
        updateData.updatedAt = new Date();
        
        // Optional fields - explicitly set to null if empty
        updateData.banner = formData.banner && formData.banner.trim() !== '' ? String(formData.banner) : null;
        // Video intro is saved by the background upload. Do not overwrite a
        // completed upload with an older copy of this form.
        updateData.departmentId = formData.departmentId && formData.departmentId.trim() !== '' ? String(formData.departmentId) : null;
        
        // Final cleanup - remove any undefined that might have slipped through
        const cleanedData = removeUndefined(updateData);
        
        // Double check - remove any keys with undefined values
        const finalData: Record<string, any> = {};
        for (const key in cleanedData) {
          if (cleanedData[key] !== undefined) {
            finalData[key] = cleanedData[key];
          }
        }
        
        console.log('🧹 Final updateData:', finalData);
        console.log('🔍 Checking for undefined:', Object.keys(finalData).some(k => finalData[k] === undefined));
        
        await updateDoc(courseRef, finalData);
        alert(t('admin.courses.updateSuccess'));
      } else {
        // Build newCourse with explicit values
        const newCourse: Record<string, any> = {};
        
        newCourse.id = `course_${Date.now()}`;
        newCourse.title = String(formData.title || '');
        newCourse.description = String(formData.description || '');
        newCourse.category = String(formData.category || '');
        newCourse.level = String(formData.level || 'beginner');
        newCourse.duration = Number(formData.duration) || 0;
        newCourse.price = Number(formData.price) || 0;
        newCourse.thumbnail = String(formData.thumbnail || '');
        newCourse.teacherId = 'admin';
        newCourse.teacherName = 'Admin';
        newCourse.students = Array.isArray(students) ? students : [];
        newCourse.projects = Array.isArray(formData.projects) ? formData.projects : [];
        newCourse.createdAt = new Date();
        newCourse.updatedAt = new Date();
        
        // Optional fields
        newCourse.banner = formData.banner && formData.banner.trim() !== '' ? String(formData.banner) : null;
        newCourse.demoVideoId = formData.demoVideoId && formData.demoVideoId.trim() !== '' ? String(formData.demoVideoId) : null;
        newCourse.demoVideoKey = formData.demoVideoKey && formData.demoVideoKey.trim() !== '' ? String(formData.demoVideoKey) : null;
        newCourse.departmentId = formData.departmentId && formData.departmentId.trim() !== '' ? String(formData.departmentId) : null;
        
        // Final cleanup
        const cleanedCourse = removeUndefined(newCourse);
        
        // Double check
        const finalCourse: Record<string, any> = {};
        for (const key in cleanedCourse) {
          if (cleanedCourse[key] !== undefined) {
            finalCourse[key] = cleanedCourse[key];
          }
        }
        
        console.log('🧹 Final newCourse:', finalCourse);
        console.log('🔍 Checking for undefined:', Object.keys(finalCourse).some(k => finalCourse[k] === undefined));
        
        await setDoc(doc(db, 'courses', finalCourse.id), finalCourse);
        alert(t('admin.courses.createSuccess'));
      }

      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving course:', error);
      alert(t('admin.courses.saveError'));
    }
  };

  const handleDelete = async (course: Course) => {
    if (!canManageCourses) return;
    if (!confirm(t('admin.courses.confirmDelete', { title: course.title }))) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'courses', course.id));
      alert(t('admin.courses.deleteSuccess'));
      loadData();
    } catch (error) {
      console.error('Error deleting course:', error);
      alert(t('admin.courses.deleteError'));
    }
  };

  const getLevelBadge = (level: string) => {
    const styles = {
      beginner: 'bg-[#edf7ee] text-[#1B7A1E] border border-[#1B7A1E]/30',
      intermediate: 'bg-amber-100 text-amber-800 border border-amber-200',
      advanced: 'bg-rose-100 text-rose-700 border border-rose-200'
    };
    const labels = {
      beginner: t('admin.courses.levelBeginner'),
      intermediate: t('admin.courses.levelIntermediate'),
      advanced: t('admin.courses.levelAdvanced')
    };
    return (
      <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap ${styles[level as keyof typeof styles]}`}>
        {labels[level as keyof typeof labels]}
      </span>
    );
  };

  const hasActiveFilters =
    Boolean(searchTerm) ||
    filterLevel !== 'all' ||
    filterCategory !== 'all' ||
    Boolean(filterProjectId);

  const clearFilters = () => {
    setSearchTerm('');
    setFilterLevel('all');
    setFilterCategory('all');
    setFilterProjectId('');
  };

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center bg-white p-8">
        <div className="space-y-3 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-[#1B7A1E] border-t-transparent" />
          <p className="text-sm text-[#475569]">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  // Show course detail page
  if (detailCourse) {
    return (
      <CourseDetailPage
        course={detailCourse}
        onBack={() => setDetailCourse(null)}
        isAdmin={canManageCourses}
        onDelete={() => {
          setDetailCourse(null);
          loadData();
        }}
      />
    );
  }



  return (
    <div className="min-h-screen max-w-[1400px] space-y-6 bg-white p-6 text-[#111b38] lg:p-8">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#1B7A1E]">
            BioKama Learning
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-[#111b38] lg:text-3xl">
            {t('admin.courses.title')}
          </h2>
          <p className="max-w-xl text-sm text-[#475569]">
            {t('admin.courses.pageSubtitle')}
          </p>
          {currentUser?.role !== 'admin' && isDepartmentLead && currentUser?.departmentId && (
            <p className="mt-1 text-sm text-[#1B7A1E]">
              {t('admin.courses.managerScope')}: <strong>{departments.find(d => d.id === currentUser.departmentId)?.name}</strong>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {canManageCourses && <button
            type="button"
            onClick={async () => {
              if (!confirm(t('admin.courses.syncStudentsConfirm'))) {
                return;
              }
              setLoading(true);
              try {
                let updated = 0;
                for (const course of courses) {
                  const students = await getStudentsForDepartment(course.departmentId || '');
                  await updateDoc(doc(db, 'courses', course.id), { students });
                  updated++;
                }
                alert(t('admin.courses.syncStudentsSuccess', { count: updated }));
                loadData();
              } catch (error) {
                console.error('Error updating students:', error);
                alert(t('admin.courses.syncStudentsError'));
              } finally {
                setLoading(false);
              }
            }}
            className="inline-flex items-center gap-2 rounded-lg border border-[#1B7A1E] bg-white px-3.5 py-2 text-sm font-medium text-[#1B7A1E] transition-colors hover:bg-[#edf7ee]"
          >
            <Users size={16} />
            {t('admin.courses.syncStudents')}
          </button>}
          {canManageCourses && (
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1B7A1E] px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-[#1B7A1E]/20 transition-colors hover:bg-[#156318]"
            >
              <Plus size={16} />
              {t('admin.courses.addCourse')}
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: t('admin.courses.totalCourses'), value: courses.length, icon: Layers },
          { label: t('admin.courses.levelBeginner'), value: courses.filter(c => c.level === 'beginner').length, icon: GraduationCap },
          { label: t('admin.courses.levelIntermediate'), value: courses.filter(c => c.level === 'intermediate').length, icon: Signal },
          { label: t('admin.courses.levelAdvanced'), value: courses.filter(c => c.level === 'advanced').length, icon: BookOpen },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className="rounded-xl border border-[#1B7A1E] bg-white p-4 transition-colors hover:bg-[#f3faf4]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-[#66718b]">{stat.label}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-tight text-[#1B7A1E]">{stat.value}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#1B7A1E]/30 bg-[#edf7ee] text-[#1B7A1E]">
                  <Icon size={18} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="space-y-3 rounded-xl border border-[#1B7A1E] bg-white p-3 lg:p-4">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={18} />
          <input
            type="text"
            placeholder={t('admin.courses.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-[#1B7A1E] bg-white py-2.5 pl-11 pr-4 text-sm text-[#111b38] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
          />
        </div>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={14} />
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value as any)}
              className="w-full appearance-none rounded-lg border border-[#1B7A1E] bg-white py-2.5 pl-9 pr-8 text-sm text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
              aria-label={t('admin.courses.filterByLevel')}
            >
              <option value="all">{t('admin.courses.allLevels')}</option>
              <option value="beginner">{t('admin.courses.levelBeginner')}</option>
              <option value="intermediate">{t('admin.courses.levelIntermediate')}</option>
              <option value="advanced">{t('admin.courses.levelAdvanced')}</option>
            </select>
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full appearance-none rounded-lg border border-[#1B7A1E] bg-white px-3.5 py-2.5 text-sm text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
            aria-label={t('admin.courses.filterByCategory')}
          >
            <option value="all">{t('admin.courses.allCategories')}</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="w-full appearance-none rounded-lg border border-[#1B7A1E] bg-white px-3.5 py-2.5 text-sm text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
            aria-label={t('admin.courses.filterByProject')}
          >
            <option value="">{t('admin.courses.allProjects')}</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between px-0.5 text-xs text-[#66718b]">
          <span>{t('admin.courses.showingCount', { count: filteredCourses.length, total: courses.length })}</span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="font-medium text-[#1B7A1E] transition-colors hover:text-[#156318]"
            >
              {t('admin.courses.clearFilters')}
            </button>
          )}
        </div>
      </div>

      {/* Course list */}
      <div className="overflow-hidden rounded-xl border border-[#1B7A1E] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse bg-white">
            <thead>
              <tr className="border-b border-[#1B7A1E] bg-white">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1B7A1E]">
                  {t('admin.courses.courseName')}
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1B7A1E]">
                  {t('admin.courses.category')}
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1B7A1E]">
                  {t('admin.courses.level')}
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1B7A1E]">
                  {t('admin.courses.audience')}
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1B7A1E]">
                  {t('admin.courses.projectsLabel')}
                </th>
                <th className="px-4 py-3.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1B7A1E]">
                  {t('admin.courses.students')}
                </th>
                <th className="px-4 py-3.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1B7A1E]">
                  {t('admin.courses.durationLabel')}
                </th>
                <th className="w-[1%] whitespace-nowrap px-5 py-3.5 text-right text-[11px] font-semibold uppercase tracking-[0.08em] text-[#1B7A1E]">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredCourses.map((course) => (
                <tr key={course.id} className="border-b border-[#d8ecd9] bg-white transition-colors hover:bg-[#f3faf4]">
                  <td className="px-5 py-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="h-11 w-11 flex-shrink-0 overflow-hidden rounded-xl border border-[#1B7A1E]/30 bg-[#edf7ee]">
                        {course.thumbnail ? (
                          <img
                            src={proxyBunnyUrl(course.thumbnail)}
                            alt=""
                            className="h-full w-full object-cover"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                              const fallback = e.currentTarget.nextElementSibling as HTMLElement | null;
                              if (fallback) fallback.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div
                          className="h-full w-full items-center justify-center text-[#1B7A1E]"
                          style={{ display: course.thumbnail ? 'none' : 'flex' }}
                        >
                          <BookOpen size={18} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[#111b38]">{course.title}</div>
                        <div className="mt-0.5 line-clamp-1 text-xs text-[#94a3b8]">{course.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-[#475569]">
                    {course.category || <span className="text-[#94a3b8]">—</span>}
                  </td>
                  <td className="px-4 py-4">
                    {getLevelBadge(course.level)}
                  </td>
                  <td className="px-4 py-4">
                    {course.departmentId === 'all' ? (
                      <span className="inline-flex rounded-md border border-[#1B7A1E]/30 bg-[#edf7ee] px-2.5 py-1 text-xs font-medium text-[#1B7A1E]">
                        {t('admin.courses.audienceAllShort')}
                      </span>
                    ) : course.departmentId ? (
                      <span className="inline-flex rounded-md border border-[#1B7A1E]/30 bg-[#edf7ee] px-2.5 py-1 text-xs font-medium text-[#1B7A1E]">
                        {departments.find(d => d.id === course.departmentId)?.name || 'N/A'}
                      </span>
                    ) : (
                      <span className="inline-flex rounded-md border border-[#d8ecd9] bg-[#f5f8fc] px-2.5 py-1 text-xs font-medium text-[#66718b]">
                        {t('admin.courses.draft')}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    {course.projectNames && course.projectNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {course.projectNames.slice(0, 2).map((projectName, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center rounded-md border border-[#1B7A1E]/30 bg-[#edf7ee] px-2 py-0.5 text-[11px] font-medium text-[#1B7A1E]"
                          >
                            {projectName}
                          </span>
                        ))}
                        {course.projectNames.length > 2 && (
                          <span className="text-[11px] text-[#94a3b8]">+{course.projectNames.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-[#94a3b8]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center gap-1.5 text-sm text-[#1B7A1E]">
                      <Users size={14} className="text-[#94a3b8]" />
                      {course.students?.length || 0}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center gap-1.5 text-sm text-[#475569]">
                      <Clock size={14} className="text-[#94a3b8]" />
                      {course.duration}h
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-5 py-4">
                    <div className="inline-flex flex-nowrap items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDetailCourse(course)}
                        className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1B7A1E] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#156318]"
                        title={t('admin.courses.classDetail')}
                      >
                        <BookOpen size={14} className="shrink-0" />
                        <span className="whitespace-nowrap">{t('common.details')}</span>
                      </button>
                      {canManageCourses && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEdit(course)}
                            className="inline-flex shrink-0 rounded-lg p-2 text-[#1B7A1E] transition-colors hover:bg-[#edf7ee]"
                            title={t('common.edit')}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(course)}
                            className="inline-flex shrink-0 rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
                            title={t('common.delete')}
                          >
                            <Trash2 size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredCourses.length === 0 && (
          <div className="px-6 py-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#1B7A1E]/30 bg-[#edf7ee]">
              <BookOpen className="h-7 w-7 text-[#1B7A1E]" />
            </div>
            <p className="mb-1 font-medium text-[#111b38]">
              {searchTerm || filterProjectId || filterCategory !== 'all' || filterLevel !== 'all'
                ? t('admin.courses.noMatchFilter')
                : t('admin.courses.notFound')}
            </p>
            <p className="text-sm text-[#475569]">
              {currentUser?.role === 'admin' ? t('admin.courses.emptyHint') : t('admin.courses.emptyHintStaff')}
            </p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#1B7A1E] bg-white shadow-2xl">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#1B7A1E] px-6 py-4">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#1B7A1E]">Bunny Stream</p>
                <h3 className="text-lg font-semibold text-[#111b38]">
                  {editingCourse ? t('admin.courses.editCourse') : t('admin.courses.addCourseNew')}
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 text-[#66718b] hover:bg-[#edf7ee] hover:text-[#111b38]">
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 space-y-6 overflow-y-auto p-6">
              <section className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#66718b]">{t('admin.courses.formSectionBasic')}</h4>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#475569]">{t('admin.courses.courseName')} *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full rounded-lg border border-[#1B7A1E] bg-white px-3.5 py-2.5 text-sm text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#475569]">{t('admin.courses.description')}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full resize-none rounded-lg border border-[#1B7A1E] bg-white px-3.5 py-2.5 text-sm text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                  />
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#475569]">{t('admin.courses.category')} *</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder={t('admin.courses.categoryPlaceholder')}
                    className="w-full rounded-lg border border-[#1B7A1E] bg-white px-3.5 py-2.5 text-sm text-[#111b38] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#475569]">{t('admin.courses.level')}</label>
                    <select
                      value={formData.level}
                      onChange={(e) => setFormData({ ...formData, level: e.target.value as any })}
                      className="w-full rounded-lg border border-[#1B7A1E] bg-white px-3.5 py-2.5 text-sm text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
                    >
                      <option value="beginner">{t('admin.courses.levelBeginner')}</option>
                      <option value="intermediate">{t('admin.courses.levelIntermediate')}</option>
                      <option value="advanced">{t('admin.courses.levelAdvanced')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[#475569]">{t('admin.courses.durationHours')}</label>
                    <input
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                      className="w-full rounded-lg border border-[#1B7A1E] bg-white px-3.5 py-2.5 text-sm text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#66718b]">{t('admin.courses.formSectionAudience')}</h4>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-[#475569]">{t('admin.courses.audience')} *</label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    disabled={!!(currentUser?.role !== 'admin' && isDepartmentLead && currentUser?.departmentId)}
                    className="w-full rounded-lg border border-[#1B7A1E] bg-white px-3.5 py-2.5 text-sm text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] disabled:cursor-not-allowed disabled:opacity-60 [&>option]:bg-white [&>option]:text-[#111b38]"
                  >
                    <option value="">{t('admin.courses.audienceNone')}</option>
                    <option value="all">{t('admin.courses.audienceAll')}</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                  {currentUser?.role !== 'admin' && isDepartmentLead && currentUser?.departmentId ? (
                    <p className="mt-1.5 text-xs text-[#1B7A1E]">
                      {t('admin.courses.managerCreateHint')}
                    </p>
                  ) : (
                    <p className="mt-1.5 text-xs leading-relaxed text-[#66718b]">
                      {t('admin.courses.audienceHintAll')} · {t('admin.courses.audienceHintDept')} · {t('admin.courses.audienceHintNone')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#475569]">
                    {t('admin.courses.projectsLabel')}
                    {formData.projects.length > 0 && (
                      <span className="ml-2 text-xs text-[#1B7A1E]">
                        ({t('admin.courses.selectedProjectsCount', { count: formData.projects.length })})
                      </span>
                    )}
                  </label>
                  <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-[#1B7A1E] bg-white p-2">
                    {projects.length === 0 ? (
                      <p className="py-4 text-center text-xs text-[#94a3b8]">{t('admin.courses.noProjectsYet')}</p>
                    ) : (
                      projects.map(project => {
                        const isChecked = formData.projects.includes(project.id);
                        return (
                          <label
                            key={project.id}
                            className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 transition-colors ${
                              isChecked
                                ? 'border border-[#1B7A1E]/30 bg-[#edf7ee]'
                                : 'border border-transparent hover:bg-[#f3faf4]'
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
                              className="h-4 w-4 rounded border-[#1B7A1E] text-[#1B7A1E] focus:ring-[#1B7A1E]"
                            />
                            <span className={`flex-1 text-sm ${isChecked ? 'font-medium text-[#1B7A1E]' : 'text-[#475569]'}`}>
                              {project.name}
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                  {formData.projects.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {formData.projects.map(projectId => {
                        const project = projects.find(p => p.id === projectId);
                        return project ? (
                          <span
                            key={projectId}
                            className="inline-flex items-center rounded-md border border-[#1B7A1E]/25 bg-[#edf7ee] px-2 py-1 text-xs font-medium text-[#1B7A1E]"
                          >
                            {project.name}
                          </span>
                        ) : null;
                      })}
                    </div>
                  )}
                </div>
              </section>

              <section className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-[#66718b]">{t('admin.courses.formSectionMedia')}</h4>
                <BunnyImageUpload
                  label={t('admin.courses.thumbnailLabel')}
                  currentImage={formData.thumbnail}
                  onUploadStart={() => setUploadingThumbnail(true)}
                  onUploadEnd={() => setUploadingThumbnail(false)}
                  onUploadComplete={(url) => setFormData(prev => ({ ...prev, thumbnail: url }))}
                  folder="courses/thumbnails"
                  variant="light"
                />

                <div>
                  <BunnyImageUpload
                    label={t('admin.courses.bannerLabel')}
                    currentImage={formData.banner}
                    onUploadStart={() => setUploadingBanner(true)}
                    onUploadEnd={() => setUploadingBanner(false)}
                    onUploadComplete={(url) => setFormData(prev => ({ ...prev, banner: url }))}
                    folder="courses/banners"
                    variant="light"
                  />
                  <p className="mt-1.5 text-xs leading-relaxed text-[#66718b]">
                    {t('admin.courses.bannerRecommend')} · {t('admin.courses.bannerMaxSize')} · {t('admin.courses.bannerFormats')}
                  </p>
                  {uploadingBanner && (
                    <div className="mt-2 rounded-xl border border-[#1B7A1E]/25 bg-[#edf7ee] px-3 py-2">
                      <p className="text-xs font-medium text-[#1B7A1E]">{t('admin.courses.bannerUploading')}</p>
                    </div>
                  )}
                  {!uploadingBanner && formData.banner && (
                    <div className="mt-2 rounded-xl border border-[#1B7A1E]/25 bg-[#edf7ee] px-3 py-2">
                      <p className="text-xs font-medium text-[#1B7A1E]">{t('admin.courses.bannerUploaded')}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-[#1B7A1E] bg-white p-4">
                  {editingCourse ? (
                    <CloudFlyVideoUpload
                      key={editingCourse.id}
                      courseId={editingCourse.id}
                      label={t('admin.courses.videoDemoLabel')}
                      currentVideoKey={formData.demoVideoKey}
                      currentLegacyVideoId={formData.demoVideoId}
                      onUploadComplete={(key) => setFormData(prev => ({ ...prev, demoVideoKey: key, demoVideoId: '' }))}
                      onSaved={(key) => setCourses(previous => previous.map(item => item.id === editingCourse.id
                        ? { ...item, demoVideoKey: key || undefined, demoVideoId: undefined }
                        : item))}
                      variant="light"
                    />
                  ) : (
                    <p className="text-sm text-[#475569]">Lưu khóa học trước, sau đó mở lại để tải video giới thiệu lên CloudFly.</p>
                  )}
                </div>
              </section>
            </div>

            <div className="shrink-0 space-y-2 border-t border-[#1B7A1E] bg-white px-6 py-4">
              <div className="flex gap-3">
                <Button
                  onClick={handleSave}
                  disabled={uploadingThumbnail || uploadingBanner}
                  className="flex flex-1 items-center justify-center gap-2 border-none bg-[#1B7A1E] text-white hover:bg-[#156318] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Save size={18} />
                  {uploadingThumbnail || uploadingBanner ? t('admin.courses.uploadingImages') : t('common.save')}
                </Button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 rounded-xl border border-[#1B7A1E] px-4 py-2.5 text-sm font-medium text-[#1B7A1E] transition-colors hover:bg-[#edf7ee] disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
              </div>
              {(uploadingThumbnail || uploadingBanner) && (
                <p className="text-center text-xs text-amber-700">
                  {t('admin.courses.waitUploadBeforeSave')}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
