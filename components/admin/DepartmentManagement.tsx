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
    <div className="min-h-screen space-y-6 bg-white p-8 text-[#111b38]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-[#111b38]">{t('admin.departments.title')}</h1>
          <p className="text-[#475569]">{t('admin.departments.subtitleAlt')}</p>
        </div>
        <Button onClick={handleAdd} className="flex items-center gap-2 border-none bg-[#1B7A1E] text-white shadow-[#1B7A1E]/25 hover:bg-[#156318]">
          <Plus size={20} />
          {t('admin.departments.addDepartment')}
        </Button>
      </div>

      {/* Search */}
      <div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={20} />
          <input
            type="text"
            placeholder={t('admin.departments.searchPlaceholderAlt')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-[#1B7A1E] bg-white py-2 pl-10 pr-4 text-[#111b38] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
          />
        </div>
      </div>

      {/* Filters */}
      <div>
        <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.departments.filterByProject')}</label>
        <select
          value={filterProjectId}
          onChange={(e) => setFilterProjectId(e.target.value)}
          className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
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
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-[#1B7A1E] bg-white p-4">
          <p className="text-sm text-[#66718b]">{t('admin.departments.totalDepartments')}</p>
          <p className="text-2xl font-bold text-[#1B7A1E]">{departments.length}</p>
        </div>
        <div className="rounded-xl border border-[#1B7A1E] bg-white p-4">
          <p className="text-sm text-[#66718b]">{t('admin.departments.withManager')}</p>
          <p className="text-2xl font-bold text-[#1B7A1E]">
            {departments.filter(d => d.managerId).length}
          </p>
        </div>
        <div className="rounded-xl border border-[#1B7A1E] bg-white p-4">
          <p className="text-sm text-[#66718b]">{t('admin.departments.totalStaff')}</p>
          <p className="text-2xl font-bold text-[#1B7A1E]">
            {users.length}
          </p>
        </div>
      </div>

      {/* Departments Table */}
      <div className="overflow-hidden rounded-xl border border-[#1B7A1E] bg-white">
        {filteredDepartments.length === 0 ? (
          <div className="py-12 text-center">
            <Building2 className="mx-auto mb-4 h-16 w-16 text-[#94a3b8]" />
            <p className="text-[#475569]">
              {searchTerm || filterProjectId 
                ? t('admin.departments.noMatchFilter')
                : t('admin.departments.noneYet')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white">
              <thead className="border-b border-[#1B7A1E] bg-white">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.departments.name')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.departments.description')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.departments.manager')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.departments.projects')}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.departments.staffCount')}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredDepartments.map((dept) => (
                  <tr key={dept.id} className="border-b border-[#d8ecd9] bg-white transition-colors hover:bg-[#f3faf4]">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-[#edf7ee] p-2">
                          <Building2 className="h-5 w-5 text-[#1B7A1E]" />
                        </div>
                        <div>
                          <p className="font-semibold text-[#111b38]">{dept.name}</p>
                          <p className="text-xs text-[#94a3b8]">ID: {dept.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="max-w-md line-clamp-2 text-sm text-[#475569]">
                        {dept.description || '-'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {dept.managerName ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7ee] px-3 py-1 text-sm font-medium text-[#1B7A1E]">
                          <Shield size={14} />
                          {dept.managerName}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700">
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
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => setViewStaffDept(dept)}
                        className="inline-flex items-center gap-2 rounded-lg bg-[#edf7ee] px-3 py-1 text-sm font-medium text-[#1B7A1E] transition-colors hover:bg-[#d8ecd9]"
                      >
                        <Users size={16} />
                        <span>{getStaffCount(dept.id)}</span>
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(dept)}
                          className="rounded-lg p-2 text-[#1B7A1E] transition-colors hover:bg-[#edf7ee]"
                          title={t('common.edit')}
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(dept)}
                          className="rounded-lg p-2 text-red-600 transition-colors hover:bg-red-50"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-[#1B7A1E] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1B7A1E] p-6">
              <h3 className="text-xl font-bold text-[#111b38]">
                {editingDept ? t('admin.departments.editDepartment') : t('admin.departments.addDepartmentNew')}
              </h3>
              <button onClick={() => setShowModal(false)} className="rounded-lg p-2 text-[#66718b] hover:bg-[#edf7ee]">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-4 p-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.departments.name')}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                  placeholder={t('admin.departments.namePlaceholder')}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.departments.description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                  rows={3}
                  placeholder={t('admin.departments.descriptionPlaceholder')}
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.departments.manager')}</label>
                <select
                  value={formData.managerId}
                  onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                  className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
                >
                  <option value="">{t('admin.departments.selectManager')}</option>
                  {editingDept && getUsersInDepartment(editingDept.id).map(user => (
                    <option key={user.uid} value={user.uid}>
                      {user.displayName} - {user.position || t('admin.departments.staffFallback')}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-[#94a3b8]">
                  {editingDept
                    ? t('admin.departments.selectFromStaff', { count: getUsersInDepartment(editingDept.id).length })
                    : t('admin.departments.saveFirstHint')}
                </p>
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-[#475569]">
                  {t('admin.departments.projects')}
                  {formData.projects.length > 0 && (
                    <span className="ml-2 text-xs text-[#1B7A1E]">
                      ({t('admin.departments.selectedProjects', { count: formData.projects.length })})
                    </span>
                  )}
                </label>
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-[#1B7A1E] bg-white p-2">
                  {projects.length === 0 ? (
                    <p className="py-4 text-center text-xs text-[#94a3b8]">{t('admin.departments.noProjectsYet')}</p>
                  ) : (
                    projects.map(project => {
                      const isChecked = formData.projects.includes(project.id);
                      return (
                        <label
                          key={project.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg p-2 transition-colors ${
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
                            className="h-4 w-4 rounded border-[#1B7A1E] text-[#1B7A1E] focus:ring-2 focus:ring-[#1B7A1E]"
                          />
                          <span className={`flex-1 text-sm ${isChecked ? 'font-medium text-[#1B7A1E]' : 'text-[#475569]'}`}>
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
                          className="inline-flex items-center rounded-md bg-[#edf7ee] px-2 py-1 text-xs font-medium text-[#1B7A1E]"
                        >
                          {project.name}
                        </span>
                      ) : null;
                    })}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 border-t border-[#1B7A1E] p-6">
              <Button onClick={() => setShowModal(false)} className="flex-1 border border-[#1B7A1E] bg-white text-[#1B7A1E] hover:bg-[#edf7ee]">
                {t('common.cancel')}
              </Button>
              <Button onClick={handleSave} className="flex flex-1 items-center justify-center gap-2 border-none bg-[#1B7A1E] text-white shadow-[#1B7A1E]/25 hover:bg-[#156318]">
                <Save size={18} />
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      )}



      {/* View Staff Modal */}
      {viewStaffDept && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#1B7A1E] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1B7A1E] bg-[#f3faf4] p-6">
              <div>
                <h3 className="text-xl font-bold text-[#111b38]">{t('admin.departments.staffListTitle')}</h3>
                <p className="mt-1 text-sm text-[#475569]">{viewStaffDept.name}</p>
              </div>
              <button
                onClick={() => setViewStaffDept(null)}
                className="rounded-lg p-2 text-[#66718b] transition-colors hover:bg-[#edf7ee]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {users.filter(u => u.departmentId === viewStaffDept.id && u.approved).length === 0 ? (
                <div className="py-12 text-center">
                  <Users className="mx-auto mb-4 h-16 w-16 text-[#94a3b8]" />
                  <p className="text-[#475569]">
                    {users.filter(u => u.departmentId === viewStaffDept.id).length === 0
                      ? t('admin.departments.noStaffInDept')
                      : t('admin.departments.noApprovedStaffInDept')}
                  </p>
                  {users.filter(u => u.departmentId === viewStaffDept.id && !u.approved).length > 0 && (
                    <p className="mt-2 text-xs text-[#94a3b8]">
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
                        className="flex items-center justify-between rounded-xl border border-[#1B7A1E] bg-white p-4 transition-colors hover:bg-[#f3faf4]"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1B7A1E] text-lg font-bold text-white">
                            {user.displayName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h4 className="font-semibold text-[#111b38]">{user.displayName}</h4>
                            <p className="text-sm text-[#475569]">{user.email}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {user.uid === viewStaffDept.managerId && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7ee] px-3 py-1 text-xs font-medium text-[#1B7A1E]">
                              <Shield size={12} />
                              {t('admin.users.positions.manager')}
                            </span>
                          )}
                          {user.monthlySalary && (
                            <p className="mt-1 text-sm text-[#475569]">
                              {t('admin.departments.salaryPerMonth', { amount: user.monthlySalary.toLocaleString(dateLocale) })}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="border-t border-[#1B7A1E] bg-[#f3faf4] p-6">
              <div className="flex items-center justify-between text-sm text-[#475569]">
                <div>
                  <span>{t('admin.departments.totalApprovedStaff', { count: users.filter(u => u.departmentId === viewStaffDept.id && u.approved).length })}</span>
                  {users.filter(u => u.departmentId === viewStaffDept.id && !u.approved).length > 0 && (
                    <span className="ml-4 text-orange-700">
                      {t('admin.departments.pendingApprovalShort', { count: users.filter(u => u.departmentId === viewStaffDept.id && !u.approved).length })}
                    </span>
                  )}
                </div>
                <Button onClick={() => setViewStaffDept(null)} className="border border-[#1B7A1E] bg-white text-[#1B7A1E] hover:bg-[#edf7ee]">
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
