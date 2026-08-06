'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Locale, TranslateFn, TranslationDict } from '@/lib/i18n/types';
import { en } from '@/lib/i18n/locales/en/index';
import { vi } from '@/lib/i18n/locales/vi/index';

const STORAGE_KEY = 'kama-locale';

const dictionaries: Record<Locale, TranslationDict> = { vi, en };

type LanguageContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
  dateLocale: string;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function getNested(dict: TranslationDict, key: string): string | undefined {
  const parts = key.split('.');
  let current: string | TranslationDict | undefined = dict;
  for (const part of parts) {
    if (current == null || typeof current === 'string') return undefined;
    current = current[part];
  }
  return typeof current === 'string' ? current : undefined;
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  );
}

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<Locale>('vi');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    if (saved === 'vi' || saved === 'en') {
      setLocaleState(saved);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(STORAGE_KEY, locale);
    document.documentElement.lang = locale;
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const t = useCallback<TranslateFn>(
    (key, params) => {
      const dict = dictionaries[locale];
      const fallback = dictionaries.vi;
      const value = getNested(dict, key) ?? getNested(fallback, key) ?? key;
      return interpolate(value, params);
    },
    [locale]
  );

  const value = useMemo(
    () => ({
      locale,
      setLocale,
      t,
      dateLocale: locale === 'vi' ? 'vi-VN' : 'en-US',
    }),
    [locale, setLocale, t]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
};

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}

export function useT() {
  return useLanguage().t;
}
