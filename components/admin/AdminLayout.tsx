'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
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
  GraduationCap,
  FolderKanban,
  Award,
  ClipboardCheck,
  Folder,
  BarChart3,
  BadgeCheck,
  Shield,
  List,
  Settings,
  Headphones,
  Search,
  Bell,
  ChevronDown,
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
  const [mobileNav, setMobileNav] = useState(false);
  const [departments, setDepartments] = useState<Array<{ id: string, managerId?: string }>>([]);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

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

  const showToast = (message: string) => {
    setToastMsg(message);
    window.setTimeout(() => setToastMsg(''), 2200);
  };

  const menuItems: Array<{
    id: string;
    label: string;
    icon: typeof LayoutDashboard;
    href?: string;
    permission?: 'view_dashboard' | 'view_users' | 'view_courses' | 'view_departments' | 'view_projects' | 'view_salary';
    section?: 'system';
  }> = [
    { id: 'dashboard', label: t('student.academy.overview'), icon: LayoutDashboard, href: '/admin', permission: 'view_dashboard' },
    { id: 'courses', label: t('student.academy.courses'), icon: BookOpen, href: '/admin/courses', permission: 'view_courses' },
    { id: 'learning', label: t('student.academy.navPrograms'), icon: GraduationCap, href: '/admin/learning' },
    { id: 'students', label: t('student.academy.navStudents'), icon: Users },
    { id: 'projects', label: t('student.academy.navProjects'), icon: FolderKanban, href: '/admin/projects', permission: 'view_projects' },
    { id: 'departments', label: t('student.academy.navDepartments'), icon: Building2, href: '/admin/departments', permission: 'view_departments' },
    { id: 'positions', label: t('student.academy.navPositions'), icon: Award },
    { id: 'assessment', label: t('student.academy.navAssessment'), icon: ClipboardCheck, href: '/admin/attendance', permission: 'view_salary' },
    { id: 'library', label: t('student.academy.navLibrary'), icon: Folder },
    { id: 'reports', label: t('student.academy.navReports'), icon: BarChart3 },
    { id: 'certificates', label: t('student.academy.navCertificates'), icon: BadgeCheck },
    { id: 'users', label: t('student.academy.navUsers'), icon: Users, href: '/admin/users', permission: 'view_users', section: 'system' },
    { id: 'permissions', label: t('student.academy.navPermissions'), icon: Shield, href: '/admin/departments', permission: 'view_departments', section: 'system' },
    { id: 'activity', label: t('student.academy.navActivity'), icon: List, section: 'system' },
    { id: 'settings', label: t('student.academy.navSettings'), icon: Settings, section: 'system' },
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

  const initials = (userProfile?.displayName || 'U')
    .split(/\s+/)
    .filter(Boolean)
    .slice(-2)
    .map(part => part[0]?.toUpperCase() || '')
    .join('');
  const roleLabel = positionLabel(userProfile?.position) || t('admin.systemName');
  const primaryItems = menuItems.filter(item => item.section !== 'system' && (!item.permission || hasPermission(item.permission)));
  const systemItems = menuItems.filter(item => item.section === 'system' && (!item.permission || hasPermission(item.permission)));

  const renderItem = (item: (typeof menuItems)[number]) => {
    const Icon = item.icon;
    const isActive = Boolean(item.href) && (pathname === item.href || (item.href !== '/admin' && pathname.startsWith(`${item.href}/`)));
    const className = `flex min-h-[38px] w-full items-center gap-3 rounded px-2.5 text-left text-[12px] ${isActive ? 'bg-[#06488e] text-white shadow-[inset_3px_0_#2885f5]' : 'text-[#e1eaf4] hover:bg-[#163753]'}`;
    if (!item.href || item.id === 'settings') {
      return (
        <button key={item.id} className={className} onClick={() => item.id === 'settings' ? setShowProfileModal(true) : showToast(t('student.academy.navSoon'))}>
          <Icon size={18} />
          {item.label}
        </button>
      );
    }
    return (
      <Link key={item.id} href={item.href} className={className} onClick={() => setMobileNav(false)}>
        <Icon size={18} />
        {item.label}
      </Link>
    );
  };

  return (
    <div className="flex min-h-screen bg-[#f5f8fc] text-[#111b38] [font-family:Arial,Helvetica,sans-serif]">
      {mobileNav && (
        <button className="fixed inset-0 z-30 bg-[#031323]/55 lg:hidden" aria-label={t('student.academy.close')} onClick={() => setMobileNav(false)} />
      )}
      <aside className={`fixed top-0 z-40 flex h-screen w-[204px] shrink-0 flex-col bg-gradient-to-b from-[#061b2b] to-[#0b2035] text-[#eef5ff] transition-transform lg:sticky ${mobileNav ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="flex h-[72px] items-center justify-center bg-white px-2">
          <img src="/logo.png" alt="BioKama" className="h-12 w-auto max-w-[168px] object-contain" />
        </div>
        <nav className="flex-1 space-y-1 overflow-auto px-2.5 py-2">
          {primaryItems.map(renderItem)}
          {systemItems.length > 0 && (
            <p className="mx-2 mb-1 mt-3 border-t border-white/10 pt-3 text-[11px] text-[#b7c5d2]">{t('student.academy.navSystem')}</p>
          )}
          {systemItems.map(renderItem)}
        </nav>
        <div className="border-t border-white/10 px-3 py-4">
          <div className="rounded-md bg-[#152e47] p-3">
            <div className="flex items-center gap-2.5">
              <Headphones size={18} />
              <span>
                <b className="block text-[12px]">{t('student.academy.supportTitle')}</b>
                <small className="block text-[10px] text-[#bdcada]">{t('student.academy.supportHint')}</small>
              </span>
            </div>
            <button onClick={() => showToast(t('student.academy.supportSent'))} className="mt-3 w-full rounded bg-[#f7faff] px-2 py-1.5 text-[11px] font-bold text-[#0755b5]">
              {t('student.academy.sendRequest')}
            </button>
          </div>
          <button onClick={handleSignOut} className="mt-3 flex w-full items-center gap-2 px-1 text-[12px] text-[#d7e3ef]">
            <LogOut size={16} />
            {t('admin.logout')}
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="flex h-[54px] items-center gap-3 border-b border-[#ecf0f6] bg-white px-4">
          <button className="p-1 lg:hidden" aria-label="Menu" onClick={() => setMobileNav(true)}>
            <Menu size={20} />
          </button>
          <label className="flex h-[35px] w-full max-w-[460px] items-center gap-2 rounded-md border border-[#eff2f7] bg-[#f7f9fc] px-3 text-[#65718a]">
            <Search size={16} />
            <input
              placeholder={t('student.academy.searchPlaceholder')}
              aria-label={t('student.academy.searchPlaceholder')}
              className="min-w-0 flex-1 bg-transparent text-[11px] text-[#111b38] outline-none placeholder:text-[#99a4b5]"
              onKeyDown={event => {
                if (event.key === 'Enter') router.push('/admin/courses');
              }}
            />
          </label>
          <div className="flex-1" />
          <LanguageSwitcher />
          <button className="relative p-1.5 text-[#2a3650]" aria-label={t('student.academy.newsTab')} onClick={() => showToast(t('student.academy.noNotifications'))}>
            <Bell size={18} />
          </button>
          <button className="flex items-center gap-2 text-left" onClick={() => setShowProfileModal(true)}>
            <span className="grid h-[31px] w-[31px] place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#eadac7] to-[#acc0d6] text-[11px] font-bold text-[#2a3550]">
              {userProfile?.photoURL ? <img src={proxyBunnyUrl(userProfile.photoURL)} alt="" className="h-full w-full object-cover" /> : initials}
            </span>
            <span className="hidden sm:block">
              <b className="block text-[11px]">{userProfile?.displayName}</b>
              <small className="block text-[10px] text-[#66718b]">{roleLabel}</small>
            </span>
            <ChevronDown size={15} className="hidden text-[#111b38] sm:block" />
          </button>
        </header>
        <main className="min-h-[calc(100vh-54px)] bg-[#0b0918] text-white">
          {children}
        </main>
      </div>

      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
      {toastMsg && (
        <div className="fixed bottom-4 right-4 z-50 rounded-md bg-[#111b38] px-4 py-2 text-[12px] text-white shadow-lg">{toastMsg}</div>
      )}
    </div>
  );
};
