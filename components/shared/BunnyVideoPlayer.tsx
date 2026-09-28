'use client';

import { useEffect, useMemo, useRef } from 'react';
import Hls from 'hls.js';
import { bunnyHlsProxyUrl } from '@/lib/bunny-media';
import { preferSharpLevel, sharpHlsConfig } from '@/lib/hls-playback';

interface BunnyVideoPlayerProps {
  videoId: string;
  videoUrl?: string;
  cdnHostname?: string;
  libraryId?: string;
  autoPlay?: boolean;
  className?: string;
}

/**
 * Phát HLS qua /api/bunny/cdn (server resolve DNS công cộng).
 * Tránh ERR_NAME_NOT_RESOLVED khi DNS máy chặn *.b-cdn.net.
 */
export function BunnyVideoPlayer({
  videoId,
  videoUrl,
  cdnHostname,
  autoPlay = false,
  className,
}: BunnyVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const source = useMemo(() => {
    if (videoId) return bunnyHlsProxyUrl(videoId);
    if (videoUrl) {
      // Nếu đã là URL CDN tuyệt đối, vẫn đi qua proxy path khi có videoId trong path
      try {
        const u = new URL(videoUrl);
        if (u.hostname.endsWith('.b-cdn.net')) {
          return `/api/bunny/cdn${u.pathname}${u.search}`;
        }
      } catch {
        /* ignore */
      }
      return videoUrl;
    }
    if (videoId && cdnHostname) {
      return bunnyHlsProxyUrl(videoId);
    }
    return '';
  }, [videoId, videoUrl, cdnHostname]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !source) return;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = source;
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    if (Hls.isSupported()) {
      const hls = new Hls(sharpHlsConfig);
      hls.loadSource(source);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => preferSharpLevel(hls));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('[BunnyVideoPlayer] HLS fatal', data.type, data.details);
        }
      });
      return () => hls.destroy();
    }
  }, [source]);

  if (!source) {
    return (
      <p className="text-sm text-slate-400 p-4">
        Thiếu video ID Bunny Stream.
      </p>
    );
  }

  return (
    <video
      ref={videoRef}
      controls
      autoPlay={autoPlay}
      controlsList="nodownload"
      playsInline
      className={className}
    />
  );
}
