'use client';

import { useEffect, useRef, useState } from 'react';
import { attachVideoPlayback, type PlaybackHandle, type VideoQualityLevel } from '@/lib/video-playback';
import { resolveVideo,resolvePlaybackSource } from '@/lib/video-resolve';
import type { VideoTarget } from '@/lib/video-pipeline-types';
import { VideoLoadingBuddy } from './VideoLoadingBuddy';
import { VideoQualitySelect } from './VideoQualitySelect';
import { videoErrorMessage, type VideoPlaybackError } from '@/lib/video-errors';

interface VideoPlayerProps {
  videoKey?: string | null;
  target?:VideoTarget;
  mediaUrl?: string | null;
  hlsUrl?: string | null;
  providerFallbackUrl?: string | null;
  autoPlay?: boolean;
  active?: boolean;
  prewarm?: boolean;
  className?: string;
}

export function VideoPlayer({ videoKey,target, mediaUrl, hlsUrl, providerFallbackUrl, autoPlay, active = true, prewarm = false, className }: VideoPlayerProps) {
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
  const [reloadKey, setReloadKey] = useState(0);
  activeRef.current = active;
  autoPlayRef.current = autoPlay;
  const targetType=target?.targetType,targetId=target?.targetId;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || (!videoKey && !mediaUrl && !hlsUrl)) return;
    const controller = new AbortController();
    let handle: PlaybackHandle | null = null;
    let refreshes = 0;
    let refreshTimer:ReturnType<typeof setTimeout>;
    let pinned:{assetId:string;version:string}|undefined;
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
    const showError = (issue?: VideoPlaybackError) => {
      if (controller.signal.aborted) return;
      handle?.destroy();
      setMediaReady(true);
      setQualityPlaceholder('Không tải được video');
      setError(videoErrorMessage(issue));
    };
    const load = async (force = false) => {
      const at = video.currentTime;
      let playbackFailed = false;
      try {
        const wasPlaying=!video.paused;
        const resolved = await resolvePlaybackSource(targetType && targetId?{targetType,targetId}:undefined,async()=>videoKey
          ? await resolveVideo(videoKey, force)
          : {
              status: 'ready' as const,
              url: mediaUrl || hlsUrl || '',
              hlsUrl: hlsUrl || undefined,
              expiresAt: Date.now() + 60 * 60_000,
            },force?pinned:undefined);
        if(resolved.assetId && resolved.version && !pinned) pinned={assetId:resolved.assetId,version:resolved.version};
        if (controller.signal.aborted) return;
        setQualityPlaceholder(resolved.processing
          ? 'Đang xử lý các mức chất lượng…'
          : 'Đang tải mức chất lượng…');
        handle?.destroy();
        if(startIfReady) video.removeEventListener('canplay',startIfReady);
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
          onPlaybackError: issue => {
            if (controller.signal.aborted) return;
            const unavailable = issue?.httpStatus === 403 || issue?.httpStatus === 404;
            if (providerFallbackUrl && !unavailable && issue?.kind !== 'timeout') {
              playbackFailed = true;
              video.pause();
              handle?.destroy();
              handle = null;
              playbackRef.current = null;
              setUseProviderFallback(true);
            }
            else if (videoKey && refreshes++ < 1 && issue?.kind !== 'timeout') void load(true);
            else {
              playbackFailed = true;
              showError(issue);
            }
          },
        });
        if (controller.signal.aborted || playbackFailed) {
          handle.destroy();
          return;
        }
        playbackRef.current = handle;
        startIfReady = () => {
          if ((!autoPlayRef.current && !wasPlaying) || !activeRef.current || controller.signal.aborted || !video.paused) return;
          void video.play().catch(() => setMediaReady(true));
        };
        video.addEventListener('canplay', startIfReady);
        if (video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) startIfReady();
        clearTimeout(refreshTimer);
        if(resolved.assetId) refreshTimer=setTimeout(()=>void load(true),Math.max(10_000,resolved.expiresAt-Date.now()-300_000));
      } catch (cause) {
        if (!controller.signal.aborted) {
          setMediaReady(true);
          setError(cause instanceof Error ? cause.message : 'Không mở được video.');
        }
      }
    };
    void load();
    return () => {
      controller.abort();
      clearTimeout(refreshTimer);
      video.removeEventListener('loadedmetadata', setSourceQuality);
      if (startIfReady) video.removeEventListener('canplay', startIfReady);
      handle?.destroy();
      playbackRef.current = null;
      video.pause();
      video.removeAttribute('src');
      video.load();
    };
  }, [videoKey,targetType,targetId, mediaUrl, hlsUrl, providerFallbackUrl, prewarm,reloadKey]);

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
      {error && <div role="alert" className="absolute inset-0 grid place-items-center bg-black/80 p-4 text-center text-sm text-white">
        <div>
          <p>{error}</p>
          <button type="button" className="mt-4 rounded-lg bg-white px-4 py-2 font-semibold text-slate-900" onClick={() => {
            setUseProviderFallback(false);
            setReloadKey(value => value + 1);
          }}>Thử lại</button>
        </div>
      </div>}
    </div>
  );
}
