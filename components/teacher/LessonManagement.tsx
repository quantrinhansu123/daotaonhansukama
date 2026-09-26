'use client';

import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, query, where, deleteField } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Course } from '@/types/course';
import { Lesson } from '@/types/lesson';
import { Plus, Edit2, Trash2, X, Save, Upload, Play, Clock, FileText, HelpCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/Button';
import { QuizManagement } from './QuizManagement';
import { DocumentUploader } from './DocumentUploader';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { uploadVideoToBunny } from '@/lib/bunny-upload';
import { BunnyVideoPlayer } from '@/components/shared/BunnyVideoPlayer';

interface LessonManagementProps {
  course: Course;
  onBack: () => void;
}

export const LessonManagement: React.FC<LessonManagementProps> = ({ course, onBack }) => {
  const { userProfile: currentUser } = useAuth();
  const { t } = useLanguage();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingLessonId, setUploadingLessonId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [managingQuiz, setManagingQuiz] = useState<Lesson | null>(null);
  const [previewingLesson, setPreviewingLesson] = useState<Lesson | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    order: 1,
    tags: [] as string[]
  });
  const [tagInput, setTagInput] = useState('');

  // Check if user can manage lessons (admin or course teacher)
  const canManage = currentUser?.role === 'admin' || currentUser?.uid === course.teacherId;

  const CDN_HOSTNAME = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;

  useEffect(() => {
    loadLessons();
  }, [course.id]);

  const loadLessons = async () => {
    try {
      setLoading(true);
      const lessonsRef = collection(db, 'lessons');
      const q = query(lessonsRef, where('courseId', '==', course.id));
      const snapshot = await getDocs(q);
      const lessonsData = snapshot.docs.map(doc => ({
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate(),
        updatedAt: doc.data().updatedAt?.toDate()
      })) as Lesson[];

      // Sort in memory instead of using orderBy
      lessonsData.sort((a, b) => a.order - b.order);
      setLessons(lessonsData);
    } catch (error) {
      console.error('Error loading lessons:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingLesson(null);
    setFormData({
      title: '',
      description: '',
      order: lessons.length + 1,
      tags: []
    });
    setTagInput('');
    setShowModal(true);
  };

  const handleEdit = (lesson: Lesson) => {
    setEditingLesson(lesson);
    setFormData({
      title: lesson.title,
      description: lesson.description,
      order: lesson.order,
      tags: lesson.tags || []
    });
    setTagInput('');
    setShowModal(true);
  };

  const handleAddTag = () => {
    if (tagInput.trim() && !formData.tags.includes(tagInput.trim())) {
      setFormData({ ...formData, tags: [...formData.tags, tagInput.trim()] });
      setTagInput('');
    }
  };

  const handleRemoveTag = (tag: string) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };

  const handleSave = async () => {
    try {
      if (!formData.title) {
        alert(t('teacher.pleaseEnterLessonName'));
        return;
      }

      if (editingLesson) {
        const lessonRef = doc(db, 'lessons', editingLesson.id);
        await setDoc(lessonRef, {
          ...editingLesson,
          ...formData,
          updatedAt: new Date()
        });
        alert(t('teacher.updateLessonSuccess'));
      } else {
        const newLesson: Lesson = {
          id: `lesson_${Date.now()}`,
          courseId: course.id,
          ...formData,
          createdAt: new Date(),
          updatedAt: new Date()
        };
        await setDoc(doc(db, 'lessons', newLesson.id), newLesson);
        alert(t('teacher.addLessonSuccess'));
      }

      setShowModal(false);
      loadLessons();
    } catch (error) {
      console.error('Error saving lesson:', error);
      alert(t('teacher.saveLessonError'));
    }
  };

  const handleDelete = async (lesson: Lesson) => {
    if (!confirm(t("teacher.confirmDeleteLesson", { title: lesson.title }))) {
      return;
    }

    try {
      // Delete video from Bunny.net if exists
      if (lesson.videoId) {
        await fetch(`/api/bunny/video/${lesson.videoId}`, {
          method: 'DELETE'
        });
      }

      // Delete lesson from Firestore
      await deleteDoc(doc(db, 'lessons', lesson.id));
      alert(t('teacher.deleteLessonSuccess'));
      loadLessons();
    } catch (error) {
      console.error('Error deleting lesson:', error);
      alert(t('teacher.deleteLessonError'));
    }
  };

  const handleVideoUpload = async (lesson: Lesson, file: File) => {
    try {
      if (!CDN_HOSTNAME) {
        throw new Error(t('teacher.missingBunnyConfig'));
      }
      setUploading(true);
      setUploadingLessonId(lesson.id);
      setUploadProgress(0);
      const videoId = await uploadVideoToBunny(file, lesson.title, setUploadProgress);

      // Update lesson with video info
      const lessonRef = doc(db, 'lessons', lesson.id);
      await setDoc(lessonRef, {
        ...lesson,
        videoId: videoId,
        videoUrl: `https://${CDN_HOSTNAME}/${videoId}/playlist.m3u8`,
        updatedAt: new Date()
      });

      alert(t('teacher.uploadVideoSuccess'));
      loadLessons();
    } catch (error) {
      console.error('[LessonManagement] Error uploading video:', error);
      const errorMessage = error instanceof Error ? error.message : t('teacher.uploadVideoUnknownError');
      alert(t("teacher.uploadVideoError", { message: errorMessage }));
    } finally {
      setUploading(false);
      setUploadingLessonId(null);
    }
  };

  const handleVideoDelete = async (lesson: Lesson) => {
    if (!confirm(t('teacher.confirmDeleteVideo'))) {
      return;
    }

    try {
      setLoading(true);
      if (lesson.videoId) {
        const response = await fetch(`/api/bunny/video/${lesson.videoId}`, {
          method: 'DELETE'
        });

        if (!response.ok) {
          throw new Error('Failed to delete video from Bunny.net');
        }
      }

      // Update lesson in Firestore to remove video info
      const lessonRef = doc(db, 'lessons', lesson.id);
      await updateDoc(lessonRef, {
        videoId: deleteField(),
        videoUrl: deleteField(),
        duration: deleteField(),
        updatedAt: new Date()
      });

      alert(t('teacher.deleteVideoSuccess'));
      loadLessons();
    } catch (error) {
      console.error('Error deleting video:', error);
      alert(t('teacher.deleteVideoError'));
    } finally {
      setLoading(false);
    }
  };

  const handleDocumentUploadComplete = async (lesson: Lesson, url: string, name: string) => {
    try {
      const lessonRef = doc(db, 'lessons', lesson.id);
      await setDoc(lessonRef, {
        ...lesson,
        documentUrl: url,
        documentName: name,
        updatedAt: new Date()
      });

      alert(t('teacher.uploadDocumentSuccess'));
      loadLessons();
    } catch (error) {
      console.error('Error saving document info:', error);
      alert(t('teacher.saveDocumentError'));
    }
  };

  const handleDocumentRemove = async (lesson: Lesson) => {
    try {
      const lessonRef = doc(db, 'lessons', lesson.id);
      await updateDoc(lessonRef, {
        documentUrl: deleteField(),
        documentName: deleteField(),
        updatedAt: new Date()
      });

      alert(t('teacher.deleteDocumentSuccess'));
      loadLessons();
    } catch (error) {
      console.error('Error removing document:', error);
      alert(t('teacher.deleteDocumentError'));
    }
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (managingQuiz) {
    return <QuizManagement lesson={managingQuiz} onBack={() => setManagingQuiz(null)} isReadOnly={!canManage} />;
  }

  if (loading) {
    return <div className="text-center py-8">{t("common.loading")}</div>;
  }

  return (
    <div className="min-h-screen bg-transparent py-6">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-6 mb-6 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-white mb-1">{t("teacher.manageLessons")}</h3>
              <p className="text-slate-300">{t("teacher.courseLabel")}: <span className="font-medium text-[#53cafd]">{course.title}</span></p>
              <p className="text-sm text-slate-400 mt-1">{t("teacher.totalLessonsCount")}: <span className="font-bold text-[#53cafd]">{lessons.length}</span></p>
            </div>
            {canManage && (
              <Button onClick={handleAdd} className="flex items-center gap-2 shadow-lg bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white shadow-[#53cafd]/25">
                <Plus size={18} />
                {t("teacher.addLesson")}
              </Button>
            )}
          </div>
        </div>

        {/* Content */}
        {lessons.length === 0 ? (
          <div className="bg-[#5e3ed0]/20 rounded-xl shadow-sm border border-white/10 p-12 text-center backdrop-blur-md">
            <div className="max-w-md mx-auto">
              <div className="w-20 h-20 bg-[#53cafd]/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#53cafd]/30">
                <Play className="w-10 h-10 text-[#53cafd]" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">{t("teacher.noLessonsTitle")}</h3>
              <p className="text-slate-300 mb-6">
                {canManage ? t('teacher.noLessonsHint') : t('teacher.noLessonsReadonly')}
              </p>
              {canManage && (
                <Button onClick={handleAdd} className="shadow-lg bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white shadow-[#53cafd]/25">
                  <Plus size={18} className="mr-2" />
                  {t("teacher.addLesson")}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {lessons.map((lesson) => (
              <div key={lesson.id} className="bg-[#5e3ed0]/20 rounded-lg shadow-sm border border-white/10 hover:bg-[#5e3ed0]/30 transition-all backdrop-blur-md">
                <div className="p-4">
                  {/* Header Row */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-[#53cafd] to-blue-600 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 shadow-lg shadow-blue-500/30">
                      {lesson.order}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-base font-bold text-white truncate">{lesson.title}</h3>
                      <p className="text-xs text-slate-300 line-clamp-1">{lesson.description}</p>
                    </div>
                    {lesson.tags && lesson.tags.length > 0 && (
                      <div className="flex gap-1">
                        {lesson.tags.slice(0, 2).map((tag, index) => (
                          <span key={index} className="px-2 py-0.5 bg-[#53cafd]/20 text-[#53cafd] rounded text-xs border border-[#53cafd]/30">
                            {tag}
                          </span>
                        ))}
                        {lesson.tags.length > 2 && (
                          <span className="px-2 py-0.5 bg-white/10 text-slate-300 rounded text-xs border border-white/10">
                            +{lesson.tags.length - 2}
                          </span>
                        )}
                      </div>
                    )}
                    {canManage && (
                      <div className="flex gap-1">
                        <button onClick={() => handleEdit(lesson)} className="p-2 text-[#53cafd] hover:bg-[#53cafd]/20 rounded-lg transition-colors" title={t("common.edit")}>
                          <Edit2 size={16} />
                        </button>
                        <button onClick={() => handleDelete(lesson)} className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors" title={t("common.delete")}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Content Row - Horizontal Layout */}
                  <div className="grid grid-cols-3 gap-3">
                    {/* Video Section */}
                    <div className="bg-gradient-to-br from-green-500/10 to-emerald-500/10 rounded-lg p-3 border border-green-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-green-500/20 rounded-md flex items-center justify-center border border-green-500/30">
                          <Play className="w-3.5 h-3.5 text-green-400" />
                        </div>
                        <h4 className="font-semibold text-white text-xs">{t("teacher.video")}</h4>
                      </div>

                      {lesson.videoId ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
                            <CheckCircle size={14} />
                            {t("teacher.uploaded")}
                          </div>
                          {lesson.duration && (
                            <p className="text-xs text-slate-400 flex items-center gap-1">
                              <Clock size={12} />
                              {formatDuration(lesson.duration)}
                            </p>
                          )}
                          <div className="flex gap-1.5">
                            <button
                              onClick={() => setPreviewingLesson(lesson)}
                              className="flex-1 px-2 py-1.5 bg-green-500/20 text-green-400 border border-green-500/50 rounded-md hover:bg-green-500/30 text-xs font-medium flex items-center justify-center gap-1 transition-colors"
                            >
                              <Play size={12} />
                              {t("teacher.view")}
                            </button>
                            {canManage && (
                              <button
                                onClick={() => handleVideoDelete(lesson)}
                                className="px-2 py-1.5 bg-red-500/20 text-red-400 border border-red-500/50 rounded-md hover:bg-red-500/30 text-xs font-medium flex items-center justify-center transition-colors"
                                title={t("teacher.deleteVideo")}
                              >
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </div>
                      ) : canManage ? (
                        <label className="cursor-pointer block">
                          <input
                            type="file"
                            accept="video/*"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleVideoUpload(lesson, file);
                            }}
                            disabled={uploading}
                          />
                          <div className="px-2 py-1.5 bg-green-500/20 text-green-400 border border-green-500/50 rounded-md hover:bg-green-500/30 flex items-center justify-center gap-1 text-xs font-medium transition-colors">
                            <Upload size={12} />
                            {uploadingLessonId === lesson.id ? `${uploadProgress}%` : t("common.upload")}
                          </div>
                        </label>
                      ) : (
                        <p className="text-xs text-slate-500 italic">{t("teacher.noVideo")}</p>
                      )}
                    </div>

                    {/* Document Section */}
                    <div className="bg-gradient-to-br from-blue-500/10 to-cyan-500/10 rounded-lg p-3 border border-blue-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-blue-500/20 rounded-md flex items-center justify-center border border-blue-500/30">
                          <FileText className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                        <h4 className="font-semibold text-white text-xs">{t("teacher.documents")}</h4>
                      </div>

                      {canManage ? (
                        <DocumentUploader
                          lessonId={lesson.id}
                          currentDocumentUrl={lesson.documentUrl}
                          currentDocumentName={lesson.documentName}
                          onUploadComplete={(url, name) => handleDocumentUploadComplete(lesson, url, name)}
                          onRemove={() => handleDocumentRemove(lesson)}
                        />
                      ) : lesson.documentUrl ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-xs text-blue-400 font-medium">
                            <CheckCircle size={14} />
                            {t("teacher.hasDocument")}
                          </div>
                          <a
                            href={lesson.documentUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block px-2 py-1.5 bg-blue-500/20 text-blue-400 border border-blue-500/50 rounded-md hover:bg-blue-500/30 text-xs font-medium text-center transition-colors"
                          >
                            <FileText size={12} className="inline mr-1" />
                            {t("teacher.view")}
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500 italic">{t("teacher.noDocument")}</p>
                      )}
                    </div>

                    {/* Quiz Section */}
                    <div className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-lg p-3 border border-purple-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-6 h-6 bg-purple-500/20 rounded-md flex items-center justify-center border border-purple-500/30">
                          <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
                        </div>
                        <h4 className="font-semibold text-white text-xs">{t("teacher.quizzes")}</h4>
                      </div>

                      <div className="space-y-2">
                        {lesson.hasQuiz && (
                          <div className="flex items-center gap-1.5 text-xs text-purple-400 font-medium">
                            <CheckCircle size={14} />
                            {t("teacher.hasQuestions")}
                          </div>
                        )}
                        <button
                          onClick={() => setManagingQuiz(lesson)}
                          className="w-full px-2 py-1.5 bg-purple-500/20 text-purple-400 border border-purple-500/50 rounded-md hover:bg-purple-500/30 flex items-center justify-center gap-1 text-xs font-medium transition-colors"
                        >
                          <HelpCircle size={12} />
                          {canManage ? t('teacher.manage') : t('teacher.view')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#311898] border border-white/10 rounded-2xl shadow-2xl p-8 w-full max-w-lg overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-2xl font-bold text-white">
                    {editingLesson ? t('teacher.editLessonTitle') : t('teacher.addLessonTitle')}
                  </h3>
                  <p className="text-sm text-slate-300 mt-1">{t("teacher.lessonBasicInfo")}</p>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-slate-400 hover:text-white hover:bg-white/10 p-2 rounded-lg transition-colors"
                >
                  <X size={24} />
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-white mb-2">{t("teacher.lessonNameRequired")}</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white placeholder-slate-400"
                    placeholder={t("teacher.lessonNamePlaceholder")}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-2">{t("common.description")}</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white placeholder-slate-400 resize-none"
                    placeholder={t("teacher.descriptionPlaceholder")}
                  />
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-2">{t("teacher.displayOrder")}</label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) => setFormData({ ...formData, order: Number(e.target.value) })}
                    min={1}
                    className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white text-center text-lg font-bold"
                  />
                  <p className="text-xs text-slate-400 mt-2">{t("teacher.displayOrderHint")}</p>
                </div>

                <div>
                  <label className="block text-sm font-bold text-white mb-2">{t("teacher.tags")}</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                      className="flex-1 px-4 py-2 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#53cafd] text-white placeholder-slate-400"
                      placeholder={t("teacher.tagPlaceholder")}
                    />
                    <button
                      type="button"
                      onClick={handleAddTag}
                      className="px-4 py-2 bg-[#53cafd] text-white rounded-xl hover:bg-[#3db9f5] transition-colors font-medium shadow-[#53cafd]/25"
                    >
                      {t("common.add")}
                    </button>
                  </div>
                  {formData.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.tags.map((tag, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-[#53cafd]/20 text-[#53cafd] border border-[#53cafd]/30 rounded-full text-sm font-medium"
                        >
                          {tag}
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="hover:text-white"
                          >
                            <X size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-2">{t("teacher.tagHint")}</p>
                </div>
              </div>

              <div className="flex gap-3 mt-8">
                <Button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 py-3 shadow-lg bg-[#53cafd] hover:bg-[#3db9f5] border-none text-white shadow-[#53cafd]/25">
                  <Save size={18} />
                  {editingLesson ? t('common.update') : t('teacher.addLesson')}
                </Button>
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-3 border border-white/10 rounded-lg hover:bg-white/5 font-medium transition-colors text-white"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </div>
        )}

        {uploading && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-[#311898] border border-white/10 rounded-2xl shadow-2xl p-8 text-center">
              <div className="w-20 h-20 border-4 border-[#53cafd] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-xl text-white font-bold mb-2">{t("teacher.uploading")}</p>
              <p className="text-sm text-slate-300">{t("teacher.uploadingHint")}</p>
            </div>
          </div>
        )}

        {/* Video Preview Modal */}
        {previewingLesson && previewingLesson.videoId && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-[#311898] border border-white/10 rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-white/10 flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">{previewingLesson.title}</h3>
                  <p className="text-sm text-slate-300">{previewingLesson.description}</p>
                </div>
                <button
                  onClick={() => setPreviewingLesson(null)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors text-slate-400 hover:text-white"
                >
                  <X size={24} />
                </button>
              </div>
              <div className="p-6">
                <div className="bg-black rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
                  <BunnyVideoPlayer
                    videoId={previewingLesson.videoId}
                    videoUrl={previewingLesson.videoUrl}
                    cdnHostname={CDN_HOSTNAME}
                    autoPlay
                    className="w-full h-full"
                  />
                </div>
                {previewingLesson.duration && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-slate-300">
                    <Clock size={16} />
                    <span>{t("teacher.durationLabel")}: {formatDuration(previewingLesson.duration)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
