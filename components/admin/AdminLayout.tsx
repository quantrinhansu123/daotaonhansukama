'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { collection, getDocs } from '@/lib/data-store';
import { db } from '@/lib/data-store';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { proxyBunnyUrl } from '@/lib/bunny-media';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  Building2,
  LogOut,
  Menu,
  X,
  GraduationCap,
  Clock,
  Fingerprint,
  FolderKanban
} from 'lucide-react';
import { ProfileModal } from '@/components/ProfileModal';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface AdminLayoutProps {
  children: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const { userProfile, signOut } = useAuth();
  const { hasPermission } = usePermissions();
  const { t } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [departments, setDepartments] = useState<Array<{ id: string, managerId?: string }>>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    const loadDepartments = async () => {
      const snapshot = await getDocs(collection(db, 'departments'));
      setDepartments(snapshot.docs.map(doc => ({ id: doc.id, managerId: doc.data().managerId })));
    };
    loadDepartments();
  }, []);

  const isManager = departments.some(d => d.managerId === userProfile?.uid);
  void isManager;

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const menuItems = [
    {
      id: 'checkin',
      label: t('admin.menu.checkin'),
      icon: Fingerprint,
      href: '/admin/checkin',
      permission: null,
      hideForStaff: false,
      hideForAdmin: true,
      hidden: true
    },
    {
      id: 'dashboard',
      label: t('admin.menu.dashboard'),
      icon: LayoutDashboard,
      href: '/admin',
      permission: 'view_dashboard' as const,
      hideForStaff: false,
      hideForManager: true
    },
    {
      id: 'learning',
      label: t('admin.menu.learning'),
      icon: GraduationCap,
      href: userProfile?.role === 'admin' ? '/student' : '/admin/learning',
      permission: null,
      hideForStaff: false,
      hideForAdmin: false
    },
    {
      id: 'users',
      label: t('admin.menu.users'),
      icon: Users,
      href: '/admin/users',
      permission: 'view_users' as const,
      hideForStaff: false
    },
    {
      id: 'courses',
      label: t('admin.menu.courses'),
      icon: BookOpen,
      href: '/admin/courses',
      permission: 'view_courses' as const,
      hideForStaff: false
    },
    {
      id: 'departments',
      label: t('admin.menu.departments'),
      icon: Building2,
      href: '/admin/departments',
      permission: 'view_departments' as const,
      hideForStaff: false
    },
    {
      id: 'projects',
      label: t('admin.menu.projects'),
      icon: FolderKanban,
      href: '/admin/projects',
      permission: 'view_projects' as const,
      hideForStaff: false
    },
    {
      id: 'attendance',
      label: t('admin.menu.attendance'),
      icon: Clock,
      href: '/admin/attendance',
      permission: 'view_salary' as const,
      hideForStaff: false,
      hidden: true
    },
  ];

  const positionLabel = (position?: string) => {
    if (!position) return '';
    const map: Record<string, string> = {
      'Nhân viên': t('admin.users.positions.staff'),
      'Trưởng nhóm': t('admin.users.positions.teamLead'),
      'Phó phòng': t('admin.users.positions.deputyManager'),
      'Trưởng phòng': t('admin.users.positions.manager'),
      'Phó giám đốc': t('admin.users.positions.deputyDirector'),
      'Giám đốc': t('admin.users.positions.director'),
    };
    return map[position] || position;
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className={`transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-20'} flex flex-col fixed h-screen z-50 bg-[#0a0814]/85 backdrop-blur-xl border-r border-white/[0.06]`}>
        {/* Logo */}
        <div className="p-4 flex items-center justify-between">
          {sidebarOpen ? (
            <>
              <div className="flex min-w-0 flex-1 items-center">
                <div className="flex h-12 min-w-0 flex-1 items-center justify-center rounded-xl bg-white px-2 shadow-lg border border-white/20">
                  <img src="/logo.png" alt="BioKama" className="h-8 w-auto max-w-full object-contain" />
                </div>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors text-slate-300">
                <X size={20} />
              </button>
            </>
          ) : (
            <button onClick={() => setSidebarOpen(true)} className="p-1 hover:bg-white/10 rounded-xl mx-auto transition-colors flex items-center justify-center">
              <div className="h-10 w-14 bg-white rounded-xl flex items-center justify-center px-1 shadow-md">
                <img src="/logo.png" alt="BioKama" className="h-7 w-auto max-w-full object-contain object-left" />
              </div>
            </button>
          )}
        </div>

        {/* Menu Items */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const isAdmin = userProfile?.role === 'admin';
            const isStaff = userProfile?.role === 'staff';
            const isManager = userProfile?.position === 'Trưởng phòng';

            if (item.hidden) {
              return null;
            }

            if (isAdmin && item.hideForAdmin) {
              return null;
            }
            if (isStaff && item.hideForStaff) {
              return null;
            }
            if (isManager && item.hideForManager) {
              return null;
            }

            if (item.permission && !hasPermission(item.permission)) {
              return null;
            }

            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href === '/admin' && pathname === '/admin');
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                  ? 'bg-[#1B7A1E] text-white shadow-lg shadow-[#1B7A1E]/20'
                  : 'text-slate-300 hover:text-white hover:bg-white/10'
                  }`}
                title={!sidebarOpen ? item.label : ''}
              >
                <Icon size={20} className={`flex-shrink-0 transition-transform ${isActive ? '' : 'group-hover:scale-110'}`} />
                {sidebarOpen && <span className="font-medium text-sm">{item.label}</span>}
                {isActive && sidebarOpen && (
                  <div className="ml-auto w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User Info */}
        <div className="p-3">
          {sidebarOpen ? (
            <button
              onClick={() => setShowProfileModal(true)}
              className="w-full mb-3 p-3 bg-white/5 rounded-xl border border-white/10 hover:bg-white/10 transition-all cursor-pointer group"
            >
              <div className="flex items-center gap-3 mb-2">
                {userProfile?.photoURL ? (
                  <img
                    src={proxyBunnyUrl(userProfile.photoURL)}
                    alt={userProfile.displayName}
                    className="w-10 h-10 rounded-full object-cover border-2 border-brand-500 shadow-md group-hover:border-brand-400 transition-all"
                  />
                ) : (
                  <div className="w-10 h-10 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white font-bold shadow-md group-hover:scale-105 transition-transform">
                    {userProfile?.displayName?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-white truncate group-hover:text-brand-300 transition-colors">{userProfile?.displayName}</p>
                  <p className="text-xs text-slate-400 truncate">{userProfile?.email}</p>
                </div>
              </div>
              {userProfile?.position && (
                <div className="px-2 py-1 bg-white/5 border border-white/10 rounded-lg group-hover:bg-white/10 transition-colors">
                  <p className="text-xs text-brand-300 text-center font-medium">{positionLabel(userProfile.position)}</p>
                </div>
              )}
            </button>
          ) : (
            <button
              onClick={() => setShowProfileModal(true)}
              className="mb-3 flex justify-center w-full hover:scale-105 transition-transform"
            >
              {userProfile?.photoURL ? (
                <img
                  src={proxyBunnyUrl(userProfile.photoURL)}
                  alt={userProfile.displayName}
                  className="w-10 h-10 rounded-full object-cover border-2 border-brand-500 shadow-md"
                />
              ) : (
                <div className="w-10 h-10 bg-gradient-to-br from-brand-400 to-brand-600 rounded-full flex items-center justify-center text-white font-bold shadow-md">
                  {userProfile?.displayName?.charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          )}
          {sidebarOpen && (
            <div className="mb-3 flex justify-center">
              <LanguageSwitcher variant="sidebar" className="w-full justify-center" />
            </div>
          )}
          {!sidebarOpen && (
            <div className="mb-3 flex justify-center">
              <LanguageSwitcher variant="sidebar" className="!px-2" />
            </div>
          )}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-300 hover:text-red-400 hover:bg-red-500/10 border border-transparent transition-all group"
            title={!sidebarOpen ? t('admin.logout') : ''}
          >
            <LogOut size={20} className="flex-shrink-0 group-hover:scale-110 transition-transform" />
            {sidebarOpen && <span className="font-medium text-sm">{t('admin.logout')}</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 overflow-auto transition-all duration-300 ${sidebarOpen ? 'ml-64' : 'ml-20'}`}>
        {children}
      </main>

      {/* Profile Modal */}
      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </div>
  );
};
