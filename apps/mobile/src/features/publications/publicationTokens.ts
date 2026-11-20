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
  discovery: '#0A0A0A',
  like: '#F02849',
  accent: '#101010',
  backdrop: '#000000',
  input: '#F1F1F1',
} as const;
function publicationLatinFont(strong: boolean): string {
  if (Platform.OS === 'android') return strong ? 'sans-serif-medium' : 'sans-serif';
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
} as const;

/** Campaign backgrounds sampled in flat regions of both 720 px references, not brand colors. */
export const PUBLICATION_CAMPAIGN_TONES = {
  campaign_orange: { headline: '#F2631F', body: '#F6A178', ink: '#19100C', heart: PUBLICATION_THEME.paper, heartInk: PUBLICATION_THEME.ink },
  campaign_red: { headline: '#DB2436', body: '#831520', ink: PUBLICATION_THEME.paper, heart: PUBLICATION_THEME.ink, heartInk: PUBLICATION_THEME.paper },
  promo: '#D50012',
  photo: '#F1F1F1',
} as const;

/** Black fullscreen player and the seek accent sampled from the video reference. */
export const PUBLICATION_PLAYER = { menu: '#191919', track: '#595959', progress: '#FF4C01' } as const;

/** Editorial video chrome, measured from the mobile video references. */
export const PUBLICATION_VIDEO_TYPE = { overlaySize: 14, overlayLine: 20, infoTitleSize: 22, infoTitleLine: 28, infoBodyLine: 24 } as const;
