'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, db } from '@/lib/data-store';
import { useLanguage } from '@/contexts/LanguageContext';
import { ClipboardCheck, Search } from 'lucide-react';

type QuizRow = {
  id: string;
  userId: string;
  userName: string;
  lessonId: string;
  courseId: string;
  lessonTitle: string;
  courseTitle: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  timeSpent?: number;
  completedAt?: Date;
};

export function StudentAssessment() {
  const { t, dateLocale } = useLanguage();
  const [rows, setRows] = useState<QuizRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setLoading(true);
        const [quizSnap, lessonSnap, courseSnap] = await Promise.all([
          getDocs(collection(db, 'quizResults')),
          getDocs(collection(db, 'lessons')),
          getDocs(collection(db, 'courses')),
        ]);
        const lessons: Record<string, string> = {};
        lessonSnap.docs.forEach(d => { lessons[d.id] = d.data().title || d.id; });
        const courses: Record<string, string> = {};
        courseSnap.docs.forEach(d => { courses[d.id] = d.data().title || d.id; });

        const data = quizSnap.docs.map(docSnap => {
          const item = docSnap.data();
          const completedAt = item.completedAt?.toDate?.() || (item.completedAt ? new Date(item.completedAt) : undefined);
          return {
            id: docSnap.id,
            userId: item.userId,
            userName: item.userName || item.userEmail || '—',
            lessonId: item.lessonId,
            courseId: item.courseId,
            lessonTitle: lessons[item.lessonId] || item.lessonId,
            courseTitle: courses[item.courseId] || item.courseId,
            score: Number(item.score || 0),
            correctCount: Number(item.correctCount || 0),
            totalQuestions: Number(item.totalQuestions || 0),
            timeSpent: item.timeSpent,
            completedAt,
          } as QuizRow;
        }).sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));

        setRows(data);
        if (data[0]) setSelectedId(data[0].id);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter(row =>
      [row.userName, row.lessonTitle, row.courseTitle].join(' ').toLowerCase().includes(keyword)
    );
  }, [rows, query]);

  const selected = filtered.find(r => r.id === selectedId) || filtered[0] || null;
  const passed = rows.filter(r => r.score >= 70).length;

  if (loading) {
    return <div className="grid min-h-[240px] place-items-center rounded-2xl border border-[#e7edf5] bg-white text-[13px] text-[#63708a]">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="m-0 text-[20px] font-bold text-[#111b38]">{t('student.academy.navAssessment')}</h1>
        <p className="mt-1 text-[13px] text-[#63708a]">{t('student.assessment.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: t('student.assessment.total'), value: rows.length },
          { label: t('student.assessment.passed'), value: passed },
          { label: t('student.assessment.failed'), value: rows.length - passed },
          { label: t('student.assessment.avg'), value: rows.length ? `${Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length)}%` : '—' },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <span className="mb-3 inline-flex rounded-xl bg-[#edfbf4] p-2.5 text-[#18701C]"><ClipboardCheck size={18} /></span>
            <p className="m-0 text-[28px] font-bold tabular-nums">{stat.value}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#63708a]">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_300px]">
        <section className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
          <div className="border-b border-[#eef2f7] p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99a4b5]" size={16} />
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('student.assessment.search')} className="w-full rounded-xl border border-[#e7edf5] bg-[#f8fafc] py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#18701C]" />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="bg-[#f7faf8] text-[11px] font-bold uppercase tracking-wide text-[#63708a]">
                <tr>
                  <th className="px-3 py-3 font-bold">#</th>
                  <th className="px-3 py-3 font-bold">{t('student.assessment.colLearner')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.assessment.colCourse')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.assessment.colLesson')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.assessment.colScore')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.assessment.colTime')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-3 py-10 text-center text-[#63708a]">{t('student.assessment.empty')}</td></tr>
                ) : filtered.map((row, index) => (
                  <tr key={row.id} onClick={() => setSelectedId(row.id)} className={`cursor-pointer border-t border-[#eef2f7] hover:bg-[#f4faf6] ${selected?.id === row.id ? 'bg-[#eff8f0]' : ''}`}>
                    <td className="px-3 py-3 text-[12px] font-bold text-[#18701C]">{index + 1}</td>
                    <td className="px-3 py-3 font-semibold text-[#111b38]">{row.userName}</td>
                    <td className="px-3 py-3 text-[#243552]">{row.courseTitle}</td>
                    <td className="px-3 py-3 text-[#243552]">{row.lessonTitle}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.score >= 70 ? 'bg-[#edfbf4] text-[#14661a]' : 'bg-[#fff1f1] text-[#b42318]'}`}>
                        {row.score}% · {row.correctCount}/{row.totalQuestions}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-[#52617c]">{row.completedAt ? row.completedAt.toLocaleString(dateLocale) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
          <p className="mb-3 text-[13px] font-bold">{t('student.assessment.preview')}</p>
          {selected ? (
            <div className="space-y-2 text-[13px]">
              <div className="grid h-24 place-items-center rounded-2xl bg-gradient-to-br from-[#0a2f12] to-[#18701C] text-white"><ClipboardCheck size={36} /></div>
              <h3 className="text-[16px] font-bold">{selected.lessonTitle}</h3>
              <p className="text-[#63708a]">{selected.courseTitle}</p>
              <div className="rounded-xl bg-[#f7faf8] p-3 space-y-2">
                <p className="m-0 flex justify-between"><span className="text-[#7a869c]">{t('student.assessment.colLearner')}</span><b>{selected.userName}</b></p>
                <p className="m-0 flex justify-between"><span className="text-[#7a869c]">{t('student.assessment.colScore')}</span><b>{selected.score}%</b></p>
                <p className="m-0 flex justify-between"><span className="text-[#7a869c]">{t('student.assessment.duration')}</span><b>{selected.timeSpent ? `${Math.round(selected.timeSpent / 60)} ${t('student.academy.minutes')}` : '—'}</b></p>
              </div>
            </div>
          ) : <p className="py-8 text-center text-[#63708a]">{t('student.assessment.empty')}</p>}
        </aside>
      </div>
    </div>
  );
}
