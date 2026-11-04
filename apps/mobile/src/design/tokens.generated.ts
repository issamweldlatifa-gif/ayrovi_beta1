/**
 * GÉNÉRÉ — ne pas modifier à la main.
 *
 * Couleurs   : apps/mobile/src/design/brand.json
 *              ZAYROVI App — Official Brand Colors · version 4.2.0
 *              sha256 : 69e920a38d630e8fb75f48c49ce56df6e964f69da700341995893235d7417e19
 * Structure  : client/src/design/editorial/identity.json
 *              ZAYROVI A — Official Identity · version 4.2.0
 *              sha256 : c0badc9b51428c99ed72ee17b32b167637a4e507b4e2cf552fa3564b39b3e4e3
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
    sha256: "c0badc9b51428c99ed72ee17b32b167637a4e507b4e2cf552fa3564b39b3e4e3",
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

/** Échelle typographique (px), partagée entre le site et l’application. */
export const TYPE_SCALE = {
  body: 16,
  bodySmall: 14,
  bodyStrong: 16,
  button: 14,
  caption: 12,
  captionStrong: 12,
  display: 38,
  h1: 32,
  h2: 28,
  h3: 22,
  label: 14,
  numeric: 16,
  overline: 11,
  price: 18,
  subtitle: 18,
} as const;

/** Rôles typographiques sémantiques : taille, graisse, largeur et interligne. */
export const TYPOGRAPHY_ROLES = {
  body: {
    lineHeight: "body",
    size: "body",
    weight: "body",
    width: "body",
  },
  bodySmall: {
    lineHeight: "body",
    size: "bodySmall",
    weight: "body",
    width: "body",
  },
  bodyStrong: {
    lineHeight: "body",
    size: "bodyStrong",
    weight: "label",
    width: "body",
  },
  button: {
    lineHeight: "label",
    size: "button",
    weight: "label",
    width: "body",
  },
  caption: {
    lineHeight: "caption",
    size: "caption",
    weight: "body",
    width: "body",
  },
  captionStrong: {
    lineHeight: "caption",
    size: "captionStrong",
    weight: "label",
    width: "body",
  },
  display: {
    lineHeight: "heading",
    size: "display",
    weight: "heading",
    width: "heading",
  },
  h1: {
    lineHeight: "heading",
    size: "h1",
    weight: "heading",
    width: "heading",
  },
  h2: {
    lineHeight: "heading",
    size: "h2",
    weight: "heading",
    width: "heading",
  },
  h3: {
    lineHeight: "heading",
    size: "h3",
    weight: "heading",
    width: "heading",
  },
  label: {
    lineHeight: "label",
    size: "label",
    weight: "label",
    width: "body",
  },
  numeric: {
    lineHeight: "body",
    numeric: "tabular",
    size: "numeric",
    weight: "body",
    width: "body",
  },
  overline: {
    lineHeight: "label",
    size: "overline",
    weight: "label",
    width: "body",
  },
  price: {
    lineHeight: "body",
    numeric: "tabular",
    size: "price",
    weight: "price",
    width: "body",
  },
  subtitle: {
    lineHeight: "body",
    size: "subtitle",
    weight: "body",
    width: "body",
  },
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
  bodyLineHeight: 1.5,
  bodyWeight: 400,
  bodyWidth: "102.5%",
  captionLineHeight: 1.3333,
  headingLineHeight: 1.2,
  headingWeight: 520,
  headingWidth: "112.5%",
  labelLineHeight: 1.4286,
  labelWeight: 650,
  letterSpacing: "0em",
  preset: "ayrovi-a",
  priceWeight: 650,
  stack: "'Ayrovi Extracted Sans', 'Noto Sans Arabic', sans-serif",
} as const;

/** Noms chargés par expo-font depuis les TTF Ayrovi Extracted Sans générés à partir du WOFF2 source. */
export const FONTS = {
  arabic: {
    bold: "NotoSansArabic-Bold",
    heading: "NotoSansArabic-Bold",
    medium: "NotoSansArabic-Regular",
    regular: "NotoSansArabic-Regular",
    semibold: "NotoSansArabic-Bold",
  },
  latin: {
    bold: "AyroviExtracted-Bold",
    heading: "AyroviExtracted-Heading",
    medium: "AyroviExtracted-Medium",
    regular: "AyroviExtracted-Regular",
    semibold: "AyroviExtracted-SemiBold",
  },
} as const;


export type ColorName = keyof typeof COLORS.light;
export type ColorSchemeName = keyof typeof COLORS;
export type FontSet = typeof FONTS.latin | typeof FONTS.arabic;
export type TypographyRoleName = keyof typeof TYPOGRAPHY_ROLES;
