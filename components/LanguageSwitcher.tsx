'use client';

import React from 'react';
import { Languages } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { Locale } from '@/lib/i18n/types';

interface LanguageSwitcherProps {
  variant?: 'light' | 'dark' | 'sidebar';
  className?: string;
}

export const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({
  variant = 'dark',
  className = '',
}) => {
  const { locale, setLocale } = useLanguage();

  const styles =
    variant === 'light'
      ? 'bg-white/10 border-white/20 text-white hover:bg-white/20'
      : variant === 'sidebar'
        ? 'bg-white/5 border-white/10 text-slate-200 hover:bg-white/10'
        : 'bg-slate-100 border-slate-200 text-slate-700 hover:bg-slate-200';

  const toggle = () => setLocale((locale === 'vi' ? 'en' : 'vi') as Locale);

  return (
    <button
      type="button"
      onClick={toggle}
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${styles} ${className}`}
      title={locale === 'vi' ? 'Switch to English' : 'Chuyển sang tiếng Việt'}
      aria-label="Switch language"
    >
      <Languages size={16} />
      <span>{locale === 'vi' ? 'VI' : 'EN'}</span>
    </button>
  );
};
