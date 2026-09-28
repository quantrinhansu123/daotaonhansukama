'use client';

import React, { useState } from 'react';
import { Upload, File, CheckCircle, AlertCircle, Loader } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

interface DocumentUploaderProps {
  lessonId: string;
  currentDocumentUrl?: string;
  currentDocumentName?: string;
  onUploadComplete: (url: string, name: string) => void;
  onRemove?: () => void;
}

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  lessonId,
  currentDocumentUrl,
  currentDocumentName,
  onUploadComplete,
  onRemove
}) => {
  const { t } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const ALLOWED_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ];

  const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

  const handleFileSelect = async (file: File) => {
    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError(t('teacher.invalidFileType'));
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setError(t('teacher.fileTooLarge'));
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${sanitizedFileName}`;
      const filePath = `documents/${lessonId}/${fileName}`;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', filePath);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = (e.loaded / e.total) * 100;
          setUploadProgress(Math.round(progress));
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText);
          console.log('File uploaded successfully:', response.url);
          onUploadComplete(response.url, file.name);
          setUploading(false);
          setUploadProgress(0);
        } else {
          const error = JSON.parse(xhr.responseText);
          setError(error.error || t('teacher.uploadFileError'));
          setUploading(false);
        }
      });

      xhr.addEventListener('error', () => {
        setError(t('teacher.uploadConnectionError'));
        setUploading(false);
      });

      xhr.open('POST', '/api/upload-document');
      xhr.send(formData);

    } catch (error: any) {
      console.error('Error uploading file:', error);
      setError(error.message || t('teacher.uploadFileError'));
      setUploading(false);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleRemove = async () => {
    if (!currentDocumentUrl || !onRemove) return;

    if (!confirm(t('teacher.confirmDeleteDocument'))) {
      return;
    }

    try {
      const url = new URL(currentDocumentUrl);
      const filePath = url.pathname.substring(1);

      const response = await fetch('/api/delete-document', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ path: filePath }),
      });

      if (!response.ok) {
        throw new Error('Failed to delete file');
      }

      onRemove();
    } catch (error) {
      console.error('Error deleting file:', error);
      alert(t('teacher.deleteFileError'));
    }
  };

  return (
    <div className="space-y-4">
      {currentDocumentUrl ? (
        <div className="border border-green-500/20 bg-green-500/10 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0 border border-green-500/30">
              <File className="w-5 h-5 text-green-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-green-400">{t('teacher.documentHasFile')}</span>
              </div>
              <p className="text-sm text-green-200 truncate">{currentDocumentName}</p>
              <div className="flex gap-2 mt-2">
                <a
                  href={currentDocumentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-green-400 hover:text-green-300 underline"
                >
                  {t('teacher.viewDocument')}
                </a>
                {onRemove && (
                  <button
                    onClick={handleRemove}
                    className="text-xs text-red-400 hover:text-red-300 underline"
                  >
                    {t('common.delete')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${dragActive
              ? 'border-[#1B7A1E] bg-[#1B7A1E]/10'
              : 'border-white/20 hover:border-white/40'
            }`}
        >
          {uploading ? (
            <div className="space-y-4">
              <Loader className="w-12 h-12 text-[#1B7A1E] mx-auto animate-spin" />
              <div>
                <p className="text-sm font-medium text-white mb-2">
                  {t('teacher.uploadingProgress', { progress: uploadProgress })}
                </p>
                <div className="w-full max-w-xs mx-auto h-2 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1B7A1E] transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-12 h-12 text-slate-400 mx-auto mb-4" />
              <p className="text-white font-medium mb-2">
                {t('teacher.dragDropFile')}
              </p>
              <p className="text-sm text-slate-400 mb-4">
                {t('teacher.supportedFormats')}
              </p>
              <label className="inline-block">
                <input
                  type="file"
                  onChange={handleFileInput}
                  accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                  className="hidden"
                  disabled={uploading}
                />
                <span className="inline-block px-6 py-3 bg-[#1B7A1E] hover:bg-[#156318] text-white rounded-lg font-medium cursor-pointer transition-colors shadow-[#1B7A1E]/25">
                  {t('teacher.selectFile')}
                </span>
              </label>
            </>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-300">{error}</p>
        </div>
      )}
    </div>
  );
};
