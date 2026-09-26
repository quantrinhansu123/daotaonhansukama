'use client';

import React, { useEffect, useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { X, Video, Upload } from 'lucide-react';
import { uploadVideoToBunny } from '@/lib/bunny-upload';
import { BunnyVideoPlayer } from './BunnyVideoPlayer';

interface BunnyVideoUploadProps {
  onUploadComplete: (videoId: string) => void;
  currentVideoId?: string;
  label?: string;
  onUploadStateChange?: (uploading: boolean) => void;
  variant?: 'light' | 'dark';
}

export const BunnyVideoUpload: React.FC<BunnyVideoUploadProps> = ({
  onUploadComplete,
  currentVideoId,
  label,
  onUploadStateChange,
  variant = 'light',
}) => {
  const { t } = useLanguage();
  const resolvedLabel = label ?? t('shared.uploadVideo');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(currentVideoId || null);

  const CDN_HOSTNAME = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;
  const dark = variant === 'dark';

  useEffect(() => setVideoId(currentVideoId || null), [currentVideoId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
      alert(t('shared.selectVideo'));
      return;
    }

    try {
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
      <label className={`block text-sm font-medium ${dark ? 'text-slate-300' : 'text-slate-700'}`}>
        {resolvedLabel}
      </label>

      {videoId ? (
        <div className="relative">
          <div className={`w-full aspect-video rounded-xl overflow-hidden border ${dark ? 'bg-black/60 border-white/10' : 'bg-slate-900 border-slate-200'}`}>
            <BunnyVideoPlayer videoId={videoId} cdnHostname={CDN_HOSTNAME} className="w-full h-full" />
          </div>
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
            type="button"
            title={t('common.delete')}
          >
            <X size={16} />
          </button>
          <p className={`text-xs mt-2 font-mono ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
            {t('shared.videoIdLabel', { id: videoId })}
          </p>
        </div>
      ) : (
        <label
          className={`flex flex-col items-center justify-center w-full aspect-video border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
            dark
              ? 'border-white/20 bg-white/5 hover:border-[#53cafd]/60 hover:bg-white/10'
              : 'border-slate-300 hover:border-brand-500 hover:bg-slate-50'
          }`}
        >
          <div className="flex flex-col items-center justify-center px-4 pt-5 pb-6 text-center">
            {uploading ? (
              <>
                <div className={`w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mb-3 ${dark ? 'border-[#53cafd]' : 'border-brand-500'}`} />
                <p className={`text-sm ${dark ? 'text-slate-200' : 'text-slate-600'}`}>
                  {t('shared.uploadingProgress', { progress: uploadProgress })}
                </p>
                <div className={`mt-3 w-48 h-1.5 rounded-full overflow-hidden ${dark ? 'bg-white/10' : 'bg-slate-200'}`}>
                  <div
                    className={`h-full transition-all ${dark ? 'bg-[#53cafd]' : 'bg-brand-500'}`}
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${dark ? 'bg-[#53cafd]/15 text-[#53cafd]' : 'bg-slate-100 text-slate-400'}`}>
                  <Video className="w-7 h-7" />
                </div>
                <p className={`mb-1 text-sm font-semibold ${dark ? 'text-white' : 'text-slate-700'}`}>
                  {t('shared.clickToUploadVideo')}
                </p>
                <p className={`text-xs mb-3 ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
                  {t('shared.videoFormatsHint')}
                </p>
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium ${dark ? 'bg-[#53cafd]/20 text-[#53cafd] border border-[#53cafd]/30' : 'bg-brand-50 text-brand-700'}`}>
                  <Upload size={12} />
                  Bunny Stream
                </span>
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
