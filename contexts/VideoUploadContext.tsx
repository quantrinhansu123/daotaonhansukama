'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { uploadVideoToCloudFly } from '@/lib/cloudfly-video';
import type { VideoTarget,VideoUploadResult } from '@/lib/video-pipeline-types';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { notifyVideoBindings } from '@/lib/video-bindings-client';

export type VideoUploadJob = {
  id: string;
  targetId: string;
  label: string;
  fileName: string;
  percent: number;
  status: 'queued' | 'preparing' | 'uploading' | 'finalizing' | 'saving' | 'processing' | 'playable' | 'done' | 'error';
  assetId?:string;
  error?: string;
};

type StartVideoUpload = {
  file: File;
  targetId: string;
  label: string;
  save: (key: string,result:VideoUploadResult) => Promise<void>;
  target?:VideoTarget;
};

type VideoUploadContextValue = {
  jobs: VideoUploadJob[];
  startUpload: (options: StartVideoUpload) => boolean;
};

const VideoUploadContext = createContext<VideoUploadContextValue | null>(null);
const activeStatuses = new Set<VideoUploadJob['status']>(['queued', 'preparing', 'uploading', 'finalizing', 'saving']);

export function useVideoUploads() {
  const context = useContext(VideoUploadContext);
  if (!context) throw new Error('useVideoUploads requires VideoUploadProvider');
  return context;
}

function ProgressRing({ job }: { job: VideoUploadJob }) {
  const radius = 21;
  const circumference = 2 * Math.PI * radius;
  const percent = job.status === 'done' ? 100 : job.percent;
  return (
    <div
      className="relative h-14 w-14 shrink-0"
      role="progressbar"
      aria-label={`${job.fileName}: ${percent}%`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
    >
      <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-slate-200" />
        <circle
          cx="28" cy="28" r={radius} fill="none" stroke="currentColor" strokeWidth="5"
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent / 100)}
          className={job.status === 'error' ? 'text-rose-500 transition-[stroke-dashoffset] duration-300' : 'text-[#1B7A1E] transition-[stroke-dashoffset] duration-300'}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[11px] font-bold text-slate-800" aria-hidden="true">
        {job.status === 'done' ? <Check size={19} className="text-[#1B7A1E]" /> : `${percent}%`}
      </span>
    </div>
  );
}

