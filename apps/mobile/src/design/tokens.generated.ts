/**
 * GÉNÉRÉ — ne pas modifier à la main.
 *
 * Source unique : client/src/design/editorial/identity.json
 * Identité : AYROVI A — Official Identity · version 3.1.0
 * sha256 : 6ca37aa4aa9739c618d789cfa43da56d6a94c78a656f8222933da7e7e507324b
 *
 * Régénérer : npm run tokens:build   ·   vérifier : npm run tokens:check
 */
/** Provenance de ces jetons. */
export const IDENTITY = {
  name: "AYROVI A — Official Identity",
  sha256: "6ca37aa4aa9739c618d789cfa43da56d6a94c78a656f8222933da7e7e507324b",
  source: "client/src/design/editorial/identity.json",
  version: "3.1.0",
} as const;

/** Palette, mode clair et mode sombre. */
export const COLORS = {
  dark: {
    accent: "#FF7900",
    accentText: "#FFAE69",
    action: "#FFFFFF",
    actionHover: "#E5E5E5",
    canvas: "#000000",
    danger: "#FFABAB",
    focus: "#FFFFFF",
    info: "#BDBDBD",
    infoSoft: "#171717",
    ink: "#FFFFFF",
    line: "#525252",
    lineControl: "#6E6E6E",
    muted: "#BDBDBD",
    onAction: "#000000",
    secondary: "#E5E5E5",
    success: "#90D6AF",
    surface: "#171717",
  },
  light: {
    accent: "#FF7900",
    accentText: "#A74700",
    action: "#000000",
    actionHover: "#262626",
    canvas: "#FFFFFF",
    danger: "#A52D2D",
    focus: "#000000",
    info: "#595959",
    infoSoft: "#F5F5F5",
    ink: "#000000",
    line: "#D9D9D9",
    lineControl: "#8E8E8E",
    muted: "#595959",
    onAction: "#FFFFFF",
    secondary: "#333333",
    success: "#236044",
    surface: "#F5F5F5",
  },
} as const;

/** Échelle d’espacement (px). */
export const SPACE = [4, 8, 12, 16, 24, 32, 48, 64, 96] as const;

/** Échelle typographique (px). */
export const TYPE_SCALE = {
  body: 16,
  caption: 12,
  display: 40,
  label: 14,
  lead: 18,
  title: 28,
} as const;

/** Durées d’animation (ms). */
export const MOTION = {
  fast: 120,
  reduced: 0,
  standard: 180,
} as const;

/** Rayons, cibles tactiles, grille d’icônes. */
export const GEOMETRY = {
  cardRadius: 16,
  contentMax: 1280,
  controlHeight: 48,
  controlRadius: 12,
  ctaRadius: 999,
  iconGrid: 24,
  iconStroke: 1.5,
  mediaRadius: 0,
  minTarget: 44,
  sheetRadius: 32,
} as const;

/** Graisses et interlignes ; `stack` est la pile CSS du site, non utilisable en React Native. */
export const TYPOGRAPHY = {
  arabicHeadingLineHeight: 1.42,
  arabicLineHeight: 1.55,
  bodyLineHeight: 1.4,
  bodyWeight: 500,
  headingLineHeight: 1.18,
  headingWeight: 650,
  headingWidth: "100%",
  labelWeight: 700,
  letterSpacing: "0em",
  preset: "ayrovi-a",
  priceWeight: 600,
  stack: "'Zalando Sans', 'Noto Sans Arabic', sans-serif",
} as const;

/** Noms de familles telles que chargées par expo-font (fichiers .ttf embarqués). */
export const FONTS = {
  arabic: {
    bold: "NotoSansArabic-Bold",
    regular: "NotoSansArabic-Regular",
  },
  latin: {
    bold: "ZalandoSans-Bold",
    regular: "ZalandoSans-Regular",
  },
} as const;


export type ColorName = keyof typeof COLORS.light;
export type ColorSchemeName = keyof typeof COLORS;
export type FontSet = typeof FONTS.latin | typeof FONTS.arabic;
