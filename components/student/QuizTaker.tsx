'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Question, QuizResult, Lesson } from '@/types/lesson';
import { useAuth } from '@/contexts/AuthContext';
import { CheckCircle, XCircle, Award, Save, Clock, FileText, Download, AlertCircle } from 'lucide-react';
import { Button } from '@/components/Button';
import { useLanguage } from '@/contexts/LanguageContext';

interface QuizTakerProps {
  lessonId: string;
  courseId: string;
  quizDuration?: number; // minutes
  quizDocumentUrl?: string;
  quizDocumentName?: string;
  onComplete: () => void;
}

export const QuizTaker: React.FC<QuizTakerProps> = ({ lessonId, courseId, quizDuration, quizDocumentUrl, quizDocumentName, onComplete }) => {
  const { t, dateLocale } = useLanguage();
  const { userProfile } = useAuth();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<number[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [existingResult, setExistingResult] = useState<QuizResult | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0); // seconds
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());

  useEffect(() => {
    loadQuestions();
    checkExistingResult();
  }, [lessonId]);

  useEffect(() => {
    if (quizDuration && timeLeft > 0 && !showResult) {
      const timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            setIsTimeUp(true);
            handleSubmit();
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
        // User has already completed this quiz
        const resultData = snapshot.docs[0].data() as QuizResult;
        const completedAt = resultData.completedAt as any;
        setExistingResult({
          ...resultData,
          completedAt: completedAt?.toDate ? completedAt.toDate() : new Date(completedAt)
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
      const questionsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      })) as Question[];
      
      questionsData.sort((a, b) => a.order - b.order);
      setQuestions(questionsData);
      setAnswers(new Array(questionsData.length).fill(-1));
      
      // Set timer if duration is provided
      if (quizDuration) {
        setTimeLeft(quizDuration * 60); // Convert minutes to seconds
      }
      
      // Record start time
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

  const handleSubmit = async () => {
    if (!userProfile) {
      alert(t('student.needLoginToSubmit'));
      return;
    }

    // Check if all questions are answered
    if (answers.some(a => a === -1)) {
      if (!confirm(t('student.confirmSubmitIncomplete'))) {
        return;
      }
    }

    try {
      // Calculate score
      let correctCount = 0;
      questions.forEach((question, index) => {
        if (answers[index] === question.correctAnswer) {
          correctCount++;
        }
      });

      const score = Math.round((correctCount / questions.length) * 100);
      
      // Calculate time spent
      const timeSpent = Math.floor((Date.now() - startTime) / 1000); // in seconds

      const quizResult: QuizResult = {
        id: `${userProfile.uid}_${lessonId}_${Date.now()}`,
        userId: userProfile.uid,
        userName: userProfile.displayName || userProfile.email || t('student.teacherFallback'),
        userEmail: userProfile.email || '',
        lessonId: lessonId,
        courseId: courseId,
        answers: answers,
        correctCount: correctCount,
        totalQuestions: questions.length,
        score: score,
        timeSpent: timeSpent,
        completedAt: new Date()
      };

      console.log('Saving quiz result:', quizResult);
      
      await setDoc(doc(db, 'quizResults', quizResult.id), quizResult);
      
      console.log('Quiz result saved successfully!');
      
      setResult(quizResult);
      setShowResult(true);
    } catch (error) {
      console.error('Error submitting quiz:', error);
      alert(t('student.submitError', { message: (error as Error).message }));
    }
  };

  if (loading) {
    return <div className="text-center py-8">{t("student.loadingQuestions")}</div>;
  }

  if (questions.length === 0) {
    return (
      <div className="bg-white rounded-xl p-8 text-center">
        <p className="text-slate-600 mb-4">{t("student.quizNoQuestions")}</p>
        <Button onClick={onComplete}>{t("common.back")}</Button>
      </div>
    );
  }

  // Show existing result if user has already completed the quiz
  if (existingResult && !showResult) {
    return (
      <div className="bg-white rounded-xl p-8">
        <div className="text-center mb-8">
          <Award className={`w-20 h-20 mx-auto mb-4 ${
            existingResult.score >= 80 ? 'text-green-500' : existingResult.score >= 50 ? 'text-yellow-500' : 'text-red-500'
          }`} />
          <h2 className="text-3xl font-bold text-slate-900 mb-2">{t("student.quizResultTitle")}</h2>
          <div className="text-5xl font-bold mb-2" style={{
            color: existingResult.score >= 80 ? '#10b981' : existingResult.score >= 50 ? '#f59e0b' : '#ef4444'
          }}>
            {t("student.scorePoints", { score: existingResult.score })}
          </div>
          <p className="text-slate-600 mb-2">
            {t("student.answeredCorrectly", { correct: existingResult.correctCount, total: existingResult.totalQuestions })}
          </p>
          <p className="text-sm text-slate-500">
            {t("student.completedAt", { time: existingResult.completedAt.toLocaleString(dateLocale) })}
          </p>
        </div>

        {existingResult.score < 70 ? (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-orange-900 mb-1">{t("student.notPassedTitle")}</p>
                <p className="text-xs text-orange-800">
                  {t("student.notPassedHint")}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-green-900 mb-1">{t("student.excellentTitle")}</p>
                <p className="text-xs text-green-800">
                  {t("student.excellentHint")}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={onComplete} className="flex-1">
            {t("student.backToLesson")}
          </Button>
          <Button 
            onClick={async () => {
              if (!confirm(t('student.confirmRetake'))) return;
              
              try {
                // Delete old result from Firestore
                if (existingResult && userProfile) {
                  const resultRef = doc(db, 'quizResults', existingResult.id);
                  await deleteDoc(resultRef);
                  console.log('Deleted old quiz result:', existingResult.id);
                }
                
                // Reset state
                setExistingResult(null);
                setAnswers(new Array(questions.length).fill(-1));
                setShowResult(false);
                setResult(null);
                setStartTime(Date.now());
                if (quizDuration) {
                  setTimeLeft(quizDuration * 60);
                }
              } catch (error) {
                console.error('Error deleting old result:', error);
                alert(t('student.deleteResultError'));
              }
            }} 
            className="flex-1 bg-orange-500 hover:bg-orange-600"
          >
            {t("student.retakeQuiz")}
          </Button>
        </div>
      </div>
    );
  }

  if (showResult && result) {
    return (
      <div className="bg-white rounded-xl p-8">
        <div className="text-center mb-8">
          <Award className={`w-20 h-20 mx-auto mb-4 ${
            result.score >= 80 ? 'text-green-500' : result.score >= 50 ? 'text-yellow-500' : 'text-red-500'
          }`} />
          <h2 className="text-3xl font-bold text-slate-900 mb-2">{t("student.quizResultTitle")}</h2>
          <div className="text-5xl font-bold mb-2" style={{
            color: result.score >= 80 ? '#10b981' : result.score >= 50 ? '#f59e0b' : '#ef4444'
          }}>
            {t("student.scorePoints", { score: result.score })}
          </div>
          <p className="text-slate-600">
            {t("student.answeredCorrectlyShort", { correct: result.correctCount, total: result.totalQuestions })}
          </p>
        </div>

        {result.score < 70 ? (
          <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <AlertCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-orange-900 mb-1">{t("student.notPassedTitle")}</p>
                <p className="text-xs text-orange-800">
                  {t("student.notPassedHintRetake")}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 mb-6">
            <div className="flex gap-3">
              <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-bold text-green-900 mb-1">{t("student.excellentTitle")}</p>
                <p className="text-xs text-green-800">
                  {t("student.excellentHint")}
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <Button onClick={onComplete} className="flex-1">
            {result.score >= 70 ? t('student.continueLearningBtn') : t('common.back')}
          </Button>
          <Button 
            onClick={async () => {
              if (!confirm(t('student.confirmRetakeCurrent'))) return;
              
              try {
                // Delete the result we just saved
                if (result && userProfile) {
                  const resultRef = doc(db, 'quizResults', result.id);
                  await deleteDoc(resultRef);
                  console.log('Deleted quiz result:', result.id);
                }
                
                // Reset state
                setShowResult(false);
                setResult(null);
                setAnswers(new Array(questions.length).fill(-1));
                setStartTime(Date.now());
                if (quizDuration) {
                  setTimeLeft(quizDuration * 60);
                }
              } catch (error) {
                console.error('Error deleting result:', error);
                alert(t('student.deleteResultErrorShort'));
              }
            }} 
            className="flex-1 bg-orange-500 hover:bg-orange-600"
          >
            {t("student.retake")}
          </Button>
        </div>
      </div>
    );
  }

  const hasContent = questions.some(q => q.question || q.options.some(opt => opt));

  return (
    <div className="bg-white rounded-xl p-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-slate-900">{t("student.quiz")}</h2>
          <div className="flex items-center gap-4">
            {quizDuration && timeLeft > 0 && (
              <div className={`px-4 py-2 rounded-lg font-bold flex items-center gap-2 ${
                timeLeft < 60 ? 'bg-red-100 text-red-700' : 
                timeLeft < 300 ? 'bg-orange-100 text-orange-700' : 
                'bg-blue-100 text-blue-700'
              }`}>
                <Clock size={18} />
                {formatTime(timeLeft)}
              </div>
            )}
            <span className="text-sm font-medium text-slate-600">
              {t("student.answeredCount", { answered: answers.filter(a => a !== -1).length, total: questions.length })}
            </span>
          </div>
        </div>
        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
          <div
            className="h-full bg-purple-500 transition-all duration-300"
            style={{ width: `${(answers.filter(a => a !== -1).length / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Document Attachment */}
      {quizDocumentUrl && quizDocumentName && (
        <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-blue-900 mb-1">{t("student.referenceDoc")}</p>
              <p className="text-xs text-blue-700 mb-2">{quizDocumentName}</p>
              <a
                href={quizDocumentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Download size={14} />
                {t("student.downloadDocument")}
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Questions */}
      <div className="space-y-4 mb-8">
        {hasContent ? (
          // Full content display
          questions.map((question, index) => (
            <div 
              key={question.id} 
              className="border-2 border-slate-200 rounded-xl p-6 hover:border-purple-300 transition-all bg-slate-50"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 shadow-lg">
                  {index + 1}
                </div>
                <h3 className="text-lg font-bold text-slate-900 flex-1">
                  {question.question || t("student.questionFallback", { n: index + 1 })}
                </h3>
                {answers[index] !== -1 && (
                  <CheckCircle className="w-6 h-6 text-green-500 flex-shrink-0" />
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-14">
                {question.options.map((option, optIndex) => (
                  <button
                    key={optIndex}
                    onClick={() => {
                      const newAnswers = [...answers];
                      newAnswers[index] = optIndex;
                      setAnswers(newAnswers);
                    }}
                    className={`px-4 py-3 rounded-lg text-left transition-all border-2 ${
                      answers[index] === optIndex
                        ? 'bg-purple-500 text-white border-purple-600 shadow-lg'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-purple-300 hover:bg-purple-50'
                    }`}
                  >
                    <span className="font-bold mr-2">{String.fromCharCode(65 + optIndex)}.</span>
                    {option || t("student.optionFallback", { letter: String.fromCharCode(65 + optIndex) })}
                  </button>
                ))}
              </div>
            </div>
          ))
        ) : (
          // Compact table display for empty questions
          questions.map((question, index) => (
            <div 
              key={question.id} 
              className="border-2 border-slate-200 rounded-xl p-4 hover:border-purple-300 transition-all bg-slate-50"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-lg flex-shrink-0 shadow-lg">
                  {index + 1}
                </div>

                <div className="flex-1 flex items-center gap-3">
                  {[0, 1, 2, 3].map((optIndex) => (
                    <button
                      key={optIndex}
                      onClick={() => {
                        const newAnswers = [...answers];
                        newAnswers[index] = optIndex;
                        setAnswers(newAnswers);
                      }}
                      className={`flex-1 h-12 rounded-lg font-bold text-lg transition-all ${
                        answers[index] === optIndex
                          ? 'bg-purple-500 text-white shadow-lg scale-105'
                          : 'bg-white text-slate-700 border-2 border-slate-200 hover:border-purple-300 hover:bg-purple-50'
                      }`}
                    >
                      {String.fromCharCode(65 + optIndex)}
                    </button>
                  ))}
                </div>

                <div className="w-8 flex-shrink-0">
                  {answers[index] !== -1 && (
                    <CheckCircle className="w-6 h-6 text-green-500" />
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Submit Button */}
      <div className="flex gap-3">
        <button
          onClick={onComplete}
          className="px-6 py-3 border-2 border-slate-200 rounded-lg hover:bg-slate-50 font-medium transition-colors"
        >
          {t("common.cancel")}
        </button>
        <div className="flex-1" />
        <button
          onClick={handleSubmit}
          disabled={isTimeUp}
          className="px-8 py-3 bg-green-500 text-white rounded-lg hover:bg-green-600 font-bold shadow-lg flex items-center gap-2 disabled:opacity-50"
        >
          <Save size={18} />
          {t("student.submitWithCount", { answered: answers.filter(a => a !== -1).length, total: questions.length })}
        </button>
      </div>
    </div>
  );
};
