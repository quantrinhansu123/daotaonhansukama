'use client';

import { UserManagement } from '@/components/admin/UserManagement';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PermissionProvider } from '@/contexts/PermissionContext';

export default function UsersPage() {
  return (
    <PermissionProvider>
      <AdminLayout>
        <ProtectedRoute requiredPermission="view_users">
          <UserManagement />
        </ProtectedRoute>
      </AdminLayout>
    </PermissionProvider>
  );
}
