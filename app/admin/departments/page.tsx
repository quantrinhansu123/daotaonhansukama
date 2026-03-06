'use client';

import { DepartmentManagement } from '@/components/admin/DepartmentManagement';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PermissionProvider } from '@/contexts/PermissionContext';

export default function DepartmentsPage() {
  return (
    <PermissionProvider>
      <AdminLayout>
        <ProtectedRoute requiredPermission="view_departments">
          <DepartmentManagement />
        </ProtectedRoute>
      </AdminLayout>
    </PermissionProvider>
  );
}
