'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';

interface BunnyVideoPlayerProps {
  videoId: string;
  videoUrl?: string;
  cdnHostname?: string;
  autoPlay?: boolean;
  className?: string;
}

export function BunnyVideoPlayer({
  videoId,
  videoUrl,
  cdnHostname,
  autoPlay = false,
  className,
}: BunnyVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const source = videoUrl || (cdnHostname ? `https://${cdnHostname}/${videoId}/playlist.m3u8` : '');

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
      const hls = new Hls();
      hls.loadSource(source);
      hls.attachMedia(video);
      return () => hls.destroy();
    }
  }, [source]);

  if (!source) return <p>Thiếu cấu hình Bunny Stream CDN.</p>;

  return <video ref={videoRef} controls autoPlay={autoPlay} controlsList="nodownload" className={className} />;
}
