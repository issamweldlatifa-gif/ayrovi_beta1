/**
 * Réglages persistants de l'application : langue et thème.
 *
 * Stockage : AsyncStorage (préférences non sensibles). Les JETONS DE SESSION
 * iront dans expo-secure-store en phase P2 — jamais ici.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';

export type Locale = 'fr' | 'ar';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface Prefs {
  locale: Locale;
  themeMode: ThemeMode;
  /** L'intro OCEREX n'est montrée qu'une fois (comme sur le site). */
  ocerexOnboarded: boolean;
}

const STORAGE_KEY = 'zayrovi.prefs.v1';
const DEFAULTS: Prefs = { locale: 'fr', themeMode: 'system', ocerexOnboarded: false };

interface PrefsValue extends Prefs {
  /** false tant que le disque n'a pas répondu : on ne peint pas avant. */
  ready: boolean;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setOcerexOnboarded: (value: boolean) => void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

const isLocale = (value: unknown): value is Locale => value === 'fr' || value === 'ar';
const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'system' || value === 'light' || value === 'dark';

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : null;
        if (alive && parsed) {
          setPrefs({
            locale: isLocale(parsed.locale) ? parsed.locale : DEFAULTS.locale,
            themeMode: isThemeMode(parsed.themeMode) ? parsed.themeMode : DEFAULTS.themeMode,
            ocerexOnboarded: parsed.ocerexOnboarded === true,
          });
        }
      } catch {
        // Une préférence illisible ne doit pas empêcher l'application de démarrer.
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const persist = useCallback((next: Prefs) => {
    setPrefs(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
      // Écriture best-effort : l'application reste utilisable, on retentera au
      // prochain changement. Rien à afficher à l'utilisateur pour un réglage.
    });
  }, []);

  const value = useMemo<PrefsValue>(() => ({
    ...prefs,
    ready,
    setLocale: (locale) => persist({ ...prefs, locale }),
    setThemeMode: (themeMode) => persist({ ...prefs, themeMode }),
    setOcerexOnboarded: (ocerexOnboarded) => persist({ ...prefs, ocerexOnboarded }),
  }), [prefs, ready, persist]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs doit être utilisé sous <PrefsProvider>.');
  return value;
}
