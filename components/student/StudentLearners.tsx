'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { collection, getDocs, db } from '@/lib/data-store';
import { Position, UserProfile, UserRole } from '@/types/user';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import { authenticatedJson } from '@/lib/authenticated-fetch';
import { Button } from '@/components/Button';
import {
  BadgeCheck,
  Check,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';

type ManagedRole = Extract<UserRole, 'student' | 'staff'>;
type ManagedUser = UserProfile & { docId?: string };

interface AccountFormData {
  displayName: string;
  email: string;
  password: string;
  role: ManagedRole;
  departmentId: string;
  position: Position | '';
  phoneNumber: string;
}

const positions: Position[] = [
  'Nhân viên',
  'Trưởng nhóm',
  'Phó phòng',
  'Trưởng phòng',
  'Phó giám đốc',
  'Giám đốc',
];

const positionLabels: Record<Position, string> = {
  'Nhân viên': 'admin.users.positions.staff',
  'Trưởng nhóm': 'admin.users.positions.teamLead',
  'Phó phòng': 'admin.users.positions.deputyManager',
  'Trưởng phòng': 'admin.users.positions.manager',
  'Phó giám đốc': 'admin.users.positions.deputyDirector',
  'Giám đốc': 'admin.users.positions.director',
};

const emptyForm = (): AccountFormData => ({
  displayName: '',
  email: '',
  password: '',
  role: 'staff',
  departmentId: '',
  position: '',
  phoneNumber: '',
});

function avatarSrc(user: UserProfile) {
  return proxyBunnyUrl(user.photoURL || user.employment?.avatarURL || '');
}

function initials(name?: string) {
  return (name || 'HV')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function StudentLearners() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'staff'>('all');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [formData, setFormData] = useState<AccountFormData>(emptyForm);
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersSnap, deptSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'departments')),
      ]);

      const deptMap: Record<string, string> = {};
      deptSnap.docs.forEach(docSnap => {
        deptMap[docSnap.id] = docSnap.data().name || docSnap.id;
      });
      setDepartments(deptMap);

      const learners = usersSnap.docs
        .map(docSnap => {
          const data = docSnap.data() as UserProfile;
          return {
            ...data,
            uid: data.uid || docSnap.id,
            docId: docSnap.id,
            createdAt: toDate(data.createdAt),
            updatedAt: toDate(data.updatedAt),
          } as UserProfile;
        })
        .filter(user => user.role === 'student' || user.role === 'staff')
        .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'vi'));

      setUsers(learners);
      setSelectedId(current => learners.some(user => user.uid === current) ? current : learners[0]?.uid || null);
    } catch (error) {
      console.error('Error loading learners:', error);
      setNotice(t('admin.users.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return users.filter(user => {
      const matchRole = roleFilter === 'all' || user.role === roleFilter;
      const matchDepartment = departmentFilter === 'all' || user.departmentId === departmentFilter;
      const haystack = [
        user.displayName,
        user.email,
        user.phoneNumber,
        user.position,
        departments[user.departmentId || ''],
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchQuery = !keyword || haystack.includes(keyword);
      return matchRole && matchDepartment && matchQuery;
    });
  }, [users, query, roleFilter, departmentFilter, departments]);

  const selected = filtered.find(user => user.uid === selectedId) || filtered[0] || null;

  const stats = [
    { label: t('student.learners.total'), value: users.length },
    { label: t('student.learners.students'), value: users.filter(u => u.role === 'student').length },
    { label: t('student.learners.staff'), value: users.filter(u => u.role === 'staff').length },
    { label: t('student.learners.approved'), value: users.filter(u => u.approved !== false).length },
  ];

  const openAddForm = () => {
    setEditingUser(null);
    setFormData(emptyForm());
    setFormError('');
    setShowForm(true);
  };

  const openEditForm = (user: ManagedUser) => {
    setEditingUser(user);
    setFormData({
      displayName: user.displayName || '',
      email: user.email || '',
      password: '',
      role: user.role === 'student' ? 'student' : 'staff',
      departmentId: user.departmentId || '',
      position: user.position || '',
      phoneNumber: user.phoneNumber || '',
    });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');

    const displayName = formData.displayName.trim();
    const email = formData.email.trim().toLowerCase();
    const password = formData.password;
    if (!displayName || !email) {
      setFormError(t('admin.users.fillRequired'));
      return;
    }
    if ((!editingUser || password) && password.length < 6) {
      setFormError(t('admin.users.passwordMinLength'));
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        displayName,
        email,
        role: formData.role,
        departmentId: formData.departmentId,
        position: formData.role === 'staff' ? formData.position : '',
        phoneNumber: formData.phoneNumber.trim(),
      };
      if (password) payload.password = password;

      let selectedUserId: string | null = null;
      if (editingUser) {
        const documentId = editingUser.docId || editingUser.uid;
        await authenticatedJson(`/api/admin/users/${encodeURIComponent(documentId)}`, 'PATCH', payload);
        selectedUserId = editingUser.uid;
      } else {
        const result = await authenticatedJson('/api/admin/users', 'POST', payload) as { uid?: string };
        selectedUserId = result.uid || null;
      }

      setShowForm(false);
      setNotice(editingUser ? t('admin.users.updateSuccess') : t('admin.users.createSuccess'));
      await loadData();
      if (selectedUserId) setSelectedId(selectedUserId);
    } catch (error) {
      console.error('Error saving learner account:', error);
      setFormError(error instanceof Error ? error.message : t('admin.users.saveError'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: ManagedUser) => {
    const documentId = user.docId || user.uid;
    if (!documentId) {
      setNotice(t('admin.users.userInfoNotFound'));
      return;
    }
    if (!window.confirm(t('admin.users.confirmDelete', { name: user.displayName || user.email }))) return;

    setActionUserId(user.uid);
    setNotice('');
    try {
      await authenticatedJson(`/api/admin/users/${encodeURIComponent(documentId)}`, 'DELETE');
      setNotice(t('admin.users.deleteSuccess'));
      await loadData();
    } catch (error) {
      console.error('Error deleting learner account:', error);
      setNotice(error instanceof Error ? error.message : t('admin.users.deleteError'));
    } finally {
      setActionUserId(null);
    }
  };

  const handleApproval = async (user: ManagedUser, approved: boolean) => {
    const documentId = user.docId || user.uid;
    if (!documentId) {
      setNotice(t('admin.users.userInfoNotFound'));
      return;
    }

    setActionUserId(user.uid);
    setNotice('');
    try {
      await authenticatedJson(`/api/admin/users/${encodeURIComponent(documentId)}/approval`, 'PATCH', { approved });
      setNotice(approved ? t('admin.users.approveSuccess') : t('admin.users.rejectSuccess'));
      await loadData();
    } catch (error) {
      console.error('Error updating learner approval:', error);
      setNotice(error instanceof Error ? error.message : t('admin.users.approveError'));
    } finally {
      setActionUserId(null);
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
          <h1 className="m-0 text-[20px] font-bold tracking-tight text-[#111b38]">{t('student.academy.navStudents')}</h1>
          <p className="mt-1 text-[13px] text-[#63708a]">{t('student.learners.subtitle')}</p>
        </div>
        <Button onClick={openAddForm} size="sm" className="gap-2 border-none !px-4 !py-2.5">
          <Plus size={16} />
          {t('admin.users.addUser')}
        </Button>
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
              <Users size={18} />
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
                placeholder={t('student.learners.search')}
                className="w-full rounded-xl border border-[#e7edf5] bg-[#f8fafc] py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#18701C]"
              />
            </div>
            <select
              value={roleFilter}
              onChange={e => setRoleFilter(e.target.value as typeof roleFilter)}
              className="rounded-xl border border-[#e7edf5] bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-[#18701C]"
            >
              <option value="all">{t('student.learners.allRoles')}</option>
              <option value="student">{t('student.academy.studentRole')}</option>
              <option value="staff">{t('student.academy.staffRole')}</option>
            </select>
            <select
              value={departmentFilter}
              onChange={e => setDepartmentFilter(e.target.value)}
              aria-label={t('admin.users.filterByDepartment')}
              className="rounded-xl border border-[#e7edf5] bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-[#18701C]"
            >
              <option value="all">{t('admin.users.allDepartments')}</option>
              {Object.entries(departments).map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="bg-[#f7faf8] text-[11px] font-bold uppercase tracking-wide text-[#63708a]">
                <tr>
                  <th className="px-3 py-3 font-bold">#</th>
                  <th className="px-3 py-3 font-bold">{t('student.learners.colLearner')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.learners.colRole')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.learners.colDept')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.learners.colContact')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.learners.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-[#63708a]">
                      {t('student.learners.empty')}
                    </td>
                  </tr>
                ) : (
                  filtered.map((user, index) => {
                    const photo = avatarSrc(user);
                    const active = selected?.uid === user.uid;
                    return (
                      <tr
                        key={user.uid}
                        onClick={() => setSelectedId(user.uid)}
                        className={`cursor-pointer border-t border-[#eef2f7] transition hover:bg-[#f4faf6] ${
                          active ? 'bg-[#eff8f0]' : ''
                        }`}
                      >
                        <td className="px-3 py-3 text-[12px] font-bold text-[#18701C]">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3.5">
                            <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-xl border border-[#d7e5db] bg-[#edfbf4] shadow-sm">
                              {photo ? (
                                <img
                                  src={photo}
                                  alt={user.displayName}
                                  className="h-full w-full object-cover"
                                  onError={event => {
                                    (event.currentTarget as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              ) : (
                                <span className="grid h-full w-full place-items-center text-[13px] font-bold text-[#18701C]">
                                  {initials(user.displayName)}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <b className="block truncate text-[13px] font-semibold text-[#111b38]">{user.displayName || '—'}</b>
                              <small className="block truncate text-[12px] text-[#7a869c]">{user.email}</small>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span className="rounded-full bg-[#edfbf4] px-2.5 py-1 text-[11px] font-bold text-[#18701C]">
                            {user.role === 'staff' ? t('student.academy.staffRole') : t('student.academy.studentRole')}
                          </span>
                          {user.position ? (
                            <small className="mt-1 block text-[11px] text-[#7a869c]">{user.position}</small>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-[#243552]">
                          {departments[user.departmentId || ''] || t('student.general')}
                        </td>
                        <td className="px-3 py-3 text-[12px] text-[#52617c]">
                          <div className="space-y-1">
                            <span className="flex items-center gap-1.5 truncate"><Mail size={12} className="shrink-0 text-[#18701C]" />{user.email || '—'}</span>
                            <span className="flex items-center gap-1.5 truncate"><Phone size={12} className="shrink-0 text-[#18701C]" />{user.phoneNumber || user.employment?.phone || '—'}</span>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                              user.approved === false
                                ? 'bg-[#fff8e8] text-[#9a6b08]'
                                : 'bg-[#edfbf4] text-[#14661a]'
                            }`}
                          >
                            <BadgeCheck size={12} />
                            {user.approved === false ? t('student.learners.pending') : t('student.learners.active')}
                          </span>
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
          <p className="m-0 mb-3 text-[13px] font-bold text-[#111b38]">{t('student.learners.preview')}</p>
          {selected ? (
            <div className="text-center">
              <div className="mx-auto h-36 w-36 overflow-hidden rounded-3xl border-4 border-[#c6ebd4] bg-[#edfbf4] shadow-[0_10px_24px_rgba(24,112,28,0.18)]">
                {avatarSrc(selected) ? (
                  <img
                    src={avatarSrc(selected)}
                    alt={selected.displayName}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-[36px] font-bold text-[#18701C]">
                    {initials(selected.displayName)}
                  </span>
                )}
              </div>
              <h3 className="mt-4 text-[16px] font-bold text-[#111b38]">{selected.displayName}</h3>
              <p className="mt-1 text-[13px] text-[#63708a]">{selected.email}</p>
              <div className="mt-4 space-y-2 rounded-xl bg-[#f7faf8] p-3 text-left text-[13px]">
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.learners.colRole')}</span>
                  <b>{selected.role === 'staff' ? t('student.academy.staffRole') : t('student.academy.studentRole')}</b>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.learners.colDept')}</span>
                  <b>{departments[selected.departmentId || ''] || t('student.general')}</b>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('admin.users.position')}</span>
                  <b>{selected.position || '—'}</b>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.learners.colPhone')}</span>
                  <b>{selected.phoneNumber || selected.employment?.phone || '—'}</b>
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button onClick={() => openEditForm(selected)} size="sm" className="gap-2 !px-3 !py-2">
                  <Pencil size={14} />
                  {t('common.edit')}
                </Button>
                <button
                  type="button"
                  onClick={() => void handleDelete(selected)}
                  disabled={actionUserId === selected.uid}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-[#f1c9c9] px-3 py-2 text-[12px] font-semibold text-[#a33b3b] transition hover:bg-[#fff5f5] disabled:cursor-wait disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  {t('common.delete')}
                </button>
              </div>
              {selected.approved === false && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void handleApproval(selected, true)}
                    disabled={actionUserId === selected.uid}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-[#18701C] px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-[#145d18] disabled:cursor-wait disabled:opacity-50"
                  >
                    <Check size={14} />
                    {t('admin.users.approve')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleApproval(selected, false)}
                    disabled={actionUserId === selected.uid}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-[#e7edf5] px-3 py-2 text-[12px] font-semibold text-[#63708a] transition hover:bg-[#f8fafc] disabled:cursor-wait disabled:opacity-50"
                  >
                    <X size={14} />
                    {t('admin.users.reject')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-[#63708a]">{t('student.learners.empty')}</p>
          )}
        </aside>
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-sm"
          onMouseDown={event => { if (event.target === event.currentTarget && !saving) setShowForm(false); }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="learner-account-form-title" className="my-auto w-full max-w-2xl overflow-hidden rounded-2xl border border-[#d7e5db] bg-white shadow-2xl">
            <header className="flex items-center justify-between border-b border-[#eef2f7] bg-[#f7faf8] px-5 py-4">
              <div>
                <h2 id="learner-account-form-title" className="m-0 text-[17px] font-bold text-[#111b38]">
                  {editingUser ? t('admin.users.editUser') : t('admin.users.addUserNew')}
                </h2>
                <p className="mb-0 mt-1 text-[12px] text-[#63708a]">{t('student.learners.accountFormHint')}</p>
              </div>
              <button type="button" onClick={() => setShowForm(false)} disabled={saving} aria-label={t('common.close')} className="rounded-lg p-2 text-[#63708a] transition hover:bg-white disabled:opacity-50">
                <X size={18} />
              </button>
            </header>

            <form onSubmit={handleSave}>
              <div className="grid gap-4 p-5 sm:grid-cols-2">
                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.users.fullName')} *</span>
                  <input
                    required
                    autoComplete="name"
                    value={formData.displayName}
                    onChange={event => setFormData(current => ({ ...current, displayName: event.target.value }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>
                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.users.email')} *</span>
                  <input
                    required
                    type="email"
                    autoComplete="email"
                    value={formData.email}
                    onChange={event => setFormData(current => ({ ...current, email: event.target.value }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>
                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.users.password')}{editingUser ? '' : ' *'}</span>
                  <input
                    required={!editingUser}
                    type="password"
                    autoComplete="new-password"
                    minLength={6}
                    value={formData.password}
                    onChange={event => setFormData(current => ({ ...current, password: event.target.value }))}
                    placeholder={t('admin.users.passwordPlaceholder')}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                  {editingUser && <small className="block font-normal text-[#7a869c]">{t('admin.users.passwordPlaceholder')}</small>}
                </label>
                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.users.role')}</span>
                  <select
                    value={formData.role}
                    onChange={event => setFormData(current => ({ ...current, role: event.target.value as ManagedRole }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  >
                    <option value="student">{t('admin.users.roles.student')}</option>
                    <option value="staff">{t('admin.users.roles.staff')}</option>
                  </select>
                </label>
                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                  <span>{t('admin.users.department')}</span>
                  <select
                    value={formData.departmentId}
                    onChange={event => setFormData(current => ({ ...current, departmentId: event.target.value }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  >
                    <option value="">{t('admin.users.selectDepartment')}</option>
                    {Object.entries(departments).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                  </select>
                </label>
                {formData.role === 'staff' && (
                  <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c]">
                    <span>{t('admin.users.position')}</span>
                    <select
                      value={formData.position}
                      onChange={event => setFormData(current => ({ ...current, position: event.target.value as Position | '' }))}
                      className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                    >
                      <option value="">{t('admin.users.selectPosition')}</option>
                      {positions.map(position => <option key={position} value={position}>{t(positionLabels[position])}</option>)}
                    </select>
                  </label>
                )}
                <label className="space-y-1.5 text-[12px] font-semibold text-[#52617c] sm:col-span-2">
                  <span>{t('admin.users.phone')}</span>
                  <input
                    type="tel"
                    autoComplete="tel"
                    value={formData.phoneNumber}
                    onChange={event => setFormData(current => ({ ...current, phoneNumber: event.target.value }))}
                    className="w-full rounded-xl border border-[#dfe7e2] bg-white px-3 py-2.5 text-[13px] text-[#111b38] outline-none focus:border-[#18701C] focus:ring-2 focus:ring-[#18701C]/10"
                  />
                </label>
                {formError && <p role="alert" className="m-0 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12px] font-medium text-red-700 sm:col-span-2">{formError}</p>}
              </div>

              <footer className="flex flex-col-reverse gap-2 border-t border-[#eef2f7] bg-[#f7faf8] p-4 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setShowForm(false)} disabled={saving} className="rounded-full border border-[#dfe7e2] bg-white px-5 py-2.5 text-[13px] font-semibold text-[#52617c] transition hover:bg-[#f8fafc] disabled:opacity-50">
                  {t('common.cancel')}
                </button>
                <Button type="submit" disabled={saving} className="gap-2 !px-5 !py-2.5">
                  <Check size={16} />
                  {saving ? t('common.loading') : editingUser ? t('common.update') : t('common.create')}
                </Button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
