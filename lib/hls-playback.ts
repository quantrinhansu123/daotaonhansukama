import type Hls from 'hls.js';

/** Bỏ bước dò băng thông ở 240p. Ước lượng 6 Mbps để mở bản nét ngay. */
export const sharpHlsConfig = {
  enableWorker: true,
  lowLatencyMode: false,
  testBandwidth: false,
  capLevelToPlayerSize: false,
  abrEwmaDefaultEstimate: 6_000_000,
  maxBufferLength: 24,
  maxMaxBufferLength: 60,
  startFragPrefetch: true,
};

/** Giữ bản cao nhất trong playlist (thường là 720p hoặc 1080p), không rơi về 240p. */
export function preferSharpLevel(hls: Hls) {
  const levels = hls.levels || [];
  if (!levels.length) return;
  let best = 0;
  for (let index = 1; index < levels.length; index += 1) {
    if ((levels[index].height || 0) > (levels[best].height || 0)) best = index;
  }
  hls.currentLevel = best;
}
