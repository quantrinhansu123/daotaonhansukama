'use client';

import { useEffect, useRef, useState } from 'react';
import { doc, updateDoc } from '@/lib/data-store';
import { Upload, X } from 'lucide-react';
import { db } from '@/lib/data-store';
import { resolveDemoVideo } from '@/lib/demo-video';
import { useVideoUploads } from '@/contexts/VideoUploadContext';
import { DemoVideoView } from './DemoVideoView';
import { useVideoBindings,courseWithBinding,notifyVideoBindings,removeBoundVideo } from '@/lib/video-bindings-client';
import { VideoProcessingStatus } from './VideoProcessingStatus';

interface Props {
  label: string;
  courseId: string;
  currentVideoKey?: string;
  currentLegacyVideoId?: string;
  onUploadComplete: (key: string) => void;
  onSaved?: (key: string) => void;
  variant?: 'light' | 'dark';
}

export function CloudFlyVideoUpload({ label, courseId, currentVideoKey, currentLegacyVideoId, onUploadComplete, onSaved, variant = 'light' }: Props) {
  const pipeline=useVideoBindings(courseId);
  const binding=pipeline.bindings.find(b=>b.targetType==='course_intro' && b.targetId===courseId);
  const media=courseWithBinding({id:courseId,demoVideoKey:currentVideoKey,demoVideoId:currentLegacyVideoId} as import('@/types/course').Course,pipeline.bindings);
  const key = media.demoVideoKey || '';
  const legacyId=media.demoVideoId;
  const [error, setError] = useState('');
  const mounted = useRef(false);
  const { jobs, startUpload } = useVideoUploads();
  const job = jobs.find(item => item.targetId === `course:${courseId}:demo` && ['queued', 'preparing', 'uploading', 'finalizing', 'saving'].includes(item.status));
  const loading = Boolean(job);
  const dark = variant === 'dark';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const handleFile = (file: File) => {
    setError('');
    startUpload({
      file,
      targetId: `course:${courseId}:demo`,
      target:{targetType:'course_intro',targetId:courseId},
      label: `Video giới thiệu: ${label}`,
      save: async (uploadedKey,result) => {
        if(result.pipeline){notifyVideoBindings();return;}
        try {
          await updateDoc(doc(db, 'courses', courseId), {
            demoVideoKey: uploadedKey,
            demoVideoId: null,
            updatedAt: new Date(),
          });
        } catch {
          throw new Error(`Video đã lên CloudFly nhưng chưa lưu vào khóa học. Mã tệp: ${uploadedKey}`);
        }
        onSaved?.(uploadedKey);
        if (mounted.current) {
          onUploadComplete(uploadedKey);
        }
      },
    });
  };

  const handleRemove = async () => {
    try {
      if(pipeline.enabled){await removeBoundVideo({targetType:'course_intro',targetId:courseId});return;}
      await updateDoc(doc(db, 'courses', courseId), { demoVideoKey: null, demoVideoId: null, updatedAt: new Date() });
      onUploadComplete('');
      onSaved?.('');
    } catch {
      setError('Không gỡ được video khỏi khóa học.');
    }
  };

  return <div className="space-y-3">
    <p className={`text-sm font-medium ${dark ? 'text-slate-300' : 'text-slate-700'}`}>{label}</p>
    <VideoProcessingStatus binding={binding} canRetry/>
    {resolveDemoVideo(key, legacyId) && <div className="aspect-video overflow-hidden rounded-xl bg-black">
      <DemoVideoView videoKey={key} legacyId={legacyId} target={{targetType:'course_intro',targetId:courseId}} className="h-full w-full" />
    </div>}
    <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-sm font-semibold ${dark ? 'border-white/20 bg-white/5 text-[#1B7A1E] hover:bg-white/10' : 'border-slate-300 bg-slate-50 text-blue-700 hover:bg-blue-50'}`}>
      <Upload size={17} /> {loading ? `Đang tải nền ${job?.percent || 0}%` : key || currentLegacyVideoId ? 'Thay bằng video CloudFly' : 'Tải video lên CloudFly'}
      <input type="file" accept="video/*,.mp4,.m4v,.webm,.mov,.mkv,.avi,.mpeg,.mpg,.3gp" disabled={loading} className="hidden" onChange={event => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (file) handleFile(file);
      }} />
    </label>
    <p className={`text-xs ${dark ? 'text-slate-400' : 'text-slate-500'}`}>Video tối đa 2 GB. Không cần đổi định dạng hoặc nén trước khi tải; hệ thống giữ file gốc và tự tạo các mức phát đến đúng độ phân giải của video.</p>
    {loading && <p className="text-xs text-slate-400">Bạn có thể đóng cửa sổ và tiếp tục thao tác; tiến trình vẫn ở góc màn hình.</p>}
    {(key || legacyId) && !loading && <button type="button" className="inline-flex items-center gap-1 text-xs text-rose-400 hover:underline" onClick={() => void handleRemove()}><X size={13} /> Gỡ khỏi khóa học (tệp vẫn lưu)</button>}
    {error && <p className="text-xs text-rose-400" role="alert">{error}</p>}
  </div>;
}
