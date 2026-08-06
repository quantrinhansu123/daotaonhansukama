"use client";

import React, { useContext } from 'react';
import { PermissionContext } from '@/contexts/PermissionContext';
import { PermissionAction } from '@/types/permission';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { UserRole } from '@/types/user';
import { Lock } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
  requiredPermission?: PermissionAction;
  requiredPermissions?: PermissionAction[];
  requireAll?: boolean; // true = cần tất cả quyền, false = chỉ cần 1 quyền
  fallback?: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  children,
  allowedRoles,
  requiredPermission,
  requiredPermissions,
  requireAll = false,
  fallback
}) => {
  const permCtx = useContext(PermissionContext);
  const hasPermission = permCtx?.hasPermission ?? (() => false);
  const hasAnyPermission = permCtx?.hasAnyPermission ?? (() => false);
  const hasAllPermissions = permCtx?.hasAllPermissions ?? (() => false);
  const permLoading = permCtx?.loading ?? false;
  const { userProfile, loading: authLoading } = useAuth();
  const { t, dateLocale } = useLanguage();

  const loading = permLoading || authLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">{t('common.checkingPermission')}</p>
        </div>
      </div>
    );
  }

  // Check allowed roles first (if provided)
  if (allowedRoles && (!userProfile || !allowedRoles.includes(userProfile.role))) {
    return fallback || <NoPermissionFallback />;
  }

  // Check single permission
  if (requiredPermission && !hasPermission(requiredPermission)) {
    return fallback || <NoPermissionFallback />;
  }

  // Check multiple permissions
  if (requiredPermissions) {
    const hasAccess = requireAll
      ? hasAllPermissions(requiredPermissions)
      : hasAnyPermission(requiredPermissions);

    if (!hasAccess) {
      return fallback || <NoPermissionFallback />;
    }
  }

  return <>{children}</>;
};

const NoPermissionFallback: React.FC = () => {
  const { t } = useLanguage();
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
          <Lock className="w-8 h-8 text-red-600" />
        </div>
        <h3 className="text-xl font-bold text-slate-900 mb-2">{t('shared.noPermissionTitle')}</h3>
        <p className="text-slate-600 mb-4">
          {t('shared.noPermissionDesc')}
          <br />
          {t('shared.contactAdminForPermission')}
        </p>
      </div>
    </div>
  );
};
