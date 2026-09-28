'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Project, ProjectPriority, ProjectStatus } from '@/types/project';
import { useLanguage } from '@/contexts/LanguageContext';
import {
  Calendar,
  FolderKanban,
  Search,
  Users,
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

export function StudentProjects() {
  const { t, dateLocale } = useLanguage();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, 'projects'));
      const rows = snapshot.docs.map(docSnap => {
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
      if (rows[0]) setSelectedId(rows[0].id);
    } catch (error) {
      console.error('Error loading projects:', error);
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
    { label: t('student.projects.statusProgress'), value: projects.filter(p => p.status === 'in_progress').length },
    { label: t('student.projects.statusCompleted'), value: projects.filter(p => p.status === 'completed').length },
    { label: t('student.projects.statusHold'), value: projects.filter(p => p.status === 'on_hold' || p.status === 'planning').length },
  ];

  const formatDate = (value?: string) => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(dateLocale);
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
      <div>
        <h1 className="m-0 text-[24px] font-bold tracking-tight text-[#111b38]">{t('student.academy.navProjects')}</h1>
        <p className="mt-1 text-[13px] text-[#63708a]">{t('student.projects.subtitle')}</p>
      </div>

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
              <option value="all">{t('student.projects.allStatus')}</option>
              {(Object.keys(statusLabel) as ProjectStatus[]).map(status => (
                <option key={status} value={status}>{statusLabel[status]}</option>
              ))}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[24px] font-semibold">
              <thead className="bg-[#f7faf8] text-[18px] font-bold uppercase tracking-wide text-[#63708a]">
                <tr>
                  <th className="px-3 py-3 font-bold">#</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colName')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colManager')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colMembers')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colStatus')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.projects.colPriority')}</th>
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
                        <td className="px-3 py-3 text-[16px] font-bold text-[#18701C]">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-start gap-3">
                            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#edfbf4] text-[#18701C]">
                              <FolderKanban size={22} />
                            </span>
                            <div className="min-w-0">
                              <b className="block truncate text-[15px] text-[#111b38]">{project.name}</b>
                              <small className="mt-0.5 line-clamp-2 block text-[18px] text-[#7a869c]">
                                {project.description || project.departmentName || '—'}
                              </small>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 font-semibold text-[#243552]">{project.managerName || '—'}</td>
                        <td className="px-3 py-3">
                          <span className="inline-flex items-center gap-1.5 font-semibold text-[#243552]">
                            <Users size={14} className="text-[#18701C]" />
                            {project.members?.length || project.memberNames?.length || 0}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-3 py-1.5 text-[16px] font-bold ${statusTone[project.status]}`}>
                            {statusLabel[project.status]}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-3 py-1.5 text-[16px] font-bold ${priorityTone[project.priority]}`}>
                            {priorityLabel[project.priority]}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-[#52617c]">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar size={13} className="text-[#18701C]" />
                            {formatDate(project.startDate)} → {formatDate(project.endDate)}
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
          <p className="m-0 mb-3 text-[13px] font-bold text-[#111b38]">{t('student.projects.preview')}</p>
          {selected ? (
            <div>
              <div className="grid h-28 place-items-center rounded-2xl bg-gradient-to-br from-[#0a2f12] to-[#18701C] text-white">
                <FolderKanban size={40} />
              </div>
              <h3 className="mt-4 text-[18px] font-bold text-[#111b38]">{selected.name}</h3>
              <p className="mt-1 text-[13px] leading-relaxed text-[#63708a]">
                {selected.description || t('student.projects.noDescription')}
              </p>
              <div className="mt-4 space-y-2 rounded-xl bg-[#f7faf8] p-3 text-[13px]">
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.projects.colManager')}</span>
                  <b>{selected.managerName || '—'}</b>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.projects.colStatus')}</span>
                  <b>{statusLabel[selected.status]}</b>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.projects.colPriority')}</span>
                  <b>{priorityLabel[selected.priority]}</b>
                </p>
                <p className="m-0 flex justify-between gap-2">
                  <span className="text-[#7a869c]">{t('student.projects.colMembers')}</span>
                  <b>{selected.members?.length || selected.memberNames?.length || 0}</b>
                </p>
              </div>
              {selected.memberNames && selected.memberNames.length > 0 && (
                <div className="mt-3">
                  <b className="text-[12px] text-[#111b38]">{t('student.projects.team')}</b>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selected.memberNames.slice(0, 8).map(name => (
                      <span key={name} className="rounded-full bg-[#edfbf4] px-3 py-1.5 text-[16px] font-semibold text-[#18701C]">
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
    </div>
  );
}
