'use client';

import { bunnyStreamPlaylistUrl, resolveDemoVideo } from '@/lib/demo-video';
import { VideoPlayer } from './VideoPlayer';
import { VideoQualitySelect } from './VideoQualitySelect';
import type { VideoTarget } from '@/lib/video-pipeline-types';

interface DemoVideoViewProps {
  videoKey?: string | null;
  target?:VideoTarget;
  legacyId?: string | null;
  className?: string;
  autoPlay?: boolean;
  active?: boolean;
  prewarm?: boolean;
}

export function DemoVideoView({ videoKey,target, legacyId, className, autoPlay, active = true, prewarm = false }: DemoVideoViewProps) {
  const source = resolveDemoVideo(videoKey, legacyId);
  if (!source) {
    return <div className={`relative grid h-full w-full place-items-center bg-black ${className || ''}`}>
      <VideoQualitySelect levels={[]} selectedIndex={-1} onChange={() => {}} disabled placeholder="Chưa có video" />
      <p className="p-4 text-sm text-slate-400">Chưa có video giới thiệu.</p>
    </div>;
  }
  if (source.kind === 'cloudfly') {
    return <VideoPlayer videoKey={source.key} target={target} autoPlay={autoPlay} active={active} prewarm={prewarm} className={className} />;
  }
  if (source.kind === 'bunny') {
    const libraryId = process.env.NEXT_PUBLIC_BUNNY_STREAM_LIBRARY_ID;
    const playlistUrl = bunnyStreamPlaylistUrl(source.id);
    const embedUrl = libraryId
      ? `https://iframe.mediadelivery.net/embed/${libraryId}/${source.id}?autoplay=${autoPlay ? 'true' : 'false'}`
      : null;
    if (playlistUrl) {
      return <VideoPlayer
        target={target}
        hlsUrl={playlistUrl}
        providerFallbackUrl={embedUrl}
        autoPlay={autoPlay}
        active={active}
        prewarm={prewarm}
        className={className}
      />;
    }
    if (!libraryId) {
      return <p className="p-4 text-sm text-slate-400">Video Bunny chưa có mã thư viện để phát.</p>;
    }
    return (
      <iframe
        src={embedUrl!}
        className={className}
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        title="Video giới thiệu"
      />
    );
  }
  const isHls = /\.m3u8(?:$|\?)/i.test(source.url);
  return <VideoPlayer target={target} mediaUrl={source.url} hlsUrl={isHls ? source.url : undefined} autoPlay={autoPlay} active={active} prewarm={prewarm} className={className} />;
}
