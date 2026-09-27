export interface WatchedRange {
  start: number;
  end: number;
}

export const VIDEO_POINTS_PER_LESSON = 10;
export const VIDEO_COMPLETION_RATIO = 0.9;

export function mergeWatchedRanges(ranges: WatchedRange[], duration: number): WatchedRange[] {
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const sorted = ranges
    .filter(range => Number.isFinite(range.start) && Number.isFinite(range.end))
    .map(range => ({
      start: Math.max(0, Math.min(duration, range.start)),
      end: Math.max(0, Math.min(duration, range.end)),
    }))
    .filter(range => range.end > range.start)
    .sort((a, b) => a.start - b.start);

  const merged: WatchedRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export function getViewedSeconds(ranges: WatchedRange[]): number {
  return ranges.reduce((total, range) => total + range.end - range.start, 0);
}

export function getVideoPoints(progress: Array<{ lessonId: string; completed: boolean }>): number {
  return new Set(progress.filter(item => item.completed && item.lessonId).map(item => item.lessonId)).size
    * VIDEO_POINTS_PER_LESSON;
}

export function getLessonCompletionPercent(progress: {
  viewedSeconds?: number;
  watchedSeconds: number;
  totalSeconds: number;
}): number {
  if (!Number.isFinite(progress.totalSeconds) || progress.totalSeconds <= 0) return 0;
  const seconds = progress.viewedSeconds ?? progress.watchedSeconds;
  return Math.max(0, Math.min(100, (seconds / progress.totalSeconds) * 100));
}
