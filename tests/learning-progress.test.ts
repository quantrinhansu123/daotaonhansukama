import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLessonCompletionPercent,
  getVideoPoints,
  getViewedSeconds,
  mergeWatchedRanges,
  VIDEO_COMPLETION_RATIO,
} from '../lib/learning-progress';

test('counts only video ranges actually played and merges repeat views', () => {
  const ranges = mergeWatchedRanges([
    { start: 0, end: 50 },
    { start: 40, end: 75 },
    { start: 0, end: 50 },
    { start: 80, end: 95 },
  ], 100);
  assert.deepEqual(ranges, [{ start: 0, end: 75 }, { start: 80, end: 95 }]);
  assert.equal(getViewedSeconds(ranges), 90);
  assert.equal(getViewedSeconds(ranges) / 100 >= VIDEO_COMPLETION_RATIO, true);
});

test('a seek to the end cannot complete a video', () => {
  const ranges = mergeWatchedRanges([{ start: 90, end: 100 }], 100);
  assert.equal(getViewedSeconds(ranges), 10);
  assert.equal(getViewedSeconds(ranges) / 100 >= VIDEO_COMPLETION_RATIO, false);
  assert.equal(getLessonCompletionPercent({ viewedSeconds: 10, watchedSeconds: 100, totalSeconds: 100 }), 10);
});

test('completed lessons earn points once even with duplicate records', () => {
  assert.equal(getVideoPoints([
    { lessonId: 'a', completed: true },
    { lessonId: 'a', completed: true },
    { lessonId: 'b', completed: true },
    { lessonId: 'c', completed: false },
  ]), 20);
});
