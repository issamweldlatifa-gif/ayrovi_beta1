/**
 * Thème de l'application : palette et typographie issues de l'identité produit
 * (jetons générés, voir scripts/gen-tokens.mjs).
 *
 * Décision P0 : la direction du texte (RTL) est portée par l'état, pas par
 * `I18nManager.forceRTL`. Forcer le RTL natif exige un redémarrage et casse la
 * bascule instantanée ; le miroir complet de la navigation est planifié en P6.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet, useColorScheme } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import {
  COLORS, FONTS, GEOMETRY, IDENTITY, MOTION, SPACE, TYPE_SCALE, TYPOGRAPHY,
} from './tokens.generated';
import { usePrefs } from '@/state/prefs';

export type ColorScheme = 'light' | 'dark';
export type TextRole = 'caption' | 'label' | 'body' | 'lead' | 'title' | 'display';

export interface Theme {
  mode: ColorScheme;
  isRTL: boolean;
  colors: (typeof COLORS)[keyof typeof COLORS];
  /** Famille de police à utiliser, choisie selon la langue et la graisse. */
  font: (weight?: 'regular' | 'bold') => string;
  /** Style Text prêt à l'emploi pour un niveau typographique donné. */
  text: (variant?: TextRole, weight?: 'regular' | 'bold') => {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    fontWeight: 'normal';
  };
  direction: { writingDirection: 'rtl' | 'ltr' };
  radius: { control: number; card: number; sheet: number; cta: number };
  space: readonly number[];
  geometry: typeof GEOMETRY;
  motion: typeof MOTION;
  typography: typeof TYPOGRAPHY;
  identity: typeof IDENTITY;
}

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { locale, themeMode } = usePrefs();
  const systemScheme = useColorScheme();

  const theme = useMemo<Theme>(() => {
    const mode: ColorScheme = themeMode === 'system'
      ? (systemScheme === 'dark' ? 'dark' : 'light')
      : themeMode;
    const isRTL = locale === 'ar';
    const families = isRTL ? FONTS.arabic : FONTS.latin;

    /**
     * Les graisses ne s'interpolent pas sur Android avec des .ttf séparés :
     * chaque graisse est une famille, on choisit donc la famille — jamais un
     * `fontWeight` numérique qui serait ignoré en silence.
     */
    const font: Theme['font'] = (weight = 'regular') => families[weight];

    const lineHeightRatio = isRTL ? TYPOGRAPHY.arabicLineHeight : TYPOGRAPHY.bodyLineHeight;
    const headingRatio = isRTL ? TYPOGRAPHY.arabicHeadingLineHeight : TYPOGRAPHY.headingLineHeight;
    const boldVariants: TextRole[] = ['label', 'title', 'display'];

    return {
      mode,
      isRTL,
      colors: mode === 'dark' ? COLORS.dark : COLORS.light,
      font,
      text: (variant = 'body', weight = boldVariants.includes(variant) ? 'bold' : 'regular') => {
        const size = TYPE_SCALE[variant];
        const ratio = boldVariants.includes(variant) ? headingRatio : lineHeightRatio;
        return {
          fontFamily: font(weight),
          fontSize: size,
          lineHeight: Math.round(size * ratio),
          fontWeight: 'normal' as const,
        };
      },
      direction: { writingDirection: isRTL ? 'rtl' : 'ltr' },
      radius: {
        control: GEOMETRY.controlRadius,
        card: GEOMETRY.cardRadius,
        sheet: GEOMETRY.sheetRadius,
        cta: GEOMETRY.ctaRadius,
      },
      space: SPACE,
      geometry: GEOMETRY,
      motion: MOTION,
      typography: TYPOGRAPHY,
      identity: IDENTITY,
    };
  }, [locale, themeMode, systemScheme]);

  // La racine native doit suivre la palette, sinon un flash blanc apparaît
  // derrière les écrans en mode sombre (et inversement au démarrage).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(theme.colors.canvas).catch(() => {});
  }, [theme.colors.canvas]);

  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error('useTheme doit être utilisé sous <ThemeProvider>.');
  return theme;
}

/** Direction CSS pour le web (react-native-web ignore `writingDirection`). */
export const webDirection = (isRTL: boolean) =>
  Platform.OS === 'web' ? ({ direction: isRTL ? 'rtl' : 'ltr' } as const) : ({} as const);

export const hairline = StyleSheet.hairlineWidth;
