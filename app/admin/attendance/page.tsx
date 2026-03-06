'use client';

import { AttendanceManagement } from '@/components/admin/AttendanceManagement';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PermissionProvider } from '@/contexts/PermissionContext';

export default function AttendancePage() {
  return (
    <PermissionProvider>
      <AdminLayout>
        <ProtectedRoute requiredPermission="view_salary">
          <AttendanceManagement />
        </ProtectedRoute>
      </AdminLayout>
    </PermissionProvider>
  );
}
