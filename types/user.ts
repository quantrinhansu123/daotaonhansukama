export type UserRole = 'admin' | 'staff' | 'teacher' | 'student';

export type Position = 
  | 'Nhân viên'
  | 'Trưởng nhóm'
  | 'Phó phòng'
  | 'Trưởng phòng'
  | 'Phó giám đốc'
  | 'Giám đốc';

// Thông tin employment đồng bộ từ hệ thống chấm công/nhân sự bên ngoài
export interface EmploymentInfo {
  id: string;
  fullName: string;
  email: string;
  password?: string; // Mật khẩu từ hệ thống nhân sự
  phone?: string;
  department?: string;
  position?: string;
  team?: string;
  branch?: string;
  country?: string;
  active?: boolean;
  birthday?: string;
  startDate?: string;
  employmentStatus?: string;
  maritalStatus?: string;
  baseSalary?: number;
  salaryPercentage?: number;
  avatarURL?: string;
  address?: string;
}

export interface UserProfile {
  uid: string;
  email: string;
  password?: string; // Chỉ có trong dữ liệu cũ, sẽ xóa sau khi chuyển sang Firebase Auth.
  displayName: string;
  role: UserRole;
  position?: Position; // Chức vụ
  departmentId?: string; // ID phòng ban
  monthlySalary?: number; // Lương tháng cơ bản
  totalLearningHours?: number; // Tổng số giờ đã học
  approved: boolean; // Trạng thái duyệt tài khoản (mặc định false)
  photoURL?: string; // URL ảnh đại diện
  // Thông tin cá nhân
  dateOfBirth?: string; // Ngày sinh (YYYY-MM-DD)
  address?: string; // Địa chỉ
  country?: string; // Quốc gia
  phoneNumber?: string; // Số điện thoại
  workLocation?: string; // Vị trí học việc/làm việc

   // Một số field nhân sự được tách riêng để dễ lọc / sửa trên LMS
   employmentStatus?: string; // Trạng thái làm việc (VD: Intern, Chính thức)
   employmentStartDate?: string; // Ngày bắt đầu làm (YYYY-MM-DD)
   employmentMaritalStatus?: string; // Tình trạng hôn nhân
   employmentBranch?: string; // Chi nhánh (Hà Nội, HCM, ...)
   employmentTeam?: string; // Team trực thuộc
   employmentSalaryPercentage?: number; // % lương
   employmentActive?: boolean; // Đang active trong hệ thống nhân sự

  createdAt: Date;
  updatedAt: Date;

  // Thông tin employment đồng bộ từ hệ thống khác (optional)
  employment?: EmploymentInfo;

  // Dự án
  projects?: string[]; // Array of project IDs
  projectNames?: string[]; // Array of project names for display
  docId?: string; // Firestore document ID
}
