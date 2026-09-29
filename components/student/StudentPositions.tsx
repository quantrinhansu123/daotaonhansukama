'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, getDocs, db } from '@/lib/data-store';
import { Position, UserProfile } from '@/types/user';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import { Award, ClipboardCheck, Search, Trash2, Users } from 'lucide-react';

const POSITION_LIST: Position[] = [
  'Nhân viên',
  'Trưởng nhóm',
  'Phó phòng',
  'Trưởng phòng',
  'Phó giám đốc',
  'Giám đốc',
];

const PASS_SCORE = 70;

type QuizAttempt = {
  id: string;
  userId: string;
  score: number;
  completedAt?: Date;
};

type MemberQuizStat = {
  user: UserProfile;
  resultIds: string[];
  attempts: number;
  avgScore: number;
  bestScore: number;
  passed: number;
  lastAt?: Date;
};

type PositionRow = {
  position: Position;
  members: UserProfile[];
  count: number;
  attempts: number;
  examTakers: number;
  passedAttempts: number;
  avgScore: number;
  passRate: number;
  memberStats: MemberQuizStat[];
};

function avg(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function StudentPositions() {
  const { t, dateLocale } = useLanguage();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string>(POSITION_LIST[0]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [userSnap, quizSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'quizResults')),
      ]);

      setUsers(
        userSnap.docs.map((docSnap) => {
          const data = docSnap.data() as UserProfile;
          return { ...data, uid: data.uid || docSnap.id };
        })
      );

      setQuizAttempts(
        quizSnap.docs.map((docSnap) => {
          const item = docSnap.data();
          return {
            id: docSnap.id,
            userId: String(item.userId || ''),
            score: Number(item.score || 0),
            completedAt: item.completedAt?.toDate?.() || (item.completedAt ? new Date(item.completedAt) : undefined),
          } as QuizAttempt;
        }).filter((item) => item.userId)
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const rows = useMemo(() => {
    const byUser = new Map<string, QuizAttempt[]>();
    for (const attempt of quizAttempts) {
      const list = byUser.get(attempt.userId) || [];
      list.push(attempt);
      byUser.set(attempt.userId, list);
    }

    return POSITION_LIST.map((position) => {
      const members = users.filter((user) => (user.position || 'Nhân viên') === position);
      const memberStats: MemberQuizStat[] = members.map((user) => {
        const attempts = byUser.get(user.uid) || [];
        const scores = attempts.map((item) => item.score);
        const lastAt = attempts
          .map((item) => item.completedAt)
          .filter(Boolean)
          .sort((a, b) => (b?.getTime() || 0) - (a?.getTime() || 0))[0];
        return {
          user,
          resultIds: attempts.map((item) => item.id),
          attempts: attempts.length,
          avgScore: Math.round(avg(scores)),
          bestScore: scores.length ? Math.max(...scores) : 0,
          passed: attempts.filter((item) => item.score >= PASS_SCORE).length,
          lastAt,
        };
      }).sort((a, b) => b.avgScore - a.avgScore || b.attempts - a.attempts);

      const allAttempts = memberStats.flatMap((member) => byUser.get(member.user.uid) || []);
      const scores = allAttempts.map((item) => item.score);
      const passedAttempts = allAttempts.filter((item) => item.score >= PASS_SCORE).length;
      const examTakers = memberStats.filter((member) => member.attempts > 0).length;

      return {
        position,
        members,
        count: members.length,
        attempts: allAttempts.length,
        examTakers,
        passedAttempts,
        avgScore: Math.round(avg(scores)),
        passRate: allAttempts.length ? Math.round((passedAttempts / allAttempts.length) * 100) : 0,
        memberStats,
      } as PositionRow;
    }).filter((row) => {
      if (!query.trim()) return true;
      const keyword = query.trim().toLowerCase();
      return row.position.toLowerCase().includes(keyword)
        || row.memberStats.some((member) => (member.user.displayName || '').toLowerCase().includes(keyword));
    });
  }, [users, quizAttempts, query]);

  const current = rows.find((row) => row.position === selected) || rows[0];
  const totalAttempts = quizAttempts.length;
  const totalPassed = quizAttempts.filter((item) => item.score >= PASS_SCORE).length;
  const overallAvg = Math.round(avg(quizAttempts.map((item) => item.score)));

  if (loading) {
    return <div className="grid min-h-[240px] place-items-center rounded-2xl border border-[#e7edf5] bg-white text-[13px] text-[#63708a]">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="m-0 text-[20px] font-bold text-[#111b38]">{t('student.academy.navPositions')}</h1>
        <p className="mt-1 text-[13px] text-[#63708a]">{t('student.positions.subtitleQuiz')}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: t('student.positions.total'), value: POSITION_LIST.length },
          { label: t('student.assessment.total'), value: totalAttempts },
          { label: t('student.assessment.passed'), value: totalPassed },
          { label: t('student.assessment.avg'), value: totalAttempts ? `${overallAvg}%` : '—' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <span className="mb-3 inline-flex rounded-xl bg-[#edfbf4] p-2.5 text-[#18701C]"><ClipboardCheck size={18} /></span>
            <p className="m-0 text-[28px] font-bold tabular-nums">{stat.value}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#63708a]">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_340px]">
        <section className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
          <div className="border-b border-[#eef2f7] p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99a4b5]" size={16} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('student.positions.search')}
                className="w-full rounded-xl border border-[#e7edf5] bg-[#f8fafc] py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#18701C]"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[13px]">
              <thead className="bg-[#f7faf8] text-[11px] font-bold uppercase tracking-wide text-[#63708a]">
                <tr>
                  <th className="px-3 py-3 font-bold">#</th>
                  <th className="px-3 py-3 font-bold">{t('student.positions.colTitle')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.positions.colCount')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.positions.colAttempts')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.positions.colAvgScore')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.positions.colPassRate')}</th>
                  <th className="px-3 py-3 font-bold">{t('student.positions.colPeople')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr
                    key={row.position}
                    onClick={() => setSelected(row.position)}
                    className={`cursor-pointer border-t border-[#eef2f7] hover:bg-[#f4faf6] ${selected === row.position ? 'bg-[#eff8f0]' : ''}`}
                  >
                    <td className="px-3 py-3 text-[12px] font-bold text-[#18701C]">{index + 1}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <span className="grid h-12 w-12 place-items-center rounded-xl bg-[#edfbf4] text-[#18701C]"><Award size={22} /></span>
                        <div>
                          <b className="block text-[15px] text-[#111b38]">{row.position}</b>
                          <small className="text-[#7a869c]">{row.examTakers}/{row.count} {t('student.positions.tookExam')}</small>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 font-semibold">{row.count}</td>
                    <td className="px-3 py-3 font-semibold">{row.attempts}</td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${row.avgScore >= PASS_SCORE ? 'bg-[#edfbf4] text-[#18701C]' : 'bg-[#fff6e9] text-[#df8b00]'}`}>
                        {row.attempts ? `${row.avgScore}%` : '—'}
                      </span>
                    </td>
                    <td className="px-3 py-3 font-semibold text-[#111b38]">{row.attempts ? `${row.passRate}%` : '—'}</td>
                    <td className="px-3 py-3">
                      <div className="flex -space-x-2">
                        {row.members.slice(0, 5).map((member) => {
                          const photo = proxyBunnyUrl(member.photoURL || member.employment?.avatarURL || '');
                          return (
                            <span key={member.uid} className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border-2 border-white bg-[#edfbf4] text-[11px] font-bold text-[#18701C]">
                              {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : (member.displayName || 'U').slice(0, 1)}
                            </span>
                          );
                        })}
                        {row.count > 5 && <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-white bg-[#18701C] text-[11px] font-bold text-white">+{row.count - 5}</span>}
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
              <h3 className="mt-3 text-[16px] font-bold">{current.position}</h3>
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-[#63708a]">
                <Users size={14} />
                {current.count} {t('student.positions.people')}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
                <div className="rounded-xl border border-[#eef2f7] bg-[#f8fafc] p-2.5">
                  <small className="text-[#7a869c]">{t('student.positions.colAttempts')}</small>
                  <b className="mt-1 block text-[16px] text-[#111b38]">{current.attempts}</b>
                </div>
                <div className="rounded-xl border border-[#eef2f7] bg-[#f8fafc] p-2.5">
                  <small className="text-[#7a869c]">{t('student.positions.colAvgScore')}</small>
                  <b className="mt-1 block text-[16px] text-[#18701C]">{current.attempts ? `${current.avgScore}%` : '—'}</b>
                </div>
                <div className="rounded-xl border border-[#eef2f7] bg-[#f8fafc] p-2.5">
                  <small className="text-[#7a869c]">{t('student.assessment.passed')}</small>
                  <b className="mt-1 block text-[16px] text-[#111b38]">{current.passedAttempts}</b>
                </div>
                <div className="rounded-xl border border-[#eef2f7] bg-[#f8fafc] p-2.5">
                  <small className="text-[#7a869c]">{t('student.positions.colPassRate')}</small>
                  <b className="mt-1 block text-[16px] text-[#111b38]">{current.attempts ? `${current.passRate}%` : '—'}</b>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {current.memberStats.length === 0 ? (
                  <p className="m-0 text-[12px] text-[#7a869c]">{t('student.positions.noMembers')}</p>
                ) : (
                  current.memberStats.slice(0, 10).map((member) => {
                    const photo = proxyBunnyUrl(member.user.photoURL || member.user.employment?.avatarURL || '');
                    return (
                      <div key={member.user.uid} className="flex items-center gap-2.5 rounded-xl border border-[#eef2f7] p-2">
                        <span className="grid h-12 w-12 place-items-center overflow-hidden rounded-xl bg-[#edfbf4] text-[12px] font-bold text-[#18701C]">
                          {photo ? <img src={photo} alt="" className="h-full w-full object-cover" /> : (member.user.displayName || 'U').slice(0, 2).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <b className="block truncate text-[13px]">{member.user.displayName}</b>
                          <small className="text-[11px] text-[#7a869c]">
                            {member.attempts
                              ? `${member.attempts} ${t('student.positions.attemptsUnit')} · TB ${member.avgScore}% · Max ${member.bestScore}%`
                              : t('student.positions.noQuizYet')}
                          </small>
                          {member.lastAt && (
                            <small className="mt-0.5 block text-[10px] text-[#94a3b8]">
                              {member.lastAt.toLocaleDateString(dateLocale)}
                            </small>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
