'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { Button } from './Button';
import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { LanguageSwitcher } from './LanguageSwitcher';

interface NavbarProps {
  onLogin: () => void;
  onRegister: () => void;
  onNavigateHome: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onLogin, onRegister, onNavigateHome }) => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { userProfile } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleDashboardClick = () => {
    if (userProfile) {
      switch (userProfile.role) {
        case 'admin':
        case 'staff':
          router.push('/admin');
          break;
        case 'teacher':
          router.push('/teacher');
          break;
        case 'student':
          router.push('/student');
          break;
      }
    }
  };

  const textColorClass = isScrolled ? 'text-slate-600 hover:text-brand-600' : 'text-slate-200 hover:text-white';
  const logoColorClass = isScrolled ? 'text-slate-900' : 'text-white';
  const buttonVariant = isScrolled ? 'primary' : 'primary';

  const handleLogoClick = () => {
    onNavigateHome();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <nav 
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled ? 'bg-white/90 backdrop-blur-md shadow-sm py-3' : 'bg-transparent py-6'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center">
          {/* Logo */}
          <div onClick={handleLogoClick} className="flex items-center gap-3 cursor-pointer group">
            <img src="/logo.png" alt="Kama" className="h-12 w-auto" />
            <span className={`text-2xl font-bold tracking-tight transition-colors ${logoColorClass}`}>
              Kama
            </span>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-4">
            <LanguageSwitcher variant={isScrolled ? 'dark' : 'light'} />
            {userProfile ? (
              <Button 
                variant={buttonVariant} 
                size="sm"
                onClick={handleDashboardClick}
                className={!isScrolled ? "shadow-none bg-brand-600 hover:bg-brand-500 text-white" : ""}
              >
                {t('landing.nav.backToDashboard')}
              </Button>
            ) : (
              <>
                <button 
                  onClick={onLogin}
                  className={`text-sm font-medium transition-colors ${textColorClass}`}
                >
                  {t('landing.nav.login')}
                </button>
                <Button 
                  variant={buttonVariant} 
                  size="sm" 
                  onClick={onRegister}
                  className={!isScrolled ? "shadow-none bg-brand-600 hover:bg-brand-500 text-white" : ""}
                >
                  {t('landing.nav.register')}
                </Button>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-2">
            <LanguageSwitcher variant={isScrolled ? 'dark' : 'light'} />
            <button 
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className={`transition-colors ${isScrolled ? 'text-slate-900' : 'text-white'}`}
            >
              {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 bg-white border-t border-gray-100 shadow-lg p-4 flex flex-col gap-4 animate-in slide-in-from-top-5">
          {userProfile ? (
            <Button 
              variant="primary" 
              className="w-full"
              onClick={() => { handleDashboardClick(); setMobileMenuOpen(false); }}
            >
              {t('landing.nav.backToDashboard')}
            </Button>
          ) : (
            <>
              <button 
                onClick={() => { onLogin(); setMobileMenuOpen(false); }}
                className="text-base font-medium text-slate-600 hover:text-brand-600 block py-2 px-2 text-left"
              >
                {t('landing.nav.login')}
              </button>
              <Button 
                variant="primary" 
                className="w-full"
                onClick={() => { onRegister(); setMobileMenuOpen(false); }}
              >
                {t('landing.nav.register')}
              </Button>
            </>
          )}
        </div>
      )}
    </nav>
  );
};
