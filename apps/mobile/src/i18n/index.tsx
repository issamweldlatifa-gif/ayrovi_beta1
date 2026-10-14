/**
 * Fournisseur de langue : ne fait que brancher la langue choisie sur la
 * résolution pure définie dans `keys.ts` (testable sans React).
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { usePrefs } from '@/state/prefs';
import { translate, type Locale, type Translate, type TranslationKey, type Vars } from './keys';

export type { Locale, Translate, TranslationKey, Vars };
export { translate };

const I18nContext = createContext<{ locale: Locale; t: Translate } | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const { locale } = usePrefs();
  const value = useMemo(() => ({
    locale: locale as Locale,
    t: (key: TranslationKey, vars?: Vars) => translate(locale as Locale, key, vars),
  }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n doit être utilisé sous <I18nProvider>.');
  return value;
}

export function useT(): Translate {
  return useI18n().t;
}