export function VideoUploadProvider({ children }: { children: React.ReactNode }) {
  const [jobs, setJobs] = useState<VideoUploadJob[]>([]);
  const activeTargets = useRef(new Set<string>());
  const queue = useRef(Promise.resolve());

  const updateJob = useCallback((id: string, patch: Partial<VideoUploadJob>) => {
    setJobs(previous => previous.map(job => job.id === id ? { ...job, ...patch } : job));
  }, []);

  const startUpload = useCallback(({ file, targetId, label, save,target }: StartVideoUpload) => {
    if (activeTargets.current.has(targetId)) return false;
    activeTargets.current.add(targetId);
    const id = crypto.randomUUID();
    setJobs(previous => [...previous, { id, targetId, label, fileName: file.name, percent: 0, status: 'queued' }]);

    const run = async () => {
      try {
        updateJob(id, { status: 'preparing' });
        const result = await uploadVideoToCloudFly(
          file,
          percent => updateJob(id, { percent: Math.min(percent, 99) }),
          () => updateJob(id, { status: 'finalizing', percent: 99 }),
          () => updateJob(id, { status: 'uploading' }),
          target,
        );
        updateJob(id, { status: 'saving', percent: 99 });
        await save(result.key,result);
        updateJob(id, { status: result.pipeline ? 'processing' : 'done', percent: 100,assetId:result.assetId });
        notifyVideoBindings();
        if(!result.pipeline) window.setTimeout(() => setJobs(previous => previous.filter(job => job.id !== id)), 20000);
      } catch (cause) {
        updateJob(id, {
          status: 'error',
          error: cause instanceof Error ? cause.message : 'Không tải được video. Vui lòng thử lại.',
        });
      } finally {
        activeTargets.current.delete(targetId);
      }
    };

    // Upload one video at a time so several large files do not compete for bandwidth.
    queue.current = queue.current.then(run, run);
    return true;
  }, [updateJob]);

  useEffect(()=>{
    const waiting=jobs.filter(j=>j.status==='processing' && j.assetId);
    if(!waiting.length) return;
    const controller=new AbortController();
    const poll=async()=>{
      for(const job of waiting) {
        try {
          const response=await authenticatedFetch(`/api/video/assets/${job.assetId}`,{signal:controller.signal});
          if(!response.ok) continue;
          const result=await response.json();
          if(controller.signal.aborted) return;
          if(['playable','complete'].includes(result.status)) {updateJob(job.id,{status:'playable'});notifyVideoBindings();window.setTimeout(()=>setJobs(p=>p.filter(j=>j.id!==job.id)),20_000);}
          else if(['failed','cancelled','source_unavailable'].includes(result.status)) {updateJob(job.id,{status:'error',error:result.status==='cancelled'?'Video đã bị hủy.':'Đã tải tệp; xử lý video lỗi. Có thể thử lại ở bài học.'});notifyVideoBindings();}
        }catch{}
      }
    };
    const timer=setInterval(()=>void poll(),3000);
    void poll();
    return ()=>{controller.abort();clearInterval(timer);};
  },[jobs,updateJob]);

  useEffect(() => {
    if (!jobs.some(job => activeStatuses.has(job.status))) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeLeaving);
    return () => window.removeEventListener('beforeunload', warnBeforeLeaving);
  }, [jobs]);

  return (
    <VideoUploadContext.Provider value={{ jobs, startUpload }}>
      {children}
      {jobs.length > 0 && (
        <aside className="fixed bottom-4 right-4 z-[120] max-h-[70vh] w-[min(360px,calc(100vw-2rem))] space-y-2 overflow-y-auto" aria-label="Tiến trình tải video">
          {jobs.map(job => (
            <div key={job.id} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/15">
              <ProgressRing job={job} />
              <div className="min-w-0 flex-1" aria-live="polite">
                <p className="truncate text-sm font-semibold text-slate-900">{job.label}</p>
                <p className="truncate text-xs text-slate-500" title={job.fileName}>{job.fileName}</p>
                <p className={`mt-1 text-xs ${job.status === 'error' ? 'text-rose-600' : 'text-slate-600'}`}>
                  {job.status === 'queued' && 'Đang chờ lượt tải lên…'}
                  {job.status === 'preparing' && 'Đang chuẩn bị tải video lên CloudFly…'}
                  {job.status === 'uploading' && 'Đang tải lên CloudFly. Bạn có thể tiếp tục làm việc.'}
                  {job.status === 'finalizing' && 'Đang hoàn tất lưu tệp trên CloudFly…'}
                  {job.status === 'saving' && 'Đã gửi tệp, đang lưu vào khóa học…'}
                  {job.status === 'done' && 'Đã tải lên và lưu thành công.'}
                  {job.status === 'processing' && 'Đã tải lên. Video đang chờ xử lý; bạn có thể đóng trang.'}
                  {job.status === 'playable' && 'Video đã có thể xem. Hệ thống tiếp tục bổ sung chất lượng cao.'}
                  {job.status === 'error' && job.error}
                </p>
              </div>
              {!activeStatuses.has(job.status) && (
                <button
                  type="button" aria-label={`Đóng thông báo ${job.fileName}`}
                  className="self-start rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                  onClick={() => setJobs(previous => previous.filter(item => item.id !== job.id))}
                >
                  <X size={17} />
                </button>
              )}
            </div>
          ))}
        </aside>
      )}
    </VideoUploadContext.Provider>
  );
}
