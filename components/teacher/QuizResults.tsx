'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { Lesson, QuizResult, Question } from '@/types/lesson';
import { ArrowLeft, Users, Award, Clock, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import { Button } from '@/components/Button';
import { useLanguage } from '@/contexts/LanguageContext';

interface QuizResultsProps {
  lesson: Lesson;
  onBack: () => void;
}

export const QuizResults: React.FC<QuizResultsProps> = ({ lesson, onBack }) => {
  const { t, dateLocale } = useLanguage();
  const [results, setResults] = useState<QuizResult[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedResult, setSelectedResult] = useState<QuizResult | null>(null);

  useEffect(() => {
    loadData();
  }, [lesson.id]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Load quiz results - without orderBy to avoid index requirement
      const resultsRef = collection(db, 'quizResults');
      const resultsQuery = query(
        resultsRef,
        where('lessonId', '==', lesson.id)
      );
      const resultsSnapshot = await getDocs(resultsQuery);
      const resultsData = resultsSnapshot.docs.map(doc => ({
        ...doc.data(),
        completedAt: doc.data().completedAt?.toDate()
      })) as QuizResult[];

      // Sort in memory instead
      resultsData.sort((a, b) => b.completedAt.getTime() - a.completedAt.getTime());

      // Load questions
      const questionsRef = collection(db, 'questions');
      const questionsQuery = query(
        questionsRef,
        where('lessonId', '==', lesson.id)
      );
      const questionsSnapshot = await getDocs(questionsQuery);
      const questionsData = questionsSnapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as Question[];

      // Sort questions by order
      questionsData.sort((a, b) => a.order - b.order);

      setResults(resultsData);
      setQuestions(questionsData);
    } catch (error) {
      console.error('Error loading quiz results:', error);
      alert(t('teacher.loadResultsError', { message: (error as Error).message }));
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = () => {
    if (results.length === 0) return null;

    const totalStudents = results.length;
    const avgScore = results.reduce((sum, r) => sum + r.score, 0) / totalStudents;
    const avgTime = results
      .filter(r => r.timeSpent)
      .reduce((sum, r) => sum + (r.timeSpent || 0), 0) / totalStudents;
    const passCount = results.filter(r => r.score >= 50).length;
    const passRate = (passCount / totalStudents) * 100;

    return { totalStudents, avgScore, avgTime, passRate };
  };

  const stats = calculateStats();

  if (loading) {
    return <div className="text-center py-8">{t("common.loading")}</div>;
  }

  return (
    <div className="min-h-screen bg-[#0E3A16] py-6">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-6 mb-6 backdrop-blur-md">
          <button onClick={onBack} className="text-[#1B7A1E] hover:text-[#156318] mb-3 flex items-center gap-2 transition-colors">
            <ArrowLeft size={18} />
            {t("teacher.backToQuizManagement")}
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white mb-1">{t("teacher.quizResultsTitle")}</h3>
              <p className="text-slate-300">{t("teacher.lessonLabel")}: <span className="font-medium text-white">{lesson.title}</span></p>
            </div>
          </div>
        </div>

        {results.length === 0 ? (
          <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-12 text-center backdrop-blur-md">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20">
                <Users className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{t("teacher.noResultsTitle")}</h3>
              <p className="text-slate-300">{t("teacher.noResultsHint")}</p>
            </div>
          </div>
        ) : (
          <>
            {/* Statistics */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-6 backdrop-blur-md">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center border border-blue-500/30">
                      <Users className="w-5 h-5 text-blue-400" />
                    </div>
                    <span className="text-sm font-medium text-slate-300">{t("teacher.teachers")}</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{stats.totalStudents}</p>
                </div>

                <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-6 backdrop-blur-md">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center border border-green-500/30">
                      <Award className="w-5 h-5 text-green-400" />
                    </div>
                    <span className="text-sm font-medium text-slate-300">{t("teacher.avgScore")}</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{stats.avgScore.toFixed(1)}</p>
                </div>

                <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-6 backdrop-blur-md">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center border border-purple-500/30">
                      <TrendingUp className="w-5 h-5 text-purple-400" />
                    </div>
                    <span className="text-sm font-medium text-slate-300">{t("teacher.passRate")}</span>
                  </div>
                  <p className="text-3xl font-bold text-white">{stats.passRate.toFixed(0)}%</p>
                </div>

                <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-6 backdrop-blur-md">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center border border-orange-500/30">
                      <Clock className="w-5 h-5 text-orange-400" />
                    </div>
                    <span className="text-sm font-medium text-slate-300">{t("teacher.avgTime")}</span>
                  </div>
                  <p className="text-3xl font-bold text-white">
                    {Math.floor(stats.avgTime / 60)}'
                  </p>
                </div>
              </div>
            )}

            {/* Results Table */}
            <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 overflow-hidden backdrop-blur-md">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4 text-left text-sm font-bold text-white">{t("teacher.teachers")}</th>
                      <th className="px-6 py-4 text-center text-sm font-bold text-white">{t("teacher.score")}</th>
                      <th className="px-6 py-4 text-center text-sm font-bold text-white">{t("teacher.correctTotal")}</th>
                      <th className="px-6 py-4 text-center text-sm font-bold text-white">{t("teacher.timeCol")}</th>
                      <th className="px-6 py-4 text-center text-sm font-bold text-white">{t("teacher.completedAt")}</th>
                      <th className="px-6 py-4 text-center text-sm font-bold text-white">{t("teacher.details")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {results.map((result) => (
                      <tr key={result.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4">
                          <div>
                            <p className="font-medium text-white">{result.userName || t('teacher.teacherFallback')}</p>
                            <p className="text-sm text-slate-400">{result.userEmail}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl font-bold text-xl ${result.score >= 80 ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                              result.score >= 50 ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                'bg-red-500/20 text-red-400 border border-red-500/30'
                            }`}>
                            {result.score}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="font-medium text-white">
                            {result.correctCount}/{result.totalQuestions}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-slate-300">
                            {result.timeSpent ? `${Math.floor(result.timeSpent / 60)}:${(result.timeSpent % 60).toString().padStart(2, '0')}` : '-'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="text-sm text-slate-300">
                            {result.completedAt.toLocaleDateString(dateLocale)}
                            <br />
                            {result.completedAt.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Button
                            onClick={() => setSelectedResult(result)}
                            className="bg-purple-600 hover:bg-purple-700 text-sm py-2 px-4 shadow-lg shadow-purple-600/25 text-white border-none"
                          >
                            {t("teacher.viewDetails")}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Detail Modal */}
        {selectedResult && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a103d] rounded-2xl shadow-2xl p-8 w-full max-w-4xl max-h-[90vh] overflow-y-auto border border-white/10">
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">{t("teacher.attemptDetails")}</h3>
                  <p className="text-slate-300 mt-1">{selectedResult.userName || t('teacher.teacherFallback')}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    <span className="text-slate-300">
                      {t("teacher.scoreLabel")}: <span className="font-bold text-[#1B7A1E]">{selectedResult.score}</span>
                    </span>
                    <span className="text-slate-500">|</span>
                    <span className="text-slate-300">
                      {t("teacher.correctLabel")}: <span className="font-bold text-green-400">{selectedResult.correctCount}/{selectedResult.totalQuestions}</span>
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedResult(null)}
                  className="text-slate-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-colors"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-4">
                {questions.map((question, index) => {
                  const studentAnswer = selectedResult.answers[index];
                  const isCorrect = studentAnswer === question.correctAnswer;
                  const isEmpty = !question.question && question.options.every(opt => !opt);

                  return (
                    <div
                      key={question.id}
                      className={`border rounded-xl p-5 ${isCorrect ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'
                        }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold flex-shrink-0 ${isCorrect ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                          }`}>
                          {index + 1}
                        </div>
                        <div className="flex-1">
                          {isEmpty ? (
                            <p className="text-slate-300 font-medium mb-3">{t("teacher.emptyQuestionAnswerOnly")}</p>
                          ) : (
                            <p className="text-white font-medium mb-3">{question.question}</p>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {question.options.map((option, optIndex) => {
                              const isStudentChoice = studentAnswer === optIndex;
                              const isCorrectAnswer = question.correctAnswer === optIndex;

                              return (
                                <div
                                  key={optIndex}
                                  className={`px-4 py-3 rounded-lg border text-sm ${isCorrectAnswer
                                      ? 'bg-green-500/20 border-green-500/50 font-medium text-green-300'
                                      : isStudentChoice
                                        ? 'bg-red-500/20 border-red-500/50 text-red-300'
                                        : 'bg-white/5 border-white/10 text-slate-300'
                                    }`}
                                >
                                  <span className="font-bold mr-2">{String.fromCharCode(65 + optIndex)}.</span>
                                  {isEmpty ? t("teacher.answerLetter", { letter: String.fromCharCode(65 + optIndex) }) : option}
                                  {isCorrectAnswer && (
                                    <CheckCircle className="inline-block ml-2 w-4 h-4 text-green-400" />
                                  )}
                                  {isStudentChoice && !isCorrectAnswer && (
                                    <XCircle className="inline-block ml-2 w-4 h-4 text-red-400" />
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-end">
                <Button
                  onClick={() => setSelectedResult(null)}
                  className="bg-slate-600 hover:bg-slate-700 text-white border-none"
                >
                  {t("common.close")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
