export interface Course {
  id: string;
  title: string;
  description: string;
  teacherId: string;
  teacherName: string;
  category: string;
  level: 'beginner' | 'intermediate' | 'advanced';
  duration: number; // số giờ
  price: number;
  thumbnail: string;
  banner?: string; // Banner ảnh hiển thị ở đầu trang chi tiết khóa học
  demoVideoId?: string; // Bunny Stream video ID cho video demo
  departmentId?: string; // Phòng ban được xem khóa học này ('all' = chung, undefined = không ai, hoặc ID phòng ban cụ thể)
  students: string[]; // Danh sách UID học viên được tự động cập nhật dựa trên departmentId
  pendingStudents?: string[]; // Danh sách UID học viên chờ phê duyệt
  projects?: string[]; // Danh sách ID dự án liên quan đến khóa học này
  projectNames?: string[]; // Tên dự án để hiển thị (không lưu vào DB)
  createdAt: Date;
  updatedAt: Date;
}
