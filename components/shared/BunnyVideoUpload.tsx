'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { X, Video } from 'lucide-react';
import { uploadVideoToBunny } from '@/lib/bunny-upload';
import { BunnyVideoPlayer } from './BunnyVideoPlayer';

interface BunnyVideoUploadProps {
  onUploadComplete: (videoId: string) => void;
  currentVideoId?: string;
  label?: string;
  onUploadStateChange?: (uploading: boolean) => void;
}

export const BunnyVideoUpload: React.FC<BunnyVideoUploadProps> = ({
  onUploadComplete,
  currentVideoId,
  label,
  onUploadStateChange,
}) => {
  const { t } = useLanguage();
  const resolvedLabel = label ?? t('shared.uploadVideo');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(currentVideoId || null);

  const CDN_HOSTNAME = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;

  useEffect(() => setVideoId(currentVideoId || null), [currentVideoId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      alert(t('shared.selectVideo'));
      return;
    }

    try {
      if (!CDN_HOSTNAME) {
        throw new Error('Thiếu NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME.');
      }
      setUploading(true);
      onUploadStateChange?.(true);
      setUploadProgress(0);
      const newVideoId = await uploadVideoToBunny(file, file.name, setUploadProgress);

      setVideoId(newVideoId);
      onUploadComplete(newVideoId);
      setUploadProgress(100);
      alert(t('shared.videoUploadSuccess'));
    } catch (error) {
      console.error('Error uploading video:', error);
      alert(error instanceof Error ? error.message : t('shared.videoUploadError'));
      setVideoId(currentVideoId || null);
    } finally {
      setUploading(false);
      onUploadStateChange?.(false);
      e.target.value = '';
    }
  };

  const handleRemove = () => {
    setVideoId(null);
    onUploadComplete('');
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{resolvedLabel}</label>
      
      {videoId ? (
        <div className="relative">
          <div className="w-full aspect-video bg-slate-900 rounded-lg overflow-hidden">
            <BunnyVideoPlayer videoId={videoId} cdnHostname={CDN_HOSTNAME} className="w-full h-full" />
          </div>
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
            type="button"
          >
            <X size={16} />
          </button>
          <p className="text-xs text-slate-500 mt-2">{t('shared.videoIdLabel', { id: videoId })}</p>
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center w-full aspect-video border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-brand-500 hover:bg-slate-50 transition-colors">
          <div className="flex flex-col items-center justify-center pt-5 pb-6">
            {uploading ? (
              <>
                <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-sm text-slate-600">{t('shared.uploadingProgress', { progress: uploadProgress })}</p>
              </>
            ) : (
              <>
                <Video className="w-12 h-12 text-slate-400 mb-3" />
                <p className="mb-2 text-sm text-slate-600">
                  <span className="font-semibold">{t('shared.clickToUploadVideo')}</span>
                </p>
                <p className="text-xs text-slate-500">{t('shared.videoFormatsHint')}</p>
              </>
            )}
          </div>
          <input
            type="file"
            className="hidden"
            accept="video/*"
            onChange={handleFileChange}
            disabled={uploading}
          />
        </label>
      )}
    </div>
  );
};
