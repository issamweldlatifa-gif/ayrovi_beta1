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
export const PUBLICATION_SOCIAL_SURFACE = '#F0F1FC';
export const PUBLICATION_LIKE = '#D92148';
export const PUBLICATION_DISLIKE = '#E8B323';

export function nativeMediaPosition(media: MediaPresentation): {
  left: `${number}%`;
  top: `${number}%`;
} {
  return { left: `${media.focalX ?? 50}%`, top: `${media.focalY ?? 50}%` };
}
