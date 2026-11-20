import type { PublicationMedia } from './publicationContent';

/** The seven layouts actually rendered by the mobile Publication feed. */
export const PUBLICATION_STUDIO_LAYOUTS = {
  'image-cover': 'Photo carrée', 'image-panoramic': 'Photo rectangulaire',
  'video-inset': 'Petite vidéo (centrée)', 'video-panoramic': 'Vidéo panoramique', 'video-square': 'Grande vidéo carrée',
  campaign_orange: 'Campagne orange', campaign_red: 'Campagne rouge',
} as const;
export type StudioPublicationLayout = keyof typeof PUBLICATION_STUDIO_LAYOUTS;
export function publicationStudioLayout(template: string, media?: PublicationMedia): StudioPublicationLayout | '' {
  if (template === 'campaign_orange' || template === 'campaign_red') return template;
  if (!['auto', 'photo', 'split', 'campaign', 'video'].includes(template)) return '';
  if (media?.type === 'video') {
    if (media.frame === 'square') return 'video-square';
    return media.fit === 'cover' || (media.fit !== 'contain' && Number(media.width) / Number(media.height) >= 1.55) ? 'video-panoramic' : 'video-inset';
  }
  if (template === 'video') return '';
  if (media?.frame) return media.frame === 'panoramic' ? 'image-panoramic' : 'image-cover';
  const wide = media?.width && media.height ? media.width / media.height >= 1.55 : template === 'split' || template === 'campaign';
  return wide ? 'image-panoramic' : 'image-cover';
}

export function publicationStudioMedia(layout: StudioPublicationLayout, cover: string, video: string, original?: PublicationMedia) {
  if (layout === 'campaign_orange' || layout === 'campaign_red') return { template_id: layout, post_type: 'collection', media: [] } as const;
  const type = layout.startsWith('video') ? 'video' : 'image';
  const url = type === 'video' ? video : cover;
  const seed: PublicationMedia = { ...(original?.type === type && original.url === url ? original : {}), type, url, poster: type === 'video' ? cover : '', alt: original?.alt ?? '' };
  const { frame: _frame, ...content } = seed;
  const frame = layout === 'image-panoramic' ? 'panoramic' : layout === 'video-square' || layout === 'image-cover' ? 'square' : undefined;
  return { template_id: type === 'video' ? 'video' : layout === 'image-panoramic' ? 'split' : 'photo', post_type: type,
    media: [{ ...content, ...(type === 'video' ? { fit: layout === 'video-panoramic' ? 'cover' : 'contain' } : {}), ...(frame ? { frame } : {}) }] };
}
