'use client';

import React, { useState } from 'react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Upload, X, Video, Play } from 'lucide-react';

interface BunnyVideoUploadProps {
  onUploadComplete: (videoId: string) => void;
  currentVideoId?: string;
  label?: string;
}

export const BunnyVideoUpload: React.FC<BunnyVideoUploadProps> = ({
  onUploadComplete,
  currentVideoId,
  label
}) => {
  const { t } = useLanguage();
  const resolvedLabel = label ?? t('shared.uploadVideo');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [videoId, setVideoId] = useState<string | null>(currentVideoId || null);

  const CDN_HOSTNAME = process.env.NEXT_PUBLIC_BUNNY_STREAM_CDN_HOSTNAME;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('video/')) {
      alert(t('shared.selectVideo'));
      return;
    }

    // Validate file size (max 500MB)
    if (file.size > 500 * 1024 * 1024) {
      alert(t('shared.fileTooLarge500MB'));
      return;
    }

    try {
      setUploading(true);
      setUploadProgress(0);

      const libraryId = process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID;
      const apiKey = process.env.NEXT_PUBLIC_BUNNY_STREAM_API_KEY;

      // Step 1: Create video
      const createResponse = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos`, {
        method: 'POST',
        headers: {
          'AccessKey': apiKey!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: file.name,
        }),
      });

      if (!createResponse.ok) {
        throw new Error('Failed to create video');
      }

      const videoData = await createResponse.json();
      const newVideoId = videoData.guid;

      // Step 2: Upload video file
      const uploadResponse = await fetch(`https://video.bunnycdn.com/library/${libraryId}/videos/${newVideoId}`, {
        method: 'PUT',
        headers: {
          'AccessKey': apiKey!,
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload video');
      }

      setVideoId(newVideoId);
      onUploadComplete(newVideoId);
      setUploadProgress(100);
      alert(t('shared.videoUploadSuccess'));
    } catch (error) {
      console.error('Error uploading video:', error);
      alert(t('shared.videoUploadError'));
      setVideoId(currentVideoId || null);
    } finally {
      setUploading(false);
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
            <video
              src={`https://${CDN_HOSTNAME}/${videoId}/playlist.m3u8`}
              controls
              className="w-full h-full"
              poster={`https://${CDN_HOSTNAME}/${videoId}/thumbnail.jpg`}
            >
              <source src={`https://${CDN_HOSTNAME}/${videoId}/playlist.m3u8`} type="application/x-mpegURL" />
              {t('shared.browserNoVideo')}
            </video>
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
