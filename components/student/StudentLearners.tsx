'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, db } from '@/lib/data-store';
import { UserProfile } from '@/types/user';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import {
  BadgeCheck,
  Mail,
  Phone,
  Search,
  Users,
} from 'lucide-react';

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

export function StudentLearners() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [departments, setDepartments] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'student' | 'staff'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
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
            createdAt: (data.createdAt as any)?.toDate?.() || data.createdAt,
            updatedAt: (data.updatedAt as any)?.toDate?.() || data.updatedAt,
          } as UserProfile;
        })
        .filter(user => user.role === 'student' || user.role === 'staff')
        .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'vi'));

      setUsers(learners);
      if (learners[0]) setSelectedId(learners[0].uid);
    } catch (error) {
      console.error('Error loading learners:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return users.filter(user => {
      const matchRole = roleFilter === 'all' || user.role === roleFilter;
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
      return matchRole && matchQuery;
    });
  }, [users, query, roleFilter, departments]);

  const selected = filtered.find(user => user.uid === selectedId) || filtered[0] || null;

  const stats = [
    { label: t('student.learners.total'), value: users.length },
    { label: t('student.learners.students'), value: users.filter(u => u.role === 'student').length },
    { label: t('student.learners.staff'), value: users.filter(u => u.role === 'staff').length },
    { label: t('student.learners.approved'), value: users.filter(u => u.approved !== false).length },
  ];

  if (loading) {
    return (
      <div className="grid min-h-[280px] place-items-center rounded-2xl border border-[#e7edf5] bg-white text-[13px] text-[#63708a]">
        {t('common.loading')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="m-0 text-[20px] font-bold tracking-tight text-[#111b38]">{t('student.academy.navStudents')}</h1>
        <p className="mt-1 text-[13px] text-[#63708a]">{t('student.learners.subtitle')}</p>
      </div>

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
                  <span className="text-[#7a869c]">{t('student.learners.colPhone')}</span>
                  <b>{selected.phoneNumber || selected.employment?.phone || '—'}</b>
                </p>
              </div>
            </div>
          ) : (
            <p className="py-10 text-center text-[13px] text-[#63708a]">{t('student.learners.empty')}</p>
          )}
        </aside>
      </div>
    </div>
  );
}
