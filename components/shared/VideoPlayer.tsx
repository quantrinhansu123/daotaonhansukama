'use client';

import { useEffect, useRef, useState } from 'react';
import { attachVideoPlayback, type PlaybackHandle, type VideoQualityLevel } from '@/lib/video-playback';
import { resolveVideo } from '@/lib/video-resolve';
import { VideoLoadingBuddy } from './VideoLoadingBuddy';
import { VideoQualitySelect } from './VideoQualitySelect';

interface VideoPlayerProps {
  videoKey?: string | null;
  mediaUrl?: string | null;
  hlsUrl?: string | null;
  providerFallbackUrl?: string | null;
  autoPlay?: boolean;
  active?: boolean;
  prewarm?: boolean;
  className?: string;
}

export function VideoPlayer({ videoKey, mediaUrl, hlsUrl, providerFallbackUrl, autoPlay, active = true, prewarm = false, className }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<PlaybackHandle | null>(null);
  const activeRef = useRef(active);
  const autoPlayRef = useRef(autoPlay);
  const [error, setError] = useState('');
  const [qualityLevels, setQualityLevels] = useState<VideoQualityLevel[]>([]);
  const [selectedQuality, setSelectedQuality] = useState(-1);
  const [qualityPlaceholder, setQualityPlaceholder] = useState('Đang tải mức chất lượng…');
  const [useProviderFallback, setUseProviderFallback] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [showBuddy, setShowBuddy] = useState(false);
  activeRef.current = active;
  autoPlayRef.current = autoPlay;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || (!videoKey && !mediaUrl && !hlsUrl)) return;
    const controller = new AbortController();
    let handle: PlaybackHandle | null = null;
    let refreshes = 0;
    let hasAdaptiveLevels = false;
    setUseProviderFallback(false);
    setMediaReady(false);
    setError('');
    setQualityLevels([]);
    setSelectedQuality(-1);

    const setSourceQuality = () => {
      if (hasAdaptiveLevels || video.videoWidth <= 0 || video.videoHeight <= 0) return;
      setQualityLevels([{
        index: 0,
        width: video.videoWidth,
        height: video.videoHeight,
        name: `Gốc ${video.videoWidth}×${video.videoHeight}`,
        bitrate: 0,
      }]);
      setSelectedQuality(0);
    };
    video.addEventListener('loadedmetadata', setSourceQuality);

    let startIfReady: (() => void) | null = null;
    const load = async (force = false) => {
      const at = video.currentTime;
      try {
        const resolved = videoKey
          ? await resolveVideo(videoKey, force)
          : {
              status: 'ready' as const,
              url: mediaUrl || hlsUrl || '',
              hlsUrl: hlsUrl || undefined,
              expiresAt: Date.now() + 60 * 60_000,
            };
        if (controller.signal.aborted) return;
        setQualityPlaceholder(resolved.processing
          ? 'Đang xử lý các mức chất lượng…'
          : 'Đang tải mức chất lượng…');
        handle?.destroy();
        handle = await attachVideoPlayback(video, resolved, {
          signal: controller.signal,
          startAt: at,
          prewarm,
          onQualityLevels: levels => {
            hasAdaptiveLevels = levels.length > 0;
            setQualityLevels(levels);
            if (levels.length) setSelectedQuality(-1);
          },
          sourceQualityAvailable: resolved.sourceQualityAvailable,
          onPlaybackError: () => {
            if (providerFallbackUrl && !controller.signal.aborted) {
              video.pause();
              handle?.destroy();
              handle = null;
              playbackRef.current = null;
              setUseProviderFallback(true);
            }
            else if (refreshes++ < 1 && !controller.signal.aborted) void load(true);
          },
        });
        if (controller.signal.aborted) {
          handle.destroy();
          return;
        }
        playbackRef.current = handle;
        startIfReady = () => {
          if (!autoPlayRef.current || !activeRef.current || controller.signal.aborted || !video.paused) return;
          void video.play().catch(() => setMediaReady(true));
        };
        video.addEventListener('canplay', startIfReady);
        if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) startIfReady();
      } catch (cause) {
        if (!controller.signal.aborted) {
          setMediaReady(true);
          if (providerFallbackUrl) setUseProviderFallback(true);
          else setError(cause instanceof Error ? cause.message : 'Không mở được video.');
        }
      }
    };
    void load();
    return () => {
      controller.abort();
      video.removeEventListener('loadedmetadata', setSourceQuality);
      if (startIfReady) video.removeEventListener('canplay', startIfReady);
      handle?.destroy();
      playbackRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [videoKey, mediaUrl, hlsUrl, providerFallbackUrl, prewarm]);

  useEffect(() => {
    if (!active || mediaReady || error || useProviderFallback) {
      setShowBuddy(false);
      return;
    }
    const timer = window.setTimeout(() => setShowBuddy(true), 350);
    return () => window.clearTimeout(timer);
  }, [active, mediaReady, error, useProviderFallback, videoKey, mediaUrl, hlsUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) {
      playbackRef.current?.resumeLoading();
      if (autoPlay && video.paused && video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
        void video.play().catch(() => {});
      }
    } else if (!video.paused) {
      video.pause();
    }
  }, [active, autoPlay]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const pauseWhenHidden = () => {
      if (!document.hidden) return;
      video.pause();
      playbackRef.current?.pauseLoading();
    };
    document.addEventListener('visibilitychange', pauseWhenHidden);
    return () => document.removeEventListener('visibilitychange', pauseWhenHidden);
  }, []);

  if (!videoKey && !mediaUrl && !hlsUrl) return <p className="p-4 text-sm text-slate-400">Video này chưa được tải lên CloudFly.</p>;
  return (
    <div className="relative h-full w-full bg-black">
      {useProviderFallback && providerFallbackUrl ? (
        <iframe
          src={providerFallbackUrl}
          title="Video"
          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
          allowFullScreen
          className="h-full w-full border-0"
        />
      ) : <video
        ref={videoRef}
        data-intro-video={prewarm ? '' : undefined}
        controls
        controlsList="nodownload"
        playsInline
        onCanPlay={() => setMediaReady(true)}
        preload={prewarm ? 'auto' : 'metadata'}
        className={className}
        onPlay={() => playbackRef.current?.resumeLoading()}
        onProgress={event => {
          if (!prewarm || active) return;
          const video = event.currentTarget;
          const end = video.buffered.length ? video.buffered.end(video.buffered.length - 1) : 0;
          if (end - video.currentTime >= 4) playbackRef.current?.pauseLoading();
        }}
      />}
      {showBuddy && <VideoLoadingBuddy />}
      {!useProviderFallback && <VideoQualitySelect
        levels={qualityLevels}
        selectedIndex={selectedQuality}
        placeholder={qualityPlaceholder}
        onChange={index => {
          setSelectedQuality(index);
          playbackRef.current?.setQuality(index);
        }}
      />}
      {error && <div className="absolute inset-0 grid place-items-center bg-black/80 p-4 text-center text-sm text-white">{error}</div>}
    </div>
  );
}
