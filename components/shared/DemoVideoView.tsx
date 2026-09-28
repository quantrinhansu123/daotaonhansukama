'use client';

import { resolveDemoVideo } from '@/lib/demo-video';
import { VideoPlayer } from './VideoPlayer';

interface DemoVideoViewProps {
  videoKey?: string | null;
  legacyId?: string | null;
  className?: string;
  autoPlay?: boolean;
}

export function DemoVideoView({ videoKey, legacyId, className, autoPlay }: DemoVideoViewProps) {
  const source = resolveDemoVideo(videoKey, legacyId);
  if (!source) {
    return <p className="p-4 text-sm text-slate-400">Chưa có video giới thiệu.</p>;
  }
  if (source.kind === 'cloudfly') {
    return <VideoPlayer videoKey={source.key} autoPlay={autoPlay} className={className} />;
  }
  if (source.kind === 'bunny') {
    const libraryId = process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID;
    if (!libraryId) {
      return <p className="p-4 text-sm text-slate-400">Video Bunny chưa có mã thư viện để phát.</p>;
    }
    return (
      <iframe
        src={`https://iframe.mediadelivery.net/embed/${libraryId}/${source.id}?autoplay=${autoPlay ? 'true' : 'false'}`}
        className={className}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        title="Video giới thiệu"
      />
    );
  }
  return <video src={source.url} controls controlsList="nodownload" playsInline autoPlay={autoPlay} className={className} />;
}
