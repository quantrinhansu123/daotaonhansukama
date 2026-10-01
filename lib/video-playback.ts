import type { ResolvedVideo } from './video-resolve';

export type VideoQualityLevel = {
  index: number;
  width: number;
  height: number;
  name: string;
  bitrate: number;
};

export type PlaybackHandle = {
  resumeLoading: () => void;
  pauseLoading: () => void;
  setQuality: (index: number) => void;
  destroy: () => void;
};

export async function attachVideoPlayback(
  video: HTMLVideoElement,
  source: ResolvedVideo,
  options: {
    startAt?: number;
    signal?: AbortSignal;
    onPlaybackError?: () => void;
    onQualityLevels?: (levels: VideoQualityLevel[]) => void;
    sourceQualityAvailable?: boolean;
    prewarm?: boolean;
  } = {},
): Promise<PlaybackHandle> {
  let disposed = false;
  let hls: import('hls.js').default | null = null;
  const startAt = Math.max(0, options.startAt || 0);
  const restorePosition = () => {
    if (startAt > 0 && Number.isFinite(video.duration)) {
      video.currentTime = Math.min(startAt, Math.max(0, video.duration - 0.5));
    }
  };
  video.addEventListener('loadedmetadata', restorePosition, { once: true });
  if (source.posterUrl) video.poster = source.posterUrl;
  video.preload = 'auto';

  const onError = () => options.onPlaybackError?.();
  video.addEventListener('error', onError);
  const cleanup = () => {
    disposed = true;
    video.removeEventListener('loadedmetadata', restorePosition);
    video.removeEventListener('error', onError);
    hls?.destroy();
    hls = null;
  };

  // A signed MP4 plays in the video element without CORS. CloudFly omits CORS
  // on signed GET responses, so HLS.js cannot fetch those segments directly
  // and would otherwise pull every segment through the app server.
  const directFile = /^https?:\/\//i.test(source.url) && !/\.m3u8(\?|$)/i.test(source.url);
  const assignSource = (url: string) => {
    const nextPath = url.split('?')[0];
    const currentPath = (video.currentSrc || video.src || '').split('?')[0];
    if (currentPath && currentPath === nextPath && video.readyState > 0) return;
    const wasPlaying = !video.paused && !video.ended;
    video.src = url;
    video.load();
    if (wasPlaying) video.addEventListener('canplay', () => { void video.play().catch(() => {}); }, { once: true });
  };

  if (source.hlsUrl && !directFile) {
    try {
      const { default: Hls } = await import('hls.js');
      if (disposed || options.signal?.aborted) return {
        resumeLoading: () => {}, pauseLoading: () => {}, setQuality: () => {}, destroy: cleanup,
      };
      if (Hls.isSupported()) {
        hls = new Hls({
          // Start on the smallest rendition so the first segments clear the
          // app proxy quickly, then let ABR climb. Do not cap levels to the
          // CSS size of the player.
          startLevel: 0,
          capLevelToPlayerSize: false,
          maxBufferLength: 20,
          maxMaxBufferLength: 30,
          backBufferLength: 10,
          enableWorker: true,
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const sourceHeight = Math.max(0, ...(hls?.levels.map(level => level.height) || []));
          const levels = hls?.levels.map((level, index) => ({
            index,
            width: level.width,
            height: level.height,
            name: options.sourceQualityAvailable && level.height === sourceHeight
              ? `Gốc ${level.width}×${level.height}`
              : level.name || `${level.height}p`,
            bitrate: level.bitrate,
          })) || [];
          options.onQualityLevels?.(levels);
        });
        hls.on(Hls.Events.ERROR, (_event, details) => {
          if (details.fatal) {
            options.onQualityLevels?.([]);
            hls?.destroy();
            hls = null;
            video.src = source.url;
            video.load();
          }
        });
        hls.loadSource(source.hlsUrl);
        // loadSource resets Hls.js' level cap. Prewarm only the lowest rendition
        // while paused, then uncap on play to avoid downloading HD in the background.
        if (options.prewarm) hls.autoLevelCapping = 0;
        hls.attachMedia(video);
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        assignSource(source.hlsUrl);
      } else {
        assignSource(source.url);
      }
    } catch {
      assignSource(source.url);
    }
  } else {
    assignSource(source.url);
  }

  return {
    resumeLoading: () => {
      if (options.prewarm && hls) hls.autoLevelCapping = -1;
      hls?.startLoad(-1);
    },
    pauseLoading: () => hls?.stopLoad(),
    setQuality: index => {
      if (!hls) return;
      hls.autoLevelCapping = -1;
      hls.currentLevel = index;
    },
    destroy: cleanup,
  };
}
