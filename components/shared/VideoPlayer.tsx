'use client';

import { cloudflyVideoUrl } from '@/lib/cloudfly-video';

interface VideoPlayerProps {
  videoKey?: string | null;
  autoPlay?: boolean;
  className?: string;
}

export function VideoPlayer({ videoKey, autoPlay, className }: VideoPlayerProps) {
  if (!videoKey) return <p className="p-4 text-sm text-slate-400">Video này chưa được tải lên CloudFly.</p>;
  return <video src={cloudflyVideoUrl(videoKey)} controls controlsList="nodownload" playsInline autoPlay={autoPlay} className={className} />;
}
