'use client';

import React, { useEffect, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import { Mail, MapPin, Phone, Shield, UserRound } from 'lucide-react';

export function StudentAccountUser() {
  const { userProfile } = useAuth();
  const { t, dateLocale } = useLanguage();
  const [deptName, setDeptName] = useState('—');

  useEffect(() => {
    void (async () => {
      if (!userProfile?.departmentId) return;
      try {
        const snap = await getDoc(doc(db, 'departments', userProfile.departmentId));
        if (snap.exists()) setDeptName(snap.data().name || userProfile.departmentId);
      } catch {
        setDeptName(userProfile.departmentId);
      }
    })();
  }, [userProfile?.departmentId]);

  if (!userProfile) {
    return <div className="rounded-2xl border border-[#e7edf5] bg-white p-8 text-center text-[#63708a]">{t('common.loading')}</div>;
  }

  const photo = proxyBunnyUrl(userProfile.photoURL || userProfile.employment?.avatarURL || '');
  const rows = [
    { label: t('student.account.displayName'), value: userProfile.displayName || '—' },
    { label: t('student.account.email'), value: userProfile.email || '—' },
    { label: t('student.account.role'), value: userProfile.role === 'staff' ? t('student.academy.staffRole') : t('student.academy.studentRole') },
    { label: t('student.account.position'), value: userProfile.position || '—' },
    { label: t('student.account.department'), value: deptName },
    { label: t('student.account.phone'), value: userProfile.phoneNumber || userProfile.employment?.phone || '—' },
    { label: t('student.account.address'), value: userProfile.address || userProfile.employment?.address || '—' },
    { label: t('student.account.status'), value: userProfile.approved === false ? t('student.learners.pending') : t('student.learners.active') },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="m-0 text-[24px] font-bold text-[#111b38]">{t('student.academy.navUsers')}</h1>
        <p className="mt-1 text-[13px] text-[#63708a]">{t('student.account.subtitle')}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[#e7edf5] bg-white p-5 text-center shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
          <div className="mx-auto h-40 w-40 overflow-hidden rounded-3xl border-4 border-[#c6ebd4] bg-[#edfbf4] shadow-[0_10px_24px_rgba(24,112,28,0.18)]">
            {photo ? (
              <img src={photo} alt={userProfile.displayName} className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-[42px] font-bold text-[#18701C]">
                {(userProfile.displayName || 'U').slice(0, 2).toUpperCase()}
              </span>
            )}
          </div>
          <h2 className="mt-4 text-[20px] font-bold text-[#111b38]">{userProfile.displayName}</h2>
          <p className="mt-1 text-[13px] text-[#63708a]">{userProfile.email}</p>
          <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#edfbf4] px-3 py-1.5 text-[12px] font-bold text-[#18701C]">
            <Shield size={14} />
            {userProfile.role === 'staff' ? t('student.academy.staffRole') : t('student.academy.studentRole')}
          </span>
        </aside>

        <section className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
          <div className="border-b border-[#eef2f7] px-4 py-3">
            <b className="text-[14px] text-[#111b38]">{t('student.account.profileTable')}</b>
          </div>
          <table className="min-w-full text-left text-[26px] font-semibold">
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.label} className={index % 2 === 0 ? 'bg-white' : 'bg-[#f7faf8]'}>
                  <th className="w-[220px] px-4 py-5 font-semibold text-[#63708a]">{row.label}</th>
                  <td className="px-4 py-5 font-bold text-[#111b38]">{row.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="grid gap-2 border-t border-[#eef2f7] p-4 sm:grid-cols-3">
            <div className="flex items-center gap-2 rounded-xl bg-[#f7faf8] px-3 py-2.5 text-[13px]"><Mail size={15} className="text-[#18701C]" />{userProfile.email}</div>
            <div className="flex items-center gap-2 rounded-xl bg-[#f7faf8] px-3 py-2.5 text-[13px]"><Phone size={15} className="text-[#18701C]" />{userProfile.phoneNumber || '—'}</div>
            <div className="flex items-center gap-2 rounded-xl bg-[#f7faf8] px-3 py-2.5 text-[13px]"><MapPin size={15} className="text-[#18701C]" />{deptName}</div>
          </div>
          <p className="px-4 pb-4 text-[18px] text-[#7a869c]">
            <UserRound size={12} className="mr-1 inline" />
            UID: {userProfile.uid}
            {userProfile.updatedAt ? ` · ${t('student.account.updated')}: ${new Date(userProfile.updatedAt as any).toLocaleString?.(dateLocale) || ''}` : ''}
          </p>
        </section>
      </div>
    </div>
  );
}
