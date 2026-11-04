/**
 * Thème de l'application : palette et typographie issues de l'identité produit
 * (jetons générés, voir scripts/gen-tokens.mjs).
 *
 * Décision P0 : la direction du texte (RTL) est portée par l'état, pas par
 * `I18nManager.forceRTL`. Forcer le RTL natif exige un redémarrage et casse la
 * bascule instantanée ; le miroir complet de la navigation est planifié en P6.
 */
import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { Platform, StyleSheet, useColorScheme, type TextStyle as RNTextStyle } from 'react-native';
import * as SystemUI from 'expo-system-ui';
import {
  COLORS, FONTS, GEOMETRY, IDENTITY, MOTION, SPACE, TYPE_SCALE, TYPOGRAPHY, TYPOGRAPHY_ROLES,
  type TypographyRoleName,
} from './tokens.generated';
import {
  CHROME, EASING, ICON_SIZE, OPACITY, RADIUS, SHEET_CORNER_RADIUS, SPRING, Z_INDEX,
  derivedColors, duration, elevation, statusFor,
  type DerivedColors, type ElevationName, type StatusSet,
} from './tokens.mobile';
import { usePrefs } from '@/state/prefs';

export type ColorScheme = 'light' | 'dark';
/** Rôles typographiques canoniques générés depuis l’identité partagée. */
export type TextRole = TypographyRoleName;

/** Graisses disponibles : chacune est une famille embarquée (voir FONTS). */
export type FontWeightName = 'regular' | 'medium' | 'semibold' | 'bold';

export interface Theme {
  mode: ColorScheme;
  isRTL: boolean;
  /** Palette de l'identité + couleurs dérivées (§2). Dérivées = jamais
   *  arbitraires : voir `tokens.mobile.ts`. */
  colors: (typeof COLORS)[keyof typeof COLORS] & DerivedColors;
  /** Famille de police à utiliser, choisie selon la langue et la graisse. */
  font: (weight?: FontWeightName) => string;
  /** Style Text prêt à l'emploi pour un niveau typographique donné. */
  text: (variant?: TextRole) => {
    fontFamily: string;
    fontSize: number;
    lineHeight: number;
    fontWeight: 'normal';
    includeFontPadding: false;
    fontVariant?: RNTextStyle['fontVariant'];
  };
  direction: { writingDirection: 'rtl' | 'ltr' };
  /** Échelle de rayons COMPLÈTE (xs → full), pas seulement les 4 jetons
   *  de l'identité. Les noms d'origine restent pour ne rien casser. */
  radius: { xs: number; sm: number; md: number; lg: number; xl: number; full: number; control: number; card: number; sheet: number; cta: number };
  /** Ombres multi-plateformes (iOS + Android dans le même objet). */
  elevation: Record<ElevationName, typeof elevation[ElevationName]>;
  /** Calques nommés — remplace l'ordre d'empilement implicite du JSX. */
  zIndex: typeof Z_INDEX;
  /** Hauteurs du chrome (en-tête, barre d'onglets, bande d'onglets). */
  chrome: typeof CHROME;
  /** Durées (identité + sortie) et courbes. */
  duration: typeof duration;
  easing: typeof EASING;
  spring: typeof SPRING;
  /** Tailles d'icônes nommées — fini les `size={17}`. */
  iconSize: typeof ICON_SIZE;
  /** Opacités sémantiques (désactivé, discret, squelette, voile). */
  opacity: typeof OPACITY;
  /**
   * Couleurs de STATUT (danger · warning · info · success), chacune en trois
   * tons : `fg` (texte/icône), `soft` (fond de pastille), `border` (liseré).
   *
   * À utiliser pour tout SIGNAL. La marque, elle, reste noir/blanc/gris +
   * violet (#571EF6) et violet clair (#C5B2F4) : c'est cette séparation qui
   * garde le violet rare (repère global ≈ 3 % = 2 % + 1 %, pas un quota par
   * écran) et chaque statut lisible (§2.10).
   */
  status: StatusSet;
  space: readonly number[];
  geometry: typeof GEOMETRY;
  motion: typeof MOTION;
  typography: typeof TYPOGRAPHY;
  typographyRoles: typeof TYPOGRAPHY_ROLES;
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
     * chaque graisse est une famille. Les rôles utilisent la table générée
     * depuis identity.json ; aucun poids numérique n'est synthétisé ici.
     */
    const font: Theme['font'] = (weight = 'regular') => families[weight];
    const lineHeightTokens = {
      heading: TYPOGRAPHY.headingLineHeight,
      body: TYPOGRAPHY.bodyLineHeight,
      label: TYPOGRAPHY.labelLineHeight,
      caption: TYPOGRAPHY.captionLineHeight,
    } as const;
    const palette = mode === 'dark' ? COLORS.dark : COLORS.light;

    return {
      mode,
      isRTL,
      colors: { ...palette, ...derivedColors(palette) },
      font,
      text: (variant = 'body') => {
        const role = TYPOGRAPHY_ROLES[variant];
        const size = TYPE_SCALE[role.size];
        const roleFace = role.weight === 'heading'
          ? isRTL ? 'bold' : 'medium'
          : role.weight === 'body' ? 'regular' : 'semibold';
        const fontFamily = !isRTL && role.weight === 'heading'
          ? FONTS.latin.heading
          : font(roleFace);
        const ratio = isRTL && role.weight === 'heading'
          ? TYPOGRAPHY.arabicHeadingLineHeight
          : isRTL && role.weight !== 'heading'
            ? role.lineHeight === 'caption' ? TYPOGRAPHY.captionLineHeight : TYPOGRAPHY.arabicLineHeight
            : lineHeightTokens[role.lineHeight];
        return {
          fontFamily,
          fontSize: size,
          lineHeight: Math.round(size * ratio),
          fontWeight: 'normal' as const,
          includeFontPadding: false as const,
          ...('numeric' in role && role.numeric === 'tabular' ? { fontVariant: ['tabular-nums'] as const } : {}),
        };
      },
      direction: { writingDirection: isRTL ? 'rtl' : 'ltr' },
      radius: {
        xs: RADIUS.xs,
        sm: RADIUS.sm,
        md: RADIUS.md,
        lg: RADIUS.lg,
        xl: RADIUS.xl,
        full: RADIUS.full,
        control: GEOMETRY.controlRadius,
        card: GEOMETRY.cardRadius,
        sheet: SHEET_CORNER_RADIUS,
        cta: GEOMETRY.ctaRadius,
      },
      elevation,
      zIndex: Z_INDEX,
      chrome: CHROME,
      duration,
      easing: EASING,
      spring: SPRING,
      iconSize: ICON_SIZE,
      opacity: OPACITY,
      status: statusFor(mode),
      space: SPACE,
      geometry: GEOMETRY,
      motion: MOTION,
      typography: TYPOGRAPHY,
      typographyRoles: TYPOGRAPHY_ROLES,
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
