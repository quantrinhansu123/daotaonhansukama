'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { ClipboardCheck, Clock, List, PlayCircle, Search } from 'lucide-react';

type ActivityItem = {
  id: string;
  type: 'video' | 'quiz';
  title: string;
  courseTitle: string;
  detail: string;
  seconds?: number;
  score?: number;
  at?: Date;
};

function formatDuration(seconds = 0) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins >= 60) {
    const hours = Math.floor(mins / 60);
    return `${hours}h ${mins % 60}m`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function StudentActivityLog() {
  const { userProfile } = useAuth();
  const { t, dateLocale } = useLanguage();
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'quiz'>('all');

  useEffect(() => {
    if (!userProfile?.uid) return;
    void (async () => {
      try {
        setLoading(true);
        const [progressSnap, quizSnap, lessonSnap, courseSnap] = await Promise.all([
          getDocs(query(collection(db, 'progress'), where('userId', '==', userProfile.uid))),
          getDocs(query(collection(db, 'quizResults'), where('userId', '==', userProfile.uid))),
          getDocs(collection(db, 'lessons')),
          getDocs(collection(db, 'courses')),
        ]);

        const lessons: Record<string, { title: string; courseId?: string }> = {};
        lessonSnap.docs.forEach(d => {
          const data = d.data();
          lessons[d.id] = { title: data.title || d.id, courseId: data.courseId };
        });
        const courses: Record<string, string> = {};
        courseSnap.docs.forEach(d => { courses[d.id] = d.data().title || d.id; });

        const videoItems: ActivityItem[] = progressSnap.docs.map(docSnap => {
          const data = docSnap.data();
          const lesson = lessons[data.lessonId] || { title: data.lessonId };
          const seconds = Number(data.viewedSeconds ?? data.watchedSeconds ?? 0);
          const at = data.lastWatchedAt?.toDate?.() || (data.lastWatchedAt ? new Date(data.lastWatchedAt) : undefined);
          return {
            id: `video-${docSnap.id}`,
            type: 'video',
            title: lesson.title,
            courseTitle: courses[data.courseId || lesson.courseId || ''] || data.courseId || '—',
            detail: data.completed ? t('student.activity.completedVideo') : t('student.activity.watching'),
            seconds,
            at,
          };
        });

        const quizItems: ActivityItem[] = quizSnap.docs.map(docSnap => {
          const data = docSnap.data();
          const lesson = lessons[data.lessonId] || { title: data.lessonId };
          const at = data.completedAt?.toDate?.() || (data.completedAt ? new Date(data.completedAt) : undefined);
          return {
            id: `quiz-${docSnap.id}`,
            type: 'quiz',
            title: lesson.title,
            courseTitle: courses[data.courseId || lesson.courseId || ''] || data.courseId || '—',
            detail: t('student.activity.quizScore', { score: data.score || 0 }),
            seconds: Number(data.timeSpent || 0),
            score: Number(data.score || 0),
            at,
          };
        });

        const merged = [...videoItems, ...quizItems].sort((a, b) => (b.at?.getTime() || 0) - (a.at?.getTime() || 0));
        setItems(merged);
      } finally {
        setLoading(false);
      }
    })();
  }, [userProfile?.uid, t]);

  const filtered = useMemo(() => {
    return items.filter(item => {
      const matchType = typeFilter === 'all' || item.type === typeFilter;
      const keyword = queryText.trim().toLowerCase();
      const matchQuery = !keyword || [item.title, item.courseTitle, item.detail].join(' ').toLowerCase().includes(keyword);
      return matchType && matchQuery;
    });
  }, [items, typeFilter, queryText]);

  const totalWatch = items.filter(i => i.type === 'video').reduce((s, i) => s + (i.seconds || 0), 0);
  const quizCount = items.filter(i => i.type === 'quiz').length;

  if (loading) {
    return <div className="grid min-h-[240px] place-items-center rounded-2xl border border-[#e7edf5] bg-white text-[13px] text-[#63708a]">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="m-0 text-[24px] font-bold text-[#111b38]">{t('student.academy.navActivity')}</h1>
        <p className="mt-1 text-[13px] text-[#63708a]">{t('student.activity.subtitle')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: t('student.activity.totalEvents'), value: items.length, icon: List },
          { label: t('student.activity.watchTime'), value: formatDuration(totalWatch), icon: Clock },
          { label: t('student.activity.videos'), value: items.filter(i => i.type === 'video').length, icon: PlayCircle },
          { label: t('student.activity.quizzes'), value: quizCount, icon: ClipboardCheck },
        ].map(stat => (
          <div key={stat.label} className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <span className="mb-3 inline-flex rounded-xl bg-[#edfbf4] p-2.5 text-[#18701C]"><stat.icon size={18} /></span>
            <p className="m-0 text-[24px] font-bold tabular-nums">{stat.value}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#63708a]">{stat.label}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
        <div className="flex flex-wrap gap-2 border-b border-[#eef2f7] p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99a4b5]" size={16} />
            <input value={queryText} onChange={e => setQueryText(e.target.value)} placeholder={t('student.activity.search')} className="w-full rounded-xl border border-[#e7edf5] bg-[#f8fafc] py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#18701C]" />
          </div>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value as typeof typeFilter)} className="rounded-xl border border-[#e7edf5] bg-white px-3 py-2.5 text-[13px] font-semibold outline-none focus:border-[#18701C]">
            <option value="all">{t('student.activity.allTypes')}</option>
            <option value="video">{t('student.activity.typeVideo')}</option>
            <option value="quiz">{t('student.activity.typeQuiz')}</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[24px] font-semibold">
            <thead className="bg-[#f7faf8] text-[18px] font-bold uppercase tracking-wide text-[#63708a]">
              <tr>
                <th className="px-3 py-3 font-bold">#</th>
                <th className="px-3 py-3 font-bold">{t('student.activity.colType')}</th>
                <th className="px-3 py-3 font-bold">{t('student.activity.colTitle')}</th>
                <th className="px-3 py-3 font-bold">{t('student.activity.colCourse')}</th>
                <th className="px-3 py-3 font-bold">{t('student.activity.colDetail')}</th>
                <th className="px-3 py-3 font-bold">{t('student.activity.colDuration')}</th>
                <th className="px-3 py-3 font-bold">{t('student.activity.colWhen')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-[#63708a]">{t('student.activity.empty')}</td></tr>
              ) : filtered.map((item, index) => (
                <tr key={item.id} className="border-t border-[#eef2f7] hover:bg-[#f4faf6]">
                  <td className="px-3 py-3 text-[16px] font-bold text-[#18701C]">{index + 1}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[16px] font-bold ${item.type === 'video' ? 'bg-[#eff6ff] text-[#1B7A1E]' : 'bg-[#edfbf4] text-[#14661a]'}`}>
                      {item.type === 'video' ? <PlayCircle size={13} /> : <ClipboardCheck size={13} />}
                      {item.type === 'video' ? t('student.activity.typeVideo') : t('student.activity.typeQuiz')}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-semibold text-[#111b38]">{item.title}</td>
                  <td className="px-3 py-3 text-[#243552]">{item.courseTitle}</td>
                  <td className="px-3 py-3 text-[#52617c]">{item.detail}</td>
                  <td className="px-3 py-3 font-bold text-[#18701C]">{item.seconds ? formatDuration(item.seconds) : '—'}</td>
                  <td className="px-3 py-3 text-[#52617c]">{item.at ? item.at.toLocaleString(dateLocale) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
