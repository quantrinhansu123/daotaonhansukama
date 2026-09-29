'use client';

import { SalaryManagementNew } from '@/components/admin/SalaryManagementNew';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PermissionProvider } from '@/contexts/PermissionContext';

export default function SalaryPage() {
  return (
    <PermissionProvider>
      <AdminLayout>
        <ProtectedRoute requiredPermission="view_salary">
          <SalaryManagementNew />
        </ProtectedRoute>
      </AdminLayout>
    </PermissionProvider>
  );
}
