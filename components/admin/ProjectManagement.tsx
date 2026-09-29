'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { collection, getDocs, doc, setDoc, deleteDoc, query, where } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { FolderKanban, Plus, Edit2, Trash2, X, Save, Search, Users, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import { Button } from '@/components/Button';
import { Project, ProjectStatus, ProjectPriority } from '@/types/project';
import { UserProfile } from '@/types/user';
import { Department } from '@/types/department';

export const ProjectManagement: React.FC = () => {
  const { t, dateLocale } = useLanguage();
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
        alert(t('admin.projects.firestorePermissionError'));
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
        alert(t('admin.projects.firestorePermissionError'));
      } else {
        alert(t('admin.projects.saveError', { error: error.message || 'Unknown error' }));
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
    if (!confirm(t('admin.projects.confirmDelete'))) return;

    try {
      await deleteDoc(doc(db, 'projects', id));
      loadData();
    } catch (error) {
      console.error('Error deleting project:', error);
      alert(t('admin.projects.deleteError'));
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
      case 'planning': return 'bg-blue-100 text-blue-700';
      case 'in_progress': return 'bg-amber-100 text-amber-700';
      case 'completed': return 'bg-[#edf7ee] text-[#1B7A1E]';
      case 'on_hold': return 'bg-slate-100 text-slate-600';
      case 'cancelled': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getPriorityColor = (priority: ProjectPriority) => {
    switch (priority) {
      case 'low': return 'bg-slate-100 text-slate-600';
      case 'medium': return 'bg-blue-100 text-blue-700';
      case 'high': return 'bg-orange-100 text-orange-700';
      case 'urgent': return 'bg-red-100 text-red-700';
      default: return 'bg-slate-100 text-slate-600';
    }
  };

  const getStatusLabel = (status: ProjectStatus) => {
    const labels: Record<ProjectStatus, string> = {
      planning: t('admin.projects.statusPlanning'),
      in_progress: t('admin.projects.statusInProgress'),
      completed: t('admin.projects.statusCompleted'),
      on_hold: t('admin.projects.statusOnHold'),
      cancelled: t('admin.projects.statusCancelled'),
    };
    return labels[status];
  };

  const getPriorityLabel = (priority: ProjectPriority) => {
    const labels: Record<ProjectPriority, string> = {
      low: t('admin.projects.priorityLow'),
      medium: t('admin.projects.priorityMedium'),
      high: t('admin.projects.priorityHigh'),
      urgent: t('admin.projects.priorityUrgent'),
    };
    return labels[priority];
  };

  if (loading) {
    return <div className="p-8 text-center">{t('common.loading')}</div>;
  }

  return (
    <div className="min-h-screen space-y-6 bg-white p-8 text-[#111b38]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="mb-2 text-3xl font-bold text-[#111b38]">{t('admin.projects.titleAlt')}</h1>
          <p className="text-[#475569]">{t('admin.projects.subtitleAlt')}</p>
        </div>
        <Button onClick={() => { resetForm(); setShowModal(true); }} className="flex items-center gap-2 border-none bg-[#1B7A1E] text-white shadow-[#1B7A1E]/25 hover:bg-[#156318]">
          <Plus size={20} />
          {t('admin.projects.addProjectAlt')}
        </Button>
      </div>

      {/* Search */}
      <div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" size={20} />
          <input
            type="text"
            placeholder={t('admin.projects.searchPlaceholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-[#1B7A1E] bg-white py-2 pl-10 pr-4 text-[#111b38] placeholder-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
          />
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.filterByStatus')}</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as ProjectStatus | 'all')}
            className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
          >
            <option value="all">{t('admin.projects.allStatuses')}</option>
            <option value="planning">{t('admin.projects.statusPlanning')}</option>
            <option value="in_progress">{t('admin.projects.statusInProgress')}</option>
            <option value="completed">{t('admin.projects.statusCompleted')}</option>
            <option value="on_hold">{t('admin.projects.statusOnHold')}</option>
            <option value="cancelled">{t('admin.projects.statusCancelled')}</option>
          </select>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.filterByPriority')}</label>
          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value as ProjectPriority | 'all')}
            className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
          >
            <option value="all">{t('admin.projects.allPriorities')}</option>
            <option value="low">{t('admin.projects.priorityLow')}</option>
            <option value="medium">{t('admin.projects.priorityMedium')}</option>
            <option value="high">{t('admin.projects.priorityHigh')}</option>
            <option value="urgent">{t('admin.projects.priorityUrgent')}</option>
          </select>
        </div>
      </div>

      {/* Projects Table */}
      <div className="overflow-hidden rounded-xl border border-[#1B7A1E] bg-white">
        {filteredProjects.length === 0 ? (
          <div className="py-12 text-center">
            <FolderKanban className="mx-auto mb-4 h-16 w-16 text-[#94a3b8]" />
            <p className="text-[#475569]">
              {searchTerm ? t('admin.projects.notFound') : t('admin.projects.noProjectsAlt')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse bg-white">
              <thead className="border-b border-[#1B7A1E] bg-white">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.projects.nameAlt')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.projects.status')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.projects.priority')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.projects.manager')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.projects.department')}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.projects.members')}
                  </th>
                  <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('admin.projects.budget')}
                  </th>
                  <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-wider text-[#1B7A1E]">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredProjects.map((project) => (
                  <tr key={project.id} className="border-b border-[#d8ecd9] bg-white transition-colors hover:bg-[#f3faf4]">
                    <td className="whitespace-nowrap px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-[#edf7ee] p-2">
                          <FolderKanban className="h-5 w-5 text-[#1B7A1E]" />
                        </div>
                        <div>
                          <p className="font-semibold text-[#111b38]">{project.name}</p>
                          {project.description && (
                            <p className="max-w-md line-clamp-1 text-xs text-[#94a3b8]">{project.description}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${getStatusColor(project.status)}`}>
                        {getStatusLabel(project.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      <span className={`rounded-full px-3 py-1 text-xs font-medium ${getPriorityColor(project.priority)}`}>
                        {getPriorityLabel(project.priority)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {project.managerName ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7ee] px-3 py-1 text-sm font-medium text-[#1B7A1E]">
                          {project.managerName}
                        </span>
                      ) : (
                        <span className="text-sm text-[#94a3b8]">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {project.departmentName ? (
                        <span className="inline-flex items-center rounded-md bg-[#edf7ee] px-2 py-1 text-xs font-medium text-[#1B7A1E]">
                          {project.departmentName}
                        </span>
                      ) : (
                        <span className="text-sm text-[#94a3b8]">-</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-6 py-4 text-center">
                      <span className="inline-flex items-center gap-2 rounded-lg bg-[#edf7ee] px-3 py-1 text-sm font-medium text-[#1B7A1E]">
                        <Users size={16} />
                        <span>{project.memberNames?.length || 0}</span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-6 py-4">
                      {project.budget ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#edf7ee] px-3 py-1 text-sm font-medium text-[#1B7A1E]">
                          <DollarSign size={14} />
                          {project.budget.toLocaleString(dateLocale)} đ
                        </span>
                      ) : (
                        <span className="text-sm text-[#94a3b8]">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(project)}
                          className="rounded-lg p-2 text-[#1B7A1E] transition-colors hover:bg-[#edf7ee]"
                          title={t('common.edit')}
                        >
                          <Edit2 size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(project.id)}
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
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#1B7A1E] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#1B7A1E] p-6">
              <h3 className="text-xl font-bold text-[#111b38]">
                {editingProject ? t('admin.projects.editProject') : t('admin.projects.addProjectNew')}
              </h3>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="rounded-lg p-2 text-[#66718b] hover:bg-[#edf7ee]">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4 p-6">
              <div>
                <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.nameAlt')} *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                  placeholder={t('admin.projects.namePlaceholder')}
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                  placeholder={t('admin.projects.descriptionPlaceholder')}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.status')}</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value as ProjectStatus })}
                    className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
                  >
                    <option value="planning">{t('admin.projects.statusPlanning')}</option>
                    <option value="in_progress">{t('admin.projects.statusInProgress')}</option>
                    <option value="completed">{t('admin.projects.statusCompleted')}</option>
                    <option value="on_hold">{t('admin.projects.statusOnHold')}</option>
                    <option value="cancelled">{t('admin.projects.statusCancelled')}</option>
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.priorityFull')}</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: e.target.value as ProjectPriority })}
                    className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
                  >
                    <option value="low">{t('admin.projects.priorityLow')}</option>
                    <option value="medium">{t('admin.projects.priorityMedium')}</option>
                    <option value="high">{t('admin.projects.priorityHigh')}</option>
                    <option value="urgent">{t('admin.projects.priorityUrgent')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.startDate')}</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.endDate')}</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.manager')}</label>
                  <select
                    value={formData.managerId}
                    onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                    className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
                  >
                    <option value="">{t('admin.projects.selectManager')}</option>
                    {users.map(user => (
                      <option key={user.uid} value={user.uid}>{user.displayName}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.department')}</label>
                  <select
                    value={formData.departmentId}
                    onChange={(e) => setFormData({ ...formData, departmentId: e.target.value })}
                    className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] [&>option]:bg-white [&>option]:text-[#111b38]"
                  >
                    <option value="">{t('admin.users.selectDepartment')}</option>
                    {departments.map(dept => (
                      <option key={dept.id} value={dept.id}>{dept.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-[#475569]">{t('admin.projects.budgetVnd')}</label>
                <input
                  type="number"
                  min="0"
                  value={formData.budget}
                  onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
                  className="w-full rounded-lg border border-[#1B7A1E] bg-white px-4 py-2 text-[#111b38] focus:outline-none focus:ring-2 focus:ring-[#1B7A1E]"
                  placeholder="0"
                />
              </div>

              <div className="flex gap-3 border-t border-[#1B7A1E] p-6">
                <Button onClick={() => { setShowModal(false); resetForm(); }} className="flex-1 border border-[#1B7A1E] bg-white text-[#1B7A1E] hover:bg-[#edf7ee]">
                  {t('common.cancel')}
                </Button>
                <Button type="submit" className="flex flex-1 items-center justify-center gap-2 border-none bg-[#1B7A1E] text-white shadow-[#1B7A1E]/25 hover:bg-[#156318]">
                  <Save size={18} />
                  {t('common.save')}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
