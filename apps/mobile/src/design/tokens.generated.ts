/**
 * GÉNÉRÉ — ne pas modifier à la main.
 *
 * Couleurs   : apps/mobile/src/design/brand.json
 *              AYROVI App — Official Brand Colors · version 4.0.0
 *              sha256 : 2eaf8af52aebecb92b56099de979205ed215044cb8fc341b8ca7225f59bf666a
 * Structure  : client/src/design/editorial/identity.json
 *              AYROVI A — Official Identity · version 3.1.0
 *              sha256 : 6ca37aa4aa9739c618d789cfa43da56d6a94c78a656f8222933da7e7e507324b
 *
 * Régénérer : npm run tokens:build   ·   vérifier : npm run tokens:check
 */
/** Provenance de ces jetons (couleurs de l’application + structure partagée avec le site). */
export const IDENTITY = {
  name: "AYROVI App — Official Brand Colors",
  sha256: "2eaf8af52aebecb92b56099de979205ed215044cb8fc341b8ca7225f59bf666a",
  source: "apps/mobile/src/design/brand.json",
  structure: {
    name: "AYROVI A — Official Identity",
    sha256: "6ca37aa4aa9739c618d789cfa43da56d6a94c78a656f8222933da7e7e507324b",
    source: "client/src/design/editorial/identity.json",
    version: "3.1.0",
  },
  version: "4.0.0",
} as const;

/** Les quatre couleurs officielles de la marque — la seule source des valeurs dérivées. */
export const BRAND = {
  black: "#0A0A0A",
  lightGray: "#F2F2F2",
  violet: "#571EF6",
  white: "#FFFFFF",
} as const;

/** Part visuelle visée par couleur (objectif d’ensemble, pas une contrainte par écran). */
export const BRAND_SHARE = {
  black: 0.35,
  lightGray: 0.05,
  violet: 0.1,
  white: 0.5,
} as const;

/** Gris d’appui : bordure légère, texte secondaire, texte appuyé, contour de champ. */
export const NEUTRALS = {
  border: "#E5E5E5",
  controlBorder: "#8E8E8E",
  textSecondary: "#666666",
  textStrong: "#333333",
} as const;

/** Palette sémantique, mode clair et mode sombre. */
export const COLORS = {
  dark: {
    accent: "#571EF6",
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
    onAction: "#FFFFFF",
    secondary: "#E5E5E5",
    success: "#90D6AF",
    surface: "#171717",
  },
  light: {
    accent: "#571EF6",
    accentText: "#571EF6",
    action: "#571EF6",
    actionHover: "#491ACC",
    canvas: "#FFFFFF",
    danger: "#A52D2D",
    focus: "#571EF6",
    info: "#666666",
    infoSoft: "#F2F2F2",
    ink: "#0A0A0A",
    line: "#E5E5E5",
    lineControl: "#8E8E8E",
    muted: "#666666",
    onAccent: "#FFFFFF",
    onAction: "#FFFFFF",
    secondary: "#333333",
    success: "#236044",
    surface: "#F2F2F2",
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
