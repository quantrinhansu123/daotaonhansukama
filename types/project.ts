export interface Project {
  id: string;
  name: string;
  description?: string;
  status: 'planning' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  managerId?: string; // User ID của project manager
  managerName?: string;
  departmentId?: string; // Phòng ban phụ trách
  departmentName?: string;
  members?: string[]; // Array of user IDs
  memberNames?: string[]; // Array of user names
  budget?: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

export type ProjectStatus = 'planning' | 'in_progress' | 'completed' | 'on_hold' | 'cancelled';
export type ProjectPriority = 'low' | 'medium' | 'high' | 'urgent';
