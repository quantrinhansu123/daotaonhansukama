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
    onCdnResponse?: (url:string,cache:string|null)=>void;
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
  video.preload = options.prewarm ? 'metadata' : 'auto';

  const onError = () => options.onPlaybackError?.();
  video.addEventListener('error', onError);
  const cleanup = () => {
    disposed = true;
    video.removeEventListener('loadedmetadata', restorePosition);
    video.removeEventListener('error', onError);
    hls?.destroy();
    hls = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
  };

  const assignSource = (url: string) => {
    const nextPath = url.split('?')[0];
    const currentPath = (video.currentSrc || video.src || '').split('?')[0];
    if (currentPath && currentPath === nextPath && video.readyState > 0) return;
    const wasPlaying = !video.paused && !video.ended;
    video.src = url;
    video.load();
    if (wasPlaying) video.addEventListener('canplay', () => { void video.play().catch(() => {}); }, { once: true });
  };

  // Preserve the legacy production path while only pipeline assets prefer HLS.
  const legacyDirectFile=!source.assetId && /^https?:\/\//i.test(source.url) && !/\.m3u8(\?|$)/i.test(source.url);
  if (source.hlsUrl && !legacyDirectFile) {
    try {
      const { default: Hls } = await import('hls.js');
      if (disposed || options.signal?.aborted) return {
        resumeLoading: () => {}, pauseLoading: () => {}, setQuality: () => {}, destroy: cleanup,
      };
      if (Hls.isSupported()) {
        hls = new Hls({
          autoStartLoad:false,
          capLevelToPlayerSize: false,
          maxBufferLength: 20,
          maxMaxBufferLength: 30,
          backBufferLength: 10,
          enableWorker: true,
          xhrSetup:options.onCdnResponse?(xhr,url)=>{xhr.addEventListener('load',()=>options.onCdnResponse?.(url,xhr.getResponseHeader('CDN-Cache')));}:undefined,
        });
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const available=hls?.levels || [];
          const eligible=available.map((level,index)=>({level,index})).filter(x=>x.level.height<=480);
          const initial=source.assetId && eligible.length?eligible.reduce((a,b)=>a.level.height>b.level.height?a:b).index:0;
          if(hls){hls.startLevel=initial;hls.autoLevelCapping=options.prewarm?initial:-1;hls.startLoad(startAt);}
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
            const position=video.currentTime,wasPlaying=!video.paused;
            hls?.destroy();
            hls = null;
            video.src = source.url;
            video.addEventListener('loadedmetadata',()=>{video.currentTime=Math.min(position,Math.max(0,video.duration-.5));if(wasPlaying)void video.play().catch(()=>{});},{once:true});
            video.load();
            if(details.response?.code===403) options.onPlaybackError?.();
          }
        });
        hls.loadSource(source.hlsUrl);
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
      video.preload='auto';
      if (options.prewarm && hls) hls.autoLevelCapping = -1;
      hls?.startLoad(-1);
    },
    pauseLoading: () => {hls?.stopLoad();if(!hls)video.preload='metadata';},
    setQuality: index => {
      if (!hls) return;
      hls.autoLevelCapping = -1;
      hls.currentLevel = index;
    },
    destroy: cleanup,
  };
}
