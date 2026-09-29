export type PermissionAction = 
  | 'view_dashboard'
  | 'view_users'
  | 'manage_users'
  | 'view_courses'
  | 'manage_courses'
  | 'view_departments'
  | 'manage_departments'
  | 'view_projects'
  | 'manage_projects'
  | 'view_salary'
  | 'manage_salary'
  | 'view_own_department'
  | 'manage_own_department';

export interface Permission {
  id: string;
  name: string;
  description: string;
  action: PermissionAction;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: PermissionAction[];
  departmentId?: string; // Nếu có thì chỉ áp dụng cho phòng ban này
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPermission {
  userId: string;
  roleId: string;
  departmentId?: string;
  customPermissions?: PermissionAction[]; // Quyền tùy chỉnh riêng
}

// Predefined permissions
export const PERMISSIONS: Permission[] = [
  { id: 'p1', name: 'Xem Dashboard', description: 'Xem trang tổng quan', action: 'view_dashboard' },
  { id: 'p2', name: 'Xem người dùng', description: 'Xem danh sách người dùng', action: 'view_users' },
  { id: 'p3', name: 'Quản lý người dùng', description: 'Thêm, sửa, xóa người dùng', action: 'manage_users' },
  { id: 'p4', name: 'Xem khóa học', description: 'Xem danh sách khóa học', action: 'view_courses' },
  { id: 'p5', name: 'Quản lý khóa học', description: 'Thêm, sửa, xóa khóa học', action: 'manage_courses' },
  { id: 'p6', name: 'Xem phòng ban', description: 'Xem danh sách phòng ban', action: 'view_departments' },
  { id: 'p7', name: 'Quản lý phòng ban', description: 'Thêm, sửa, xóa phòng ban', action: 'manage_departments' },
  { id: 'p12', name: 'Xem Project', description: 'Xem danh sách project', action: 'view_projects' },
  { id: 'p13', name: 'Quản lý Project', description: 'Thêm, sửa, xóa project', action: 'manage_projects' },
  { id: 'p8', name: 'Xem lương', description: 'Xem bảng lương', action: 'view_salary' },
  { id: 'p9', name: 'Quản lý lương', description: 'Tính lương, chỉnh sửa', action: 'manage_salary' },
  { id: 'p10', name: 'Xem phòng ban của mình', description: 'Chỉ xem phòng ban mình thuộc về', action: 'view_own_department' },
  { id: 'p11', name: 'Quản lý phòng ban của mình', description: 'Quản lý nhân viên trong phòng ban', action: 'manage_own_department' },
];

// Predefined roles
export const DEFAULT_ROLES = {
  ADMIN: {
    name: 'Admin',
    // Admin có toàn bộ quyền trong hệ thống
    permissions: PERMISSIONS.map((p) => p.action) as PermissionAction[]
  },
  MANAGER: {
    name: 'Trưởng phòng',
    permissions: [
      'view_dashboard',
      'view_users',
      'view_courses',
      'view_own_department',
      'manage_own_department',
      'view_salary'
    ] as PermissionAction[]
  },
  STAFF: {
    name: 'Nhân viên',
    permissions: [] as PermissionAction[] // Staff không có quyền mặc định, chỉ có quyền từ phòng ban
  }
};
