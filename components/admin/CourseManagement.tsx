'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Course } from '@/types/course';
import { Search, Plus, Edit2, Trash2, X, Save, BookOpen, Users } from 'lucide-react';
import { Button } from '@/components/Button';
import { CourseDetailPage } from './CourseDetailPage';
import { BunnyImageUpload } from '@/components/shared/BunnyImageUpload';
import { useAuth } from '@/contexts/AuthContext';

interface CourseManagementProps {
  onNavigateToApproval?: () => void;
}

export const CourseManagement: React.FC<CourseManagementProps> = () => {
  const { userProfile: currentUser } = useAuth();
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
        alert('Vui lòng điền đầy đủ thông tin bắt buộc');
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
        updateData.demoVideoId = formData.demoVideoId && formData.demoVideoId.trim() !== '' ? String(formData.demoVideoId) : null;
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
        alert('Cập nhật khóa học thành công!');
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
        alert('Thêm khóa học thành công!');
      }

      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving course:', error);
      alert('Lỗi khi lưu khóa học');
    }
  };

  const handleDelete = async (course: Course) => {
    if (!confirm(`Bạn có chắc muốn xóa khóa học "${course.title}"?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'courses', course.id));
      alert('Xóa khóa học thành công!');
      loadData();
    } catch (error) {
      console.error('Error deleting course:', error);
      alert('Lỗi khi xóa khóa học');
    }
  };

  const getLevelBadge = (level: string) => {
    const styles = {
      beginner: 'bg-green-100 text-green-700',
      intermediate: 'bg-yellow-100 text-yellow-700',
      advanced: 'bg-red-100 text-red-700'
    };
    const labels = {
      beginner: 'Cơ bản',
      intermediate: 'Trung cấp',
      advanced: 'Nâng cao'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[level as keyof typeof styles]}`}>
        {labels[level as keyof typeof labels]}
      </span>
    );
  };

  if (loading) {
    return <div className="text-center py-8">Đang tải...</div>;
  }

  // Show course detail page
  if (detailCourse) {
    return (
      <CourseDetailPage
        course={detailCourse}
        onBack={() => setDetailCourse(null)}
        isAdmin={true}
      />
    );
  }



  return (
    <div className="p-8 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Quản lý khóa học</h2>
          {currentUser?.role !== 'admin' && currentUser?.position === 'Trưởng phòng' && (
            <p className="text-sm text-[#53cafd] mt-1">
              🏢 Bạn đang xem khóa học của phòng ban: <strong>{departments.find(d => d.id === currentUser.departmentId)?.name}</strong>
            </p>
          )}
        </div>
        <div className="flex gap-3">
          <Button
            onClick={async () => {
              if (!confirm('Cập nhật lại danh sách học viên cho TẤT CẢ khóa học dựa trên phòng ban?\n\nLưu ý: Thao tác này sẽ ghi đè danh sách học viên hiện tại.')) {
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
                alert(`✅ Đã cập nhật ${updated} khóa học!`);
                loadData();
              } catch (error) {
                console.error('Error updating students:', error);
                alert('❌ Lỗi khi cập nhật!');
              } finally {
                setLoading(false);
              }
            }}
            className="flex items-center gap-2 bg-[#5e3ed0]/20 hover:bg-[#5e3ed0]/40 text-white border border-white/10"
          >
            <Users size={18} />
            Cập nhật học viên
          </Button>
          {/* Chỉ admin mới được thêm khóa học */}
          {currentUser?.role === 'admin' && (
            <Button onClick={handleAdd} className="flex items-center gap-2 bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white shadow-[#53cafd]/25">
              <Plus size={18} />
              Thêm khóa học
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Tìm kiếm khóa học theo tên, mô tả, danh mục..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white placeholder-slate-400"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Lọc theo cấp độ</label>
          <select
            value={filterLevel}
            onChange={(e) => setFilterLevel(e.target.value as any)}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
          >
            <option value="all">Tất cả cấp độ</option>
            <option value="beginner">Cơ bản</option>
            <option value="intermediate">Trung cấp</option>
            <option value="advanced">Nâng cao</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Lọc theo danh mục</label>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
          >
            <option value="all">Tất cả danh mục</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Lọc theo dự án</label>
          <select
            value={filterProjectId}
            onChange={(e) => setFilterProjectId(e.target.value)}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
          >
            <option value="">Tất cả dự án</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">Tổng khóa học</p>
          <p className="text-2xl font-bold text-white">{courses.length}</p>
        </div>
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">Cơ bản</p>
          <p className="text-2xl font-bold text-green-400">{courses.filter(c => c.level === 'beginner').length}</p>
        </div>
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">Trung cấp</p>
          <p className="text-2xl font-bold text-yellow-400">{courses.filter(c => c.level === 'intermediate').length}</p>
        </div>
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">Nâng cao</p>
          <p className="text-2xl font-bold text-red-400">{courses.filter(c => c.level === 'advanced').length}</p>
        </div>
      </div>

      {/* Course List Table */}
      <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 overflow-hidden backdrop-blur-md">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#5e3ed0]/40 border-b border-white/10">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Khóa học
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Danh mục
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Cấp độ
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Đối tượng
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Dự án
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Học viên
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Thời lượng
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredCourses.map((course) => (
                <tr key={course.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-6 py-4">
                    <div>
                      <div className="font-medium text-white">{course.title}</div>
                      <div className="text-sm text-slate-300 line-clamp-1">{course.description}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-white">
                    {course.category}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {getLevelBadge(course.level)}
                  </td>
                  <td className="px-6 py-4">
                    {course.departmentId === 'all' ? (
                      <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                        🌐 Chung
                      </span>
                    ) : course.departmentId ? (
                      <span className="inline-block px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                        🏢 {departments.find(d => d.id === course.departmentId)?.name || 'N/A'}
                      </span>
                    ) : (
                      <span className="inline-block px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-sm font-medium">
                        🔒 Nháp
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {course.projectNames && course.projectNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {course.projectNames.map((projectName, idx) => (
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
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-sm font-medium">
                      <span>{course.students?.length || 0}</span>
                      <span className="text-xs">người</span>
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-white">
                    {course.duration}h
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setDetailCourse(course)}
                        className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all shadow-md hover:shadow-lg flex items-center gap-2 font-medium"
                        title="Chi tiết lớp học"
                      >
                        <BookOpen size={16} />
                        Chi tiết
                      </button>

                      {/* Chỉ admin mới thấy các nút chỉnh sửa và xóa */}
                      {currentUser?.role === 'admin' && (
                        <>
                          <button
                            onClick={() => handleEdit(course)}
                            className="p-2 text-[#53cafd] hover:bg-white/10 rounded-lg transition-colors"
                            title="Chỉnh sửa"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => handleDelete(course)}
                            className="p-2 text-pink-500 hover:bg-white/10 rounded-lg transition-colors"
                            title="Xóa"
                          >
                            <Trash2 size={16} />
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
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-300">
              {searchTerm || filterProjectId || filterCategory !== 'all' || filterLevel !== 'all'
                ? 'Không tìm thấy khóa học nào phù hợp với bộ lọc'
                : 'Không tìm thấy khóa học nào'}
            </p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#311898]/90 backdrop-blur-xl border border-white/10 rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">
                {editingCourse ? 'Chỉnh sửa khóa học' : 'Thêm khóa học mới'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X size={24} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Tên khóa học *</label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Mô tả</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Danh mục *</label>
                <input
                  type="text"
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="VD: Lập trình, Thiết kế..."
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Đối tượng học *</label>
                <select
                  value={formData.departmentId}
                  onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                  disabled={!!(currentUser?.role !== 'admin' && currentUser?.departmentId && departments.find(d => d.managerId === currentUser.uid))}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white disabled:bg-white/10 disabled:cursor-not-allowed [&>option]:bg-[#311898] [&>option]:text-white"
                >
                  <option value="">-- Không hiển thị cho ai --</option>
                  <option value="all">🌐 Chung (Tất cả nhân viên)</option>
                  {departments.map(dept => (
                    <option key={dept.id} value={dept.id}>🏢 {dept.name}</option>
                  ))}
                </select>
                {currentUser?.role !== 'admin' && currentUser?.departmentId && departments.find(d => d.managerId === currentUser.uid) ? (
                  <p className="text-xs text-[#53cafd] mt-1">
                    🔒 Trưởng phòng chỉ có thể tạo khóa học cho phòng ban của mình
                  </p>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">
                    • <strong>Chung</strong>: Tất cả nhân viên đều thấy<br />
                    • <strong>Phòng ban cụ thể</strong>: Chỉ nhân viên phòng ban đó thấy<br />
                    • <strong>Không chọn</strong>: Không ai thấy (nháp)
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Dự án
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Cấp độ</label>
                  <select
                    value={formData.level}
                    onChange={(e) => setFormData({ ...formData, level: e.target.value as any })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
                  >
                    <option value="beginner">Cơ bản</option>
                    <option value="intermediate">Trung cấp</option>
                    <option value="advanced">Nâng cao</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Thời lượng (giờ)</label>
                  <input
                    type="number"
                    value={formData.duration}
                    onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                  />
                </div>
              </div>

              <BunnyImageUpload
                label="Thumbnail (Ảnh đại diện)"
                currentImage={formData.thumbnail}
                onUploadStart={() => setUploadingThumbnail(true)}
                onUploadEnd={() => setUploadingThumbnail(false)}
                onUploadComplete={(url) => setFormData(prev => ({ ...prev, thumbnail: url }))}
                folder="courses/thumbnails"
              />

              <div>
                <BunnyImageUpload
                  label="Banner (Ảnh bìa khóa học - Hiển thị ở đầu trang chi tiết)"
                  currentImage={formData.banner}
                  onUploadStart={() => {
                    console.log('⏳ Banner upload started...');
                    setUploadingBanner(true);
                  }}
                  onUploadEnd={() => {
                    console.log('✅ Banner upload ended');
                    setUploadingBanner(false);
                  }}
                  onUploadComplete={(url) => {
                    console.log('🎉 Banner uploaded, URL:', url);
                    setFormData(prev => {
                      const updated = { ...prev, banner: url };
                      console.log('📝 Updated formData with banner:', updated);
                      return updated;
                    });
                  }}
                  folder="courses/banners"
                />
                <p className="text-xs text-slate-500 mt-1">
                  📐 <strong>Kích cỡ khuyến nghị:</strong> 1920x600px (tỷ lệ 16:5) hoặc 1920x1080px (16:9)<br />
                  📦 <strong>Kích thước file:</strong> Tối đa 5MB<br />
                  📄 <strong>Định dạng:</strong> JPG, PNG, WebP
                </p>
                {uploadingBanner && (
                  <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-xs text-blue-700 font-semibold">⏳ Đang tải banner lên... Vui lòng đợi!</p>
                  </div>
                )}
                {!uploadingBanner && formData.banner && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs text-green-700 font-semibold mb-1">✅ Banner đã được tải lên</p>
                    <p className="text-xs text-green-600 break-all font-mono">{formData.banner}</p>
                  </div>
                )}
              </div>

              {/* <BunnyVideoUpload
                label="Video Demo (Video giới thiệu khóa học)"
                currentVideoId={formData.demoVideoId}
                onUploadComplete={(videoId) => setFormData({ ...formData, demoVideoId: videoId })}
              /> */}
            </div>

            <div className="flex gap-3 mt-6">
              <Button
                onClick={handleSave}
                disabled={uploadingThumbnail || uploadingBanner}
                className="flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save size={18} />
                {uploadingThumbnail || uploadingBanner ? 'Đang tải ảnh...' : 'Lưu'}
              </Button>
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 px-4 py-2 border border-white/10 rounded-lg hover:bg-white/10 text-white"
              >
                Hủy
              </button>
            </div>
            {(uploadingThumbnail || uploadingBanner) && (
              <p className="text-xs text-orange-600 text-center mt-2">
                ⚠️ Vui lòng đợi ảnh tải lên hoàn tất trước khi lưu
              </p>
            )}
          </div>
        </div>
      )}

    </div>
  );
};
