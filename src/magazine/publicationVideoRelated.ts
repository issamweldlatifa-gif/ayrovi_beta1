import { entries } from '../../assets/media/reels-owned-v2/manifest.json';

const ownedDuration = new Map(entries.map(entry => [entry.videoUrl, entry.durationSeconds]));

/** Optional, bounded extension to the existing private publication feed. */
export function parseLinkedPublicationProducts(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (typeof value !== 'string' || value.length > 2419) return null;
  const ids = value.split(',');
  return ids.length <= 20 && ids.every(id => /^[A-Za-z0-9_.:-]{1,120}$/.test(id)) ? [...new Set(ids)] : null;
}

export function linkedPublicationProductFilter(ids: string[]) {
  const params = ids.map(() => '?').join(',');
  return {
    sql: `(pub.content_mode='shoppable' AND (pub.product_id IN (${params}) OR EXISTS(
      SELECT 1 FROM content_products cp WHERE cp.content_kind='publication' AND cp.content_id=pub.id AND cp.product_id IN (${params})
    )))`,
    args: [...ids, ...ids],
  };
}

/** Keep old CRM records intact; only enrich known bundled video URLs on read. */
export function publicationMediaWithDuration(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    const media: unknown = JSON.parse(raw);
    if (!Array.isArray(media) || media.length > 10) return raw;
    let changed = false;
    const enriched = media.map(item => {
      const durationSeconds = item?.type === 'video' && item.durationSeconds == null ? ownedDuration.get(item.url) : undefined;
      if (!durationSeconds) return item;
      changed = true;
      return { ...item, durationSeconds };
    });
    return changed ? JSON.stringify(enriched) : raw;
  } catch {
    return raw;
  }
}
