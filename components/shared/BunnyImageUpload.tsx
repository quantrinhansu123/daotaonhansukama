'use client';

import React, { useState, useEffect } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

interface BunnyImageUploadProps {
  onUploadComplete: (url: string) => void;
  currentImage?: string;
  label?: string;
  folder?: string;
  onUploadStart?: () => void;
  onUploadEnd?: () => void;
  variant?: 'light' | 'dark';
}

export const BunnyImageUpload: React.FC<BunnyImageUploadProps> = ({
  onUploadComplete,
  currentImage,
  label,
  folder = 'courses',
  onUploadStart,
  onUploadEnd,
  variant = 'light',
}) => {
  const { t } = useLanguage();
  const resolvedLabel = label ?? t('shared.uploadImage');
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const dark = variant === 'dark';

  // Convert storage.bunnycdn.com URL to proxy API URL (avoids CDN suspension)
  const convertToProxyUrl = (url: string | null | undefined): string | null => {
    if (!url) return null;
    // If already proxy URL, return as is
    if (url.includes('/api/banner')) {
      return url;
    }
    
    // Convert storage.bunnycdn.com to proxy API URL (no CDN needed)
    if (url.includes('storage.bunnycdn.com')) {
      const proxyUrl = `/api/banner?url=${encodeURIComponent(url)}`;
      console.log('🔄 Converted storage URL to proxy:', url, '→', proxyUrl);
      return proxyUrl;
    }
    
    // If CDN URL, try to use it, but will fallback via onError if it fails
    return url;
  };

  // Sync preview with currentImage prop
  useEffect(() => {
    if (currentImage) {
      const proxyUrl = convertToProxyUrl(currentImage);
      setPreview(proxyUrl);
      console.log('🖼️ Preview updated from currentImage:', currentImage, '→', proxyUrl);
    } else {
      setPreview(null);
    }
  }, [currentImage]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert(t('shared.selectImage'));
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert(t('shared.fileTooLarge5MB'));
      return;
    }

    try {
      setUploading(true);
      onUploadStart?.();

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Bunny Storage via API route (server-side, no CORS issues)
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const fileName = `${timestamp}_${sanitizedFileName}`;
      const filePath = `${folder}/${fileName}`;

      // Upload via API route
      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', filePath);

      const response = await fetch('/api/upload-document', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const data = await response.json();
      const uploadedUrl = data.url;
      
      // Update preview with uploaded URL (convert to proxy if needed)
      const previewUrl = convertToProxyUrl(uploadedUrl) || uploadedUrl;
      setPreview(previewUrl);
      
      console.log('✅ Upload successful, URL:', uploadedUrl);
      console.log('🖼️ Preview URL:', previewUrl);
      
      onUploadComplete(uploadedUrl);
      alert(t('shared.imageUploadSuccess'));
    } catch (error) {
      console.error('Error uploading image:', error);
      alert(t('shared.imageUploadError'));
      // Restore previous preview
      const previousPreview = convertToProxyUrl(currentImage) || currentImage || null;
      setPreview(previousPreview);
    } finally {
      setUploading(false);
      onUploadEnd?.();
    }
  };

  const handleRemove = () => {
    setPreview(null);
    onUploadComplete('');
  };

  return (
    <div className="space-y-2">
      <label className={`block text-sm font-medium ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{resolvedLabel}</label>
      
      {preview ? (
        <div className="space-y-2">
          <div className="relative">
            <img
              src={preview}
              alt="Preview"
              className={`w-full h-48 object-cover rounded-xl border ${dark ? 'border-white/10' : 'border-slate-200'}`}
              onError={(e) => {
                const previewUrl = preview as string;
                console.error('❌ Preview image load error:', previewUrl);
                if (previewUrl.includes('storage.bunnycdn.com')) {
                  e.currentTarget.src = `/api/banner?url=${encodeURIComponent(previewUrl)}`;
                } else if (previewUrl.includes('b-cdn.net')) {
                  const originalUrl = currentImage || previewUrl;
                  if (originalUrl && originalUrl.includes('storage.bunnycdn.com')) {
                    e.currentTarget.src = `/api/banner?url=${encodeURIComponent(originalUrl)}`;
                  }
                }
              }}
              onLoad={() => {
                if (preview) {
                  console.log('✅ Preview image loaded:', preview);
                }
              }}
            />
            <button
              onClick={handleRemove}
              className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
              type="button"
            >
              <X size={16} />
            </button>
          </div>
          <div className={`p-2 rounded-lg border ${dark ? 'bg-white/5 border-white/10' : 'bg-slate-50 border-slate-200'}`}>
            <p className={`text-xs mb-1 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t('shared.urlLabel')}</p>
            <p className={`text-xs break-all font-mono ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
              {currentImage || preview}
            </p>
            <button
              onClick={() => {
                const urlToCopy = currentImage || preview;
                if (urlToCopy) {
                  navigator.clipboard.writeText(urlToCopy);
                  alert(t('shared.urlCopied'));
                }
              }}
              className={`mt-1 text-xs underline ${dark ? 'text-[#53cafd] hover:text-[#3db9f5]' : 'text-blue-600 hover:text-blue-700'}`}
              type="button"
            >
              {t('shared.copyUrl')}
            </button>
          </div>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          dark
            ? 'border-white/20 bg-white/5 hover:border-[#53cafd]/60 hover:bg-white/10'
            : 'border-slate-300 hover:border-brand-500 hover:bg-slate-50'
        }`}>
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            {uploading ? (
              <>
                <div className={`w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mb-3 ${dark ? 'border-[#53cafd]' : 'border-brand-500'}`}></div>
                <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-600'}`}>{t('shared.uploading')}</p>
              </>
            ) : (
              <>
                <ImageIcon className={`w-12 h-12 mb-3 ${dark ? 'text-[#53cafd]/70' : 'text-slate-400'}`} />
                <p className={`mb-2 text-sm ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
                  <span className="font-semibold">{t('shared.clickToUploadImage')}</span>
                </p>
                <p className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>{t('shared.imageFormatsHint')}</p>
              </>
            )}
          </div>
          <input
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
};
