/** Explicitly approved visual scope: Publication only, never a global theme override. */
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
export const PUBLICATION_TYPE = {
  regular: 'Publication-Regular',
  semibold: 'Publication-SemiBold',
  captionSize: 13,
  captionLine: 18,
  titleSize: 18,
  headlineSize: 20,
  bodySize: 16,
  bodyLine: 24,
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
export const PUBLICATION_PUBLISHER = {
  font: PUBLICATION_TYPE.semibold,
  nameSize: PUBLICATION_TYPE.nameSize,
  lineHeight: PUBLICATION_TYPE.nameLine,
  avatar: PUBLICATION_TYPE.avatar,
  mark: 24,
  follow: 24,
  sealEdge: 1,
} as const;

/** Local, deliberately short motion; not inferred Threads timings. */
export const PUBLICATION_MOTION = {
  enter: 200,
  exit: 140,
  dismiss: 180,
  travel: 12,
  stiffness: 280,
  damping: 32,
} as const;
