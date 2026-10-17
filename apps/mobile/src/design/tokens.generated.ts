/**
 * GÉNÉRÉ — ne pas modifier à la main.
 *
 * Couleurs   : apps/mobile/src/design/brand.json
 *              ZAYROVI App — Official Brand Colors · version 4.2.0
 *              sha256 : 69e920a38d630e8fb75f48c49ce56df6e964f69da700341995893235d7417e19
 * Structure  : client/src/design/editorial/identity.json
 *              ZAYROVI A — Official Identity · version 4.2.0
 *              sha256 : 049c7f0b569425c1d3b0a21931b1c4f50238514298176a249497c3fbb1116812
 *
 * Régénérer : npm run tokens:build   ·   vérifier : npm run tokens:check
 */
/** Provenance de ces jetons (couleurs de l’application + structure partagée avec le site). */
export const IDENTITY = {
  name: "ZAYROVI App — Official Brand Colors",
  sha256: "69e920a38d630e8fb75f48c49ce56df6e964f69da700341995893235d7417e19",
  source: "apps/mobile/src/design/brand.json",
  structure: {
    name: "ZAYROVI A — Official Identity",
    sha256: "049c7f0b569425c1d3b0a21931b1c4f50238514298176a249497c3fbb1116812",
    source: "client/src/design/editorial/identity.json",
    version: "4.2.0",
  },
  version: "4.2.0",
} as const;

/** Les quatre couleurs officielles de la marque — la seule source des valeurs dérivées. */
export const BRAND = {
  black: "#0A0A0A",
  lightGray: "#F2F2F2",
  violet: "#571EF6",
  violetLight: "#C5B2F4",
  white: "#FFFFFF",
} as const;

/** Part visuelle visée par couleur (objectif d’ensemble, pas une contrainte par écran). */
export const BRAND_SHARE = {
  black: 0.35,
  lightGray: 0.05,
  violet: 0.02,
  violetLight: 0.01,
  white: 0.5,
} as const;

/** Gris d’appui : bordure légère, texte secondaire, texte appuyé, contour de champ. */
export const NEUTRALS = {
  border: "#E5E5E5",
  controlBorder: "#888888",
  textSecondary: "#666666",
  textStrong: "#333333",
} as const;

/** Palette sémantique, mode clair et mode sombre. */
export const COLORS = {
  dark: {
    accent: "#571EF6",
    accentSoft: "#C5B2F4",
    accentText: "#926DF9",
    action: "#571EF6",
    actionHover: "#491ACC",
    canvas: "#0A0A0A",
    danger: "#FFABAB",
    focus: "#926DF9",
    info: "#BDBDBD",
    infoSoft: "#171717",
    ink: "#FFFFFF",
    line: "#525252",
    lineControl: "#6E6E6E",
    muted: "#BDBDBD",
    onAccent: "#FFFFFF",
    onAccentSoft: "#0A0A0A",
    onAction: "#FFFFFF",
    secondary: "#E5E5E5",
    shimmer: "#171717",
    success: "#90D6AF",
    surface: "#171717",
  },
  light: {
    accent: "#571EF6",
    accentSoft: "#C5B2F4",
    accentText: "#571EF6",
    action: "#571EF6",
    actionHover: "#491ACC",
    canvas: "#FFFFFF",
    danger: "#A52D2D",
    focus: "#571EF6",
    info: "#666666",
    infoSoft: "#FFFFFF",
    ink: "#0A0A0A",
    line: "#E5E5E5",
    lineControl: "#888888",
    muted: "#666666",
    onAccent: "#FFFFFF",
    onAccentSoft: "#0A0A0A",
    onAction: "#FFFFFF",
    secondary: "#333333",
    shimmer: "#F2F2F2",
    success: "#236044",
    surface: "#FFFFFF",
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
  preset: "zayrovi-a",
  priceWeight: 600,
  stack: "'Zalando Sans', 'Noto Sans Arabic', sans-serif",
} as const;

/** Noms de familles telles que chargées par expo-font (fichiers .ttf embarqués). */
export const FONTS = {
  arabic: {
    bold: "NotoSansArabic-Bold",
    regular: "NotoSansArabic-Regular",
    semibold: "NotoSansArabic-Bold",
  },
  latin: {
    bold: "ZalandoSans-Bold",
    regular: "ZalandoSans-Regular",
    semibold: "ZalandoSans-SemiBold",
  },
} as const;


export type ColorName = keyof typeof COLORS.light;
export type ColorSchemeName = keyof typeof COLORS;
export type FontSet = typeof FONTS.latin | typeof FONTS.arabic;
