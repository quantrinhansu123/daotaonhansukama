import {
  claimVideoAsset,
  heartbeatVideoAsset,
  markVideoAssetFailed,
  markVideoAssetReady,
  type VideoAsset,
} from '../lib/video-assets-server';
import { processVideo } from './transcode';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const selectedKey = process.argv.find(arg => arg.startsWith('--key='))?.slice('--key='.length);
const once = process.argv.includes('--once') || Boolean(selectedKey);
// The CloudFly object queue has one active consumer; run one worker replica.
const concurrency = 1;
let stopping = false;

process.on('SIGINT', () => { stopping = true; });
process.on('SIGTERM', () => { stopping = true; });

function failureCode(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  if (message.startsWith('media_tool_exit_')) return 'media_tool_failed';
  if (/ffmpeg_missing|ffprobe_missing|video_stream_missing|video_duration_invalid|source_object_empty/.test(message)) {
    return message.split(':')[0];
  }
  if (/lease/i.test(message)) return 'lease_lost';
  return 'video_processing_failed';
}

async function runAsset(asset: VideoAsset) {
  const startedAt = Date.now();
  const heartbeat = setInterval(() => {
    void heartbeatVideoAsset(asset).catch(() => {
      // markReady is conditional on the same lease token, so a lost lease cannot publish.
    });
  }, 5 * 60_000);
  try {
    const result = await processVideo(asset.source_key);
    await markVideoAssetReady(asset, result);
    console.info('[video-worker] ready', { seconds: Math.round((Date.now() - startedAt) / 1000) });
  } catch (cause) {
    const code = failureCode(cause);
    await markVideoAssetFailed(asset, code);
    console.error('[video-worker] failed', { code, seconds: Math.round((Date.now() - startedAt) / 1000) });
  } finally {
    clearInterval(heartbeat);
  }
}

async function loop() {
  while (!stopping) {
    try {
      const asset = await claimVideoAsset(selectedKey);
      if (asset) {
        await runAsset(asset);
        if (once) return;
      } else {
        if (once) return;
        await sleep(3000);
      }
    } catch (cause) {
      console.error('[video-worker] queue unavailable', {
        code: failureCode(cause),
      });
      if (once) throw cause;
      await sleep(10_000);
    }
  }
}

void Promise.all(Array.from({ length: once ? 1 : concurrency }, () => loop())).catch(error => {
  console.error('[video-worker] stopped', { code: failureCode(error) });
  process.exitCode = 1;
});
