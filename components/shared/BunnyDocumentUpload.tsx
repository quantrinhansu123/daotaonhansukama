'use client';

import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Upload, X, FileText } from 'lucide-react';

interface BunnyDocumentUploadProps {
  onUploadComplete: (url: string, fileName: string) => void;
  currentDocument?: string;
  currentDocumentName?: string;
  label?: string;
  folder?: string;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
}

export const BunnyDocumentUpload: React.FC<BunnyDocumentUploadProps> = ({
  onUploadComplete,
  currentDocument,
  currentDocumentName,
  label,
  folder = 'documents',
  onUploadStart,
  onUploadEnd
}) => {
  const { t } = useLanguage();
  const resolvedLabel = label ?? t('shared.uploadDocument');
  const [uploading, setUploading] = useState(false);
  const [documentUrl, setDocumentUrl] = useState<string | null>(currentDocument || null);
  const [documentName, setDocumentName] = useState<string | null>(currentDocumentName || null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type (PDF, DOC, DOCX, PPT, PPTX, XLS, XLSX)
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    ];

    if (!allowedTypes.includes(file.type)) {
      alert(t('shared.selectDocument'));
      return;
    }

    // Validate file size (max 50MB)
    if (file.size > 50 * 1024 * 1024) {
      alert(t('shared.fileTooLarge50MB'));
      return;
    }

    try {
      setUploading(true);
      onUploadStart?.();

      // Upload to Bunny Storage
      const fileName = `${folder}/${Date.now()}_${file.name}`;
      const storageZone = process.env.NEXT_PUBLIC_BUNNY_STORAGE_ZONE;
      const storagePassword = process.env.NEXT_PUBLIC_BUNNY_STORAGE_PASSWORD;
      const storageHostname = process.env.NEXT_PUBLIC_BUNNY_STORAGE_HOSTNAME;
      const cdnUrl = process.env.NEXT_PUBLIC_BUNNY_STORAGE_CDN_URL;

      const uploadUrl = `https://${storageHostname}/${storageZone}/${fileName}`;

      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'AccessKey': storagePassword!,
          'Content-Type': file.type,
        },
        body: file,
      });

      if (!response.ok) {
        throw new Error('Upload failed');
      }

      const documentUrl = `https://${cdnUrl}/${fileName}`;
      setDocumentUrl(documentUrl);
      setDocumentName(file.name);
      onUploadComplete(documentUrl, file.name);
      alert(t('shared.documentUploadSuccess'));
    } catch (error) {
      console.error('Error uploading document:', error);
      alert(t('shared.documentUploadError'));
      setDocumentUrl(currentDocument || null);
      setDocumentName(currentDocumentName || null);
    } finally {
      setUploading(false);
      onUploadEnd?.();
    }
  };

  const handleRemove = () => {
    setDocumentUrl(null);
    setDocumentName(null);
    onUploadComplete('', '');
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{resolvedLabel}</label>
      
      {documentUrl && documentName ? (
        <div className="relative border-2 border-slate-200 rounded-lg p-4 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <FileText className="w-6 h-6 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-slate-900 truncate">{documentName}</p>
              <a
                href={documentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                {t('shared.viewDocumentLink')}
              </a>
            </div>
            <button
              onClick={handleRemove}
              className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors flex-shrink-0"
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-brand-500 hover:bg-slate-50 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            {uploading ? (
              <>
                <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-sm text-slate-600">{t('shared.uploading')}</p>
              </>
            ) : (
              <>
                <FileText className="w-12 h-12 text-slate-400 mb-3" />
                <p className="mb-2 text-sm text-slate-600">
                  <span className="font-semibold">{t('shared.clickToUploadDocument')}</span>
                </p>
                <p className="text-xs text-slate-500">{t('shared.documentFormatsHint')}</p>
              </>
            )}
          </div>
          <input
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
};
