'use client';

import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useRouter } from 'next/navigation';
import { DashboardSimple } from '@/components/admin/DashboardSimple';
import { ProtectedRoute } from '@/components/shared/ProtectedRoute';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { PermissionProvider } from '@/contexts/PermissionContext';

export default function AdminPage() {
  const { userProfile, loading } = useAuth();
  const { t, dateLocale } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (!loading && userProfile) {
      // Redirect staff to learning page, admin to dashboard
      if (userProfile.role === 'staff') {
        router.replace('/admin/learning');
      } else if (userProfile.role === 'admin') {
        // Already on dashboard, no redirect needed
      } else {
        router.push('/');
      }
    } else if (!loading && !userProfile) {
      router.push('/');
    }
  }, [userProfile, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!userProfile || (userProfile.role !== 'admin' && userProfile.role !== 'staff')) {
    return null;
  }

  return (
    <PermissionProvider>
      <AdminLayout>
        <ProtectedRoute requiredPermission="view_dashboard">
          <DashboardSimple />
        </ProtectedRoute>
      </AdminLayout>
    </PermissionProvider>
  );
}
