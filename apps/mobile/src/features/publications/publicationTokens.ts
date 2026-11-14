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
  /** 14/11 — rond du cœur et pastille « Nouveau » posés sur la photo (planches GBox). */
  chip: '#FFFFFF',
  commentPaper: '#FFFFFF',
  splitPaper: '#FFFFFF',
  campaignPaper: '#FFFFFF',
  socialSurface: '#F3F3F3',
  verified: BRAND_ACCENT,
  discovery: '#0A63F5',
  like: '#F02849',
  accent: '#101010',
  backdrop: '#000000',
  input: '#F1F1F1',
} as const;
/** Native Android Roboto is a closer reference match; do not override other features. */
export function publicationLatinFont(strong: boolean, os: string = Platform.OS): string {
  if (os === 'android') return strong ? 'sans-serif-medium' : 'sans-serif';
  return strong ? 'Publication-SemiBold' : 'Publication-Regular';
}
/**
 * 14/11 — police des BLOCS (cartes, bandeaux) : la planche GBox est composée en
 * Zalando Sans, la famille d'où viennent les fichiers `AyroviExtracted-*` déjà
 * embarqués ; le titre du bandeau prend la coupe « Heading » (plus large). L'arabe
 * garde Noto Sans Arabic. Le reste de Publication (en-tête) ne change pas.
 */
export type BlockFace = 'regular' | 'bold' | 'heading';
export function publicationBlockFont(locale: string, face: BlockFace): string {
  if (locale === 'ar') return face === 'regular' ? 'NotoSansArabic-Regular' : 'NotoSansArabic-Bold';
  if (face === 'heading') return 'AyroviExtracted-Heading';
  return face === 'bold' ? 'AyroviExtracted-Bold' : 'AyroviExtracted-Regular';
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
  bandTitleSize: 22,   // « Vans / Ready for the plot twist? » : capitales de 31 px ⇒ corps 22
  bandTitleLine: 27,   // 55 px entre deux lignes du titre
  /*
   * 14/11 — texte SOUS les cartes (planches GBox Vans 224048, WE Fashion 224107) :
   * Sponsorisé 790 px → marque 830 → nom 865 → prix 915 (pas de 20 / 18 / 25 dp).
   */
  cardSponsoredSize: 14,
  cardSponsoredLine: 20,
  cardBrandSize: 16,   // marque, GRASSE
  cardBrandLine: 20,
  cardNameSize: 16,    // nom du produit, régulier, une ligne avec « … »
  cardNameLine: 18,
  cardPriceSize: 16,   // prix, RÉGULIER sur la planche (« €26.00 »)
  cardPriceLine: 22,
  cardPriceTop: 4,
  cardTextTop: 12,     // 14/11 (rythme, Zalando photo → marque ≈ 12 dp) : 6 → 12 = RHYTHM.related
  // 13/11 : le cœur (rond blanc 40 / 32 dp) est remplacé par le cœur nu du système de cartes (`cardSystem.ts`).
  cardReferenceLine: 18, // ancien prix, sur sa ligne (corps = « Sponsorisé »)
  badgeSize: 14,       // pastille « Nouveau » : blanche, en bas à gauche
  badgeLine: 18,
  badgeHeight: 22,
  badgeInset: 8,
  badgeRadius: 4,
  followSize: 16,      // « + Suivre » de la pilule
  followLine: 22,
  followHeight: 48,    // pilule : 95 px de haut sur la planche ⇒ 48 dp
  followIcon: 18,
  infoIcon: 14,        // « ⓘ » après « Sponsorisé »
} as const;
