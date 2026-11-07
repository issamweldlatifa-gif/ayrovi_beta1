import type { MediaPresentation } from './publicationPresentation';
import { normalizeMediaLink } from './mediaLinks';
export const PUBLICATION_TYPES = [
  'image',
  'carousel',
  'video',
  'product',
  'collection',
  'editorial',
] as const;
export const PUBLICATION_TEMPLATES = [
  'auto',
  'photo',
  'split',
  'campaign',
  'carousel',
  'video',
  'social_mosaic',
  'shoppable',
  'caption_photo',
  'social_strip',
  'social_pair',
] as const;
export type PublicationTemplate = (typeof PUBLICATION_TEMPLATES)[number];
export type PublicationType = (typeof PUBLICATION_TYPES)[number];
export interface PublicationMedia extends MediaPresentation {
  originalUrl?: string;
  type: 'image' | 'video';
  url: string;
  poster: string;
  alt: string;
  fit?: 'contain' | 'cover';
}
export interface PublicationContent {
  showTitle?: boolean;
  template?: PublicationTemplate;
  actionLabel?: string;
  actionTarget?: 'detail' | 'products';
  type: PublicationType;
  media: PublicationMedia[];
  description: string;
  descriptionPosition: 'above' | 'below';
  sponsored: boolean;
  sponsorName: string;
  audience: string;
  topic: string;
}
export function normalizePublicationContent(
  body: any,
  previous?: any
): PublicationContent | null {
  let type = body.post_type ?? previous?.post_type ?? 'image';
  if (!PUBLICATION_TYPES.includes(type)) return null;
  let source: any;
  try {
    source =
      body.media ??
      (previous?.media_json ? JSON.parse(previous.media_json) : []);
  } catch {
    return null;
  }
  if (!Array.isArray(source) || source.length > 10) return null;
  const media: PublicationMedia[] = [];
  for (const item of source) {
    if (!item || !['image', 'video'].includes(item.type)) return null;
    const link = normalizeMediaLink(item.url, item.type);
    const poster = normalizeMediaLink(
      item.poster ||
        (item.type === 'video'
          ? body.image_url || previous?.image_url || ''
          : ''),
      'image'
    );
    if (!link.ok || !link.url || !poster.ok) return null;
    if (item.fit !== undefined && !['contain', 'cover'].includes(item.fit))
      return null;
    if (
      item.purpose !== undefined &&
      !['product', 'scene'].includes(item.purpose)
    )
      return null;
    for (const [key, min, max] of [
      ['width', 1, 50000],
      ['height', 1, 50000],
      ['focalX', 0, 100],
      ['focalY', 0, 100],
      ['scale', 1, 2],
    ] as const) {
      if (
        item[key] !== undefined &&
        (typeof item[key] !== 'number' ||
          !Number.isFinite(item[key]) ||
          item[key] < min ||
          item[key] > max)
      )
        return null;
    }
    const original =
      item.originalUrl === undefined
        ? null
        : normalizeMediaLink(item.originalUrl, item.type);
    if (original && !original.ok) return null;
    media.push({
      ...Object.fromEntries(
        ['purpose', 'width', 'height', 'focalX', 'focalY', 'scale']
          .filter((k) => item[k] !== undefined)
          .map((k) => [k, item[k]])
      ),
      ...(original?.ok && original.url ? { originalUrl: original.url } : {}),
      ...(item.fit ? { fit: item.fit } : {}),
      type: item.type,
      url: link.url,
      poster: poster.url,
      alt: String(item.alt || '').slice(0, 160),
    });
  }
  if (media.some((m) => m.type === 'video')) {
    if (media.length === 1) type = 'video';
    else if (type !== 'carousel') type = 'collection';
  }
  const showTitle = body.show_title ?? previous?.show_title ?? true;
  if (![true, false, 0, 1].includes(showTitle)) return null;
  const template = body.template_id ?? previous?.template_id ?? 'auto';
  const actionTarget =
    body.action_target ?? previous?.action_target ?? 'detail';
  if (
    !PUBLICATION_TEMPLATES.includes(template) ||
    !['detail', 'products'].includes(actionTarget)
  )
    return null;
  if (template === 'carousel' && media.length < 2) return null;
  if (['social_mosaic', 'social_strip'].includes(template) && media.length < 2)
    return null;
  if (template === 'social_pair' && media.length !== 2) return null;
  if (['caption_photo', 'shoppable'].includes(template) && media.length !== 1)
    return null;
  if (template === 'video' && (media.length !== 1 || media[0].type !== 'video'))
    return null;
  const position =
    body.description_position ?? previous?.description_position ?? 'below';
  if (!['above', 'below'].includes(position)) return null;
  const audience = String(body.audience ?? previous?.audience ?? '');
  if (!['', 'men', 'women', 'unisex'].includes(audience)) return null;
  const topic = String(body.topic ?? previous?.topic ?? '');
  if (!['', 'shoes', 'accessories', 'new-trends'].includes(topic)) return null;
  const sponsored = body.sponsored ?? !!previous?.sponsored;
  if (typeof sponsored !== 'boolean' && sponsored !== 0 && sponsored !== 1)
    return null;
  if (type === 'carousel' && media.length < 2) return null;
  if (type === 'video' && (media.length !== 1 || media[0].type !== 'video'))
    return null;
  if (media.some((m) => m.type === 'video' && !m.poster)) return null;
  return {
    showTitle: !!showTitle,
    template,
    actionTarget,
    actionLabel: String(body.action_label ?? previous?.action_label ?? '')
      .trim()
      .slice(0, 40),
    type,
    media,
    description: String(body.description ?? previous?.description ?? '').slice(
      0,
      10000
    ),
    descriptionPosition: 'above',
    sponsored: !!sponsored,
    sponsorName: String(
      body.sponsor_name ?? previous?.sponsor_name ?? 'ZAYROVI'
    )
      .trim()
      .slice(0, 80),
    audience,
    topic,
  };
}

export function publicationTypeForTemplate(
  template: string,
  previous = 'image'
) {
  if (template === 'video') return 'video';
  if (template === 'carousel') return 'carousel';
  if (['social_mosaic', 'social_strip', 'social_pair'].includes(template))
    return 'collection';
  if (
    ['caption_photo', 'shoppable'].includes(template) ||
    (['photo', 'split', 'campaign'].includes(template) && previous === 'video')
  )
    return 'image';
  return previous;
}
