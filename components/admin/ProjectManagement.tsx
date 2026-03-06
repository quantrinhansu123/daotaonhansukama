'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { FolderKanban, Plus, Edit2, Trash2, X, Save, Search, Users, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import { Button } from '@/components/Button';
import { Project, ProjectStatus, ProjectPriority } from '@/types/project';
import { UserProfile } from '@/types/user';
import { Department } from '@/types/department';

export const ProjectManagement: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [filteredProjects, setFilteredProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'all'>('all');
  const [filterPriority, setFilterPriority] = useState<ProjectPriority | 'all'>('all');

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    status: 'planning' as ProjectStatus,
    startDate: '',
    endDate: '',
    managerId: '',
    departmentId: '',
    members: [] as string[],
    budget: 0,
    priority: 'medium' as ProjectPriority,
    tags: [] as string[],
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterProjects();
  }, [projects, searchTerm, filterStatus, filterPriority]);

  const filterProjects = () => {
    let filtered = projects;

    if (searchTerm) {
      filtered = filtered.filter(project =>
        project.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        project.managerName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterStatus !== 'all') {
      filtered = filtered.filter(project => project.status === filterStatus);
    }

    if (filterPriority !== 'all') {
      filtered = filtered.filter(project => project.priority === filterPriority);
    }

    setFilteredProjects(filtered);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load projects - với error handling tốt hơn
      let projectsData: Project[] = [];
      try {
        const projectsSnapshot = await getDocs(collection(db, 'projects'));
        projectsData = projectsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        })) as Project[];
        console.log('[ProjectManagement] Loaded projects:', projectsData.length);
      } catch (projectsError: any) {
        console.error('[ProjectManagement] Error loading projects:', projectsError);
        if (projectsError.code === 'permission-denied') {
          console.error('[ProjectManagement] Permission denied for projects collection. Please check Firestore rules.');
        }
        // Tiếp tục với mảng rỗng nếu không load được
        projectsData = [];
      }

      // Load users
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        uid: doc.id,
        ...doc.data(),
      })) as UserProfile[];

      // Load departments
      const deptSnapshot = await getDocs(collection(db, 'departments'));
      const deptData = deptSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      })) as Department[];

      // Enrich projects with names
      const enrichedProjects = projectsData.map(project => {
        const manager = usersData.find(u => u.uid === project.managerId);
        const department = deptData.find(d => d.id === project.departmentId);
        const memberNames = project.members?.map(memberId => {
          const member = usersData.find(u => u.uid === memberId);
          return member?.displayName || '';
        }).filter(Boolean) || [];

        return {
          ...project,
          managerName: manager?.displayName,
          departmentName: department?.name,
          memberNames,
        };
      });

      setProjects(enrichedProjects);
      setUsers(usersData);
      setDepartments(deptData);
    } catch (error: any) {
      console.error('[ProjectManagement] Error loading data:', error);
      if (error.code === 'permission-denied') {
        alert('Lỗi quyền truy cập Firestore. Vui lòng kiểm tra Firestore rules đã được deploy chưa.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const projectData = {
        ...formData,
        updatedAt: new Date(),
        createdAt: editingProject?.createdAt || new Date(),
      };

      if (editingProject) {
        await setDoc(doc(db, 'projects', editingProject.id), projectData);
        console.log('[ProjectManagement] Updated project:', editingProject.id);
      } else {
        const newId = `project_${Date.now()}`;
        await setDoc(doc(db, 'projects', newId), { ...projectData, id: newId });
        console.log('[ProjectManagement] Created project:', newId);
      }

      setShowModal(false);
      setEditingProject(null);
      resetForm();
      loadData();
    } catch (error: any) {
      console.error('[ProjectManagement] Error saving project:', error);
      if (error.code === 'permission-denied') {
        alert('Lỗi quyền truy cập Firestore. Vui lòng kiểm tra Firestore rules đã được deploy chưa.');
      } else {
        alert('Lỗi khi lưu project: ' + (error.message || 'Unknown error'));
      }
    }
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name,
      description: project.description || '',
      status: project.status,
      startDate: project.startDate || '',
      endDate: project.endDate || '',
      managerId: project.managerId || '',
      departmentId: project.departmentId || '',
      members: project.members || [],
      budget: project.budget || 0,
      priority: project.priority,
      tags: project.tags || [],
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Bạn có chắc chắn muốn xóa project này?')) return;

    try {
      await deleteDoc(doc(db, 'projects', id));
      loadData();
    } catch (error) {
      console.error('Error deleting project:', error);
      alert('Lỗi khi xóa project');
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      status: 'planning',
      startDate: '',
      endDate: '',
      managerId: '',
      departmentId: '',
      members: [],
      budget: 0,
      priority: 'medium',
      tags: [],
    });
    setEditingProject(null);
  };

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case 'planning': return 'bg-blue-500/20 text-blue-300';
      case 'in_progress': return 'bg-yellow-500/20 text-yellow-300';
      case 'completed': return 'bg-green-500/20 text-green-300';
      case 'on_hold': return 'bg-gray-500/20 text-gray-300';
      case 'cancelled': return 'bg-red-500/20 text-red-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  };

  const getPriorityColor = (priority: ProjectPriority) => {
    switch (priority) {
      case 'low': return 'bg-gray-500/20 text-gray-300';
      case 'medium': return 'bg-blue-500/20 text-blue-300';
      case 'high': return 'bg-orange-500/20 text-orange-300';
      case 'urgent': return 'bg-red-500/20 text-red-300';
      default: return 'bg-gray-500/20 text-gray-300';
    }
  };

  const getStatusLabel = (status: ProjectStatus) => {
    const labels: Record<ProjectStatus, string> = {
      planning: 'Lên kế hoạch',
      in_progress: 'Đang thực hiện',
      completed: 'Hoàn thành',
      on_hold: 'Tạm dừng',
      cancelled: 'Đã hủy',
    };
    return labels[status];
  };

  const getPriorityLabel = (priority: ProjectPriority) => {
    const labels: Record<ProjectPriority, string> = {
      low: 'Thấp',
      medium: 'Trung bình',
      high: 'Cao',
      urgent: 'Khẩn cấp',
    };
    return labels[priority];
  };

  if (loading) {
    return <div className="p-8 text-center">Đang tải...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Quản lý Project</h1>
          <p className="text-slate-300">Quản lý và theo dõi các dự án</p>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }} className="flex items-center gap-2 bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white shadow-[#53cafd]/25">
          <Plus size={20} />
          Thêm Project
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Tìm kiếm project theo tên, mô tả, người quản lý..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white placeholder-slate-400"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Lọc theo trạng thái</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | 'all')}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="planning">Lên kế hoạch</option>
            <option value="in_progress">Đang thực hiện</option>
            <option value="completed">Hoàn thành</option>
            <option value="on_hold">Tạm dừng</option>
            <option value="cancelled">Đã hủy</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">Lọc theo mức độ</label>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as ProjectPriority | 'all')}
            className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
          >
            <option value="all">Tất cả mức độ</option>
            <option value="low">Thấp</option>
            <option value="medium">Trung bình</option>
            <option value="high">Cao</option>
            <option value="urgent">Khẩn cấp</option>
          </select>
        </div>
      </div>

      {/* Projects Table */}
      <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 overflow-hidden backdrop-blur-md">
        {filteredProjects.length === 0 ? (
          <div className="text-center py-12">
            <FolderKanban className="w-16 h-16 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-300">
              {searchTerm ? 'Không tìm thấy project nào' : 'Chưa có project nào'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#5e3ed0]/40 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Tên Project
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Trạng thái
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Mức độ
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Người quản lý
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Phòng ban
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Thành viên
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Ngân sách
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="bg-purple-500/20 p-2 rounded-lg">
                          <FolderKanban className="w-5 h-5 text-purple-300" />
                        </div>
                        <div>
                          <p className="font-semibold text-white">{project.name}</p>
                          {project.description && (
                            <p className="text-xs text-slate-400 max-w-md line-clamp-1">{project.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(project.status)}`}>
                        {getStatusLabel(project.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityColor(project.priority)}`}>
                        {getPriorityLabel(project.priority)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {project.managerName ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#53cafd]/20 text-[#53cafd] rounded-full text-sm font-medium">
                          {project.managerName}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {project.departmentName ? (
                        <span className="inline-flex items-center px-2 py-1 bg-purple-500/20 text-purple-300 rounded-md text-xs font-medium">
                          {project.departmentName}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 text-white rounded-lg text-sm font-medium">
                        <Users size={16} />
                        <span>{project.memberNames?.length || 0}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {project.budget ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-500/20 text-green-300 rounded-full text-sm font-medium">
                          <DollarSign size={14} />
                          {project.budget.toLocaleString('vi-VN')} đ
                        </span>
                      ) : (
                        <span className="text-slate-400 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(project)}
                          className="p-2 text-[#53cafd] hover:bg-white/10 rounded-lg transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(project.id)}
                          className="p-2 text-pink-500 hover:bg-white/10 rounded-lg transition-colors"
                          title="Xóa"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#311898]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">
                {editingProject ? 'Chỉnh sửa Project' : 'Thêm Project mới'}
              </h3>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-2 hover:bg-white/10 rounded-lg text-white">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Tên Project *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                  placeholder="Ví dụ: Website công ty"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Mô tả</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                  placeholder="Mô tả về project..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Trạng thái</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ProjectStatus })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
                  >
                    <option value="planning">Lên kế hoạch</option>
                    <option value="in_progress">Đang thực hiện</option>
                    <option value="completed">Hoàn thành</option>
                    <option value="on_hold">Tạm dừng</option>
                    <option value="cancelled">Đã hủy</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Mức độ ưu tiên</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as ProjectPriority })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
                  >
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                    <option value="urgent">Khẩn cấp</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Ngày bắt đầu</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Ngày kết thúc</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Người quản lý</label>
                  <select
                    value={formData.managerId}
                    onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
                  >
                    <option value="">-- Chọn người quản lý --</option>
                    {users.map(user => (
                      <option key={user.uid} value={user.uid}>{user.displayName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">Phòng ban</label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Ngân sách (VNĐ)</label>
                <input
                  type="number"
                  min="0"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                  placeholder="0"
                />
              </div>

              <div className="p-6 border-t border-white/10 flex gap-3">
                <Button onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 bg-white/10 hover:bg-white/20 text-white border-none">
                  Hủy
                </Button>
                <Button type="submit" className="flex-1 flex items-center justify-center gap-2 bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white shadow-[#53cafd]/25">
                  <Save size={18} />
                  Lưu
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
