'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Cloud,
  Download,
  FileSpreadsheet,
  FileText,
  Folder,
  Loader2,
  MoreHorizontal,
  Search,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { authenticatedJson } from '@/lib/authenticated-fetch';
import { collection, db, getDocs } from '@/lib/data-store';

type DocType = 'PDF' | 'Excel' | 'Word' | 'Other';

type LibraryDoc = {
  id: string;
  name: string;
  desc: string;
  project: string;
  projectTone: string;
  dept: string;
  type: DocType;
  size: string;
  sizeBytes: number;
  updated: string;
  updatedAt: string;
  downloads: number;
  url: string;
  storagePath: string;
  uploadedBy: string;
  uploadedByName: string;
};

const FOLDER_TONES = [
  'bg-[#fff6e9] text-[#df8b00]',
  'bg-[#edfbf4] text-[#18701C]',
  'bg-[#eff6ff] text-[#1B7A1E]',
  'bg-[#f0fdf4] text-[#15803d]',
  'bg-[#fff1f1] text-[#b42318]',
  'bg-[#f5f3ff] text-[#6d28d9]',
];

const typeIcon = {
  PDF: FileText,
  Excel: FileSpreadsheet,
  Word: FileText,
  Other: FileText,
};

const typeTone = {
  PDF: 'bg-[#fff1f1] text-[#b42318]',
  Excel: 'bg-[#edfbf4] text-[#18701C]',
  Word: 'bg-[#eff6ff] text-[#1B7A1E]',
  Other: 'bg-[#f5f8fc] text-[#52617c]',
};

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024;

