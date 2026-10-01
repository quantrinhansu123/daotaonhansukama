'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, db } from '@/lib/data-store';
import { Project, ProjectPriority, ProjectStatus } from '@/types/project';
import { Department } from '@/types/department';
import { UserProfile } from '@/types/user';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/Button';
import {
  Calendar,
  Check,
  DollarSign,
  FolderKanban,
  Pencil,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';

const statusTone: Record<ProjectStatus, string> = {
  planning: 'bg-[#eff6ff] text-[#1B7A1E]',
  in_progress: 'bg-[#edfbf4] text-[#14661a]',
  completed: 'bg-[#e8f5ea] text-[#0f5c18]',
  on_hold: 'bg-[#fff8e8] text-[#9a6b08]',
  cancelled: 'bg-[#fff1f1] text-[#b42318]',
};

const priorityTone: Record<ProjectPriority, string> = {
  low: 'bg-[#f5f8fc] text-[#52617c]',
  medium: 'bg-[#eff6ff] text-[#1B7A1E]',
  high: 'bg-[#fff6e9] text-[#df8b00]',
  urgent: 'bg-[#fff1f1] text-[#b42318]',
};

interface ProjectFormData {
  name: string;
  description: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  departmentId: string;
  managerId: string;
  members: string[];
  startDate: string;
  endDate: string;
  budget: number;
  tagsString: string;
}

const defaultFormData: ProjectFormData = {
  name: '',
  description: '',
  status: 'planning',
  priority: 'medium',
  departmentId: '',
  managerId: '',
  members: [],
  startDate: '',
  endDate: '',
  budget: 0,
  tagsString: '',
};

export function StudentProjects() {
  const { userProfile } = useAuth();
  const { hasPermission } = usePermissions();
  const { t, dateLocale } = useLanguage();

  const canManage = userProfile?.role === 'admin' || hasPermission('manage_projects');

  const [projects, setProjects] = useState<Project[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [staffUsers, setStaffUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [formData, setFormData] = useState<ProjectFormData>(defaultFormData);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [projSnap, deptSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'projects')),
        getDocs(collection(db, 'departments')),
        getDocs(collection(db, 'users')),
      ]);

      const depts = deptSnap.docs.map(d => ({
        id: d.id,
        ...d.data(),
      })) as Department[];
      setDepartments(depts);

      const users = usersSnap.docs.map(docSnap => {
        const data = docSnap.data() as UserProfile;
        return {
          ...data,
          uid: data.uid || docSnap.id,
          docId: docSnap.id,
        } as UserProfile;
      });
      setStaffUsers(users.filter(u => u.role === 'staff' || u.role === 'admin'));

      const rows = projSnap.docs.map(docSnap => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
        } as Project;
      });

      rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
      setProjects(rows);
      if (rows.length > 0) {
        setSelectedId(prev => (prev && rows.some(r => r.id === prev) ? prev : rows[0].id));
      }
    } catch (error) {
      console.error('Error loading projects:', error);
      setNotice(t('admin.projects.loadError') || 'Có lỗi xảy ra khi tải danh sách dự án');
    } finally {
      setLoading(false);
    }
  };

  const statusLabel: Record<ProjectStatus, string> = {
    planning: t('student.projects.statusPlanning'),
    in_progress: t('student.projects.statusProgress'),
    completed: t('student.projects.statusCompleted'),
    on_hold: t('student.projects.statusHold'),
    cancelled: t('student.projects.statusCancelled'),
  };

  const priorityLabel: Record<ProjectPriority, string> = {
    low: t('student.projects.priorityLow'),
    medium: t('student.projects.priorityMedium'),
    high: t('student.projects.priorityHigh'),
    urgent: t('student.projects.priorityUrgent'),
  };

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return projects.filter(project => {
      const matchStatus = statusFilter === 'all' || project.status === statusFilter;
      const haystack = [
        project.name,
        project.description,
        project.managerName,
        project.departmentName,
        ...(project.memberNames || []),
        ...(project.tags || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return matchStatus && (!keyword || haystack.includes(keyword));
    });
  }, [projects, query, statusFilter]);

  const selected = filtered.find(item => item.id === selectedId) || filtered[0] || null;

  const stats = [
    { label: t('student.projects.total'), value: projects.length },
    { label: t('student.projects.active'), value: projects.filter(p => p.status === 'in_progress').length },
    { label: t('student.projects.completedCount'), value: projects.filter(p => p.status === 'completed').length },
    { label: t('student.projects.planningCount'), value: projects.filter(p => p.status === 'planning').length },
  ];

  const openAdd = () => {
    setEditingProject(null);
    setFormData(defaultFormData);
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setFormData({
      name: project.name || '',
      description: project.description || '',
      status: project.status || 'planning',
      priority: project.priority || 'medium',
      departmentId: project.departmentId || '',
      managerId: project.managerId || '',
      members: project.members || [],
      startDate: project.startDate || '',
      endDate: project.endDate || '',
      budget: project.budget || 0,
      tagsString: (project.tags || []).join(', '),
    });
    setFormError('');
    setShowModal(true);
  };

  const toggleMember = (uid: string) => {
    setFormData(prev => {
      const exists = prev.members.includes(uid);
      return {
        ...prev,
        members: exists ? prev.members.filter(id => id !== uid) : [...prev.members, uid],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formData.name.trim();
    if (!name) {
      setFormError(t('admin.projects.fillRequired') || 'Vui lòng nhập tên dự án');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const projectId = editingProject?.id || `proj_${Date.now()}`;
      const manager = formData.managerId ? staffUsers.find(u => u.uid === formData.managerId) : null;
      const dept = formData.departmentId ? departments.find(d => d.id === formData.departmentId) : null;
      const memberNames = formData.members
        .map(id => staffUsers.find(u => u.uid === id)?.displayName)
        .filter(Boolean) as string[];

      const tags = formData.tagsString
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const projectData: Record<string, unknown> = {
        name,
        description: formData.description.trim(),
        status: formData.status,
        priority: formData.priority,
        departmentId: formData.departmentId || null,
        departmentName: dept?.name || null,
        managerId: formData.managerId || null,
        managerName: manager?.displayName || null,
        members: formData.members,
        memberNames,
        startDate: formData.startDate || null,
        endDate: formData.endDate || null,
        budget: Number(formData.budget) || 0,
        tags,
        updatedAt: new Date(),
      };
      if (!editingProject) {
        projectData.createdAt = new Date();
      }

      await setDoc(doc(db, 'projects', projectId), projectData, { merge: true });

      setNotice(
        editingProject
          ? (t('admin.projects.updateSuccess') || 'Cập nhật dự án thành công!')
          : (t('admin.projects.createSuccess') || 'Tạo dự án thành công!')
      );
      setShowModal(false);
      await loadData();
      setSelectedId(projectId);
    } catch (err: unknown) {
      console.error('Error saving project:', err);
      setFormError(err instanceof Error ? err.message : (t('admin.projects.saveError') || 'Có lỗi xảy ra khi lưu dự án'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (project: Project) => {
    if (!confirm(t('admin.projects.confirmDelete', { name: project.name }) || `Bạn có chắc chắn muốn xóa dự án "${project.name}"?`)) {
      return;
    }

    setDeletingId(project.id);
    setNotice('');
    try {
      await deleteDoc(doc(db, 'projects', project.id));
      setNotice(t('admin.projects.deleteSuccess') || 'Xóa dự án thành công!');
      await loadData();
    } catch (err: unknown) {
      console.error('Error deleting project:', err);
      setNotice(err instanceof Error ? err.message : (t('admin.projects.deleteError') || 'Có lỗi xảy ra khi xóa dự án'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-[280px] place-items-center rounded-2xl border border-[#e7edf5] bg-white text-[13px] text-[#63708a]">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[20px] font-bold tracking-tight text-[#111b38]">{t('student.academy.navProjects')}</h1>
          <p className="mt-1 text-[13px] text-[#63708a]">{t('student.projects.subtitle')}</p>
        </div>
        {canManage && (
          <Button onClick={openAdd} size="sm" className="gap-2 border-none !px-4 !py-2.5">
            <Plus size={16} />
            {t('admin.projects.addProject') || 'Thêm dự án'}
          </Button>
        )}
      </div>

      {notice && (
        <div role="status" className="flex items-center justify-between gap-3 rounded-xl border border-[#c6ebd4] bg-[#edfbf4] px-4 py-3 text-[13px] font-medium text-[#14661a]">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice('')} aria-label={t('common.close')} className="rounded-lg p-1 hover:bg-white/70">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <span className="mb-3 inline-flex rounded-xl bg-[#edfbf4] p-2.5 text-[#18701C]">
              <FolderKanban size={18} />
            </span>
            <p className="m-0 text-[28px] font-bold tabular-nums text-[#111b38]">{stat.value}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#63708a]">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_320px]">
        <section className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
          <div className="flex flex-wrap gap-2 border-b border-[#eef2f7] p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99a4b5]" size={16} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('student.projects.search')}
                className="w-full rounded-xl border border-[#e7edf5] bg-[#f8fafc] py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#18701C]"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-xl border border-[#e7edf5] bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-[#18701C]"
            >
              <option value="all">{t('student.projects.filterAll')}</option>
              <option value="planning">{t('student.projects.statusPlanning')}</option>
              <option value="in_progress">{t('student.projects.statusProgress')}</option>
              <option value="completed">{t('student.projects.statusCompleted')}</option>
              <option value="on_hold">{t('student.projects.statusHold')}</option>
              <option value="cancelled">{t('student.projects.statusCancelled')}</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="bg-[#f7faf8] text-[11px] font-bold uppercase tracking-wide text-[#63708a]">
                <tr>
                  <th className="px-3 py-3 font-bold">#</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colName')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colStatus')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colPriority')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colManager')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colDept')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colTimeline')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-10 text-center text-[#63708a]">
                      {t('student.projects.empty')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((project, index) => {
                    const active = selected?.id === project.id;
                    return (
                      <tr
                        key={project.id}
                        onClick={() => setSelectedId(project.id)}
                        className={`cursor-pointer border-t border-[#eef2f7] transition hover:bg-[#f4faf6] ${
                          active ? 'bg-[#eff8f0]' : ''
                        }`}
                      >
                        <td className="px-3 py-3 text-[12px] font-bold text-[#18701C]">{index + 1}</td>
                        <td className="px-3 py-3">
                          <b className="block truncate text-[13px] font-semibold text-[#111b38]">{project.name}</b>
                          <small className="line-clamp-1 text-[12px] text-[#7a869c]">{project.description || '—'}</small>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${statusTone[project.status] || 'bg-slate-100 text-slate-700'}`}>
                            {statusLabel[project.status] || project.status}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${priorityTone[project.priority] || 'bg-slate-100 text-slate-700'}`}>
                            {priorityLabel[project.priority] || project.priority}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#243552]">
                          {project.managerName || '—'}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#243552]">
                          {project.departmentName || t('student.general')}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-[12px] text-[#52617c]">
                          {project.startDate || project.endDate
                            ? `${project.startDate || '—'} → ${project.endDate || '—'}`
                            : '—'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
          <p className="m-0 mb-3 text-[13px] font-bold text-[#111b38]">{t('student.projects.preview')}</p>
          {selected ? (
            <div>
              <div className="grid h-28 place-items-center rounded-2xl bg-gradient-to-br from-[#0a2f12] to-[#18701C] text-white">
                <FolderKanban size={40} />
              </div>
              <h3 className="mt-4 text-[16px] font-bold text-[#111b38]">{selected.name}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[#63708a]">
                {selected.description || t('student.projects.noDescription')}
              </p>
              <div className="mt-4 space-y-2 rounded-xl bg-[#f7faf8] p-3 text-[13px]">
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.projects.colStatus')}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${statusTone[selected.status]}`}>
                    {statusLabel[selected.status]}
                  </span>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.projects.colPriority')}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${priorityTone[selected.priority]}`}>
                    {priorityLabel[selected.priority]}
                  </span>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.projects.colManager')}</span>
                  <b>{selected.managerName || '—'}</b>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.projects.colDept')}</span>
                  <b>{selected.departmentName || t('student.general')}</b>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('admin.projects.budget') || 'Ngân sách'}</span>
                  <b>{selected.budget ? `${Number(selected.budget).toLocaleString()} ₫` : '—'}</b>
                </p>
              </div>

              {canManage && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Button onClick={() => openEdit(selected)} size="sm" className="gap-2 !px-3 !py-2">
                    <Pencil size={14} />
                    {t('common.edit')}
                  </Button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(selected)}
                    disabled={deletingId === selected.id}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#f1c9c9] px-3 py-2 text-[12px] font-semibold text-[#a33b3b] transition hover:bg-[#fff5f5] disabled:cursor-wait disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    {t('common.delete')}
                  </button>
                </div>
              )}

              {selected.tags && selected.tags.length > 0 && (
                <div className="mt-4">
                  <b className="text-[12px] text-[#111b38]">{t('admin.projects.tags') || 'Thẻ tag'}</b>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.tags.map(tag => (
                      <span key={tag} className="rounded-lg bg-[#f0f4f8] px-2 py-1 text-[11px] font-semibold text-[#52617c]">
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {selected.memberNames && selected.memberNames.length > 0 && (
                <div className="mt-4">
                  <b className="text-[12px] text-[#111b38]">{t('student.projects.members')} ({selected.memberNames.length})</b>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.memberNames.map(name => (
                      <span key={name} className="inline-flex items-center gap-1 rounded-full bg-[#edfbf4] px-2.5 py-1 text-[11px] font-semibold text-[#18701C]">
                        <Users size={12} />
                        {name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-[#63708a]">{t('student.projects.empty')}</p>
          )}
        </aside>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={event => { if (event.target === event.currentTarget && !saving) setShowModal(false); }}
        >
          <section role="dialog" aria-modal="true" className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-[#d7e5db] bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#eef2f7] bg-[#f7faf8] px-5 py-4">
              <div>
                <h2 className="m-0 text-[17px] font-bold text-[#111b38]">
                  {editingProject ? (t('admin.projects.editProject') || 'Chỉnh sửa dự án') : (t('admin.projects.addProject') || 'Thêm dự án mới')}
                </h2>
                <p className="mb-0 mt-1 text-[12px] text-[#63708a]">
                  {editingProject ? 'Cập nhật tiến độ, mức độ ưu tiên và nhân sự tham gia dự án' : 'Nhập thông tin dự án mới trong hệ thống quản trị'}
                </p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} disabled={saving} aria-label={t('common.close')} className="rounded-lg p-2 text-[#63708a] transition hover:bg-white disabled:opacity-50">
                <X size={18} />
              </button>
            </header>

            <form onSubmit={handleSave}>
              <div className="grid gap-4 p-5 sm:grid-cols-2 max-h-[75vh] overflow-y-auto">
                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c] sm:col-span-2">
                  <span>{t('admin.projects.name') || 'Tên dự án'} *</span>
                  <input
                    required
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ví dụ: Triển khai LMS 2026, Nâng cấp hạ tầng..."
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>

                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c] sm:col-span-2">
                  <span>{t('admin.projects.description') || 'Mô tả'}</span>
                  <textarea
                    rows={2}
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Mô tả mục tiêu, phạm vi của dự án..."
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>

                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('student.projects.colStatus') || 'Trạng thái'}</span>
                  <select
                    value={formData.status}
                    onChange={e => setFormData(prev => ({ ...prev, status: e.target.value as ProjectStatus }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  >
                    <option value="planning">{statusLabel.planning}</option>
                    <option value="in_progress">{statusLabel.in_progress}</option>
                    <option value="completed">{statusLabel.completed}</option>
                    <option value="on_hold">{statusLabel.on_hold}</option>
                    <option value="cancelled">{statusLabel.cancelled}</option>
                  </select>
                </label>

                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('student.projects.colPriority') || 'Mức độ ưu tiên'}</span>
                  <select
                    value={formData.priority}
                    onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value as ProjectPriority }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  >
                    <option value="low">{priorityLabel.low}</option>
                    <option value="medium">{priorityLabel.medium}</option>
                    <option value="high">{priorityLabel.high}</option>
                    <option value="urgent">{priorityLabel.urgent}</option>
                  </select>
                </label>

                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.projects.department') || 'Phòng ban phụ trách'}</span>
                  <select
                    value={formData.departmentId}
                    onChange={e => setFormData(prev => ({ ...prev, departmentId: e.target.value }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  >
                    <option value="">-- Chọn phòng ban --</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.projects.manager') || 'Người quản lý dự án'}</span>
                  <select
                    value={formData.managerId}
                    onChange={e => setFormData(prev => ({ ...prev, managerId: e.target.value }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  >
                    <option value="">-- Chọn người quản lý --</option>
                    {staffUsers.map(user => (
                      <option key={user.uid} value={user.uid}>
                        {user.displayName} ({user.position || user.role})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.projects.startDate') || 'Ngày bắt đầu'}</span>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={e => setFormData(prev => ({ ...prev, startDate: e.target.value }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>

                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.projects.endDate') || 'Ngày kết thúc'}</span>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={e => setFormData(prev => ({ ...prev, endDate: e.target.value }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>

                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.projects.budget') || 'Ngân sách (VNĐ)'}</span>
                  <input
                    type="number"
                    min={0}
                    value={formData.budget || ''}
                    onChange={e => setFormData(prev => ({ ...prev, budget: Number(e.target.value) || 0 }))}
                    placeholder="0"
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>

                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.projects.tags') || 'Tags (phân cách bởi dấu phẩy)'}</span>
                  <input
                    type="text"
                    value={formData.tagsString}
                    onChange={e => setFormData(prev => ({ ...prev, tagsString: e.target.value }))}
                    placeholder="AI, Frontend, Q1..."
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>

                <div className="sm:col-span-2">
                  <span className="block mb-2 text-[12px] font-semibold text-[#52617c]">
                    {t('admin.projects.members') || 'Thành viên tham gia'} ({formData.members.length})
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto rounded-xl border border-[#dfe7e2] p-2 bg-[#f8fafc]">
                    {staffUsers.map(user => {
                      const isChecked = formData.members.includes(user.uid);
                      return (
                        <label
                          key={user.uid}
                          className={`flex items-center gap-2 rounded-lg border p-2 text-[12px] cursor-pointer transition ${
                            isChecked
                              ? 'border-[#18701C] bg-[#edfbf4] font-semibold text-[#18701C]'
                              : 'border-[#e7edf5] bg-white text-[#52617c] hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggleMember(user.uid)}
                            className="accent-[#18701C]"
                          />
                          <span className="truncate">{user.displayName || user.email}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {formError && (
                  <p role="alert" className="m-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] font-medium text-red-700 sm:col-span-2">
                    {formError}
                  </p>
                )}
              </div>

              <footer className="flex flex-col-reverse gap-2 border-t border-[#eef2f7] bg-[#f7faf8] p-4 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  disabled={saving}
                  className="rounded-full border border-[#dfe7e2] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#52617c] transition hover:bg-[#f8fafc] disabled:opacity-50"
                >
                  {t('common.cancel')}
                </button>
                <Button type="submit" disabled={saving} className="gap-2 !px-5 !py-2.5">
                  <Check size={16} />
                  {saving ? t('common.loading') : editingProject ? t('common.update') : t('common.create')}
                </Button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
