'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, db } from '@/lib/data-store';
import { Department } from '@/types/department';
import { UserProfile } from '@/types/user';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import { Button } from '@/components/Button';
import {
  Building2,
  Check,
  FolderKanban,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRound,
  Users,
  X,
} from 'lucide-react';

type DeptRow = Department & {
  memberCount: number;
  members: UserProfile[];
};

export function StudentDepartments() {
  const { userProfile } = useAuth();
  const { hasPermission } = usePermissions();
  const { t } = useLanguage();

  const canManage = userProfile?.role === 'admin' || hasPermission('manage_departments');

  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [staffUsers, setStaffUsers] = useState<UserProfile[]>([]);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [editingDept, setEditingDept] = useState<DeptRow | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    managerId: '',
    projects: [] as string[],
  });
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
      const [deptSnap, usersSnap, projectsSnap] = await Promise.all([
        getDocs(collection(db, 'departments')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'projects')),
      ]);

      const projectsData = projectsSnap.docs.map(d => ({
        id: d.id,
        name: d.data().name || '',
      }));
      setProjects(projectsData);

      const users = usersSnap.docs.map(docSnap => {
        const data = docSnap.data() as UserProfile;
        return {
          ...data,
          uid: data.uid || docSnap.id,
          docId: docSnap.id,
        } as UserProfile;
      });
      setStaffUsers(users.filter(u => u.role === 'staff'));

      const rows = deptSnap.docs.map(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        const members = users.filter(user => user.departmentId === id);
        const deptProjects = (data.projects as string[]) || [];
        const deptProjectNames = deptProjects.map(pId => {
          const p = projectsData.find(proj => proj.id === pId);
          return p?.name || '';
        }).filter(Boolean);

        return {
          id,
          ...data,
          projects: deptProjects,
          projectNames: deptProjectNames.length > 0 ? deptProjectNames : (data.projectNames || []),
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
          memberCount: members.length,
          members,
        } as DeptRow;
      });

      rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
      setDepartments(rows);
      if (rows.length > 0) {
        setSelectedId(prev => (prev && rows.some(r => r.id === prev) ? prev : rows[0].id));
      }
    } catch (error) {
      console.error('Error loading departments:', error);
      setNotice(t('admin.departments.loadError') || 'Có lỗi xảy ra khi tải dữ liệu phòng ban');
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return departments;
    return departments.filter(dept => {
      const haystack = [
        dept.name,
        dept.description,
        dept.managerName,
        ...(dept.projectNames || []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [departments, query]);

  const selected = filtered.find(item => item.id === selectedId) || filtered[0] || null;

  const stats = [
    { label: t('student.departments.total'), value: departments.length },
    { label: t('student.departments.members'), value: departments.reduce((sum, d) => sum + d.memberCount, 0) },
    { label: t('student.departments.withManager'), value: departments.filter(d => d.managerId || d.managerName).length },
    { label: t('student.departments.withProjects'), value: departments.filter(d => (d.projects?.length || d.projectNames?.length || 0) > 0).length },
  ];

  const openAdd = () => {
    setEditingDept(null);
    setFormData({ name: '', description: '', managerId: '', projects: [] });
    setFormError('');
    setShowModal(true);
  };

  const openEdit = (dept: DeptRow) => {
    setEditingDept(dept);
    setFormData({
      name: dept.name || '',
      description: dept.description || '',
      managerId: dept.managerId || '',
      projects: dept.projects || [],
    });
    setFormError('');
    setShowModal(true);
  };

  const toggleProject = (projectId: string) => {
    setFormData(prev => {
      const exists = prev.projects.includes(projectId);
      return {
        ...prev,
        projects: exists
          ? prev.projects.filter(id => id !== projectId)
          : [...prev.projects, projectId],
      };
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = formData.name.trim();
    if (!name) {
      setFormError(t('admin.departments.fillRequired') || 'Vui lòng nhập tên phòng ban');
      return;
    }

    setSaving(true);
    setFormError('');
    try {
      const deptId = editingDept?.id || `dept_${Date.now()}`;
      const manager = formData.managerId ? staffUsers.find(u => u.uid === formData.managerId) : null;
      const deptProjectNames = formData.projects.map(pId => {
        const p = projects.find(proj => proj.id === pId);
        return p?.name || '';
      }).filter(Boolean);

      const deptData: Record<string, unknown> = {
        name,
        description: formData.description.trim(),
        managerId: formData.managerId || null,
        managerName: manager?.displayName || null,
        projects: formData.projects,
        projectNames: deptProjectNames,
        updatedAt: new Date(),
      };
      if (!editingDept) {
        deptData.createdAt = new Date();
      }

      await setDoc(doc(db, 'departments', deptId), deptData, { merge: true });

      setNotice(
        editingDept
          ? (t('admin.departments.updateSuccess') || 'Cập nhật phòng ban thành công!')
          : (t('admin.departments.createSuccess') || 'Tạo phòng ban thành công!')
      );
      setShowModal(false);
      await loadData();
      setSelectedId(deptId);
    } catch (err: unknown) {
      console.error('Error saving department:', err);
      setFormError(err instanceof Error ? err.message : (t('admin.departments.saveError') || 'Có lỗi xảy ra khi lưu phòng ban'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dept: DeptRow) => {
    if (dept.memberCount > 0) {
      alert(`Phòng ban "${dept.name}" hiện đang có ${dept.memberCount} nhân sự. Vui lòng chuyển nhân sự sang phòng ban khác trước khi xóa.`);
      return;
    }
    if (!confirm(t('admin.departments.confirmDelete', { name: dept.name }) || `Bạn có chắc chắn muốn xóa phòng ban "${dept.name}"?`)) {
      return;
    }

    setDeletingId(dept.id);
    setNotice('');
    try {
      await deleteDoc(doc(db, 'departments', dept.id));
      setNotice(t('admin.departments.deleteSuccess') || 'Xóa phòng ban thành công!');
      await loadData();
    } catch (err: unknown) {
      console.error('Error deleting department:', err);
      setNotice(err instanceof Error ? err.message : (t('admin.departments.deleteError') || 'Có lỗi xảy ra khi xóa phòng ban'));
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
          <h1 className="m-0 text-[20px] font-bold tracking-tight text-[#111b38]">{t('student.academy.navDepartments')}</h1>
          <p className="mt-1 text-[13px] text-[#63708a]">{t('student.departments.subtitle')}</p>
        </div>
        {canManage && (
          <Button onClick={openAdd} size="sm" className="gap-2 border-none !px-4 !py-2.5">
            <Plus size={16} />
            {t('admin.departments.addDepartment') || 'Thêm phòng ban'}
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
              <Building2 size={18} />
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
                placeholder={t('student.departments.search')}
                className="w-full rounded-xl border border-[#e7edf5] bg-[#f8fafc] py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#18701C]"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="bg-[#f7faf8] text-[11px] font-bold uppercase tracking-wide text-[#63708a]">
                <tr>
                  <th className="px-3 py-3 font-bold">#</th>
                  <th className="px-3 py-3 font-bold">{t('student.departments.colName')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.departments.colManager')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.departments.colMembers')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.departments.colProjects')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.departments.colDesc')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-[#63708a]">
                      {t('student.departments.empty')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((dept, index) => {
                    const active = selected?.id === dept.id;
                    const manager = dept.members.find(m => m.uid === dept.managerId) || null;
                    const managerPhoto = proxyBunnyUrl(manager?.photoURL || manager?.employment?.avatarURL || '');
                    return (
                      <tr
                        key={dept.id}
                        onClick={() => setSelectedId(dept.id)}
                        className={`cursor-pointer border-t border-[#eef2f7] transition hover:bg-[#f4faf6] ${
                          active ? 'bg-[#eff8f0]' : ''
                        }`}
                      >
                        <td className="px-3 py-3 text-[12px] font-bold text-[#18701C]">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#edfbf4] text-[#18701C] shadow-sm">
                              <Building2 size={24} />
                            </span>
                            <div className="min-w-0">
                              <b className="block truncate text-[13px] font-semibold text-[#111b38]">{dept.name}</b>
                              <small className="text-[12px] text-[#7a869c]">{dept.id}</small>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#d7e5db] bg-[#f7faf8] text-[#18701C]">
                              {managerPhoto ? (
                                <img src={managerPhoto} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <UserRound size={16} />
                              )}
                            </span>
                            <b className="text-[#243552]">{dept.managerName || '—'}</b>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#243552]">
                            <Users size={14} className="text-[#18701C]" />
                            {dept.memberCount}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#243552]">
                            <FolderKanban size={14} className="text-[#18701C]" />
                            {dept.projects?.length || dept.projectNames?.length || 0}
                          </span>
                        </td>
                        <td className="max-w-[280px] px-3 py-3 text-[#52617c]">
                          <span className="line-clamp-2">{dept.description || '—'}</span>
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
          <p className="m-0 mb-3 text-[13px] font-bold text-[#111b38]">{t('student.departments.preview')}</p>
          {selected ? (
            <div>
              <div className="grid h-28 place-items-center rounded-2xl bg-gradient-to-br from-[#0a2f12] to-[#18701C] text-white">
                <Building2 size={40} />
              </div>
              <h3 className="mt-4 text-[16px] font-bold text-[#111b38]">{selected.name}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[#63708a]">
                {selected.description || t('student.departments.noDescription')}
              </p>
              <div className="mt-4 space-y-2 rounded-xl bg-[#f7faf8] p-3 text-[13px]">
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.departments.colManager')}</span>
                  <b>{selected.managerName || '—'}</b>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.departments.colMembers')}</span>
                  <b>{selected.memberCount}</b>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.departments.colProjects')}</span>
                  <b>{selected.projects?.length || selected.projectNames?.length || 0}</b>
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

              {selected.members.length > 0 && (
                <div className="mt-4">
                  <b className="text-[12px] text-[#111b38]">{t('student.departments.team')} ({selected.members.length})</b>
                  <div className="mt-2 space-y-2">
                    {selected.members.slice(0, 6).map(member => {
                      const photo = proxyBunnyUrl(member.photoURL || member.employment?.avatarURL || '');
                      return (
                        <div key={member.uid} className="flex items-center gap-2.5 rounded-xl border border-[#eef2f7] p-2">
                          <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#edfbf4] text-[12px] font-bold text-[#18701C]">
                            {photo ? (
                              <img src={photo} alt="" className="h-full w-full object-cover" />
                            ) : (
                              (member.displayName || 'U').slice(0, 2).toUpperCase()
                            )}
                          </span>
                          <div className="min-w-0">
                            <b className="block truncate text-[12px] text-[#111b38]">{member.displayName}</b>
                            <small className="block truncate text-[11px] text-[#7a869c]">{member.position || member.email}</small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-[#63708a]">{t('student.departments.empty')}</p>
          )}
        </aside>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={event => { if (event.target === event.currentTarget && !saving) setShowModal(false); }}
        >
          <section role="dialog" aria-modal="true" className="my-auto w-full max-w-xl overflow-hidden rounded-2xl border border-[#d7e5db] bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#eef2f7] bg-[#f7faf8] px-5 py-4">
              <div>
                <h2 className="m-0 text-[17px] font-bold text-[#111b38]">
                  {editingDept ? (t('admin.departments.editDepartment') || 'Chỉnh sửa phòng ban') : (t('admin.departments.addDepartment') || 'Thêm phòng ban mới')}
                </h2>
                <p className="mb-0 mt-1 text-[12px] text-[#63708a]">
                  {editingDept ? 'Cập nhật thông tin phòng ban, trưởng phòng và dự án phụ trách' : 'Nhập thông tin để thiết lập phòng ban mới trong tổ chức'}
                </p>
              </div>
              <button type="button" onClick={() => setShowModal(false)} disabled={saving} aria-label={t('common.close')} className="rounded-lg p-2 text-[#63708a] transition hover:bg-white disabled:opacity-50">
                <X size={18} />
              </button>
            </header>

            <form onSubmit={handleSave}>
              <div className="space-y-4 p-5">
                <label className="block space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.departments.name')} *</span>
                  <input
                    required
                    value={formData.name}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ví dụ: Phòng Kỹ thuật, Phòng Marketing..."
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>

                <label className="block space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.departments.description')}</span>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Mô tả chức năng nhiệm vụ của phòng ban..."
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>

                <label className="block space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.departments.manager')}</span>
                  <select
                    value={formData.managerId}
                    onChange={e => setFormData(prev => ({ ...prev, managerId: e.target.value }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  >
                    <option value="">{t('admin.departments.selectManager') || '-- Chọn trưởng phòng --'}</option>
                    {staffUsers.map(user => (
                      <option key={user.uid} value={user.uid}>
                        {user.displayName} ({user.email}) - {user.position || 'Nhân viên'}
                      </option>
                    ))}
                  </select>
                </label>

                {projects.length > 0 && (
                  <div>
                    <span className="block mb-2 text-[12px] font-semibold text-[#52617c]">{t('admin.departments.projects') || 'Dự án trực thuộc'}</span>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto rounded-xl border border-[#dfe7e2] p-2 bg-[#f8fafc]">
                      {projects.map(proj => {
                        const isChecked = formData.projects.includes(proj.id);
                        return (
                          <label
                            key={proj.id}
                            className={`flex items-center gap-2 rounded-lg border p-2 text-[12px] cursor-pointer transition ${
                              isChecked
                                ? 'border-[#18701C] bg-[#edfbf4] font-semibold text-[#18701C]'
                                : 'border-[#e7edf5] bg-white text-[#52617c] hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => toggleProject(proj.id)}
                              className="accent-[#18701C]"
                            />
                            <span className="truncate">{proj.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {formError && (
                  <p role="alert" className="m-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] font-medium text-red-700">
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
                  {saving ? t('common.loading') : editingDept ? t('common.update') : t('common.create')}
                </Button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
