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
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';

interface CourseManagementProps {
  onNavigateToApproval?: () => void;
}

export const CourseManagement: React.FC<CourseManagementProps> = () => {
  const { userProfile: currentUser } = useAuth();
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

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterCourses();
  }, [courses, searchTerm, filterLevel, filterCategory, filterProjectId, users]);

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
    if (currentUser?.role !== 'admin' && currentUser?.position === 'Trưởng phòng' && currentUser?.departmentId) {
      filtered = filtered.filter(course => {
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
    setEditingCourse(null);

    // Nếu là trưởng phòng, mặc định chọn phòng ban của mình
    const isManager = currentUser?.role !== 'admin' && currentUser?.departmentId && departments.find(d => d.managerId === currentUser.uid);
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
      beginner: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
      intermediate: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
      advanced: 'bg-rose-500/15 text-rose-300 border border-rose-500/25'
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
      <div className="p-8 flex items-center justify-center min-h-[50vh]">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-2 border-[#1B7A1E] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-slate-300">{t('common.loading')}</p>
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
        isAdmin={true}
        onDelete={() => {
          setDetailCourse(null);
          loadData();
        }}
      />
    );
  }



  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      {/* Page header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#1B7A1E]/70">
            BioKama Learning
          </p>
          <h2 className="text-2xl lg:text-3xl font-semibold tracking-tight text-white">
            {t('admin.courses.title')}
          </h2>
          <p className="text-sm text-slate-500 max-w-xl">
            {t('admin.courses.pageSubtitle')}
          </p>
          {currentUser?.role !== 'admin' && currentUser?.position === 'Trưởng phòng' && (
            <p className="text-sm text-[#1B7A1E] mt-1">
              {t('admin.courses.managerScope')}: <strong>{departments.find(d => d.id === currentUser.departmentId)?.name}</strong>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
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
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium text-slate-300 bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] transition-colors"
          >
            <Users size={16} />
            {t('admin.courses.syncStudents')}
          </button>
          {currentUser?.role === 'admin' && (
            <button
              type="button"
              onClick={handleAdd}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-[#0b1b2b] bg-[#1B7A1E] hover:bg-[#156318] transition-colors shadow-[0_0_24px_rgba(83,202,253,0.25)]"
            >
              <Plus size={16} />
              {t('admin.courses.addCourse')}
            </button>
          )}
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: t('admin.courses.totalCourses'), value: courses.length, icon: Layers, tone: 'text-white', ring: 'from-[#1B7A1E]/20' },
          { label: t('admin.courses.levelBeginner'), value: courses.filter(c => c.level === 'beginner').length, icon: GraduationCap, tone: 'text-emerald-300', ring: 'from-emerald-400/20' },
          { label: t('admin.courses.levelIntermediate'), value: courses.filter(c => c.level === 'intermediate').length, icon: Signal, tone: 'text-amber-300', ring: 'from-amber-400/20' },
          { label: t('admin.courses.levelAdvanced'), value: courses.filter(c => c.level === 'advanced').length, icon: BookOpen, tone: 'text-rose-300', ring: 'from-rose-400/20' },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.label}
              className={`relative overflow-hidden rounded-2xl border border-white/[0.06] bg-black/30 backdrop-blur-md p-4`}
            >
              <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${stat.ring} to-transparent opacity-80`} />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-400 font-medium">{stat.label}</p>
                  <p className={`mt-2 text-3xl font-semibold tracking-tight ${stat.tone}`}>{stat.value}</p>
                </div>
                <div className="h-9 w-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-slate-300">
                  <Icon size={18} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="rounded-2xl border border-white/[0.06] bg-black/30 backdrop-blur-md p-3 lg:p-4 space-y-3">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
          <input
            type="text"
            placeholder={t('admin.courses.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-black/40 border border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]/30 focus:border-[#1B7A1E]/30 text-sm text-white placeholder-slate-600"
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={14} />
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value as any)}
              className="w-full appearance-none pl-9 pr-8 py-2.5 bg-black/40 border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]/30 [&>option]:bg-[#12101f]"
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
            className="w-full appearance-none px-3.5 py-2.5 bg-black/40 border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]/30 [&>option]:bg-[#12101f]"
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
            className="w-full appearance-none px-3.5 py-2.5 bg-black/40 border border-white/[0.08] rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]/30 [&>option]:bg-[#12101f]"
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
        <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
          <span>{t('admin.courses.showingCount', { count: filteredCourses.length, total: courses.length })}</span>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[#1B7A1E] hover:text-[#7dd9ff] font-medium transition-colors"
            >
              {t('admin.courses.clearFilters')}
            </button>
          )}
        </div>
      </div>

      {/* Course list */}
      <div className="rounded-2xl border border-white/[0.06] bg-black/35 backdrop-blur-md overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px]">
            <thead>
              <tr className="border-b border-white/[0.06] bg-black/25">
                <th className="px-5 py-3.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em]">
                  {t('admin.courses.courseName')}
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em]">
                  {t('admin.courses.category')}
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em]">
                  {t('admin.courses.level')}
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em]">
                  {t('admin.courses.audience')}
                </th>
                <th className="px-4 py-3.5 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em]">
                  {t('admin.courses.projectsLabel')}
                </th>
                <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em]">
                  {t('admin.courses.students')}
                </th>
                <th className="px-4 py-3.5 text-center text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em]">
                  {t('admin.courses.durationLabel')}
                </th>
                <th className="px-5 py-3.5 text-right text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em] w-[1%] whitespace-nowrap">
                  {t('common.actions')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filteredCourses.map((course) => (
                <tr key={course.id} className="group hover:bg-white/[0.03] transition-colors">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-11 w-11 rounded-xl overflow-hidden bg-white/5 border border-white/10 flex-shrink-0">
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
                          className="h-full w-full items-center justify-center text-[#1B7A1E]/70"
                          style={{ display: course.thumbnail ? 'none' : 'flex' }}
                        >
                          <BookOpen size={18} />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-white truncate">{course.title}</div>
                        <div className="text-xs text-slate-400 line-clamp-1 mt-0.5">{course.description}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-200">
                    {course.category || <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-4 py-4">
                    {getLevelBadge(course.level)}
                  </td>
                  <td className="px-4 py-4">
                    {course.departmentId === 'all' ? (
                      <span className="inline-flex px-2.5 py-1 bg-emerald-500/15 text-emerald-300 border border-emerald-500/25 rounded-md text-xs font-medium">
                        {t('admin.courses.audienceAllShort')}
                      </span>
                    ) : course.departmentId ? (
                      <span className="inline-flex px-2.5 py-1 bg-violet-500/15 text-violet-300 border border-violet-500/25 rounded-md text-xs font-medium">
                        {departments.find(d => d.id === course.departmentId)?.name || 'N/A'}
                      </span>
                    ) : (
                      <span className="inline-flex px-2.5 py-1 bg-white/5 text-slate-400 border border-white/10 rounded-md text-xs font-medium">
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
                            className="inline-flex items-center px-2 py-0.5 bg-white/5 text-slate-300 border border-white/10 rounded-md text-[11px] font-medium"
                          >
                            {projectName}
                          </span>
                        ))}
                        {course.projectNames.length > 2 && (
                          <span className="text-[11px] text-slate-500">+{course.projectNames.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-500 text-sm">—</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-200">
                      <Users size={14} className="text-slate-500" />
                      {course.students?.length || 0}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span className="inline-flex items-center gap-1.5 text-sm text-slate-200">
                      <Clock size={14} className="text-slate-500" />
                      {course.duration}h
                    </span>
                  </td>
                  <td className="px-5 py-4 whitespace-nowrap">
                    <div className="inline-flex items-center justify-end gap-1.5 flex-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetailCourse(course)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 bg-[#1B7A1E]/90 text-[#061018] hover:bg-[#1B7A1E] transition-colors"
                        title={t('admin.courses.classDetail')}
                      >
                        <BookOpen size={14} className="shrink-0" />
                        <span className="whitespace-nowrap">{t('common.details')}</span>
                      </button>
                      {currentUser?.role === 'admin' && (
                        <>
                          <button
                            type="button"
                            onClick={() => handleEdit(course)}
                            className="inline-flex p-2 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors shrink-0"
                            title={t('common.edit')}
                          >
                            <Edit2 size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(course)}
                            className="inline-flex p-2 rounded-lg text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors shrink-0"
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
          <div className="text-center py-16 px-6">
            <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
              <BookOpen className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-white font-medium mb-1">
              {searchTerm || filterProjectId || filterCategory !== 'all' || filterLevel !== 'all'
                ? t('admin.courses.noMatchFilter')
                : t('admin.courses.notFound')}
            </p>
            <p className="text-sm text-slate-400">
              {currentUser?.role === 'admin' ? t('admin.courses.emptyHint') : t('admin.courses.emptyHintStaff')}
            </p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-[#0e0c1a]/98 backdrop-blur-xl border border-white/[0.08] rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center gap-3 px-6 py-4 border-b border-white/[0.06] shrink-0">
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-[#1B7A1E]/80 font-medium">Bunny Stream</p>
                <h3 className="text-lg font-semibold text-white">
                  {editingCourse ? t('admin.courses.editCourse') : t('admin.courses.addCourseNew')}
                </h3>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-6 p-6 overflow-y-auto flex-1">
              <section className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{t('admin.courses.formSectionBasic')}</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.courses.courseName')} *</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]/40 focus:border-[#1B7A1E]/40 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.courses.description')}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3.5 py-2.5 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]/40 focus:border-[#1B7A1E]/40 text-sm text-white resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.courses.category')} *</label>
                  <input
                    type="text"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    placeholder={t('admin.courses.categoryPlaceholder')}
                    className="w-full px-3.5 py-2.5 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]/40 focus:border-[#1B7A1E]/40 text-sm text-white placeholder-slate-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.courses.level')}</label>
                    <select
                      value={formData.level}
                      onChange={(e) => setFormData({ ...formData, level: e.target.value as any })}
                      className="w-full px-3.5 py-2.5 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]/40 text-sm text-white [&>option]:bg-[#0E3A16]"
                    >
                      <option value="beginner">{t('admin.courses.levelBeginner')}</option>
                      <option value="intermediate">{t('admin.courses.levelIntermediate')}</option>
                      <option value="advanced">{t('admin.courses.levelAdvanced')}</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.courses.durationHours')}</label>
                    <input
                      type="number"
                      value={formData.duration}
                      onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                      className="w-full px-3.5 py-2.5 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]/40 text-sm text-white"
                    />
                  </div>
                </div>
              </section>

              <section className="space-y-4">
                <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{t('admin.courses.formSectionAudience')}</h4>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">{t('admin.courses.audience')} *</label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    disabled={!!(currentUser?.role !== 'admin' && currentUser?.departmentId && departments.find(d => d.managerId === currentUser.uid))}
                    className="w-full px-3.5 py-2.5 bg-black/20 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]/40 text-sm text-white disabled:opacity-60 disabled:cursor-not-allowed [&>option]:bg-[#0E3A16]"
                  >
                    <option value="">{t('admin.courses.audienceNone')}</option>
                    <option value="all">{t('admin.courses.audienceAll')}</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                  {currentUser?.role !== 'admin' && currentUser?.departmentId && departments.find(d => d.managerId === currentUser.uid) ? (
                    <p className="text-xs text-[#1B7A1E] mt-1.5">
                      {t('admin.courses.managerCreateHint')}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                      {t('admin.courses.audienceHintAll')} · {t('admin.courses.audienceHintDept')} · {t('admin.courses.audienceHintNone')}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    {t('admin.courses.projectsLabel')}
                    {formData.projects.length > 0 && (
                      <span className="ml-2 text-xs text-[#1B7A1E]">
                        ({t('admin.courses.selectedProjectsCount', { count: formData.projects.length })})
                      </span>
                    )}
                  </label>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto border border-white/10 rounded-xl p-2 bg-black/20">
                    {projects.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">{t('admin.courses.noProjectsYet')}</p>
                    ) : (
                      projects.map(project => {
                        const isChecked = formData.projects.includes(project.id);
                        return (
                          <label
                            key={project.id}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                              isChecked
                                ? 'bg-[#1B7A1E]/15 border border-[#1B7A1E]/30'
                                : 'hover:bg-white/5 border border-transparent'
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
                              className="w-4 h-4 text-[#1B7A1E] bg-white/5 border-white/20 rounded focus:ring-[#1B7A1E] focus:ring-2"
                            />
                            <span className={`text-sm flex-1 ${isChecked ? 'text-white font-medium' : 'text-slate-300'}`}>
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
                            className="inline-flex items-center px-2 py-1 bg-[#1B7A1E]/15 text-[#1B7A1E] border border-[#1B7A1E]/25 rounded-md text-xs font-medium"
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
                <h4 className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">{t('admin.courses.formSectionMedia')}</h4>
                <BunnyImageUpload
                  label={t('admin.courses.thumbnailLabel')}
                  currentImage={formData.thumbnail}
                  onUploadStart={() => setUploadingThumbnail(true)}
                  onUploadEnd={() => setUploadingThumbnail(false)}
                  onUploadComplete={(url) => setFormData(prev => ({ ...prev, thumbnail: url }))}
                  folder="courses/thumbnails"
                  variant="dark"
                />

                <div>
                  <BunnyImageUpload
                    label={t('admin.courses.bannerLabel')}
                    currentImage={formData.banner}
                    onUploadStart={() => setUploadingBanner(true)}
                    onUploadEnd={() => setUploadingBanner(false)}
                    onUploadComplete={(url) => setFormData(prev => ({ ...prev, banner: url }))}
                    folder="courses/banners"
                    variant="dark"
                  />
                  <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                    {t('admin.courses.bannerRecommend')} · {t('admin.courses.bannerMaxSize')} · {t('admin.courses.bannerFormats')}
                  </p>
                  {uploadingBanner && (
                    <div className="mt-2 px-3 py-2 bg-[#1B7A1E]/10 border border-[#1B7A1E]/25 rounded-xl">
                      <p className="text-xs text-[#1B7A1E] font-medium">{t('admin.courses.bannerUploading')}</p>
                    </div>
                  )}
                  {!uploadingBanner && formData.banner && (
                    <div className="mt-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/25 rounded-xl">
                      <p className="text-xs text-emerald-300 font-medium">{t('admin.courses.bannerUploaded')}</p>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-4">
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
                      variant="dark"
                    />
                  ) : (
                    <p className="text-sm text-slate-300">Lưu khóa học trước, sau đó mở lại để tải video giới thiệu lên CloudFly.</p>
                  )}
                </div>
              </section>
            </div>

            <div className="shrink-0 border-t border-white/[0.06] px-6 py-4 space-y-2 bg-[#0e0c1a]">
              <div className="flex gap-3">
                <Button
                  onClick={handleSave}
                  disabled={uploadingThumbnail || uploadingBanner}
                  className="flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save size={18} />
                  {uploadingThumbnail || uploadingBanner ? t('admin.courses.uploadingImages') : t('common.save')}
                </Button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2.5 border border-white/10 rounded-xl hover:bg-white/10 text-sm font-medium text-white disabled:opacity-50 transition-colors"
                >
                  {t('common.cancel')}
                </button>
              </div>
              {(uploadingThumbnail || uploadingBanner) && (
                <p className="text-xs text-amber-300/90 text-center">
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
