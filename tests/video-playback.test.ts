import assert from 'node:assert/strict';
import test from 'node:test';
import { attachVideoPlayback } from '../lib/video-playback';
import type { VideoPlaybackError } from '../lib/video-errors';

class MediaElement extends EventTarget {
  src = '';
  currentSrc = '';
  preload = '';
  poster = '';
  paused = true;
  ended = false;
  duration = 60;
  currentTime = 0;
  readyState = 0;
  loads = 0;
  pause() { this.paused = true; }
  load() { this.loads++; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  canPlayType() { return ''; }
  asVideo() { return this as unknown as HTMLVideoElement; }
}

const source = { status: 'legacy' as const, url: 'https://media.example/source.mp4', expiresAt: Date.now() + 60_000 };
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

test('direct MP4 stays usable and canplay cancels the startup deadline', async () => {
  const video = new MediaElement();
  const failures: VideoPlaybackError[] = [];
  const handle = await attachVideoPlayback(video.asVideo(), source, {
    startupTimeoutMs: 15, onPlaybackError: issue => { if (issue) failures.push(issue); },
  });
  assert.equal(video.src, source.url);
  video.dispatchEvent(new Event('canplay'));
  await delay(30);
  assert.deepEqual(failures, []);
  handle.destroy();
});

test('a source that never becomes playable reports one bounded timeout', async () => {
  const video = new MediaElement();
  const failures: VideoPlaybackError[] = [];
  const handle = await attachVideoPlayback(video.asVideo(), source, {
    startupTimeoutMs: 10, onPlaybackError: issue => { if (issue) failures.push(issue); },
  });
  await delay(25);
  video.dispatchEvent(new Event('error'));
  assert.deepEqual(failures, [{ kind: 'timeout' }]);
  handle.destroy();
});

test('aborting playback clears the source, deadline and error listener', async () => {
  const video = new MediaElement(), controller = new AbortController();
  let errors = 0;
  const handle = await attachVideoPlayback(video.asVideo(), source, {
    signal: controller.signal, startupTimeoutMs: 10, onPlaybackError: () => errors++,
  });
  controller.abort();
  video.dispatchEvent(new Event('error'));
  await delay(25);
  assert.equal(video.src, '');
  assert.equal(errors, 0);
  handle.destroy();
});

test('an unsupported HLS-only source is not assigned as a fake MP4 fallback', async () => {
  const video = new MediaElement();
  const failures: VideoPlaybackError[] = [];
  const playlist = '/api/bunny/cdn/video/playlist.m3u8';
  const handle = await attachVideoPlayback(video.asVideo(), { ...source, url: playlist, hlsUrl: playlist }, {
    onPlaybackError: issue => { if (issue) failures.push(issue); },
  });
  assert.equal(video.src, '');
  assert.deepEqual(failures, [{ kind: 'unsupported' }]);
  handle.destroy();
});

test('metadata-only prewarming does not require a canplay event', async () => {
  const video = new MediaElement();
  let errors = 0;
  const handle = await attachVideoPlayback(video.asVideo(), source, {
    prewarm: true, startupTimeoutMs: 10, onPlaybackError: () => errors++,
  });
  video.dispatchEvent(new Event('loadedmetadata'));
  await delay(25);
  assert.equal(errors, 0);
  handle.destroy();
});

test('an already loaded source is reused without a new startup failure', async () => {
  const video = new MediaElement();
  video.src = source.url;
  video.readyState = 4;
  let errors = 0;
  const handle = await attachVideoPlayback(video.asVideo(), source, {
    startupTimeoutMs: 10, onPlaybackError: () => errors++,
  });
  await delay(25);
  assert.equal(video.loads, 0);
  assert.equal(errors, 0);
  handle.destroy();
});
