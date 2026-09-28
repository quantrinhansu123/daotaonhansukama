'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Department } from '@/types/department';
import { UserProfile } from '@/types/user';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import {
  Building2,
  FolderKanban,
  Search,
  UserRound,
  Users,
} from 'lucide-react';

type DeptRow = Department & {
  memberCount: number;
  members: UserProfile[];
};

export function StudentDepartments() {
  const { t } = useLanguage();
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [deptSnap, usersSnap] = await Promise.all([
        getDocs(collection(db, 'departments')),
        getDocs(collection(db, 'users')),
      ]);

      const users = usersSnap.docs.map(docSnap => {
        const data = docSnap.data() as UserProfile;
        return {
          ...data,
          uid: data.uid || docSnap.id,
          docId: docSnap.id,
        } as UserProfile;
      });

      const rows = deptSnap.docs.map(docSnap => {
        const data = docSnap.data();
        const id = docSnap.id;
        const members = users.filter(user => user.departmentId === id);
        return {
          id,
          ...data,
          createdAt: data.createdAt?.toDate?.() || data.createdAt,
          updatedAt: data.updatedAt?.toDate?.() || data.updatedAt,
          memberCount: members.length,
          members,
        } as DeptRow;
      });

      rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
      setDepartments(rows);
      if (rows[0]) setSelectedId(rows[0].id);
    } catch (error) {
      console.error('Error loading departments:', error);
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
        <h1 className="m-0 text-[24px] font-bold tracking-tight text-[#111b38]">{t('student.academy.navDepartments')}</h1>
        <p className="mt-1 text-[13px] text-[#63708a]">{t('student.departments.subtitle')}</p>
      </div>

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
            <table className="min-w-full text-left text-[24px] font-semibold">
              <thead className="bg-[#f7faf8] text-[18px] font-bold uppercase tracking-wide text-[#63708a]">
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
                        <td className="px-3 py-3 text-[16px] font-bold text-[#18701C]">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-3">
                            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#edfbf4] text-[#18701C] shadow-sm">
                              <Building2 size={26} />
                            </span>
                            <div className="min-w-0">
                              <b className="block truncate text-[15px] text-[#111b38]">{dept.name}</b>
                              <small className="text-[18px] text-[#7a869c]">{dept.id}</small>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2.5">
                            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#d7e5db] bg-[#f7faf8] text-[#18701C]">
                              {managerPhoto ? (
                                <img src={managerPhoto} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <UserRound size={18} />
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
              <h3 className="mt-4 text-[18px] font-bold text-[#111b38]">{selected.name}</h3>
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
              {selected.members.length > 0 && (
                <div className="mt-3">
                  <b className="text-[12px] text-[#111b38]">{t('student.departments.team')}</b>
                  <div className="mt-2 space-y-2">
                    {selected.members.slice(0, 6).map(member => {
                      const photo = proxyBunnyUrl(member.photoURL || member.employment?.avatarURL || '');
                      return (
                        <div key={member.uid} className="flex items-center gap-2.5 rounded-xl border border-[#eef2f7] p-2">
                          <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-[#edfbf4] text-[13px] font-bold text-[#18701C]">
                            {photo ? (
                              <img src={photo} alt="" className="h-full w-full object-cover" />
                            ) : (
                              (member.displayName || 'U').slice(0, 2).toUpperCase()
                            )}
                          </span>
                          <div className="min-w-0">
                            <b className="block truncate text-[13px] text-[#111b38]">{member.displayName}</b>
                            <small className="block truncate text-[16px] text-[#7a869c]">{member.email}</small>
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
    </div>
  );
}
