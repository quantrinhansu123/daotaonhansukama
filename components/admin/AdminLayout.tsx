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
  Users,
  BookOpen,
  Building2,
  LogOut,
  GraduationCap,
  FolderKanban,
  ChevronLeft,
  ChevronRight,
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
  const [departments, setDepartments] = useState<Array<{ id: string; managerId?: string }>>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);

  useEffect(() => {
    const loadDepartments = async () => {
      const snapshot = await getDocs(collection(db, 'departments'));
      setDepartments(snapshot.docs.map((docSnap) => ({ id: docSnap.id, managerId: docSnap.data().managerId })));
    };
    void loadDepartments();
  }, []);

  const isManager = departments.some((d) => d.managerId === userProfile?.uid);
  void isManager;

  const handleSignOut = async () => {
    await signOut();
    router.push('/');
  };

  const menuItems = [
    {
      id: 'learning',
      label: t('admin.menu.learning'),
      icon: GraduationCap,
      href: '/student',
      permission: null,
      hideForStaff: false,
      hideForAdmin: false,
    },
    {
      id: 'users',
      label: t('admin.menu.users'),
      icon: Users,
      href: '/admin/users',
      permission: 'view_users' as const,
      hideForStaff: false,
    },
    {
      id: 'courses',
      label: t('admin.menu.courses'),
      icon: BookOpen,
      href: '/admin/courses',
      permission: 'view_courses' as const,
      hideForStaff: false,
    },
    {
      id: 'departments',
      label: t('admin.menu.departments'),
      icon: Building2,
      href: '/admin/departments',
      permission: 'view_departments' as const,
      hideForStaff: false,
    },
    {
      id: 'projects',
      label: t('admin.menu.projects'),
      icon: FolderKanban,
      href: '/admin/projects',
      permission: 'view_projects' as const,
      hideForStaff: false,
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

  const navClass = (active: boolean) =>
    `flex min-h-[44px] w-full items-center gap-2.5 whitespace-nowrap rounded-md px-2.5 text-left text-[15px] font-extrabold leading-none transition-colors ${
      active
        ? 'bg-[#18701C] text-white shadow-[inset_3px_0_#EDB409]'
        : 'text-[#e4f5e8] hover:bg-[#18701C]/45'
    }`;

  return (
    <div className="flex min-h-screen bg-white font-sans text-[#111b38]">
      <aside
        className={`fixed z-50 flex h-screen flex-col bg-gradient-to-b from-[#0a2f12] via-[#0f3d18] to-[#145616] text-[#eef8ef] transition-all duration-300 ${
          sidebarOpen ? 'w-[268px]' : 'w-20'
        }`}
      >
        <div className="relative flex h-[72px] shrink-0 items-center justify-center bg-white px-2">
          {sidebarOpen ? (
            <img src="/logo.png" alt="BioKama" className="h-12 w-auto max-w-[168px] object-contain" />
          ) : (
            <img src="/logo.png" alt="BioKama" className="h-8 w-auto max-w-[52px] object-contain" />
          )}
          <button
            type="button"
            onClick={() => setSidebarOpen((open) => !open)}
            className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[#0f3d18] hover:bg-[#e8f5ea]"
            title={sidebarOpen ? 'Thu gọn' : 'Mở rộng'}
          >
            {sidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-2">
          {menuItems.map((item) => {
            const isAdmin = userProfile?.role === 'admin';
            const isStaff = userProfile?.role === 'staff';
            const isDeptManager = userProfile?.position === 'Trưởng phòng';

            if ('hidden' in item && item.hidden) return null;
            if (isAdmin && 'hideForAdmin' in item && item.hideForAdmin) return null;
            if (isStaff && item.hideForStaff) return null;
            if (isDeptManager && 'hideForManager' in item && item.hideForManager) return null;
            if (!isAdmin && item.permission && !hasPermission(item.permission)) return null;

            const Icon = item.icon;
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.id}
                href={item.href}
                className={navClass(isActive)}
                title={!sidebarOpen ? item.label : undefined}
              >
                <Icon size={18} className="shrink-0" />
                {sidebarOpen && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/15 px-2.5 py-3">
          {sidebarOpen ? (
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="mb-2 w-full rounded-md bg-[#0c3a16]/80 p-3 text-left ring-1 ring-white/10 transition hover:bg-[#0c3a16]"
            >
              <div className="flex items-center gap-2.5">
                {userProfile?.photoURL ? (
                  <img
                    src={proxyBunnyUrl(userProfile.photoURL)}
                    alt={userProfile.displayName}
                    className="h-9 w-9 rounded-full object-cover ring-2 ring-[#1B7A1E]"
                  />
                ) : (
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-[#1B7A1E] text-sm font-bold text-white">
                    {userProfile?.displayName?.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold text-white">{userProfile?.displayName}</p>
                  <p className="truncate text-[11px] text-[#c5e6cc]">{userProfile?.email}</p>
                </div>
              </div>
              {userProfile?.position && (
                <p className="mt-2 rounded bg-white/10 px-2 py-1 text-center text-[11px] font-semibold text-[#c5e6cc]">
                  {positionLabel(userProfile.position)}
                </p>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="mb-2 flex w-full justify-center"
            >
              {userProfile?.photoURL ? (
                <img
                  src={proxyBunnyUrl(userProfile.photoURL)}
                  alt={userProfile.displayName}
                  className="h-9 w-9 rounded-full object-cover ring-2 ring-[#1B7A1E]"
                />
              ) : (
                <div className="grid h-9 w-9 place-items-center rounded-full bg-[#1B7A1E] text-sm font-bold text-white">
                  {userProfile?.displayName?.charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          )}

          <div className={`mb-2 flex ${sidebarOpen ? 'justify-stretch' : 'justify-center'}`}>
            <LanguageSwitcher variant="sidebar" className={sidebarOpen ? 'w-full justify-center' : '!px-2'} />
          </div>

          <button
            type="button"
            onClick={handleSignOut}
            className={navClass(false).replace('hover:bg-[#18701C]/45', 'hover:bg-red-500/20 hover:text-red-200')}
            title={!sidebarOpen ? t('admin.logout') : undefined}
          >
            <LogOut size={18} className="shrink-0" />
            {sidebarOpen && <span>{t('admin.logout')}</span>}
          </button>
        </div>
      </aside>

      <main className={`min-w-0 flex-1 overflow-auto transition-all duration-300 ${sidebarOpen ? 'ml-[268px]' : 'ml-20'}`}>
        {children}
      </main>

      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
    </div>
  );
};
