'use client';

import { useEffect, useState } from 'react';
import { Upload, X } from 'lucide-react';
import { uploadVideoToCloudFly } from '@/lib/cloudfly-video';
import { VideoPlayer } from './VideoPlayer';

interface Props {
  label: string;
  currentVideoKey?: string;
  currentLegacyVideoId?: string;
  onUploadComplete: (key: string) => void;
  onUploadStateChange?: (uploading: boolean) => void;
  variant?: 'light' | 'dark';
}

export function CloudFlyVideoUpload({ label, currentVideoKey, currentLegacyVideoId, onUploadComplete, onUploadStateChange, variant = 'light' }: Props) {
  const [key, setKey] = useState(currentVideoKey || '');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const dark = variant === 'dark';

  useEffect(() => setKey(currentVideoKey || ''), [currentVideoKey]);

  const handleFile = async (file: File) => {
    setLoading(true);
    onUploadStateChange?.(true);
    setProgress(0);
    setError('');
    try {
      const uploadedKey = await uploadVideoToCloudFly(file, setProgress);
      setKey(uploadedKey);
      onUploadComplete(uploadedKey);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tải được video lên CloudFly.');
    } finally {
      setLoading(false);
      onUploadStateChange?.(false);
    }
  };

  return <div className="space-y-3">
    <p className={`text-sm font-medium ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{label}</p>
    {key && <div className="aspect-video overflow-hidden rounded-xl bg-black">
      <VideoPlayer videoKey={key} className="h-full w-full" />
    </div>}
    {currentLegacyVideoId && !key && <p className={`text-xs ${dark ? 'text-amber-300' : 'text-amber-700'}`}>Video cũ chưa có trên CloudFly. Hãy tải file gốc lên để tiếp tục phát.</p>}
    <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-sm font-semibold ${dark ? 'border-white/20 bg-white/5 text-[#53cafd] hover:bg-white/10' : 'border-slate-300 bg-slate-50 text-blue-700 hover:bg-blue-50'}`}>
      <Upload size={17} /> {loading ? `Đang tải lên CloudFly ${progress}%` : key || currentLegacyVideoId ? 'Thay bằng video CloudFly' : 'Tải video lên CloudFly'}
      <input type="file" accept="video/mp4,video/webm" disabled={loading} className="hidden" onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) void handleFile(file);
      }} />
    </label>
    {loading && <div className={`h-2 overflow-hidden rounded-full ${dark ? 'bg-white/10' : 'bg-slate-200'}`}><div className="h-full bg-[#53cafd]" style={{ width: `${progress}%` }} /></div>}
    {key && <button type="button" className="inline-flex items-center gap-1 text-xs text-rose-400 hover:underline" onClick={() => { setKey(''); onUploadComplete(''); }}><X size={13} /> Gỡ khỏi khóa học (tệp vẫn lưu)</button>}
    {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
  </div>;
}
