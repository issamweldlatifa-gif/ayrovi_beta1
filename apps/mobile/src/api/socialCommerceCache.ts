import type { DiscoveryPage } from './socialCommerce';

const MAX_AGE = 24 * 60 * 60 * 1000;

/** Only public editorial metadata is persisted. No cursors, prices, stock, targets or reactions. */
export function editorialSnapshot(page: DiscoveryPage, now = Date.now()): DiscoveryPage {
  return {
    edition: page.edition && Date.parse(page.edition.endsAt) > now ? page.edition : null,
    nextCursor: null,
    items: page.items.filter(item => item.kind !== 'pick' && (item.kind !== 'story' || !item.story.expiresAt || Date.parse(item.story.expiresAt) > now)).map(item => {
      if (item.kind === 'reel') return { ...item, products: [], reel: { ...item.reel, product: null, products: [], myReaction: undefined } };
      if (item.kind === 'story') return { ...item, story: { ...item.story, product: null, cta: '', targetUrl: '', productId: '', promotionId: '', arrivalId: '' } };
      if (item.kind === 'look') return { ...item, pins: [] };
      return item;
    }),
  };
}

export function readEditorialSnapshot(raw: string | null, now = Date.now()): DiscoveryPage | null {
  if (!raw) return null;
  try {
    const { savedAt, page } = JSON.parse(raw) as { savedAt: number; page: DiscoveryPage };
    if (!Number.isFinite(savedAt) || savedAt > now || now - savedAt >= MAX_AGE || !Array.isArray(page?.items) || page.items.length > 8) return null;
    return editorialSnapshot(page, now);
  } catch { return null; }
}
