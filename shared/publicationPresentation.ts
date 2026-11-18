/** Non-destructive, deterministic rules shared by the authoring preview and native UI. */
export interface MediaPresentation {
  fit?: 'contain' | 'cover';
  purpose?: 'product' | 'scene';
  width?: number;
  height?: number;
  focalX?: number;
  focalY?: number;
  scale?: number;
}
export function mediaFit(media: MediaPresentation) {
  return media.fit || (media.purpose === 'product' ? 'contain' : 'cover');
}
export function mediaRatio(media: MediaPresentation, fallback = 4 / 5) {
  return media.width && media.height
    ? Math.min(1.8, Math.max(0.65, media.width / media.height))
    : Math.min(1.8, Math.max(0.65, fallback));
}
export function mediaPosition(media: MediaPresentation) {
  return `${media.focalX ?? 50}% ${media.focalY ?? 50}%`;
}
export function tileRatio(items: MediaPresentation[]) {
  const ratios = items
    .filter((m) => m.width && m.height)
    .map((m) => mediaRatio(m));
  return ratios.length
    ? Math.min(
        1.5,
        Math.max(0.7, ratios.reduce((a, b) => a + b, 0) / ratios.length)
      )
    : 1;
}
export function showsPublicationTitle(template: string) {
  return ![
    'social_mosaic',
    'social_pair',
    'social_strip',
    'caption_photo',
    'shoppable',
  ].includes(template);
}
/** 18/11 (v5.0.0): links and verified badge are INK — no blue anywhere (white text on it: 19.8:1). */
export const PUBLICATION_DISCOVERY_INK = '#0A0A0A';
export const PUBLICATION_SOCIAL_SURFACE = '#F2F2F2'; // 18/11 : gris clair officiel (plus de lavande bleutée)
/** "J'adore" red, legible on white (4.1:1) and on black (4.8:1). */
export const PUBLICATION_LIKE = '#F02849';
export const PUBLICATION_DISLIKE = '#E8B323';

export function nativeMediaPosition(media: MediaPresentation): {
  left: `${number}%`;
  top: `${number}%`;
} {
  return { left: `${media.focalX ?? 50}%`, top: `${media.focalY ?? 50}%` };
}
