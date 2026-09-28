'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, setDoc, deleteDoc } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { Question, QuizResult } from '@/types/lesson';
import { useAuth } from '@/contexts/AuthContext';
import {
  CheckCircle2,
  Award,
  Save,
  Clock,
  FileText,
  Download,
  AlertCircle,
  RotateCcw,
  ArrowLeft,
  Trophy,
  Target,
  CircleHelp,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface QuizTakerProps {
  lessonId: string;
  courseId: string;
  quizDuration?: number;
  quizDocumentUrl?: string;
  quizDocumentName?: string;
  onComplete: () => void;
}

const PASS_SCORE = 70;

function scoreTone(score: number) {
  if (score >= 80) {
    return {
      ring: 'from-[#18701C] to-[#1B7A1E]',
      badge: 'bg-[#edfbf4] text-[#14661a] border-[#c6ebd4]',
      score: 'text-[#18701C]',
      iconBg: 'bg-[#edfbf4] text-[#18701C]',
      bar: 'bg-[#18701C]',
    };
  }
  if (score >= PASS_SCORE) {
    return {
      ring: 'from-[#1B7A1E] to-[#2f9e45]',
      badge: 'bg-[#eff8f0] text-[#18701C] border-[#cfe8d4]',
      score: 'text-[#1B7A1E]',
      iconBg: 'bg-[#eff8f0] text-[#1B7A1E]',
      bar: 'bg-[#1B7A1E]',
    };
  }
  if (score >= 50) {
    return {
      ring: 'from-[#c99212] to-[#e0a820]',
      badge: 'bg-[#fff8e8] text-[#9a6b08] border-[#f0dfb0]',
      score: 'text-[#b8850d]',
      iconBg: 'bg-[#fff8e8] text-[#c99212]',
      bar: 'bg-[#c99212]',
    };
  }
  return {
    ring: 'from-[#9a3b3b] to-[#c45a5a]',
    badge: 'bg-[#fff5f4] text-[#8f2f2f] border-[#f0cfcb]',
    score: 'text-[#b42318]',
    iconBg: 'bg-[#fff5f4] text-[#b42318]',
    bar: 'bg-[#b42318]',
  };
}

export const QuizTaker: React.FC<QuizTakerProps> = ({
  lessonId,
  courseId,
  quizDuration,
  quizDocumentUrl,
  quizDocumentName,
  onComplete,
}) => {
  const { t, dateLocale } = useLanguage();
  const { userProfile } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [existingResult, setExistingResult] = useState<QuizResult | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [retaking, setRetaking] = useState(false);

  useEffect(() => {
    void loadQuestions();
    void checkExistingResult();
  }, [lessonId]);

  useEffect(() => {
    if (quizDuration && timeLeft > 0 && !showResult) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsTimeUp(true);
            void handleSubmit();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [timeLeft, showResult]);

  const checkExistingResult = async () => {
    if (!userProfile) return;
    try {
      const resultsRef = collection(db, 'quizResults');
      const q = query(
        resultsRef,
        where('userId', '==', userProfile.uid),
        where('lessonId', '==', lessonId)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const resultData = snapshot.docs[0].data() as QuizResult;
        const completedAt = resultData.completedAt as any;
        setExistingResult({
          ...resultData,
          completedAt: completedAt?.toDate ? completedAt.toDate() : new Date(completedAt),
        });
      }
    } catch (error) {
      console.error('Error checking existing result:', error);
    }
  };

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const questionsRef = collection(db, 'questions');
      const q = query(questionsRef, where('lessonId', '==', lessonId));
      const snapshot = await getDocs(q);
      const questionsData = snapshot.docs.map(docSnap => ({
        ...docSnap.data(),
        createdAt: docSnap.data().createdAt?.toDate(),
      })) as Question[];

      questionsData.sort((a, b) => a.order - b.order);
      setQuestions(questionsData);
      setAnswers(new Array(questionsData.length).fill(-1));
      if (quizDuration) setTimeLeft(quizDuration * 60);
      setStartTime(Date.now());
    } catch (error) {
      console.error('Error loading questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const resetQuizState = () => {
    setExistingResult(null);
    setShowResult(false);
    setResult(null);
    setAnswers(new Array(questions.length).fill(-1));
    setStartTime(Date.now());
    setIsTimeUp(false);
    if (quizDuration) setTimeLeft(quizDuration * 60);
  };

  const handleRetake = async (quizResult: QuizResult, confirmKey: string) => {
    if (!confirm(t(confirmKey))) return;
    try {
      setRetaking(true);
      if (userProfile) {
        await deleteDoc(doc(db, 'quizResults', quizResult.id));
      }
      resetQuizState();
    } catch (error) {
      console.error('Error deleting result:', error);
      alert(t('student.deleteResultError'));
    } finally {
      setRetaking(false);
    }
  };

  const handleSubmit = async () => {
    if (!userProfile) {
      alert(t('student.needLoginToSubmit'));
      return;
    }
    if (answers.some(a => a === -1)) {
      if (!confirm(t('student.confirmSubmitIncomplete'))) return;
    }

    try {
      let correctCount = 0;
      questions.forEach((question, index) => {
        if (answers[index] === question.correctAnswer) correctCount++;
      });

      const score = questions.length
        ? Math.round((correctCount / questions.length) * 100)
        : 0;
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);

      const quizResult: QuizResult = {
        id: `${userProfile.uid}_${lessonId}_${Date.now()}`,
        userId: userProfile.uid,
        userName: userProfile.displayName || userProfile.email || t('student.teacherFallback'),
        userEmail: userProfile.email || '',
        lessonId,
        courseId,
        answers,
        correctCount,
        totalQuestions: questions.length,
        score,
        timeSpent,
        completedAt: new Date(),
      };

      await setDoc(doc(db, 'quizResults', quizResult.id), quizResult);
      setResult(quizResult);
      setShowResult(true);
    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert(t('student.submitError', { message: (error as Error).message }));
    }
  };

  const renderResultCard = (
    quizResult: QuizResult,
    options: {
      primaryLabel: string;
      onPrimary: () => void;
      retakeConfirmKey: string;
      showCompletedAt?: boolean;
      failHintKey: string;
    }
  ) => {
    const passed = quizResult.score >= PASS_SCORE;
    const tone = scoreTone(quizResult.score);
    const accuracy = quizResult.totalQuestions
      ? Math.round((quizResult.correctCount / quizResult.totalQuestions) * 100)
      : 0;

    return (
      <div className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_8px_28px_rgba(24,48,93,0.06)]">
        <div className={`bg-gradient-to-br ${tone.ring} px-6 pb-10 pt-8 text-center text-white`}>
          <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-white/15 backdrop-blur-sm">
            {passed ? <Trophy size={30} strokeWidth={1.75} /> : <Award size={30} strokeWidth={1.75} />}
          </div>
          <p className="mb-1 text-[12px] font-medium uppercase tracking-[0.14em] text-white/80">
            {t('student.quizResult')}
          </p>
          <h2 className="m-0 text-[22px] font-bold tracking-tight">{t('student.quizResultTitle')}</h2>
        </div>

        <div className="relative px-5 pb-6 pt-0 sm:px-8">
          <div className="-mt-8 mx-auto max-w-sm rounded-2xl border border-[#e7edf5] bg-white p-5 text-center shadow-[0_10px_30px_rgba(24,48,93,0.08)]">
            <div className={`text-[42px] font-bold leading-none tracking-tight ${tone.score}`}>
              {quizResult.score}
              <span className="ml-1 text-[16px] font-semibold text-[#63708a]">{t('student.scorePoints', { score: '' }).replace(/\d+/g, '').trim() || 'điểm'}</span>
            </div>
            <p className="mt-2 text-[13px] font-semibold text-[#243552]">
              {t('student.answeredCorrectly', {
                correct: quizResult.correctCount,
                total: quizResult.totalQuestions,
              })}
            </p>
            {options.showCompletedAt && quizResult.completedAt && (
              <p className="mt-1 text-[11px] text-[#7a869c]">
                {t('student.completedAt', {
                  time: new Date(quizResult.completedAt).toLocaleString(dateLocale),
                })}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#f5f8fc] px-3 py-2.5 text-left">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#7a869c]">
                  <Target size={12} className="text-[#1B7A1E]" />
                  Accuracy
                </div>
                <b className="text-[15px] text-[#111b38]">{accuracy}%</b>
              </div>
              <div className="rounded-xl bg-[#f5f8fc] px-3 py-2.5 text-left">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#7a869c]">
                  <CircleHelp size={12} className="text-[#1B7A1E]" />
                  Pass
                </div>
                <b className="text-[15px] text-[#111b38]">{PASS_SCORE}+</b>
              </div>
            </div>

            <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#e9edf3]">
              <div
                className={`h-full rounded-full transition-all ${tone.bar}`}
                style={{ width: `${Math.min(100, quizResult.score)}%` }}
              />
            </div>
          </div>

          <div
            className={`mt-5 flex gap-3 rounded-xl border px-4 py-3.5 ${
              passed
                ? 'border-[#c6ebd4] bg-[#edfbf4]'
                : 'border-[#f0dfb0] bg-[#fff9ec]'
            }`}
          >
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                passed ? 'bg-[#18701C] text-white' : 'bg-[#c99212] text-white'
              }`}
            >
              {passed ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
            </span>
            <div className="min-w-0 text-left">
              <p className={`m-0 text-[13px] font-bold ${passed ? 'text-[#14661a]' : 'text-[#8a6508]'}`}>
                {passed ? t('student.excellentTitle') : t('student.notPassedTitle')}
              </p>
              <p className={`m-0 mt-1 text-[12px] leading-relaxed ${passed ? 'text-[#2f6b3d]' : 'text-[#7a6840]'}`}>
                {passed ? t('student.excellentHint') : t(options.failHintKey)}
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={options.onPrimary}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-[#18701C] px-4 text-[13px] font-bold text-white transition hover:bg-[#145616]"
            >
              <ArrowLeft size={16} />
              {options.primaryLabel}
            </button>
            <button
              type="button"
              disabled={retaking}
              onClick={() => void handleRetake(quizResult, options.retakeConfirmKey)}
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-[#d7e0eb] bg-white px-4 text-[13px] font-bold text-[#293957] transition hover:border-[#1B7A1E] hover:bg-[#f6faf7] hover:text-[#18701C] disabled:opacity-60"
            >
              <RotateCcw size={16} />
              {retaking ? '...' : t('student.retakeQuiz')}
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="grid min-h-[220px] place-items-center rounded-2xl border border-[#e7edf5] bg-white text-[13px] text-[#63708a]">
        <div className="text-center">
          <div className="mx-auto mb-3 h-9 w-9 animate-spin rounded-full border-2 border-[#18701C] border-t-transparent" />
          {t('student.loadingQuestions')}
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-2xl border border-[#e7edf5] bg-white p-8 text-center shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
        <CircleHelp className="mx-auto mb-3 text-[#9aa7b8]" size={36} />
        <p className="mb-4 text-[13px] text-[#52617c]">{t('student.quizNoQuestions')}</p>
        <button
          type="button"
          onClick={onComplete}
          className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-[#18701C] px-5 text-[13px] font-bold text-white hover:bg-[#145616]"
        >
          {t('common.back')}
        </button>
      </div>
    );
  }

  if (existingResult && !showResult) {
    return renderResultCard(existingResult, {
      primaryLabel: t('student.backToLesson'),
      onPrimary: onComplete,
      retakeConfirmKey: 'student.confirmRetake',
      showCompletedAt: true,
      failHintKey: 'student.notPassedHint',
    });
  }

  if (showResult && result) {
    return renderResultCard(result, {
      primaryLabel: result.score >= PASS_SCORE ? t('student.continueLearningBtn') : t('common.back'),
      onPrimary: onComplete,
      retakeConfirmKey: 'student.confirmRetakeCurrent',
      failHintKey: 'student.notPassedHintRetake',
    });
  }

  const hasContent = questions.some(q => q.question || q.options.some(opt => opt));
  const answeredCount = answers.filter(a => a !== -1).length;
  const progressPct = questions.length ? (answeredCount / questions.length) * 100 : 0;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7edf5] bg-white shadow-[0_4px_16px_rgba(24,48,93,0.045)]">
      <div className="border-b border-[#eef2f7] bg-[#f8fafc] px-4 py-4 sm:px-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#7a869c]">
              BioKama Quiz
            </p>
            <h2 className="m-0 mt-0.5 text-[18px] font-bold text-[#111b38]">{t('student.quiz')}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {quizDuration && timeLeft > 0 && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold ${
                  timeLeft < 60
                    ? 'bg-[#fff5f4] text-[#b42318]'
                    : timeLeft < 300
                      ? 'bg-[#fff8e8] text-[#9a6b08]'
                      : 'bg-[#eff8f0] text-[#18701C]'
                }`}
              >
                <Clock size={14} />
                {formatTime(timeLeft)}
              </span>
            )}
            <span className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-[#52617c] ring-1 ring-[#e7edf5]">
              {t('student.answeredCount', { answered: answeredCount, total: questions.length })}
            </span>
          </div>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-[#e4ebf3]">
          <div
            className="h-full rounded-full bg-[#18701C] transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="px-4 py-5 sm:px-5">
        {quizDocumentUrl && quizDocumentName && (
          <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-[#dceee2] bg-[#f4faf6] p-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#18701C] text-white">
              <FileText size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-[12px] font-bold text-[#14661a]">{t('student.referenceDoc')}</p>
              <p className="m-0 truncate text-[12px] text-[#3d6b4a]">{quizDocumentName}</p>
            </div>
            <a
              href={quizDocumentUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#18701C] px-3 py-2 text-[12px] font-bold text-white hover:bg-[#145616]"
            >
              <Download size={14} />
              {t('student.downloadDocument')}
            </a>
          </div>
        )}

        <div className="space-y-3.5">
          {hasContent
            ? questions.map((question, index) => (
                <div
                  key={question.id}
                  className="rounded-xl border border-[#e7edf5] bg-[#fbfcfe] p-4 transition hover:border-[#cfe0d4]"
                >
                  <div className="mb-3 flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#18701C] text-[13px] font-bold text-white">
                      {index + 1}
                    </span>
                    <h3 className="m-0 flex-1 pt-1.5 text-[14px] font-bold leading-snug text-[#111b38]">
                      {question.question || t('student.questionFallback', { n: index + 1 })}
                    </h3>
                    {answers[index] !== -1 && (
                      <CheckCircle2 className="mt-1.5 shrink-0 text-[#18701C]" size={18} />
                    )}
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 sm:pl-12">
                    {question.options.map((option, optIndex) => {
                      const selected = answers[index] === optIndex;
                      return (
                        <button
                          key={optIndex}
                          type="button"
                          onClick={() => {
                            const next = [...answers];
                            next[index] = optIndex;
                            setAnswers(next);
                          }}
                          className={`rounded-xl border px-3.5 py-3 text-left text-[13px] transition ${
                            selected
                              ? 'border-[#18701C] bg-[#18701C] font-semibold text-white shadow-[0_4px_12px_rgba(24,112,28,0.25)]'
                              : 'border-[#e3eaf2] bg-white text-[#2f3c57] hover:border-[#1B7A1E] hover:bg-[#f6faf7]'
                          }`}
                        >
                          <span className={`mr-2 font-bold ${selected ? 'text-white/90' : 'text-[#1B7A1E]'}`}>
                            {String.fromCharCode(65 + optIndex)}.
                          </span>
                          {option || t('student.optionFallback', { letter: String.fromCharCode(65 + optIndex) })}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            : questions.map((question, index) => (
                <div
                  key={question.id}
                  className="flex items-center gap-3 rounded-xl border border-[#e7edf5] bg-[#fbfcfe] p-3.5"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#18701C] text-[14px] font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="flex flex-1 gap-2">
                    {[0, 1, 2, 3].map(optIndex => {
                      const selected = answers[index] === optIndex;
                      return (
                        <button
                          key={optIndex}
                          type="button"
                          onClick={() => {
                            const next = [...answers];
                            next[index] = optIndex;
                            setAnswers(next);
                          }}
                          className={`h-11 flex-1 rounded-lg text-[15px] font-bold transition ${
                            selected
                              ? 'bg-[#18701C] text-white shadow'
                              : 'border border-[#e3eaf2] bg-white text-[#314057] hover:border-[#1B7A1E]'
                          }`}
                        >
                          {String.fromCharCode(65 + optIndex)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="w-6 shrink-0">
                    {answers[index] !== -1 && <CheckCircle2 className="text-[#18701C]" size={18} />}
                  </div>
                </div>
              ))}
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2.5 border-t border-[#eef2f7] pt-5 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onComplete}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-[#d7e0eb] px-5 text-[13px] font-semibold text-[#52617c] hover:bg-[#f5f8fc]"
          >
            {t('common.cancel')}
          </button>
          <div className="hidden flex-1 sm:block" />
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={isTimeUp}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[#18701C] px-6 text-[13px] font-bold text-white shadow-[0_6px_16px_rgba(24,112,28,0.22)] transition hover:bg-[#145616] disabled:opacity-50"
          >
            <Save size={16} />
            {t('student.submitWithCount', { answered: answeredCount, total: questions.length })}
          </button>
        </div>
      </div>
    </div>
  );
};
