/** Geometry shared by native rendering and CRM. Every tile keeps its original media index. */
export const SOCIAL_TEMPLATES = [
  'social_mosaic',
  'social_strip',
  'social_pair',
] as const;
export const CAPTION_FIRST_TEMPLATES = [
  ...SOCIAL_TEMPLATES,
  'caption_photo',
  'shoppable',
] as const;
export function publicationTiles(template: string, count: number) {
  if (count < 1) return [];
  const visible = Math.min(
    count,
    template === 'social_pair' ? 2 : template === 'social_strip' ? 3 : 5
  );
  const rows =
    template === 'social_mosaic' && visible > 3 ? [2, visible - 2] : [visible];
  let index = 0;
  return rows.map((columns) =>
    Array.from({ length: columns }, () => {
      const i = index++;
      return { index: i, remaining: i === visible - 1 ? count - visible : 0 };
    })
  );
}

/** Reference editorial compositions, shared with the CRM preview. */
export const PUBLICATION_EDITORIAL_PAPER = '#F4F1EA';
export const PUBLICATION_EDITORIAL_RATIO = 3 / 2;

/** Legacy auto content must not all become the same compact split card.
 * Only per-post metadata chooses a composition; this never adds a feed filter. */
export function resolvePublicationTemplate(
  template = 'auto',
  type = 'image',
  mediaCount = 0,
  category = ''
) {
  if (template !== 'auto') return template;
  if (type === 'video') return 'video';
  if (type === 'collection') return 'auto';
  if (type === 'carousel' || mediaCount > 1) return 'carousel';
  if (type === 'editorial' || category === 'beauty') return 'campaign';
  return 'photo';
}

/** Internal provenance for the four bundled editorial examples; never trust a client flag. */
export function isGeneratedPublicationEditorialAsset(url: string) {
  return ['/media/publications/editorial-beauty-mirror.jpg', '/media/publications/bag-editorial-caramel.jpg', '/media/publications/bag-editorial-brown.jpg', '/media/publications/bag-editorial-ivory.jpg'].includes(url);
}
