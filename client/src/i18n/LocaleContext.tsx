import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type AyroviLocale = 'fr' | 'ar';

interface LocaleValue {
  locale: AyroviLocale;
  isArabic: boolean;
  direction: 'ltr' | 'rtl';
  setLocale: (locale: AyroviLocale) => void;
  toggleLocale: () => void;
  tr: (french: string, arabic: string) => string;
  formatDate: (value: unknown, detailed?: boolean) => string;
  formatMoney: (value: unknown) => string;
}

const STORAGE_KEY = 'ayrovi.locale.v1';
const LocaleContext = createContext<LocaleValue | null>(null);

function initialLocale(): AyroviLocale {
  if (typeof window === 'undefined') return 'fr';
  if (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/')) return 'fr';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'ar' || stored === 'fr') return stored;
  return window.navigator.language.toLowerCase().startsWith('ar') ? 'ar' : 'fr';
}

export const LocaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [locale, setLocaleState] = useState<AyroviLocale>(initialLocale);
  const setLocale = (next: AyroviLocale) => {
    setLocaleState(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* storage may be unavailable */ }
  };

  useEffect(() => {
    document.documentElement.lang = locale === 'ar' ? 'ar-TN' : 'fr-TN';
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);

  const value = useMemo<LocaleValue>(() => ({
    locale,
    isArabic: locale === 'ar',
    direction: locale === 'ar' ? 'rtl' : 'ltr',
    setLocale,
    toggleLocale: () => setLocale(locale === 'ar' ? 'fr' : 'ar'),
    tr: (french, arabic) => locale === 'ar' ? arabic : french,
    formatDate: (raw, detailed = false) => raw ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-TN' : 'fr-TN', detailed
      ? { dateStyle: 'medium', timeStyle: 'short', hourCycle: 'h23' }
      : { dateStyle: 'medium' }).format(new Date(String(raw))) : '—',
    formatMoney: (raw) => `${Number(raw || 0).toLocaleString(locale === 'ar' ? 'ar-TN' : 'fr-TN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${locale === 'ar' ? 'د.ت' : 'DT'}`,
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
};

export function useLocale(): LocaleValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside LocaleProvider');
  return context;
}
