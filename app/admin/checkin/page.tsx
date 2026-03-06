'use client';

import { StaffCheckIn } from '@/components/staff/StaffCheckIn';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PermissionProvider } from '@/contexts/PermissionContext';

export default function CheckInPage() {
  return (
    <PermissionProvider>
      <AdminLayout>
        <StaffCheckIn />
      </AdminLayout>
    </PermissionProvider>
  );
}
