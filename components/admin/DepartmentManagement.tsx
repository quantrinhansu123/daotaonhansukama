'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Building2, Plus, Edit2, Trash2, X, Save, Users, Search, Shield } from 'lucide-react';
import { Button } from '@/components/Button';
import { Department } from '@/types/department';
import { UserProfile } from '@/types/user';


export const DepartmentManagement: React.FC = () => {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [filteredDepartments, setFilteredDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterProjectId, setFilterProjectId] = useState<string>('');

  const [viewStaffDept, setViewStaffDept] = useState<Department | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    managerId: '',
    projects: [] as string[],
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    filterDepartments();
  }, [departments, searchTerm, filterProjectId]);

  const filterDepartments = () => {
    let filtered = departments;

    if (searchTerm) {
      filtered = filtered.filter(dept =>
        dept.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dept.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        dept.managerName?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (filterProjectId) {
      filtered = filtered.filter(dept =>
        dept.projects && dept.projects.includes(filterProjectId)
      );
    }

    setFilteredDepartments(filtered);
  };

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

      // Load departments
      const deptSnapshot = await getDocs(collection(db, 'departments'));
      const depts = deptSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate() || new Date(),
      })) as Department[];

      // Enrich departments with project names
      const enrichedDepts = depts.map(dept => {
        const projectNames = dept.projects?.map(projectId => {
          const project = projectsData.find(p => p.id === projectId);
          return project?.name || '';
        }).filter(Boolean) || [];
        return {
          ...dept,
          projectNames,
        };
      });

      setDepartments(enrichedDepts);

      // Load users (staff only)
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const usersData = usersSnapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as UserProfile[];
      setUsers(usersData.filter(u => u.role === 'staff'));
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStaffCount = (deptId: string) => {
    return users.filter(u => u.departmentId === deptId).length;
  };

  const handleAdd = () => {
    setEditingDept(null);
    setFormData({ name: '', description: '', managerId: '', projects: [] });
    setShowModal(true);
  };

  const handleEdit = (dept: Department) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name,
      description: dept.description,
      managerId: dept.managerId || '',
      projects: dept.projects || [],
    });
    setShowModal(true);
  };

  const getUsersInDepartment = (deptId: string) => {
    // Lấy danh sách nhân viên trong phòng ban
    return users.filter(u => u.departmentId === deptId && u.approved);
  };

  const handleSave = async () => {
    try {
      if (!formData.name) {
        alert('Vui lòng nhập tên phòng ban');
        return;
      }

      const deptId = editingDept?.id || `dept_${Date.now()}`;
      const manager = formData.managerId ? users.find(u => u.uid === formData.managerId) : null;

      const deptData: any = {
        name: formData.name,
        description: formData.description,
        managerId: formData.managerId || null,
        managerName: manager?.displayName || null,
        projects: formData.projects || [],
        createdAt: editingDept?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      await setDoc(doc(db, 'departments', deptId), deptData);

      alert(editingDept ? 'Cập nhật phòng ban thành công!' : 'Thêm phòng ban thành công!');
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving department:', error);
      alert('Lỗi khi lưu phòng ban');
    }
  };

  const handleDelete = async (dept: Department) => {
    if (!confirm(`Bạn có chắc muốn xóa phòng ban "${dept.name}"?`)) return;

    try {
      await deleteDoc(doc(db, 'departments', dept.id));
      alert('Xóa phòng ban thành công!');
      loadData();
    } catch (error) {
      console.error('Error deleting department:', error);
      alert('Lỗi khi xóa phòng ban');
    }
  };

  if (loading) {
    return <div className="p-8 text-center">Đang tải...</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Quản lý phòng ban</h1>
          <p className="text-slate-300">Chọn trưởng phòng từ danh sách nhân viên trong phòng ban</p>
        </div>
        <Button onClick={handleAdd} className="flex items-center gap-2 bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white shadow-[#53cafd]/25">
          <Plus size={20} />
          Thêm phòng ban
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Tìm kiếm phòng ban theo tên, mô tả, trưởng phòng..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white placeholder-slate-400"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">Tổng phòng ban</p>
          <p className="text-2xl font-bold text-white">{departments.length}</p>
        </div>
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">Có trưởng phòng</p>
          <p className="text-2xl font-bold text-[#53cafd]">
            {departments.filter(d => d.managerId).length}
          </p>
        </div>
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">Tổng nhân viên</p>
          <p className="text-2xl font-bold text-pink-400">
            {users.length}
          </p>
        </div>
      </div>

      {/* Departments Table */}
      <div className="bg-[#5e3ed0]/20 rounded-xl border border-white/10 overflow-hidden backdrop-blur-md">
        {filteredDepartments.length === 0 ? (
          <div className="text-center py-12">
            <Building2 className="w-16 h-16 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-300">
              {searchTerm || filterProjectId 
                ? 'Không tìm thấy phòng ban nào phù hợp với bộ lọc' 
                : 'Chưa có phòng ban nào'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#5e3ed0]/40 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Phòng ban
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Mô tả
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Trưởng phòng
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Dự án
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Số nhân viên
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    Thao tác
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredDepartments.map((dept) => (
                  <tr key={dept.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="bg-purple-500/20 p-2 rounded-lg">
                          <Building2 className="w-5 h-5 text-purple-300" />
                        </div>
                        <div>
                          <p className="font-semibold text-white">{dept.name}</p>
                          <p className="text-xs text-slate-400">ID: {dept.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-300 max-w-md line-clamp-2">
                        {dept.description || '-'}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {dept.managerName ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#53cafd]/20 text-[#53cafd] rounded-full text-sm font-medium">
                          <Shield size={14} />
                          {dept.managerName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-500/20 text-orange-300 rounded-full text-sm font-medium">
                          ⚠️ Chưa có
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {dept.projectNames && dept.projectNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {dept.projectNames.map((projectName, idx) => (
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
                      <button
                        onClick={() => setViewStaffDept(dept)}
                        className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <Users size={16} />
                        <span>{getStaffCount(dept.id)}</span>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(dept)}
                          className="p-2 text-[#53cafd] hover:bg-white/10 rounded-lg transition-colors"
                          title="Chỉnh sửa"
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(dept)}
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
          <div className="bg-[#311898]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">
                {editingDept ? 'Chỉnh sửa phòng ban' : 'Thêm phòng ban mới'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Tên phòng ban</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                  placeholder="Ví dụ: Phòng Kỹ thuật"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Mô tả</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white"
                  rows={3}
                  placeholder="Mô tả về phòng ban..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Trưởng phòng</label>
                <select
                  value={formData.managerId}
                  onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white [&>option]:bg-[#311898] [&>option]:text-white"
                >
                  <option value="">-- Chọn trưởng phòng --</option>
                  {editingDept && getUsersInDepartment(editingDept.id).map(user => (
                    <option key={user.uid} value={user.uid}>
                      {user.displayName} - {user.position || 'Nhân viên'}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {editingDept
                    ? `Chọn từ ${getUsersInDepartment(editingDept.id).length} nhân viên trong phòng`
                    : 'Lưu phòng ban trước, sau đó sửa để chọn trưởng phòng'}
                </p>
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
            </div>
            <div className="p-6 border-t border-white/10 flex gap-3">
              <Button onClick={() => setShowModal(false)} className="flex-1 bg-white/10 hover:bg-white/20 text-white border-none">
                Hủy
              </Button>
              <Button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white shadow-[#53cafd]/25">
                <Save size={18} />
                Lưu
              </Button>
            </div>
          </div>
        </div>
      )}



      {/* View Staff Modal */}
      {viewStaffDept && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#311898]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#5e3ed0]/20">
              <div>
                <h3 className="text-xl font-bold text-white">Danh sách nhân viên</h3>
                <p className="text-sm text-slate-300 mt-1">{viewStaffDept.name}</p>
              </div>
              <button
                onClick={() => setViewStaffDept(null)}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {users.filter(u => u.departmentId === viewStaffDept.id).length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-300">Chưa có nhân viên nào trong phòng ban này</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {users
                    .filter(u => u.departmentId === viewStaffDept.id)
                    .map((user) => (
                      <div
                        key={user.uid}
                        className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-[#53cafd] to-[#5e3ed0] rounded-full flex items-center justify-center text-white font-bold text-lg">
                            {user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-semibold text-white">{user.displayName}</h4>
                            <p className="text-sm text-slate-300">{user.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {user.uid === viewStaffDept.managerId && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#53cafd]/20 text-[#53cafd] rounded-full text-xs font-medium">
                              <Shield size={12} />
                              Trưởng phòng
                            </span>
                          )}
                          {user.monthlySalary && (
                            <p className="text-sm text-slate-300 mt-1">
                              {user.monthlySalary.toLocaleString('vi-VN')}đ/tháng
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-white/10 bg-[#5e3ed0]/20">
              <div className="flex items-center justify-between text-sm text-slate-300">
                <span>Tổng số nhân viên: <strong className="text-white">{users.filter(u => u.departmentId === viewStaffDept.id).length}</strong></span>
                <Button onClick={() => setViewStaffDept(null)} className="bg-white/10 hover:bg-white/20 text-white border-none">
                  Đóng
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
