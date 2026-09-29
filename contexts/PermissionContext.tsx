'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { PermissionAction, DEFAULT_ROLES, PERMISSIONS } from '@/types/permission';
import { collection, getDocs, query, where } from '@/lib/data-store';
import { db } from '@/lib/data-store';

const ALL_PERMISSIONS = PERMISSIONS.map((p) => p.action);

interface PermissionContextType {
  permissions: PermissionAction[];
  hasPermission: (action: PermissionAction) => boolean;
  hasAnyPermission: (actions: PermissionAction[]) => boolean;
  hasAllPermissions: (actions: PermissionAction[]) => boolean;
  loading: boolean;
}

export const PermissionContext = createContext<PermissionContextType | undefined>(undefined);

export const PermissionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { userProfile } = useAuth();
  const [permissions, setPermissions] = useState<PermissionAction[]>([]);
  const [loading, setLoading] = useState(true);
  const isAdmin = userProfile?.role === 'admin';

  useEffect(() => {
    loadPermissions();
  }, [userProfile]);

  const loadPermissions = async () => {
    try {
      setLoading(true);

      if (!userProfile) {
        setPermissions([]);
        return;
      }

      // Admin có tất cả quyền — nhìn và thao tác hết mọi mục
      if (userProfile.role === 'admin') {
        setPermissions(ALL_PERMISSIONS);
        return;
      }

      if (userProfile.role === 'staff' && userProfile.departmentId && ['Trưởng phòng', 'Phó phòng', 'TrÆ°á»Ÿng phÃ²ng', 'PhÃ³ phÃ²ng'].includes(userProfile.position || '')) {
        setPermissions([...DEFAULT_ROLES.MANAGER.permissions, 'manage_courses']);
        return;
      }

      // Staff: Load permissions từ phòng ban
      if (userProfile.role === 'staff') {
        // ✅ CÁCH ĐƠN GIẢN: Kiểm tra position trước (không cần query Firestore)
        if (userProfile.position === 'Trưởng phòng' && userProfile.departmentId) {
          // Trưởng phòng tự động có quyền manager
          setPermissions(DEFAULT_ROLES.MANAGER.permissions);
          return;
        }

        // Staff thường: Load permissions từ phòng ban
        if (userProfile.departmentId) {
          const deptSnapshot = await getDocs(
            query(collection(db, 'departments'), where('__name__', '==', userProfile.departmentId))
          );
          
          if (!deptSnapshot.empty) {
            const deptData = deptSnapshot.docs[0].data();
            const deptPermissions = deptData.permissions || [];

            // Staff: Chỉ có quyền của phòng ban
            setPermissions(deptPermissions);
            return;
          }
        }
        
        // Staff không có phòng ban hoặc phòng ban không tồn tại → Không có quyền gì
        setPermissions([]);
        return;
      }

      // Default: no permissions
      setPermissions([]);
    } catch (error) {
      console.error('Error loading permissions:', error);
      setPermissions([]);
    } finally {
      setLoading(false);
    }
  };

  const hasPermission = (action: PermissionAction): boolean => {
    if (isAdmin) return true;
    return permissions.includes(action);
  };

  const hasAnyPermission = (actions: PermissionAction[]): boolean => {
    if (isAdmin) return true;
    return actions.some(action => permissions.includes(action));
  };

  const hasAllPermissions = (actions: PermissionAction[]): boolean => {
    if (isAdmin) return true;
    return actions.every(action => permissions.includes(action));
  };

  return (
    <PermissionContext.Provider
      value={{
        permissions,
        hasPermission,
        hasAnyPermission,
        hasAllPermissions,
        loading
      }}
    >
      {children}
    </PermissionContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionContext);
  if (context === undefined) {
    throw new Error('usePermissions must be used within a PermissionProvider');
  }
  return context;
};
