'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Lesson, Question } from '@/types/lesson';
import { Plus, Trash2, X, Save, FileText, Wand2, BarChart3 } from 'lucide-react';
import { Button } from '@/components/Button';
import { QuizResults } from './QuizResults';
import { BunnyDocumentUpload } from '@/components/shared/BunnyDocumentUpload';
import { useLanguage } from '@/contexts/LanguageContext';

interface QuizManagementProps {
  lesson: Lesson;
  onBack: () => void;
  isReadOnly?: boolean;
}

interface BulkForm {
  question: string;
  options: string[];
  correctAnswer: number;
}

export const QuizManagement: React.FC<QuizManagementProps> = ({ lesson, onBack, isReadOnly = false }) => {
  const { t } = useLanguage();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showBulkFormModal, setShowBulkFormModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showResults, setShowResults] = useState(false);

  const [bulkData, setBulkData] = useState({
    count: 10,
    duration: 30, // minutes
    correctAnswer: 0, // default answer A
    quizDocumentUrl: lesson.quizDocumentUrl || '',
    quizDocumentName: lesson.quizDocumentName || ''
  });

  const [correctAnswers, setCorrectAnswers] = useState<number[]>([]);
  const [bulkForms, setBulkForms] = useState<BulkForm[]>([]);

  useEffect(() => {
    loadQuestions();
  }, [lesson.id]);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const questionsRef = collection(db, 'questions');
      const q = query(questionsRef, where('lessonId', '==', lesson.id));
      const snapshot = await getDocs(q);
      const questionsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as Question[];

      questionsData.sort((a, b) => a.order - b.order);
      setQuestions(questionsData);
    } catch (error) {
      console.error('Error loading questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateQuiz = () => {
    // Open modal to set quiz parameters
    setCorrectAnswers([]);
    setShowBulkModal(true);
  };

  const handleBulkCreate = async () => {
    if (bulkData.count < 1 || bulkData.count > 100) {
      alert(t('teacher.questionCountRange'));
      return;
    }

    if (bulkData.duration < 1 || bulkData.duration > 180) {
      alert(t('teacher.durationRange'));
      return;
    }

    // Initialize correct answers array
    const initialAnswers = new Array(bulkData.count).fill(0);
    setCorrectAnswers(initialAnswers);
    setShowBulkModal(false);
  };

  const handleSaveQuiz = async () => {
    try {
      // Delete existing questions
      for (const q of questions) {
        await deleteDoc(doc(db, 'questions', q.id));
      }

      // Create new questions with correct answers
      for (let i = 0; i < correctAnswers.length; i++) {
        const newQuestion: Question = {
          id: `question_${Date.now()}_${i}`,
          lessonId: lesson.id,
          question: '', // Empty question
          options: ['', '', '', ''], // Empty options
          correctAnswer: correctAnswers[i],
          order: i + 1,
          createdAt: new Date()
        };
        await setDoc(doc(db, 'questions', newQuestion.id), newQuestion);
      }

      // Mark lesson as having quiz and set duration
      const lessonRef = doc(db, 'lessons', lesson.id);
      await setDoc(lessonRef, {
        ...lesson,
        hasQuiz: true,
        quizDuration: bulkData.duration,
        quizDocumentUrl: bulkData.quizDocumentUrl || null,
        quizDocumentName: bulkData.quizDocumentName || null,
        updatedAt: new Date()
      });

      alert(t("teacher.quizSaved", { count: correctAnswers.length }));
      setCorrectAnswers([]);
      loadQuestions();
    } catch (error) {
      console.error('Error saving quiz:', error);
      alert(t('teacher.saveQuizError'));
    }
  };

  const handleRemoveFromModal = (index: number) => {
    const newForms = bulkForms.filter((_, i) => i !== index);
    setBulkForms(newForms);
  };

  const handleAddMoreInModal = () => {
    setBulkForms([
      ...bulkForms,
      {
        question: '',
        options: ['', '', '', ''],
        correctAnswer: 0
      }
    ]);
  };

  const handleSaveBulkForms = async () => {
    // Validate all forms
    for (let i = 0; i < bulkForms.length; i++) {
      const form = bulkForms[i];
      if (!form.question.trim()) {
        alert(t("teacher.questionContentRequired", { n: i + 1 }));
        return;
      }
      for (let j = 0; j < form.options.length; j++) {
        if (!form.options[j].trim()) {
          alert(t("teacher.optionRequired", { n: i + 1, letter: String.fromCharCode(65 + j) }));
          return;
        }
      }
    }

    try {
      // Delete existing questions if editing
      if (editingQuestion) {
        await deleteDoc(doc(db, 'questions', editingQuestion.id));
      } else {
        for (const q of questions) {
          await deleteDoc(doc(db, 'questions', q.id));
        }
      }

      // Create new questions
      for (let i = 0; i < bulkForms.length; i++) {
        const form = bulkForms[i];
        const newQuestion: Question = {
          id: editingQuestion ? editingQuestion.id : `question_${Date.now()}_${i}`,
          lessonId: lesson.id,
          question: form.question,
          options: form.options,
          correctAnswer: form.correctAnswer,
          order: editingQuestion ? editingQuestion.order : i + 1,
          createdAt: new Date()
        };
        await setDoc(doc(db, 'questions', newQuestion.id), newQuestion);
      }

      // Mark lesson as having quiz
      const lessonRef = doc(db, 'lessons', lesson.id);
      await setDoc(lessonRef, {
        ...lesson,
        hasQuiz: true,
        quizDuration: bulkData.duration,
        quizDocumentUrl: bulkData.quizDocumentUrl || null,
        quizDocumentName: bulkData.quizDocumentName || null,
        updatedAt: new Date()
      });

      alert(editingQuestion ? t('teacher.updateQuestionSuccess') : t('teacher.questionsSaved', { count: bulkForms.length }));
      setShowBulkFormModal(false);
      setBulkForms([]);
      setEditingQuestion(null);
      loadQuestions();
    } catch (error) {
      console.error('Error saving questions:', error);
      alert(t('teacher.saveQuestionsError'));
    }
  };

  const handleDeleteQuiz = async () => {
    if (!confirm(t("teacher.confirmDeleteQuiz"))) {
      return;
    }

    try {
      // Delete all questions
      for (const q of questions) {
        await deleteDoc(doc(db, 'questions', q.id));
      }

      // Update lesson
      const lessonRef = doc(db, 'lessons', lesson.id);
      await setDoc(lessonRef, {
        ...lesson,
        hasQuiz: false,
        quizDuration: undefined,
        updatedAt: new Date()
      });

      alert(t('teacher.deleteQuizSuccess'));
      loadQuestions();
    } catch (error) {
      console.error('Error deleting quiz:', error);
      alert(t('teacher.deleteQuizError'));
    }
  };

  if (loading) {
    return <div className="text-center py-8">{t("common.loading")}</div>;
  }

  // Show results view
  if (showResults) {
    return <QuizResults lesson={lesson} onBack={() => setShowResults(false)} />;
  }

  return (
    <div className="min-h-screen bg-[#0E3A16] py-6">
      <div className="max-w-5xl mx-auto px-4">
        {/* Header */}
        <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-6 mb-6 backdrop-blur-md">
          <button onClick={onBack} className="text-[#1B7A1E] hover:text-[#156318] mb-3 flex items-center gap-2 transition-colors">
            ← {t("teacher.backToLessons")}
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white mb-1">
                {isReadOnly ? t('teacher.viewQuiz') : t('teacher.manageQuizzes')}
              </h3>
              <p className="text-slate-300">{t("teacher.lessonLabel")}: <span className="font-medium text-white">{lesson.title}</span></p>
              {questions.length > 0 && (
                <p className="text-sm text-slate-400 mt-1">
                  {t("teacher.totalQuestions")}: <span className="font-bold text-[#1B7A1E]">{questions.length}</span>
                  {lesson.quizDuration && <span> | {t("teacher.timeLabel")}: <span className="font-bold text-[#1B7A1E]">{lesson.quizDuration} {t("teacher.minutesUnit")}</span></span>}
                </p>
              )}
              {isReadOnly && (
                <p className="text-sm text-[#1B7A1E] mt-2">
                  {t("teacher.readOnlyMode")}
                </p>
              )}
            </div>
            <div className="flex gap-3">
              {questions.length > 0 && (
                <>
                  <Button
                    onClick={() => setShowResults(true)}
                    className="flex items-center gap-2 bg-[#1B7A1E] hover:bg-[#156318] shadow-lg shadow-[#1B7A1E]/25 text-white border-none"
                  >
                    <BarChart3 size={18} />
                    {t("teacher.viewResults")}
                  </Button>
                  {!isReadOnly && (
                    <button
                      onClick={handleDeleteQuiz}
                      className="px-4 py-2 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/10 font-medium transition-colors flex items-center gap-2"
                    >
                      <Trash2 size={18} />
                      {t("teacher.deleteQuiz")}
                    </button>
                  )}
                </>
              )}
              {!isReadOnly && (
                <Button onClick={handleCreateQuiz} className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-600/25 text-white border-none">
                  <Plus size={18} />
                  {questions.length > 0 ? t('teacher.recreate') : t('teacher.createQuiz')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        {correctAnswers.length === 0 && questions.length === 0 ? (
          <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-12 text-center backdrop-blur-md">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-purple-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-purple-500/30">
                <FileText className="w-10 h-10 text-purple-400" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{t("teacher.noQuizzes")}</h3>
              <p className="text-slate-300 mb-6">{t("teacher.noQuizzesHint")}</p>
              <Button onClick={handleCreateQuiz} className="bg-purple-600 hover:bg-purple-700 shadow-lg shadow-purple-600/25 text-white border-none">
                <Plus size={18} className="mr-2" />
                {t("teacher.createQuiz")}
              </Button>
            </div>
          </div>
        ) : correctAnswers.length > 0 ? (
          <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-6 backdrop-blur-md">
            <div className="mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">{t("teacher.setCorrectAnswers")}</h3>
                  <p className="text-slate-300">{t("teacher.setCorrectAnswersHint")}</p>
                  <div className="mt-3 flex items-center gap-4 text-sm">
                    <span className="text-slate-300">{t("teacher.timeLabel")}:</span>
                    <span className="font-bold text-[#1B7A1E]">{bulkData.duration} {t("teacher.minutesUnit")}</span>
                    <span className="text-slate-500">|</span>
                    <span className="text-slate-300">{t("teacher.totalQuestionsCount")}:</span>
                    <span className="font-bold text-[#1B7A1E]">{correctAnswers.length} {t("teacher.questionsUnit")}</span>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-300 mb-3">{t("teacher.quickSelectAll")}</p>
                  <div className="flex gap-2">
                    {[0, 1, 2, 3].map((optIndex) => (
                      <button
                        key={optIndex}
                        onClick={() => {
                          const newAnswers = correctAnswers.map(() => optIndex);
                          setCorrectAnswers(newAnswers);
                        }}
                        className="w-10 h-10 rounded-lg font-bold text-sm bg-white/10 border border-white/20 hover:border-[#1B7A1E] hover:bg-[#1B7A1E]/20 transition-all shadow-sm text-white"
                        title={t("teacher.setAllTo", { letter: String.fromCharCode(65 + optIndex) })}
                      >
                        {String.fromCharCode(65 + optIndex)}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">{t("teacher.orUseKeys")}</p>
                </div>
              </div>
            </div>

            {/* Compact Grid Layout */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 mb-6">
              {correctAnswers.map((answer, index) => (
                <div
                  key={index}
                  className="border border-white/10 rounded-lg p-3 bg-white/5 hover:border-purple-500/50 transition-all"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    const key = e.key.toUpperCase();
                    if (['1', '2', '3', '4'].includes(key)) {
                      const newAnswers = [...correctAnswers];
                      newAnswers[index] = parseInt(key) - 1;
                      setCorrectAnswers(newAnswers);
                    } else if (['A', 'B', 'C', 'D'].includes(key)) {
                      const newAnswers = [...correctAnswers];
                      newAnswers[index] = key.charCodeAt(0) - 65;
                      setCorrectAnswers(newAnswers);
                    }
                  }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-300">{t("teacher.questionN", { n: index + 1 })}</span>
                    <div className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${answer !== undefined
                        ? 'bg-green-500 text-white'
                        : 'bg-white/10 text-slate-400'
                      }`}>
                      {answer !== undefined ? String.fromCharCode(65 + answer) : '?'}
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {[0, 1, 2, 3].map((optIndex) => (
                      <button
                        key={optIndex}
                        onClick={() => {
                          const newAnswers = [...correctAnswers];
                          newAnswers[index] = optIndex;
                          setCorrectAnswers(newAnswers);
                        }}
                        className={`h-8 rounded font-bold text-xs transition-all ${answer === optIndex
                            ? 'bg-green-500 text-white shadow-md scale-110'
                            : 'bg-white/5 text-slate-400 border border-white/10 hover:border-green-400 hover:bg-green-500/20'
                          }`}
                      >
                        {String.fromCharCode(65 + optIndex)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Progress Indicator */}
            <div className="mb-6 bg-white/5 rounded-lg p-4 border border-white/10">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-300">{t("teacher.completionProgress")}</span>
                <span className="text-sm font-bold text-[#1B7A1E]">
                  {correctAnswers.filter(a => a !== undefined).length}/{correctAnswers.length}
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-2">
                <div
                  className="bg-gradient-to-r from-purple-500 to-[#1B7A1E] h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(correctAnswers.filter(a => a !== undefined).length / correctAnswers.length) * 100}%` }}
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  if (confirm(t('teacher.cancelCreatingQuiz'))) {
                    setCorrectAnswers([]);
                  }
                }}
                className="px-6 py-3 border border-white/20 text-white rounded-lg hover:bg-white/10 font-medium transition-colors"
              >
                {t("common.cancel")}
              </button>
              <div className="flex-1" />
              <Button
                onClick={handleSaveQuiz}
                className="flex items-center gap-2 bg-green-500 hover:bg-green-600 shadow-lg shadow-green-500/25 px-8 text-white border-none"
              >
                <Save size={18} />
                {t("teacher.saveQuizWithCount", { count: correctAnswers.length })}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((question, index) => {
              const isEmpty = !question.question && question.options.every(opt => !opt);

              return (
                <div key={question.id} className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-6 hover:border-[#1B7A1E]/50 transition-all backdrop-blur-md">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-lg shadow-purple-500/30">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEmpty ? (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-bold text-white">{t("teacher.emptyQuestion")}</h3>
                            <span className="px-2 py-1 bg-orange-500/20 text-orange-400 text-xs font-medium rounded border border-orange-500/30">
                              {t("teacher.answerOnly")}
                            </span>
                          </div>
                          <p className="text-sm text-slate-300 mb-3">
                            {t("teacher.emptyQuestionHint")}
                          </p>
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-slate-300">{t("teacher.correctAnswer")}:</span>
                            <div className="px-4 py-2 bg-green-500/10 border border-green-500/30 rounded-lg font-bold text-green-400">
                              {String.fromCharCode(65 + question.correctAnswer)}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-bold text-white">{question.question}</h3>
                            <span className="px-2 py-1 bg-[#1B7A1E]/20 text-[#1B7A1E] text-xs font-medium rounded border border-[#1B7A1E]/30">
                              {t("teacher.hasContent")}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                            {question.options.map((option, optIndex) => (
                              <div
                                key={optIndex}
                                className={`text-sm px-4 py-3 rounded-lg border transition-all ${optIndex === question.correctAnswer
                                    ? 'bg-green-500/10 border-green-500/50 text-green-400 font-medium shadow-sm'
                                    : 'bg-white/5 border-white/10 text-slate-300'
                                  }`}
                              >
                                <span className="font-bold mr-2">{String.fromCharCode(65 + optIndex)}.</span>
                                {option}
                                {optIndex === question.correctAnswer && (
                                  <span className="ml-2 text-green-400">✓ {t("teacher.correct")}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bulk Create Modal */}
        {showBulkModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a103d] rounded-2xl shadow-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto border border-white/10">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">{t("teacher.bulkCreateTitle")}</h3>
                  <p className="text-sm text-slate-300 mt-1">{t("teacher.bulkCreateHint")}</p>
                </div>
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="text-slate-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">{t("teacher.questionCountLabel")}</label>
                  <input
                    type="number"
                    value={bulkData.count}
                    onChange={(e) => setBulkData({ ...bulkData, count: Number(e.target.value) })}
                    min={1}
                    max={100}
                    className="w-full px-4 py-3 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] focus:border-transparent bg-white/5 text-lg font-bold text-center text-white"
                  />
                  <p className="text-xs text-slate-400 mt-2 text-center">{t("teacher.questionCountHint")}</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-3">{t("teacher.defaultCorrectAnswer")}</label>
                  <div className="grid grid-cols-2 gap-3">
                    {['A', 'B', 'C', 'D'].map((letter, index) => (
                      <label
                        key={index}
                        className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all ${bulkData.correctAnswer === index
                            ? 'bg-green-500/10 border-green-500/50 shadow-md'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                          }`}
                      >
                        <input
                          type="radio"
                          name="bulkCorrectAnswer"
                          checked={bulkData.correctAnswer === index}
                          onChange={() => setBulkData({ ...bulkData, correctAnswer: index })}
                          className="w-5 h-5 text-green-500"
                        />
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center font-bold text-white border border-white/20">
                            {letter}
                          </div>
                          <span className="font-medium text-slate-300">{t("teacher.answerLetter", { letter })}</span>
                        </div>
                        {bulkData.correctAnswer === index && (
                          <span className="ml-auto text-green-500">✓</span>
                        )}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold text-slate-300 mb-2">{t("teacher.quizDurationLabel")}</label>
                  <input
                    type="number"
                    value={bulkData.duration}
                    onChange={(e) => setBulkData({ ...bulkData, duration: Number(e.target.value) })}
                    min={1}
                    max={180}
                    className="w-full px-4 py-3 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] focus:border-transparent bg-white/5 text-lg font-bold text-center text-white"
                  />
                  <p className="text-xs text-slate-400 mt-2 text-center">{t("teacher.quizDurationHint")}</p>
                </div>

                <div>
                  <BunnyDocumentUpload
                    label={t("teacher.attachedDocument")}
                    currentDocument={bulkData.quizDocumentUrl}
                    currentDocumentName={bulkData.quizDocumentName}
                    onUploadComplete={(url, fileName) => {
                      setBulkData({ ...bulkData, quizDocumentUrl: url, quizDocumentName: fileName });
                    }}
                    folder="quiz-documents"
                  />
                  <p className="text-xs text-slate-400 mt-1">
                    {t("teacher.attachedDocumentHint")}
                  </p>
                </div>

                <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 border border-purple-500/20 rounded-xl p-4">
                  <div className="flex gap-3">
                    <div className="w-8 h-8 bg-purple-500/20 rounded-lg flex items-center justify-center flex-shrink-0 border border-purple-500/30">
                      <Wand2 className="w-5 h-5 text-purple-400" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-purple-300 mb-1">{t("teacher.note")}</p>
                      <p className="text-xs text-purple-200">
                        {t("teacher.bulkCreateNote", { count: bulkData.count, letter: String.fromCharCode(65 + bulkData.correctAnswer) })}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <Button
                  onClick={handleBulkCreate}
                  className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 py-3 shadow-lg shadow-purple-600/25 text-white border-none"
                >
                  <Wand2 size={18} />
                  {t("teacher.createNQuestions", { count: bulkData.count })}
                </Button>
                <button
                  onClick={() => setShowBulkModal(false)}
                  className="flex-1 px-4 py-3 border border-white/20 rounded-lg hover:bg-white/10 font-medium transition-colors text-white"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Form Modal - Step 2: Fill all questions */}
        {showBulkFormModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#1a103d] rounded-2xl shadow-2xl p-8 w-full max-w-6xl max-h-[90vh] overflow-y-auto border border-white/10">
              <div className="flex justify-between items-center mb-6 sticky top-0 bg-[#1a103d] pb-4 border-b border-white/10 z-10">
                <div>
                  <h3 className="text-2xl font-bold text-white">
                    {editingQuestion ? t('teacher.editQuestion') : t('teacher.fillQuestions', { count: bulkForms.length })}
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">{t("teacher.fillQuestionsHint")}</p>
                </div>
                <button
                  onClick={() => {
                    if (confirm(t('teacher.cancelAllQuestions'))) {
                      setShowBulkFormModal(false);
                      setBulkForms([]);
                      setEditingQuestion(null);
                    }
                  }}
                  className="text-slate-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-6">
                {bulkForms.map((form, formIndex) => (
                  <div key={formIndex} className="border border-white/10 rounded-xl p-6 bg-white/5 relative">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold shadow-lg shadow-purple-500/30">
                          {formIndex + 1}
                        </div>
                        <h4 className="text-lg font-bold text-white">{t("teacher.questionN", { n: formIndex + 1 })}</h4>
                      </div>
                      {!editingQuestion && bulkForms.length > 1 && (
                        <button
                          onClick={() => handleRemoveFromModal(formIndex)}
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          title={t("teacher.deleteThisQuestion")}
                        >
                          <Trash2 size={18} />
                        </button>
                      )}
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-bold text-slate-300 mb-2">{t("teacher.questionContentLabel")}</label>
                        <textarea
                          value={form.question}
                          onChange={(e) => {
                            const newForms = [...bulkForms];
                            newForms[formIndex].question = e.target.value;
                            setBulkForms(newForms);
                          }}
                          rows={2}
                          className="w-full px-4 py-3 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] focus:border-transparent bg-white/5 text-white placeholder-slate-500"
                          placeholder={t("teacher.questionPlaceholder")}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-bold text-slate-300 mb-2">{t("teacher.optionsLabel")}</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {form.options.map((option, optIndex) => (
                            <div
                              key={optIndex}
                              className={`flex items-center gap-2 p-3 rounded-lg border transition-all bg-white/5 ${form.correctAnswer === optIndex
                                  ? 'border-green-500 bg-green-500/10'
                                  : 'border-white/10'
                                }`}
                            >
                              <input
                                type="radio"
                                name={`correct_${formIndex}`}
                                checked={form.correctAnswer === optIndex}
                                onChange={() => {
                                  const newForms = [...bulkForms];
                                  newForms[formIndex].correctAnswer = optIndex;
                                  setBulkForms(newForms);
                                }}
                                className="w-4 h-4 text-green-500"
                              />
                              <div className="w-6 h-6 bg-white/10 rounded flex items-center justify-center font-bold text-xs text-slate-300">
                                {String.fromCharCode(65 + optIndex)}
                              </div>
                              <input
                                type="text"
                                value={option}
                                onChange={(e) => {
                                  const newForms = [...bulkForms];
                                  newForms[formIndex].options[optIndex] = e.target.value;
                                  setBulkForms(newForms);
                                }}
                                className="flex-1 px-3 py-2 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1B7A1E] bg-transparent text-sm text-white placeholder-slate-500"
                                placeholder={t("teacher.optionPlaceholder", { letter: String.fromCharCode(65 + optIndex) })}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 mt-8 sticky bottom-0 bg-[#1a103d] pt-4 border-t border-white/10 z-10">
                {!editingQuestion && !isReadOnly && (
                  <button
                    onClick={handleAddMoreInModal}
                    className="px-6 py-3 border border-purple-500/50 text-purple-400 rounded-lg hover:bg-purple-500/10 font-medium transition-colors flex items-center gap-2"
                  >
                    <Plus size={18} />
                    {t("teacher.addQuestion")}
                  </button>
                )}
                <div className="flex-1" />
                {!isReadOnly && (
                  <>
                    <button
                      onClick={() => {
                        if (confirm(t('teacher.cancelAllQuestions'))) {
                          setShowBulkFormModal(false);
                          setBulkForms([]);
                          setEditingQuestion(null);
                        }
                      }}
                      className="px-6 py-3 border border-white/20 rounded-lg hover:bg-white/10 font-medium transition-colors text-white"
                    >
                      {t("common.cancel")}
                    </button>
                    <Button
                      onClick={handleSaveBulkForms}
                      className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 py-3 shadow-lg shadow-purple-600/25 text-white border-none"
                    >
                      <Save size={18} />
                      {editingQuestion ? t('common.update') : t('teacher.saveNQuestions', { count: bulkForms.length })}
                    </Button>
                  </>
                )}
                {isReadOnly && (
                  <button
                    onClick={() => {
                      setShowBulkFormModal(false);
                      setBulkForms([]);
                      setEditingQuestion(null);
                    }}
                    className="px-6 py-3 bg-slate-600 text-white rounded-lg hover:bg-slate-700 font-medium transition-colors"
                  >
                    {t("common.close")}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
