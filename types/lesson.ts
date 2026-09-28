export interface Lesson {
  id: string;
  courseId: string;
  title: string;
  description: string;
  order: number;
  videoId?: string; // Mã video cũ, giữ để biết video nào cần tải lại
  videoUrl?: string; // URL video cũ
  videoKey?: string; // Object key của video trên CloudFly
  duration?: number; // seconds
  documentUrl?: string; // URL tài liệu (PDF, DOC, etc)
  documentName?: string;
  hasQuiz?: boolean; // Có bài kiểm tra không
  quizDuration?: number; // Thời gian làm bài (phút)
  quizDocumentUrl?: string; // Tài liệu đính kèm cho bài kiểm tra
  quizDocumentName?: string; // Tên file tài liệu kiểm tra
  tags?: string[]; // Tags cho bài học (ví dụ: ['cơ bản', 'quan trọng', 'nâng cao'])
  createdAt: Date;
  updatedAt: Date;
}

export interface Question {
  id: string;
  lessonId: string;
  question: string;
  options: string[]; // 4 đáp án
  correctAnswer: number; // Index của đáp án đúng (0-3)
  order: number;
  createdAt: Date;
}

export interface QuizResult {
  id: string;
  userId: string;
  userName?: string; // Tên giáo viên
  userEmail?: string; // Email giáo viên
  lessonId: string;
  courseId: string;
  answers: number[]; // Đáp án của giáo viên
  correctCount: number;
  totalQuestions: number;
  score: number; // Điểm (0-100)
  timeSpent?: number; // Thời gian làm bài (giây)
  completedAt: Date;
}
