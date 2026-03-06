'use client';

import { CourseEnrollment } from '@/components/student/CourseEnrollment';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PermissionProvider } from '@/contexts/PermissionContext';

export default function LearningPage() {
  return (
    <PermissionProvider>
      <AdminLayout>
        <div className="p-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-6">Học bài</h1>
          <CourseEnrollment />
        </div>
      </AdminLayout>
    </PermissionProvider>
  );
}
