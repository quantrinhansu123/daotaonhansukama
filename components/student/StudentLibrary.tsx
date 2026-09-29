'use client';

import React, { useMemo, useState } from 'react';
import {
  Cloud,
  Download,
  FileSpreadsheet,
  FileText,
  Folder,
  MoreHorizontal,
  Search,
  Star,
  Upload,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

type DocRow = {
  id: string;
  name: string;
  desc: string;
  project: string;
  projectTone: string;
  dept: string;
  type: 'PDF' | 'Excel' | 'Word';
  size: string;
  updated: string;
  downloads: number;
};

const FOLDERS = [
  { name: 'Tài liệu chung', count: 128, tone: 'bg-[#fff6e9] text-[#df8b00]' },
  { name: 'BIOKAMA', count: 86, tone: 'bg-[#edfbf4] text-[#18701C]' },
  { name: 'Sales Playbook', count: 54, tone: 'bg-[#eff6ff] text-[#1B7A1E]' },
  { name: 'Kỹ thuật', count: 41, tone: 'bg-[#f0fdf4] text-[#15803d]' },
  { name: 'Marketing', count: 37, tone: 'bg-[#fff1f1] text-[#b42318]' },
  { name: 'Đào tạo nội bộ', count: 62, tone: 'bg-[#f5f3ff] text-[#6d28d9]' },
];

const DOCS: DocRow[] = [
  { id: '1', name: 'Catalogue sản phẩm BIOKAMA.pdf', desc: 'Tài liệu giới thiệu dòng sản phẩm', project: 'BIOKAMA', projectTone: 'bg-[#edfbf4] text-[#18701C]', dept: 'Kinh doanh', type: 'PDF', size: '4.2 MB', updated: '28/09/2026', downloads: 842 },
  { id: '2', name: 'Kịch bản tư vấn Room Sale.docx', desc: 'Script bán hàng chuẩn', project: 'ROOM SALE', projectTone: 'bg-[#eff6ff] text-[#1B7A1E]', dept: 'Sales', type: 'Word', size: '1.1 MB', updated: '27/09/2026', downloads: 512 },
  { id: '3', name: 'Báo cáo hiệu suất Q3.xlsx', desc: 'Số liệu đào tạo quý 3', project: 'FLOSI', projectTone: 'bg-[#eff6ff] text-[#2563eb]', dept: 'Vận hành', type: 'Excel', size: '890 KB', updated: '25/09/2026', downloads: 220 },
  { id: '4', name: 'Quy trình chăm sóc KH 7 ngày.pdf', desc: 'Checklist sau bán hàng', project: 'BIOKAMA', projectTone: 'bg-[#edfbf4] text-[#18701C]', dept: 'CSKH', type: 'PDF', size: '2.4 MB', updated: '22/09/2026', downloads: 390 },
  { id: '5', name: 'FAQ kỹ thuật sản phẩm.docx', desc: 'Câu hỏi thường gặp', project: 'BIOKAMA', projectTone: 'bg-[#edfbf4] text-[#18701C]', dept: 'Kỹ thuật', type: 'Word', size: '760 KB', updated: '20/09/2026', downloads: 188 },
];

const typeIcon = {
  PDF: FileText,
  Excel: FileSpreadsheet,
  Word: FileText,
};

const typeTone = {
  PDF: 'bg-[#fff1f1] text-[#b42318]',
  Excel: 'bg-[#edfbf4] text-[#18701C]',
  Word: 'bg-[#eff6ff] text-[#1B7A1E]',
};

export function StudentLibrary() {
  const { t } = useLanguage();
  const [tab, setTab] = useState<'all' | 'folders' | 'fav' | 'mine' | 'trash'>('all');
  const [query, setQuery] = useState('');

  const rows = useMemo(
    () => DOCS.filter(doc => !query || doc.name.toLowerCase().includes(query.toLowerCase()) || doc.project.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  const stats = [
    { label: t('student.library.totalDocs'), value: '1.248', tone: 'bg-[#eff6ff] text-[#1B7A1E]', delta: '+18%' },
    { label: t('student.library.downloads'), value: '12.580', tone: 'bg-[#edfbf4] text-[#18701C]', delta: '+25%' },
    { label: t('student.library.visitors'), value: '2.480', tone: 'bg-[#fff6e9] text-[#df8b00]', delta: '+12%' },
    { label: t('student.library.storage'), value: '12.8 GB', tone: 'bg-[#f5f3ff] text-[#6d28d9]', delta: '+8%' },
  ];

  const tabs = [
    { id: 'all' as const, label: t('student.library.tabAll') },
    { id: 'folders' as const, label: t('student.library.tabFolders') },
    { id: 'fav' as const, label: t('student.library.tabFav') },
    { id: 'mine' as const, label: t('student.library.tabMine') },
    { id: 'trash' as const, label: t('student.library.tabTrash') },
  ];

  const tags = ['Sản phẩm', 'Kỹ thuật', 'Marketing', 'Sales', 'CSKH', 'Nội bộ', 'BIOKAMA', 'FAQ'];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[20px] font-bold tracking-tight text-[#111b38]">{t('student.academy.navLibrary')}</h1>
          <p className="mt-1 text-[13px] text-[#63708a]">{t('student.library.subtitle')}</p>
        </div>
        <button type="button" className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#18701C] px-5 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(24,112,28,0.28)] hover:bg-[#145616]">
          <Upload size={16} />
          {t('student.library.upload')}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <span className={`mb-3 inline-flex rounded-xl p-2.5 ${stat.tone}`}>
              <Folder size={18} />
            </span>
            <p className="m-0 text-[28px] font-bold tabular-nums text-[#111b38]">{stat.value}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#63708a]">{stat.label}</p>
            <p className="mt-1 text-[11px] font-bold text-[#18701C]">{stat.delta} {t('student.library.vsLastMonth')}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[#e7edf5]">
        {tabs.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap px-4 py-3 text-[13px] font-bold transition ${
              tab === item.id ? 'border-b-2 border-[#18701C] text-[#18701C]' : 'text-[#63708a] hover:text-[#18701C]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.75fr)_300px]">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99a4b5]" size={16} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('student.library.search')}
                className="w-full rounded-xl border border-[#e7edf5] bg-white py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#18701C]"
              />
            </div>
            {['Dự án', 'Phòng ban', 'Loại tài liệu', 'Ngày cập nhật'].map(label => (
              <select key={label} className="rounded-xl border border-[#e7edf5] bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#18701C]">
                <option>{label}</option>
              </select>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {FOLDERS.map(folder => (
              <button
                key={folder.name}
                type="button"
                className="w-full rounded-2xl border border-[#e7edf5] bg-white p-4 text-left shadow-[0_4px_14px_rgba(24,48,93,0.05)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(24,48,93,0.08)]"
              >
                <span className={`mb-2 inline-flex rounded-xl p-2.5 ${folder.tone}`}>
                  <Folder size={20} />
                </span>
                <b className="block truncate text-[14px] text-[#111b38]">{folder.name}</b>
                <small className="text-[#7a869c]">{folder.count} {t('student.library.files')}</small>
              </button>
            ))}
          </div>

          <section className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-[13px]">
                <thead className="bg-[#f7faf8] text-[11px] font-bold uppercase tracking-wide text-[#63708a]">
                  <tr>
                    <th className="px-3 py-3 font-bold">#</th>
                    <th className="px-3 py-3 font-bold">{t('student.library.colName')}</th>
                    <th className="px-3 py-3 font-bold">{t('student.library.colProject')}</th>
                    <th className="px-3 py-3 font-bold">{t('student.library.colDept')}</th>
                    <th className="px-3 py-3 font-bold">{t('student.library.colType')}</th>
                    <th className="px-3 py-3 font-bold">{t('student.library.colSize')}</th>
                    <th className="px-3 py-3 font-bold">{t('student.library.colUpdated')}</th>
                    <th className="px-3 py-3 font-bold">{t('student.library.colDownloads')}</th>
                    <th className="px-3 py-3 font-bold">{t('student.library.colAction')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((doc, index) => {
                    const Icon = typeIcon[doc.type];
                    return (
                      <tr key={doc.id} className="border-t border-[#eef2f7] hover:bg-[#f4faf6]">
                        <td className="px-3 py-3 text-[12px] font-bold text-[#18701C]">{index + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-start gap-2">
                            <span className={`mt-0.5 grid h-8 w-8 place-items-center rounded-lg ${typeTone[doc.type]}`}>
                              <Icon size={15} />
                            </span>
                            <span>
                              <b className="block text-[#111b38]">{doc.name}</b>
                              <small className="text-[#7a869c]">{doc.desc}</small>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${doc.projectTone}`}>{doc.project}</span>
                        </td>
                        <td className="px-3 py-3 text-[#52617c]">{doc.dept}</td>
                        <td className="px-3 py-3">
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${typeTone[doc.type]}`}>{doc.type}</span>
                        </td>
                        <td className="px-3 py-3 text-[#52617c]">{doc.size}</td>
                        <td className="px-3 py-3 text-[#52617c]">{doc.updated}</td>
                        <td className="px-3 py-3 font-bold text-[#111b38]">{doc.downloads}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 text-[#52617c]">
                            <button type="button" className="rounded-lg p-1.5 hover:bg-[#edfbf4] hover:text-[#18701C]"><Download size={15} /></button>
                            <button type="button" className="rounded-lg p-1.5 hover:bg-[#fff8e8] hover:text-[#c99212]"><Star size={15} /></button>
                            <button type="button" className="rounded-lg p-1.5 hover:bg-[#f5f8fc]"><MoreHorizontal size={15} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <b className="mb-3 block text-[14px] text-[#111b38]">{t('student.library.featured')}</b>
            <div className="space-y-2.5">
              {DOCS.slice(0, 4).map(doc => (
                <div key={doc.id} className="flex items-start gap-2 rounded-xl border border-[#eef2f7] p-2.5 hover:bg-[#f4faf6]">
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${typeTone[doc.type]}`}>
                    <FileText size={14} />
                  </span>
                  <div className="min-w-0">
                    <b className="block truncate text-[12px] text-[#111b38]">{doc.name}</b>
                    <small className="text-[#7a869c]">{doc.downloads} {t('student.library.downloads').toLowerCase()}</small>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <b className="mb-3 block text-[14px] text-[#111b38]">{t('student.library.tags')}</b>
            <div className="flex flex-wrap gap-2">
              {tags.map(tag => (
                <span key={tag} className="rounded-full bg-[#eff8f0] px-2.5 py-1 text-[11px] font-bold text-[#18701C]">
                  {tag}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-[#c6ebd4] bg-[#edfbf4] p-4">
            <div className="mb-2 flex items-center gap-2 text-[#18701C]">
              <Cloud size={18} />
              <b className="text-[13px]">{t('student.library.storage')}</b>
            </div>
            <p className="m-0 text-[20px] font-bold text-[#145616]">12.8 GB / 50 GB</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/80">
              <div className="h-full w-[26%] rounded-full bg-[#18701C]" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
