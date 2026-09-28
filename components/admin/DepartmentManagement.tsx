'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, getDocs, doc, setDoc, deleteDoc } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { Building2, Plus, Edit2, Trash2, X, Save, Users, Search, Shield } from 'lucide-react';
import { Button } from '@/components/Button';
import { Department } from '@/types/department';
import { UserProfile } from '@/types/user';


export const DepartmentManagement: React.FC = () => {
  const { t, dateLocale } = useLanguage();
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
      const searchLower = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(dept =>
        dept.name?.toLowerCase().includes(searchLower) ||
        dept.description?.toLowerCase().includes(searchLower) ||
        dept.managerName?.toLowerCase().includes(searchLower) ||
        dept.id?.toLowerCase().includes(searchLower)
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
    return users.filter(u => u.departmentId === deptId && u.approved).length;
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
        alert(t('admin.departments.fillRequired'));
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

      alert(editingDept ? t('admin.departments.updateSuccess') : t('admin.departments.createSuccess'));
      setShowModal(false);
      loadData();
    } catch (error) {
      console.error('Error saving department:', error);
      alert(t('admin.departments.saveError'));
    }
  };

  const handleDelete = async (dept: Department) => {
    if (!confirm(t('admin.departments.confirmDelete', { name: dept.name }))) return;

    try {
      await deleteDoc(doc(db, 'departments', dept.id));
      alert(t('admin.departments.deleteSuccess'));
      loadData();
    } catch (error) {
      console.error('Error deleting department:', error);
      alert(t('admin.departments.deleteError'));
    }
  };

  if (loading) {
    return <div className="p-8 text-center">{t('common.loading')}</div>;
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('admin.departments.title')}</h1>
          <p className="text-slate-300">{t('admin.departments.subtitleAlt')}</p>
        </div>
        <Button onClick={handleAdd} className="flex items-center gap-2 bg-[#1B7A1E] hover:bg-[#156318] border-none text-white shadow-[#1B7A1E]/25">
          <Plus size={20} />
          {t('admin.departments.addDepartment')}
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder={t('admin.departments.searchPlaceholderAlt')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white placeholder-slate-400"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-slate-300 mb-2">{t('admin.departments.filterByProject')}</label>
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white [&>option]:bg-[#0E3A16] [&>option]:text-white"
        >
          <option value="">{t('admin.departments.allProjects')}</option>
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
          <p className="text-sm text-slate-300">{t('admin.departments.totalDepartments')}</p>
          <p className="text-2xl font-bold text-white">{departments.length}</p>
        </div>
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">{t('admin.departments.withManager')}</p>
          <p className="text-2xl font-bold text-[#1B7A1E]">
            {departments.filter(d => d.managerId).length}
          </p>
        </div>
        <div className="bg-[#5e3ed0]/20 p-4 rounded-lg border border-white/10 backdrop-blur-md">
          <p className="text-sm text-slate-300">{t('admin.departments.totalStaff')}</p>
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
                ? t('admin.departments.noMatchFilter')
                : t('admin.departments.noneYet')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#5e3ed0]/40 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {t('admin.departments.name')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {t('admin.departments.description')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {t('admin.departments.manager')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {t('admin.departments.projects')}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {t('admin.departments.staffCount')}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold text-slate-300 uppercase tracking-wider">
                    {t('common.actions')}
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
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#1B7A1E]/20 text-[#1B7A1E] rounded-full text-sm font-medium">
                          <Shield size={14} />
                          {dept.managerName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-orange-500/20 text-orange-300 rounded-full text-sm font-medium">
                          ⚠️ {t('admin.departments.noManagerYet')}
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
                          className="p-2 text-[#1B7A1E] hover:bg-white/10 rounded-lg transition-colors"
                          title={t('common.edit')}
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(dept)}
                          className="p-2 text-pink-500 hover:bg-white/10 rounded-lg transition-colors"
                          title={t('common.delete')}
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
          <div className="bg-[#0E3A16]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">
                {editingDept ? t('admin.departments.editDepartment') : t('admin.departments.addDepartmentNew')}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-white">
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t('admin.departments.name')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white"
                  placeholder={t('admin.departments.namePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t('admin.departments.description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white"
                  rows={3}
                  placeholder={t('admin.departments.descriptionPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">{t('admin.departments.manager')}</label>
                <select
                  value={formData.managerId}
                  onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                  className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] text-white [&>option]:bg-[#0E3A16] [&>option]:text-white"
                >
                  <option value="">{t('admin.departments.selectManager')}</option>
                  {editingDept && getUsersInDepartment(editingDept.id).map(user => (
                    <option key={user.uid} value={user.uid}>
                      {user.displayName} - {user.position || t('admin.departments.staffFallback')}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">
                  {editingDept
                    ? t('admin.departments.selectFromStaff', { count: getUsersInDepartment(editingDept.id).length })
                    : t('admin.departments.saveFirstHint')}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  {t('admin.departments.projects')}
                  {formData.projects.length > 0 && (
                    <span className="ml-2 text-xs text-[#1B7A1E]">
                      ({t('admin.departments.selectedProjects', { count: formData.projects.length })})
                    </span>
                  )}
                </label>
                <div className="space-y-2 max-h-48 overflow-y-auto border border-white/10 rounded-lg p-2 bg-white/5">
                  {projects.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">{t('admin.departments.noProjectsYet')}</p>
                  ) : (
                    projects.map(project => {
                      const isChecked = formData.projects.includes(project.id);
                      return (
                        <label
                          key={project.id}
                          className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors ${
                            isChecked 
                              ? 'bg-[#1B7A1E]/20 border border-[#1B7A1E]/30' 
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
                            className="w-4 h-4 text-[#1B7A1E] bg-white/5 border-white/20 rounded focus:ring-[#1B7A1E] focus:ring-2"
                          />
                          <span className={`text-sm flex-1 ${isChecked ? 'text-white font-medium' : 'text-slate-300'}`}>
                            {project.name}
                          </span>
                          {isChecked && (
                            <span className="text-xs text-[#1B7A1E]">✓</span>
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
                          className="inline-flex items-center px-2 py-1 bg-[#1B7A1E]/20 text-[#1B7A1E] rounded-md text-xs font-medium"
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
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 bg-[#1B7A1E] hover:bg-[#156318] border-none text-white shadow-[#1B7A1E]/25">
                <Save size={18} />
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}



      {/* View Staff Modal */}
      {viewStaffDept && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0E3A16]/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-[#5e3ed0]/20">
              <div>
                <h3 className="text-xl font-bold text-white">{t('admin.departments.staffListTitle')}</h3>
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
              {users.filter(u => u.departmentId === viewStaffDept.id && u.approved).length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 text-slate-500 mx-auto mb-4" />
                  <p className="text-slate-300">
                    {users.filter(u => u.departmentId === viewStaffDept.id).length === 0
                      ? t('admin.departments.noStaffInDept')
                      : t('admin.departments.noApprovedStaffInDept')}
                  </p>
                  {users.filter(u => u.departmentId === viewStaffDept.id && !u.approved).length > 0 && (
                    <p className="text-xs text-slate-400 mt-2">
                      {t('admin.departments.pendingStaffCount', { count: users.filter(u => u.departmentId === viewStaffDept.id && !u.approved).length })}
                    </p>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {users
                    .filter(u => u.departmentId === viewStaffDept.id && u.approved)
                    .map((user) => (
                      <div
                        key={user.uid}
                        className="flex items-center justify-between p-4 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-[#1B7A1E] to-[#5e3ed0] rounded-full flex items-center justify-center text-white font-bold text-lg">
                            {user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-semibold text-white">{user.displayName}</h4>
                            <p className="text-sm text-slate-300">{user.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {user.uid === viewStaffDept.managerId && (
                            <span className="inline-flex items-center gap-1 px-3 py-1 bg-[#1B7A1E]/20 text-[#1B7A1E] rounded-full text-xs font-medium">
                              <Shield size={12} />
                              {t('admin.users.positions.manager')}
                            </span>
                          )}
                          {user.monthlySalary && (
                            <p className="text-sm text-slate-300 mt-1">
                              {t('admin.departments.salaryPerMonth', { amount: user.monthlySalary.toLocaleString(dateLocale) })}
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
                <div>
                  <span>{t('admin.departments.totalApprovedStaff', { count: users.filter(u => u.departmentId === viewStaffDept.id && u.approved).length })}</span>
                  {users.filter(u => u.departmentId === viewStaffDept.id && !u.approved).length > 0 && (
                    <span className="ml-4 text-orange-300">
                      {t('admin.departments.pendingApprovalShort', { count: users.filter(u => u.departmentId === viewStaffDept.id && !u.approved).length })}
                    </span>
                  )}
                </div>
                <Button onClick={() => setViewStaffDept(null)} className="bg-white/10 hover:bg-white/20 text-white border-none">
                  {t('common.close')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
