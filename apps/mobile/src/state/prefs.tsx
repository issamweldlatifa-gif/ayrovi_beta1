/**
 * Réglages persistants de l'application : langue, thème et affichage de la grille produits.
 *
 * Stockage : AsyncStorage (préférences non sensibles). Les JETONS DE SESSION
 * iront dans expo-secure-store en phase P2 — jamais ici.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';

import { isProductDensity, type ProductDensity } from '@/design/productTile';

export type Locale = 'fr' | 'ar';
export type ThemeMode = 'system' | 'light' | 'dark';

export interface Prefs {
  locale: Locale;
  themeMode: ThemeMode;
  /** L'intro OCEREX n'est montrée qu'une fois (comme sur le site). */
  ocerexOnboarded: boolean;
  /** Grille produits : petites photos (`grid`) ou grandes photos (`large`) — 13/11/2026. */
  productDensity: ProductDensity;
  videoAutoplay: boolean;
  autoplayWifiOnly: boolean;
  optionalAnalytics: boolean;
}

const STORAGE_KEY = 'zayrovi.prefs.v1';
const DEFAULTS: Prefs = { locale: 'fr', themeMode: 'system', ocerexOnboarded: false, productDensity: 'grid', videoAutoplay: true, autoplayWifiOnly: false, optionalAnalytics: false };

interface PrefsValue extends Prefs {
  /** false tant que le disque n'a pas répondu : on ne peint pas avant. */
  ready: boolean;
  setLocale: (locale: Locale) => void;
  setThemeMode: (mode: ThemeMode) => void;
  setOcerexOnboarded: (value: boolean) => void;
  setVideoAutoplay: (enabled: boolean) => void;
  setAutoplayWifiOnly: (enabled: boolean) => void;
  setOptionalAnalytics: (enabled: boolean) => void;
  setProductDensity: (density: ProductDensity) => void;
}

const PrefsContext = createContext<PrefsValue | null>(null);

const isLocale = (value: unknown): value is Locale => value === 'fr' || value === 'ar';
const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'system' || value === 'light' || value === 'dark';

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const latest = useRef(DEFAULTS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = stored ? JSON.parse(stored) : null;
        if (alive && parsed) {
          latest.current = {
            locale: isLocale(parsed.locale) ? parsed.locale : DEFAULTS.locale,
            themeMode: isThemeMode(parsed.themeMode) ? parsed.themeMode : DEFAULTS.themeMode,
            ocerexOnboarded: parsed.ocerexOnboarded === true,
            productDensity: isProductDensity(parsed.productDensity) ? parsed.productDensity : DEFAULTS.productDensity,
            videoAutoplay: typeof parsed.videoAutoplay === 'boolean' ? parsed.videoAutoplay : DEFAULTS.videoAutoplay,
            autoplayWifiOnly: parsed.autoplayWifiOnly === true,
            optionalAnalytics: parsed.optionalAnalytics === true,
          };
          setPrefs(latest.current);
        }
      } catch {
        // Une préférence illisible ne doit pas empêcher l'application de démarrer.
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  const persist = useCallback((patch: Partial<Prefs>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    setPrefs(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {
      // Écriture best-effort : l'application reste utilisable, on retentera au
      // prochain changement. Rien à afficher à l'utilisateur pour un réglage.
    });
  }, []);

  const value = useMemo<PrefsValue>(() => ({
    ...prefs,
    ready,
    setLocale: (locale) => persist({ locale }),
    setThemeMode: (themeMode) => persist({ themeMode }),
    setOcerexOnboarded: (ocerexOnboarded) => persist({ ocerexOnboarded }),
    setVideoAutoplay: videoAutoplay => persist({ videoAutoplay }),
    setAutoplayWifiOnly: autoplayWifiOnly => persist({ autoplayWifiOnly }),
    setOptionalAnalytics: optionalAnalytics => persist({ optionalAnalytics }),
    setProductDensity: (productDensity) => persist({ productDensity }),
  }), [prefs, ready, persist]);

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsValue {
  const value = useContext(PrefsContext);
  if (!value) throw new Error('usePrefs doit être utilisé sous <PrefsProvider>.');
  return value;
}

/** Media components mounted outside the application shell retain legacy playback behavior. */
export function useVideoAutoplay(): boolean {
  const prefs = useContext(PrefsContext);
  const wifi = useContext(PlaybackWifiContext);
  return (prefs?.videoAutoplay ?? DEFAULTS.videoAutoplay) && (!prefs?.autoplayWifiOnly || wifi);
}

const PlaybackWifiContext = createContext(false);
export function PlaybackWifiProvider({ connected, children }: { connected: boolean; children: ReactNode }) {
  return <PlaybackWifiContext.Provider value={connected}>{children}</PlaybackWifiContext.Provider>;
}

/** Fail closed, including while preference data is being restored. */
export function useOptionalAnalytics(): boolean {
  const prefs = useContext(PrefsContext);
  return prefs?.ready === true && prefs.optionalAnalytics;
}
