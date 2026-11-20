import type { PublicationCampaignLayout } from '../../../../../shared/publicationCampaign';

/** Measurements of the supplied 720 px screenshots, normalized to a 360 dp screen. */
export const PUBLICATION_REFERENCE = {
  inset: 12, cardRadius: 8, railGap: 4, peek: 16, mediaGap: 4,
  tileAspect: 202 / 292, imageCoverAspect: 658 / 634, panoramicAspect: 658 / 318,
  heartDiameter: 32, heartInset: 8, moreDiameter: 48,
  videoControlDiameter: 40, videoControlInset: 8, videoControlGap: 8,
  headingSize: 16, headingLine: 20, publisherSize: 14, publisherLine: 18,
  captionGap: 6, postGap: 28, startGap: 16,
} as const;

export type ReferenceLayout = 'image-cover' | 'image-panoramic' | 'video-inset' | 'video-panoramic';
export interface ReferenceMedia {
  type: 'image' | 'video'; url: string; poster: string; alt: string;
  width?: number; height?: number; fit?: 'contain' | 'cover'; focalX?: number; focalY?: number;
}

export function referenceLayout(media: ReferenceMedia, template: string): ReferenceLayout {
  const landscape = Boolean(media.width && media.height && media.width / media.height >= 1.55);
  if (media.type === 'video') {
    return (media.fit === 'cover' || (media.fit !== 'contain' && landscape)) ? 'video-panoramic' : 'video-inset';
  }
  // Older authored campaigns can lack dimensions; do not let product count drive the media height.
  return (media.width && media.height ? landscape : template === 'campaign' || template === 'split')
    ? 'image-panoramic' : 'image-cover';
}

export function referenceMeasurements(viewport: number, layout: ReferenceLayout | PublicationCampaignLayout) {
  const r = PUBLICATION_REFERENCE;
  const width = Math.max(0, Math.min(600, viewport - 2 * r.inset));
  const tileWidth = Math.max(0, (width - r.peek - 3 * r.railGap) / 3);
  const mediaHeight = width / (layout === 'image-cover' ? r.imageCoverAspect : r.panoramicAspect);
  return { width, tileWidth, tileHeight: tileWidth / r.tileAspect, mediaHeight };
}
