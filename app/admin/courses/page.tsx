'use client';

import { useState } from 'react';
import { CourseManagement } from '@/components/admin/CourseManagement';
import { StudentApprovalPage } from '@/components/admin/StudentApprovalPage';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PermissionProvider } from '@/contexts/PermissionContext';

export default function CoursesPage() {
  const [showApprovalPage, setShowApprovalPage] = useState(false);

  return (
    <PermissionProvider>
      <AdminLayout>
        {showApprovalPage ? (
          <ProtectedRoute allowedRoles={['admin']}>
            <StudentApprovalPage onBack={() => setShowApprovalPage(false)} />
          </ProtectedRoute>
        ) : (
          <ProtectedRoute requiredPermission="view_courses">
            <CourseManagement onNavigateToApproval={() => setShowApprovalPage(true)} />
          </ProtectedRoute>
        )}
      </AdminLayout>
    </PermissionProvider>
  );
}
