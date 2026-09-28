'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Position, UserProfile } from '@/types/user';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import { Award, Search, Users } from 'lucide-react';

const POSITION_LIST: Position[] = [
  'Nhân viên',
  'Trưởng nhóm',
  'Phó phòng',
  'Trưởng phòng',
  'Phó giám đốc',
  'Giám đốc',
];

export function StudentPositions() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>(POSITION_LIST[0]);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const snap = await getDocs(collection(db, 'users'));
        setUsers(
          snap.docs.map(docSnap => {
            const data = docSnap.data() as UserProfile;
            return { ...data, uid: data.uid || docSnap.id };
          })
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rows = useMemo(() => {
    return POSITION_LIST.map(position => {
      const members = users.filter(user => (user.position || 'Nhân viên') === position);
      return { position, members, count: members.length };
    }).filter(row => {
      if (!query.trim()) return true;
      const keyword = query.trim().toLowerCase();
      return row.position.toLowerCase().includes(keyword) ||
        row.members.some(m => (m.displayName || '').toLowerCase().includes(keyword));
    });
  }, [users, query]);

  const current = rows.find(r => r.position === selected) || rows[0];

  if (loading) {
    return <div className="grid min-h-[240px] place-items-center rounded-2xl border border-[#e7edf5] bg-white text-[13px] text-[#63708a]">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="m-0 text-[24px] font-bold text-[#111b38]">{t('student.academy.navPositions')}</h1>
        <p className="mt-1 text-[13px] text-[#63708a]">{t('student.positions.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: t('student.positions.total'), value: POSITION_LIST.length },
          { label: t('student.positions.assigned'), value: users.filter(u => u.position).length },
          { label: t('student.positions.managers'), value: users.filter(u => u.position && u.position !== 'Nhân viên').length },
          { label: t('student.positions.staff'), value: users.filter(u => !u.position || u.position === 'Nhân viên').length },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <span className="mb-3 inline-flex rounded-xl bg-[#edfbf4] p-2.5 text-[#18701C]"><Award size={18} /></span>
            <p className="m-0 text-[28px] font-bold tabular-nums">{stat.value}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#63708a]">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_320px]">
        <section className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
          <div className="border-b border-[#eef2f7] p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99a4b5]" size={16} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('student.positions.search')} className="w-full rounded-xl border border-[#e7edf5] bg-[#f8fafc] py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#18701C]" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[24px] font-semibold">
              <thead className="bg-[#f7faf8] text-[18px] font-bold uppercase tracking-wide text-[#63708a]">
                <tr>
                  <th className="px-3 py-3 font-bold">#</th>
                  <th className="px-3 py-3 font-bold">{t('student.positions.colTitle')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.positions.colCount')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.positions.colPeople')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.position} onClick={() => setSelected(row.position)} className={`cursor-pointer border-t border-[#eef2f7] hover:bg-[#f4faf6] ${selected === row.position ? 'bg-[#eff8f0]' : ''}`}>
                    <td className="px-3 py-3 text-[16px] font-bold text-[#18701C]">{index + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#edfbf4] text-[#18701C]"><Award size={22} /></span>
                        <b className="text-[15px] text-[#111b38]">{row.position}</b>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold">{row.count}</td>
                    <td className="px-3 py-3">
                      <div className="flex -space-x-2">
                        {row.members.slice(0, 5).map(member => {
                          const photo = proxyBunnyUrl(member.photoURL || member.employment?.avatarURL || '');
                          return (
                            <span key={member.uid} className="grid h-14 w-14 place-items-center overflow-hidden rounded-full border-2 border-white bg-[#edfbf4] text-[16px] font-bold text-[#18701C]">
                              {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : (member.displayName || 'U').slice(0, 1)}
                            </span>
                          );
                        })}
                        {row.count > 5 && <span className="grid h-14 w-14 place-items-center rounded-full border-2 border-white bg-[#18701C] text-[16px] font-bold text-white">+{row.count - 5}</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
          <p className="mb-3 text-[13px] font-bold">{t('student.positions.preview')}</p>
          {current ? (
            <>
              <div className="grid h-24 place-items-center rounded-2xl bg-gradient-to-br from-[#0a2f12] to-[#18701C] text-white"><Award size={36} /></div>
              <h3 className="mt-3 text-[18px] font-bold">{current.position}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#63708a]"><Users size={14} />{current.count} {t('student.positions.people')}</p>
              <div className="mt-3 space-y-2">
                {current.members.slice(0, 8).map(member => {
                  const photo = proxyBunnyUrl(member.photoURL || member.employment?.avatarURL || '');
                  return (
                    <div key={member.uid} className="flex items-center gap-2.5 rounded-xl border border-[#eef2f7] p-2">
                      <span className="grid h-12 w-12 overflow-hidden rounded-xl bg-[#edfbf4] text-[12px] font-bold text-[#18701C] place-items-center">
                        {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : (member.displayName || 'U').slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <b className="block truncate text-[13px]">{member.displayName}</b>
                        <small className="text-[16px] text-[#7a869c]">{member.email}</small>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
