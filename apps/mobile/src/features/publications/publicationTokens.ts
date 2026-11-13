/** Explicitly approved visual scope: Publication only, never a global theme override. */
import { Platform } from 'react-native';
import { BRAND_ACCENT } from '@/design/brandAppearance';
import { PUBLICATION_THEME } from '@/design/tokens.mobile';
export const PUBLICATION_PALETTE = {
  ...PUBLICATION_THEME,
  paper: '#FFFFFF',
  ink: '#101010',
  icon: '#454545',
  muted: '#666666',
  line: '#E8E8E8',
  neutral: '#F3F3F3',
  commentPaper: '#FFFFFF',
  splitPaper: '#FFFFFF',
  campaignPaper: '#FFFFFF',
  socialSurface: '#F3F3F3',
  verified: BRAND_ACCENT,
  discovery: '#0078CA',
  like: '#F23F5D',
  accent: '#101010',
  backdrop: '#000000',
  input: '#F1F1F1',
} as const;
/** Native Android Roboto is a closer reference match; do not override other features. */
export function publicationLatinFont(strong: boolean, os: string = Platform.OS): string {
  if (os === 'android') return strong ? 'sans-serif-medium' : 'sans-serif';
  return strong ? 'Publication-SemiBold' : 'Publication-Regular';
}
export const PUBLICATION_TYPE = {
  // Android reference: native Roboto; keep the licensed bundled face elsewhere.
  regular: publicationLatinFont(false),
  semibold: publicationLatinFont(true),
  captionSize: 13,
  captionLine: 18,
  titleSize: 18,
  headlineSize: 20,
  bodySize: 16,
  bodyLine: 22,
  arabicBodyLine: 26,
  titleLine: 24,
  headlineLine: 26,
  mediaRadius: 16,
  nameSize: 16,
  nameLine: 22,
  icon: 22,
  stroke: 1.7,
  column: 52,
  inset: 8,
  avatar: 44,
  touch: 44,
  countSize: 15,
  countLine: 20,
  /*
   * Blocs Publication (planches Zalando du 13/11, écran 360 dp) — une échelle
   * à niveaux DISTINCTS : titre du bandeau > prix > marque > nom > « Sponsorisé ».
   */
  bandTitleSize: 22,   // « Nike Hybrid RN / Train everything » : 2 lignes, gras
  bandTitleLine: 28,
  cardBrandSize: 15,   // marque, gras
  cardBrandLine: 20,
  cardNameSize: 14,    // nom du produit, régulier, une ligne
  cardNameLine: 18,
  cardPriceSize: 16,   // prix, gras, le plus lisible de la carte
  cardPriceLine: 22,
  followSize: 16,      // « + Suivre » de la pilule
  followLine: 22,
  followHeight: 48,    // pilule : 95 px de haut sur la planche ⇒ 48 dp
  followIcon: 18,
  infoIcon: 14,        // « ⓘ » après « Sponsorisé »
} as const;
