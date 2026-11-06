import { normalizeMediaLink } from './mediaLinks';
export const PUBLICATION_TYPES = ['image', 'carousel', 'video', 'product', 'collection', 'editorial'] as const;
export type PublicationType = typeof PUBLICATION_TYPES[number];
export interface PublicationMedia { type: 'image' | 'video'; url: string; poster: string; alt: string }
export interface PublicationContent { type: PublicationType; media: PublicationMedia[]; description: string; descriptionPosition: 'above' | 'below'; sponsored: boolean; sponsorName: string; audience: string; topic: string }
export function normalizePublicationContent(body: any, previous?: any): PublicationContent | null {
  const type = body.post_type ?? previous?.post_type ?? 'image';
  if (!PUBLICATION_TYPES.includes(type)) return null;
  let source: any;
  try { source = body.media ?? (previous?.media_json ? JSON.parse(previous.media_json) : []); } catch { return null; }
  if (!Array.isArray(source) || source.length > 10) return null;
  const media: PublicationMedia[] = [];
  for (const item of source) {
    if (!item || !['image','video'].includes(item.type)) return null;
    const link = normalizeMediaLink(item.url, item.type);
    const poster = normalizeMediaLink(item.poster || (item.type === 'video' ? body.image_url || previous?.image_url || '' : ''), 'image');
    if (!link.ok || !link.url || !poster.ok) return null;
    media.push({ type: item.type, url: link.url, poster: poster.url, alt: String(item.alt || '').slice(0, 160) });
  }
  const position = body.description_position ?? previous?.description_position ?? 'below';
  if (!['above','below'].includes(position)) return null;
  const audience = String(body.audience ?? previous?.audience ?? '');
  if (!['','men','women','unisex'].includes(audience)) return null;
  const topic = String(body.topic ?? previous?.topic ?? '');
  if (!['','shoes','accessories','new-trends'].includes(topic)) return null;
  const sponsored = body.sponsored ?? !!previous?.sponsored;
  if (typeof sponsored !== 'boolean' && sponsored !== 0 && sponsored !== 1) return null;
  if (type === 'carousel' && (media.length < 2 || media.some(m => m.type !== 'image'))) return null;
  if (type === 'video' && (media.length !== 1 || media[0].type !== 'video' || !media[0].poster)) return null;
  if (type !== 'video' && media.some(m => m.type !== 'image')) return null;
  return { type, media, description: String(body.description ?? previous?.description ?? '').slice(0, 10000), descriptionPosition: position,
    sponsored: !!sponsored, sponsorName: String(body.sponsor_name ?? previous?.sponsor_name ?? 'ZAYROVI').trim().slice(0,80), audience, topic };
}
