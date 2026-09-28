'use client';

import React, { useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { DEFAULT_ROLES } from '@/types/permission';
import { Check, Shield, X } from 'lucide-react';

type Crud = { view: boolean; edit: boolean; remove: boolean };

type ModuleKey = 'users' | 'courses' | 'departments' | 'projects' | 'salary' | 'dashboard';

function roleCrud(role: 'admin' | 'staff' | 'student' | 'teacher' | undefined): Record<ModuleKey, Crud> {
  if (role === 'admin') {
    return {
      users: { view: true, edit: true, remove: true },
      courses: { view: true, edit: true, remove: true },
      departments: { view: true, edit: true, remove: true },
      projects: { view: true, edit: true, remove: true },
      salary: { view: true, edit: true, remove: true },
      dashboard: { view: true, edit: true, remove: false },
    };
  }
  if (role === 'staff') {
    return {
      users: { view: true, edit: false, remove: false },
      courses: { view: true, edit: false, remove: false },
      departments: { view: true, edit: false, remove: false },
      projects: { view: true, edit: false, remove: false },
      salary: { view: false, edit: false, remove: false },
      dashboard: { view: true, edit: false, remove: false },
    };
  }
  // student / teacher
  return {
    users: { view: true, edit: false, remove: false },
    courses: { view: true, edit: false, remove: false },
    departments: { view: true, edit: false, remove: false },
    projects: { view: true, edit: false, remove: false },
    salary: { view: false, edit: false, remove: false },
    dashboard: { view: true, edit: false, remove: false },
  };
}

function Cell({ ok, yes, no }: { ok: boolean; yes: string; no: string }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#edfbf4] px-3 py-1.5 text-[16px] font-bold text-[#14661a]">
      <Check size={12} /> {yes}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#fff1f1] px-3 py-1.5 text-[16px] font-bold text-[#b42318]">
      <X size={12} /> {no}
    </span>
  );
}

export function StudentPermissions() {
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const [roleTab, setRoleTab] = useState<'mine' | 'admin' | 'manager' | 'staff'>('mine');

  const matrix = useMemo(() => {
    if (roleTab === 'mine') return roleCrud(userProfile?.role);
    if (roleTab === 'admin') return roleCrud('admin');
    if (roleTab === 'manager') {
      return {
        users: { view: true, edit: false, remove: false },
        courses: { view: true, edit: false, remove: false },
        departments: { view: true, edit: true, remove: false },
        projects: { view: true, edit: true, remove: false },
        salary: { view: true, edit: false, remove: false },
        dashboard: { view: true, edit: false, remove: false },
      } as Record<ModuleKey, Crud>;
    }
    return roleCrud('staff');
  }, [roleTab, userProfile?.role]);

  const modules: Array<{ key: ModuleKey; label: string }> = [
    { key: 'dashboard', label: t('student.permissions.modDashboard') },
    { key: 'users', label: t('student.permissions.modUsers') },
    { key: 'courses', label: t('student.permissions.modCourses') },
    { key: 'departments', label: t('student.permissions.modDepartments') },
    { key: 'projects', label: t('student.permissions.modProjects') },
    { key: 'salary', label: t('student.permissions.modSalary') },
  ];

  const tabs = [
    { id: 'mine' as const, label: t('student.permissions.myRole') },
    { id: 'admin' as const, label: 'Admin' },
    { id: 'manager' as const, label: DEFAULT_ROLES.MANAGER.name },
    { id: 'staff' as const, label: DEFAULT_ROLES.STAFF.name },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="m-0 text-[24px] font-bold text-[#111b38]">{t('student.academy.navPermissions')}</h1>
        <p className="mt-1 text-[13px] text-[#63708a]">{t('student.permissions.subtitle')}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setRoleTab(tab.id)}
            className={`rounded-full px-4 py-2 text-[13px] font-bold transition ${
              roleTab === tab.id ? 'bg-[#18701C] text-white' : 'border border-[#e7edf5] bg-white text-[#52617c] hover:bg-[#f4faf6]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
        <div className="flex items-center gap-2 border-b border-[#eef2f7] px-4 py-3 text-[#18701C]">
          <Shield size={18} />
          <b className="text-[14px] text-[#111b38]">
            {roleTab === 'mine'
              ? `${t('student.permissions.current')}: ${userProfile?.role || '—'}`
              : tabs.find(tab => tab.id === roleTab)?.label}
          </b>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[24px] font-semibold">
            <thead className="bg-[#f7faf8] text-[18px] font-bold uppercase tracking-wide text-[#63708a]">
              <tr>
                <th className="px-4 py-4 font-bold">#</th>
                <th className="px-4 py-4 font-bold">{t('student.permissions.module')}</th>
                <th className="px-4 py-4 font-bold">{t('student.permissions.view')}</th>
                <th className="px-4 py-4 font-bold">{t('student.permissions.edit')}</th>
                <th className="px-4 py-4 font-bold">{t('student.permissions.delete')}</th>
              </tr>
            </thead>
            <tbody>
              {modules.map((mod, index) => (
                <tr key={mod.key} className="border-t border-[#eef2f7]">
                  <td className="px-4 py-5 text-[16px] font-bold text-[#18701C]">{index + 1}</td>
                  <td className="px-4 py-5 font-bold text-[#111b38]">{mod.label}</td>
                  <td className="px-4 py-5"><Cell ok={matrix[mod.key].view} yes={t('student.permissions.yes')} no={t('student.permissions.no')} /></td>
                  <td className="px-4 py-5"><Cell ok={matrix[mod.key].edit} yes={t('student.permissions.yes')} no={t('student.permissions.no')} /></td>
                  <td className="px-4 py-5"><Cell ok={matrix[mod.key].remove} yes={t('student.permissions.yes')} no={t('student.permissions.no')} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
