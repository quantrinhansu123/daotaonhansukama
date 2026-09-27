'use client';

import { CourseEnrollment } from '@/components/student/CourseEnrollment';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PermissionProvider } from '@/contexts/PermissionContext';

export default function LearningPage() {
  return (
    <PermissionProvider>
      <AdminLayout>
        <div className="min-h-screen bg-[#080d19] p-6 sm:p-8">
          <h1 className="text-3xl font-semibold text-white mb-6">Học bài</h1>
          <CourseEnrollment />
        </div>
      </AdminLayout>
    </PermissionProvider>
  );
}
