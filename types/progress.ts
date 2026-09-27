/**
 * Interface cho tiến độ học bài
 * Collection: 'progress' trong Firestore
 * 
 * Mỗi bản ghi đại diện cho tiến độ của một user trên một lesson cụ thể
 * ID format: `${userId}_${lessonId}`
 */
export interface LessonProgress {
  id: string;
  userId: string;
  courseId: string;
  lessonId: string;
  watchedSeconds: number; // Số giây đã xem
  totalSeconds: number;   // Tổng số giây của video
  viewedSeconds?: number; // Số giây thực sự đã phát, không tính đoạn tua qua
  watchedRanges?: Array<{ start: number; end: number }>;
  completed: boolean;     // Đã hoàn thành hay chưa
  lastWatchedAt: Date;    // Thời gian xem gần nhất
}
