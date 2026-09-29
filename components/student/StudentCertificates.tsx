'use client';

import React, { useMemo, useState } from 'react';
import {
  Award,
  BadgeCheck,
  Calendar,
  Download,
  Eye,
  FileCheck2,
  Plus,
  Search,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';

type CertStatus = 'issued' | 'pending' | 'expired' | 'expiring';

type CertificateRow = {
  id: string;
  student: string;
  role: string;
  course: string;
  completedAt: string;
  issuedAt: string;
  expiresAt: string;
  status: CertStatus;
};

const DEMO_ROWS: CertificateRow[] = [
  { id: '1', student: 'Nguyễn Văn A', role: 'Sales', course: 'ROOM SALE', completedAt: '12/09/2026', issuedAt: '15/09/2026', expiresAt: '15/09/2028', status: 'issued' },
  { id: '2', student: 'Trần Thị B', role: 'CSKH', course: 'Kiến thức sản phẩm BIOKAMA', completedAt: '08/09/2026', issuedAt: '10/09/2026', expiresAt: '10/10/2026', status: 'expiring' },
  { id: '3', student: 'Lê Văn C', role: 'Kinh doanh', course: 'Kỹ năng tư vấn', completedAt: '01/09/2026', issuedAt: '—', expiresAt: '—', status: 'pending' },
  { id: '4', student: 'Phạm Thu D', role: 'Sales', course: 'Chăm sóc khách hàng 7 ngày', completedAt: '20/08/2025', issuedAt: '22/08/2025', expiresAt: '22/08/2026', status: 'expired' },
  { id: '5', student: 'Hoàng Minh E', role: 'Marketing', course: 'ROOM SALE', completedAt: '05/09/2026', issuedAt: '06/09/2026', expiresAt: '06/09/2028', status: 'issued' },
];

const statusStyle: Record<CertStatus, string> = {
  issued: 'bg-[#edfbf4] text-[#14661a] ring-[#c6ebd4]',
  pending: 'bg-[#fff8e8] text-[#9a6b08] ring-[#f0dfb0]',
  expiring: 'bg-[#fff6e9] text-[#df8b00] ring-[#f5dfb8]',
  expired: 'bg-[#fff1f1] text-[#b42318] ring-[#f0cfcb]',
};

export function StudentCertificates() {
  const { t } = useLanguage();
  const { userProfile } = useAuth();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CertStatus>('all');
  const [selectedId, setSelectedId] = useState(DEMO_ROWS[0].id);
  const [tab, setTab] = useState<'list' | 'templates' | 'rules' | 'history' | 'expired'>('list');

  const statusLabel: Record<CertStatus, string> = {
    issued: t('student.certs.statusIssued'),
    pending: t('student.certs.statusPending'),
    expiring: t('student.certs.statusExpiring'),
    expired: t('student.certs.statusExpired'),
  };

  const rows = useMemo(() => {
    return DEMO_ROWS.filter(row => {
      const matchQuery =
        !query ||
        row.student.toLowerCase().includes(query.toLowerCase()) ||
        row.course.toLowerCase().includes(query.toLowerCase());
      const matchStatus = statusFilter === 'all' || row.status === statusFilter;
      return matchQuery && matchStatus;
    });
  }, [query, statusFilter]);

  const selected = rows.find(r => r.id === selectedId) || DEMO_ROWS[0];

  const stats = [
    { label: t('student.certs.total'), value: '1.285', tone: 'bg-[#fff6e9] text-[#df8b00]', icon: Award },
    { label: t('student.certs.issued'), value: '1.142', tone: 'bg-[#edfbf4] text-[#18701C]', icon: BadgeCheck },
    { label: t('student.certs.pending'), value: '98', tone: 'bg-[#fff8e8] text-[#c99212]', icon: FileCheck2 },
    { label: t('student.certs.expired'), value: '45', tone: 'bg-[#fff1f1] text-[#b42318]', icon: ShieldAlert },
  ];

  const tabs = [
    { id: 'list' as const, label: t('student.certs.tabList') },
    { id: 'templates' as const, label: t('student.certs.tabTemplates') },
    { id: 'rules' as const, label: t('student.certs.tabRules') },
    { id: 'history' as const, label: t('student.certs.tabHistory') },
    { id: 'expired' as const, label: t('student.certs.tabExpired') },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[20px] font-bold tracking-tight text-[#111b38]">{t('student.academy.navCertificates')}</h1>
          <p className="mt-1 text-[13px] text-[#63708a]">{t('student.certs.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-[#cfe0d4] bg-white px-4 text-[13px] font-bold text-[#18701C] shadow-sm hover:bg-[#f4faf6]">
            <FileCheck2 size={16} />
            {t('student.certs.templatesBtn')}
          </button>
          <button type="button" className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#18701C] px-5 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(24,112,28,0.28)] hover:bg-[#145616]">
            <Plus size={16} />
            {t('student.certs.issueBtn')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(stat => (
          <div key={stat.label} className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <span className={`mb-3 inline-flex rounded-xl p-2.5 ${stat.tone}`}>
              <stat.icon size={18} />
            </span>
            <p className="m-0 text-[28px] font-bold tabular-nums text-[#111b38]">{stat.value}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#63708a]">{stat.label}</p>
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
              tab === item.id
                ? 'border-b-2 border-[#18701C] text-[#18701C]'
                : 'text-[#63708a] hover:text-[#18701C]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_320px]">
        <section className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
          <div className="flex flex-wrap gap-2 border-b border-[#eef2f7] p-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99a4b5]" size={16} />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('student.certs.search')}
                className="w-full rounded-xl border border-[#e7edf5] bg-[#f8fafc] py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#18701C]"
              />
            </div>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
              className="rounded-xl border border-[#e7edf5] bg-white px-3 py-2.5 text-[13px] outline-none focus:border-[#18701C]"
            >
              <option value="all">{t('student.certs.allStatus')}</option>
              <option value="issued">{statusLabel.issued}</option>
              <option value="pending">{statusLabel.pending}</option>
              <option value="expiring">{statusLabel.expiring}</option>
              <option value="expired">{statusLabel.expired}</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="bg-[#f7faf8] text-[11px] font-bold uppercase tracking-wide text-[#63708a]">
                <tr>
                  <th className="px-3 py-3 font-bold">#</th>
                  <th className="px-3 py-3 font-bold">{t('student.certs.colStudent')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.certs.colCourse')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.certs.colCompleted')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.certs.colIssued')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.certs.colStatus')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.certs.colAction')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(row.id)}
                    className={`cursor-pointer border-t border-[#eef2f7] transition hover:bg-[#f4faf6] ${selectedId === row.id ? 'bg-[#eff8f0]' : ''}`}
                  >
                    <td className="px-3 py-3 text-[12px] font-bold text-[#18701C]">{index + 1}</td>
                    <td className="px-3 py-3">
                      <b className="block text-[#111b38]">{row.student}</b>
                      <small className="text-[#7a869c]">{row.role}</small>
                    </td>
                    <td className="px-3 py-3 font-semibold text-[#243552]">{row.course}</td>
                    <td className="px-3 py-3 text-[#52617c]">{row.completedAt}</td>
                    <td className="px-3 py-3 text-[#52617c]">{row.issuedAt}</td>
                    <td className="px-3 py-3">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 ${statusStyle[row.status]}`}>
                        {statusLabel[row.status]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <button type="button" className="inline-flex items-center gap-1 font-bold text-[#18701C] hover:underline">
                        <Eye size={14} />
                        {t('student.certs.view')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <p className="m-0 mb-3 text-[13px] font-bold text-[#111b38]">{t('student.certs.preview')}</p>
            <div className="rounded-xl border-4 border-double border-[#18701C] bg-[#f4fffb] px-3 py-8 text-center">
              <Award className="mx-auto mb-2 text-[#18701C]" size={28} />
              <p className="m-0 text-[18px] font-bold text-[#145616]">BioKama Academy</p>
              <p className="mt-1 text-[11px] font-bold tracking-wide text-[#18701C]">{t('student.academy.certificateSample')}</p>
              <h3 className="mt-3 text-[16px] font-bold text-[#111b38]">{selected.course}</h3>
              <p className="mt-2 text-[13px] font-semibold text-[#52617c]">{selected.student}</p>
              <p className="mt-1 text-[11px] text-[#7a869c]">{userProfile?.displayName || 'BioKama'}</p>
            </div>
            <div className="mt-3 space-y-1.5 text-[12px] text-[#52617c]">
              <p className="m-0 flex items-center gap-2"><Calendar size={13} className="text-[#18701C]" />{t('student.certs.colIssued')}: <b>{selected.issuedAt}</b></p>
              <p className="m-0 flex items-center gap-2"><BadgeCheck size={13} className="text-[#18701C]" />{t('student.certs.colStatus')}: <b>{statusLabel[selected.status]}</b></p>
            </div>
            <div className="mt-4 grid gap-2">
              <button type="button" className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-[#18701C] text-[13px] font-bold text-white hover:bg-[#145616]">
                <Send size={14} /> {t('student.certs.send')}
              </button>
              <button type="button" className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-[#cfe0d4] text-[13px] font-bold text-[#18701C] hover:bg-[#f4faf6]">
                <Download size={14} /> {t('student.certs.download')}
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