function detectType(fileName: string, mime: string): DocType {
  const lower = fileName.toLowerCase();
  if (mime.includes('pdf') || lower.endsWith('.pdf')) return 'PDF';
  if (mime.includes('sheet') || mime.includes('excel') || lower.endsWith('.xls') || lower.endsWith('.xlsx')) return 'Excel';
  if (mime.includes('word') || lower.endsWith('.doc') || lower.endsWith('.docx')) return 'Word';
  return 'Other';
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: Date, locale: string) {
  return value.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function projectTone(name: string) {
  if (/bio/i.test(name)) return 'bg-[#edfbf4] text-[#18701C]';
  if (/sale|room/i.test(name)) return 'bg-[#eff6ff] text-[#1B7A1E]';
  return 'bg-[#f5f8fc] text-[#52617c]';
}

export function StudentLibrary() {
  const { t, dateLocale } = useLanguage();
  const { userProfile } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'all' | 'folders' | 'fav' | 'mine' | 'trash'>('all');
  const [query, setQuery] = useState('');
  const [docs, setDocs] = useState<LibraryDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [projects, setProjects] = useState<Array<{ id: string; name: string }>>([]);
  const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
  const [form, setForm] = useState({
    name: '',
    desc: '',
    project: 'Chung',
    dept: '',
    file: null as File | null,
  });

  useEffect(() => {
    void (async () => {
      try {
        const [projectSnap, deptSnap] = await Promise.all([
          getDocs(collection(db, 'projects')),
          getDocs(collection(db, 'departments')),
        ]);
        setProjects(
          projectSnap.docs
            .map((snap) => ({ id: snap.id, name: String(snap.data()?.name || snap.id) }))
            .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        );
        const deptRows = deptSnap.docs
          .map((snap) => ({ id: snap.id, name: String(snap.data()?.name || snap.id) }))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'));
        setDepartments(deptRows);
        setForm((prev) => ({
          ...prev,
          dept: prev.dept || userProfile?.departmentId || deptRows[0]?.id || '',
        }));
      } catch (err) {
        console.error('Error loading library form options:', err);
      }
    })();
  }, [userProfile?.departmentId]);

  const openUploadModal = () => {
    setFormError(null);
    setForm({
      name: '',
      desc: '',
      project: 'Chung',
      dept: userProfile?.departmentId || departments[0]?.id || '',
      file: null,
    });
    if (fileInputRef.current) fileInputRef.current.value = '';
    setShowUploadModal(true);
  };

  const closeUploadModal = () => {
    if (uploading) return;
    setShowUploadModal(false);
    setFormError(null);
    setForm((prev) => ({ ...prev, file: null }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const loadDocs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const payload = await authenticatedJson('/api/library-documents', 'GET') as { items?: LibraryDoc[] };
      const rows = (payload.items || []).map((item) => {
        const updatedAt = item.updatedAt ? new Date(item.updatedAt) : new Date();
        return {
          id: item.id,
          name: item.name || 'Untitled',
          desc: item.desc || '',
          project: item.project || 'Chung',
          projectTone: item.projectTone || projectTone(item.project || ''),
          dept: item.dept || '—',
          type: (item.type as DocType) || 'Other',
          size: item.size || formatSize(Number(item.sizeBytes) || 0),
          sizeBytes: Number(item.sizeBytes) || 0,
          updated: formatDate(updatedAt, dateLocale),
          updatedAt: updatedAt.toISOString(),
          downloads: Number(item.downloads) || 0,
          url: item.url || '',
          storagePath: item.storagePath || '',
          uploadedBy: item.uploadedBy || '',
          uploadedByName: item.uploadedByName || '',
        } satisfies LibraryDoc;
      });
      setDocs(rows);
    } catch (err) {
      console.error('Error loading library documents:', err);
      setError(err instanceof Error ? err.message : t('shared.documentUploadError'));
    } finally {
      setLoading(false);
    }
  }, [dateLocale, t]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const docItem of docs) {
      const key = docItem.project || 'Chung';
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([name, count], index) => ({
      name,
      count,
      tone: FOLDER_TONES[index % FOLDER_TONES.length],
    }));
  }, [docs]);

  const rows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return docs.filter((docItem) => {
      if (tab === 'mine' && userProfile?.uid && docItem.uploadedBy !== userProfile.uid) return false;
      if (!keyword) return true;
      return (
        docItem.name.toLowerCase().includes(keyword)
        || docItem.project.toLowerCase().includes(keyword)
        || docItem.dept.toLowerCase().includes(keyword)
        || docItem.desc.toLowerCase().includes(keyword)
      );
    });
  }, [docs, query, tab, userProfile?.uid]);

  const totalBytes = useMemo(() => docs.reduce((sum, item) => sum + (item.sizeBytes || 0), 0), [docs]);
  const totalDownloads = useMemo(() => docs.reduce((sum, item) => sum + item.downloads, 0), [docs]);

  const stats = [
    { label: t('student.library.totalDocs'), value: String(docs.length), tone: 'bg-[#eff6ff] text-[#1B7A1E]' },
    { label: t('student.library.downloads'), value: totalDownloads.toLocaleString(dateLocale), tone: 'bg-[#edfbf4] text-[#18701C]' },
    { label: t('student.library.visitors'), value: String(new Set(docs.map((d) => d.uploadedBy).filter(Boolean)).size), tone: 'bg-[#fff6e9] text-[#df8b00]' },
    { label: t('student.library.storage'), value: formatSize(totalBytes), tone: 'bg-[#f5f3ff] text-[#6d28d9]' },
  ];

  const tabs = [
    { id: 'all' as const, label: t('student.library.tabAll') },
    { id: 'folders' as const, label: t('student.library.tabFolders') },
    { id: 'fav' as const, label: t('student.library.tabFav') },
    { id: 'mine' as const, label: t('student.library.tabMine') },
    { id: 'trash' as const, label: t('student.library.tabTrash') },
  ];

  const submitUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!userProfile?.uid) {
      setFormError(t('shared.uploadError'));
      return;
    }
    const file = form.file;
    if (!file) {
      setFormError(t('student.library.formFileRequired'));
      return;
    }
    if (!form.name.trim()) {
      setFormError(t('student.library.formNameRequired'));
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type) && !/\.(pdf|docx?|xlsx?|pptx?|txt)$/i.test(file.name)) {
      setFormError(t('teacher.invalidFileType'));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setFormError(t('teacher.fileTooLarge'));
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    setFormError(null);
    setError(null);
    setMessage(null);

    try {
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const storagePath = `library/${userProfile.uid}/${timestamp}_${sanitizedFileName}`;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', storagePath);

      const uploadResult = await new Promise<{ url: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            setUploadProgress(Math.round((event.loaded / event.total) * 100));
          }
        });
        xhr.addEventListener('load', () => {
          try {
            const payload = JSON.parse(xhr.responseText || '{}') as { url?: string; error?: string };
            if (xhr.status >= 200 && xhr.status < 300 && payload.url) {
              resolve({ url: payload.url });
            } else {
              reject(new Error(payload.error || t('shared.documentUploadError')));
            }
          } catch {
            reject(new Error(t('shared.documentUploadError')));
          }
        });
        xhr.addEventListener('error', () => reject(new Error(t('teacher.uploadConnectionError'))));
        xhr.open('POST', '/api/upload-document');
        xhr.send(formData);
      });

      const projectName = form.project.trim() || 'Chung';
      const deptName = departments.find((item) => item.id === form.dept)?.name || form.dept || '—';
      const id = `lib_${timestamp}`;
      const now = new Date().toISOString();
      const record = {
        id,
        name: form.name.trim(),
        desc: form.desc.trim(),
        project: projectName,
        projectTone: projectTone(projectName),
        dept: deptName,
        type: detectType(file.name, file.type),
        size: formatSize(file.size),
        sizeBytes: file.size,
        downloads: 0,
        url: uploadResult.url,
        storagePath,
        uploadedBy: userProfile.uid,
        uploadedByName: userProfile.displayName || userProfile.email || '',
        createdAt: now,
        updatedAt: now,
      };

      await authenticatedJson('/api/library-documents', 'POST', record);
      setMessage(t('shared.documentUploadSuccess'));
      setShowUploadModal(false);
      setForm({
        name: '',
        desc: '',
        project: 'Chung',
        dept: userProfile.departmentId || departments[0]?.id || '',
        file: null,
      });
      await loadDocs();
    } catch (err) {
      console.error('Library upload failed:', err);
      setFormError(err instanceof Error ? err.message : t('shared.documentUploadError'));
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setForm((prev) => ({
      ...prev,
      file,
      name: prev.name.trim() ? prev.name : file.name.replace(/\.[^.]+$/, ''),
    }));
    setFormError(null);
  };

  const handleDownload = async (item: LibraryDoc) => {
    if (!item.url) return;
    window.open(item.url, '_blank', 'noopener,noreferrer');
    try {
      const nextDownloads = (item.downloads || 0) + 1;
      await authenticatedJson('/api/library-documents', 'PATCH', { id: item.id, downloads: nextDownloads });
      setDocs((prev) => prev.map((row) => (row.id === item.id ? { ...row, downloads: nextDownloads } : row)));
    } catch (err) {
      console.error('Download tracking failed:', err);
    }
  };

  const handleDelete = async (item: LibraryDoc) => {
    if (!confirm(t('teacher.confirmDeleteDocument'))) return;
    try {
      await authenticatedJson('/api/library-documents', 'DELETE', {
        id: item.id,
        storagePath: item.storagePath,
      });
      setDocs((prev) => prev.filter((row) => row.id !== item.id));
      setMessage(null);
      setError(null);
    } catch (err) {
      console.error('Delete library document failed:', err);
      setError(err instanceof Error ? err.message : t('teacher.deleteFileError'));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="m-0 text-[20px] font-bold tracking-tight text-[#111b38]">{t('student.academy.navLibrary')}</h1>
          <p className="mt-1 text-[13px] text-[#63708a]">{t('student.library.subtitle')}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileInput}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex min-h-[42px] items-center gap-2 rounded-full bg-[#18701C] px-5 text-[13px] font-bold text-white shadow-[0_8px_18px_rgba(24,112,28,0.28)] hover:bg-[#145616] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            {uploading ? t('shared.uploadingProgress', { progress: uploadProgress }) : t('student.library.upload')}
          </button>
          {uploading && (
            <div className="h-1.5 w-44 overflow-hidden rounded-full bg-[#e7edf5]">
              <div className="h-full rounded-full bg-[#18701C] transition-all" style={{ width: `${uploadProgress}%` }} />
            </div>
          )}
        </div>
      </div>

      {(error || message) && (
        <div className={`rounded-xl border px-4 py-3 text-[13px] font-medium ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-[#c6ebd4] bg-[#edfbf4] text-[#145616]'}`}>
          {error || message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <span className={`mb-3 inline-flex rounded-xl p-2.5 ${stat.tone}`}>
              <Folder size={18} />
            </span>
            <p className="m-0 text-[28px] font-bold tabular-nums text-[#111b38]">{stat.value}</p>
            <p className="mt-1 text-[12px] font-semibold text-[#63708a]">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-[#e7edf5]">
        {tabs.map((item) => (
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
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#99a4b5]" size={16} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('student.library.search')}
              className="w-full rounded-xl border border-[#e7edf5] bg-white py-2.5 pl-9 pr-3 text-[13px] outline-none focus:border-[#18701C]"
            />
          </div>

          {tab !== 'mine' && folders.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
              {folders.map((folder) => (
                <button
                  key={folder.name}
                  type="button"
                  onClick={() => setQuery(folder.name)}
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
          )}

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
                  {loading ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-[#63708a]">
                        <Loader2 className="mx-auto mb-2 animate-spin text-[#18701C]" size={22} />
                        {t('common.loading')}
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-3 py-10 text-center text-[#63708a]">
                        {t('student.library.empty')}
                      </td>
                    </tr>
                  ) : (
                    rows.map((docItem, index) => {
                      const Icon = typeIcon[docItem.type] || FileText;
                      return (
                        <tr key={docItem.id} className="border-t border-[#eef2f7] hover:bg-[#f4faf6]">
                          <td className="px-3 py-3 text-[12px] font-bold text-[#18701C]">{index + 1}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-start gap-2">
                              <span className={`mt-0.5 grid h-8 w-8 place-items-center rounded-lg ${typeTone[docItem.type]}`}>
                                <Icon size={15} />
                              </span>
                              <span>
                                <b className="block text-[#111b38]">{docItem.name}</b>
                                <small className="text-[#7a869c]">{docItem.desc || docItem.uploadedByName}</small>
                              </span>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${docItem.projectTone}`}>{docItem.project}</span>
                          </td>
                          <td className="px-3 py-3 text-[#52617c]">{docItem.dept}</td>
                          <td className="px-3 py-3">
                            <span className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${typeTone[docItem.type]}`}>{docItem.type}</span>
                          </td>
                          <td className="px-3 py-3 text-[#52617c]">{docItem.size}</td>
                          <td className="px-3 py-3 text-[#52617c]">{docItem.updated}</td>
                          <td className="px-3 py-3 font-bold text-[#111b38]">{docItem.downloads}</td>
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1.5 text-[#52617c]">
                              <button type="button" onClick={() => void handleDownload(docItem)} className="rounded-lg p-1.5 hover:bg-[#edfbf4] hover:text-[#18701C]" title={t('common.download')}>
                                <Download size={15} />
                              </button>
                              <button type="button" className="rounded-lg p-1.5 hover:bg-[#fff8e8] hover:text-[#c99212]">
                                <Star size={15} />
                              </button>
                              <button type="button" onClick={() => void handleDelete(docItem)} className="rounded-lg p-1.5 hover:bg-[#fff1f1] hover:text-[#b42318]" title={t('common.delete')}>
                                <Trash2 size={15} />
                              </button>
                              <button type="button" className="rounded-lg p-1.5 hover:bg-[#f5f8fc]">
                                <MoreHorizontal size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <div className="rounded-2xl border border-[#e7edf5] bg-white p-4 shadow-[0_8px_24px_rgba(24,48,93,0.06)]">
            <b className="mb-3 block text-[14px] text-[#111b38]">{t('student.library.featured')}</b>
            <div className="space-y-2.5">
              {docs.slice(0, 4).map((docItem) => (
                <button
                  key={docItem.id}
                  type="button"
                  onClick={() => void handleDownload(docItem)}
                  className="flex w-full items-start gap-2 rounded-xl border border-[#eef2f7] p-2.5 text-left hover:bg-[#f4faf6]"
                >
                  <span className={`grid h-8 w-8 place-items-center rounded-lg ${typeTone[docItem.type]}`}>
                    <FileText size={14} />
                  </span>
                  <div className="min-w-0">
                    <b className="block truncate text-[12px] text-[#111b38]">{docItem.name}</b>
                    <small className="text-[#7a869c]">{docItem.downloads} {t('student.library.downloads').toLowerCase()}</small>
                  </div>
                </button>
              ))}
              {docs.length === 0 && <p className="m-0 text-[12px] text-[#7a869c]">—</p>}
            </div>
          </div>

          <div className="rounded-2xl border border-[#c6ebd4] bg-[#edfbf4] p-4">
            <div className="mb-2 flex items-center gap-2 text-[#18701C]">
              <Cloud size={18} />
              <b className="text-[13px]">{t('student.library.storage')}</b>
            </div>
            <p className="m-0 text-[20px] font-bold text-[#145616]">{formatSize(totalBytes)} / 50 GB</p>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/80">
              <div
                className="h-full rounded-full bg-[#18701C]"
                style={{ width: `${Math.min(100, (totalBytes / (50 * 1024 * 1024 * 1024)) * 100)}%` }}
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
