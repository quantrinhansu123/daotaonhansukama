'use client';

import { ProjectManagement } from '@/components/admin/ProjectManagement';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PermissionProvider } from '@/contexts/PermissionContext';

export default function ProjectsPage() {
  return (
    <PermissionProvider>
      <AdminLayout>
        <ProtectedRoute requiredPermission="view_projects">
          <ProjectManagement />
        </ProtectedRoute>
      </AdminLayout>
    </PermissionProvider>
  );
}
