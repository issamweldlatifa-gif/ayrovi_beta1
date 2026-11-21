import { useQuery } from '@tanstack/react-query';
import { BLACK_FRIDAY_MAX_PRODUCTS, DEFAULT_BLACK_FRIDAY, blackFridayDiscount, normalizeBlackFriday, resolveBlackFridayCollections, type BlackFridaySettings } from '../../../../shared/blackFriday';
import { apiGetData } from './client';
import { parseLinkedProduct, type LinkedProduct } from './linkedProduct';

export type BlackFridayOffer = LinkedProduct & { discountPercent: number; compareAtPrice: number };
export type BlackFridayCampaign = Omit<BlackFridaySettings, 'enabled' | 'productIds'> & { products: BlackFridayOffer[]; maxDiscount: number };

export function parseBlackFriday(value: unknown): BlackFridayCampaign | null {
  if (!value || typeof value !== 'object') return null;
  const { title, ctaFr, ctaAr, cover, products } = value as Record<string, unknown>;
  if (typeof title !== 'string' || !title.trim() || typeof ctaFr !== 'string' || !ctaFr.trim() || typeof ctaAr !== 'string' || !ctaAr.trim() || !Array.isArray(products)) return null;
  const ids = new Set<string>();
  const offers = products.slice(0, BLACK_FRIDAY_MAX_PRODUCTS).flatMap(entry => {
    const product = parseLinkedProduct(entry);
    if (!product?.available || !product.image || !product.compareAtPrice || ids.has(product.id)) return [];
    const discountPercent = blackFridayDiscount(product.price, product.compareAtPrice);
    if (!discountPercent) return [];
    ids.add(product.id);
    return [{ ...product, compareAtPrice: product.compareAtPrice, discountPercent }];
  });
  if (!offers.length) return null;
  const settings = normalizeBlackFriday({ ...DEFAULT_BLACK_FRIDAY, ...value, enabled: true,
    cover: typeof cover === 'string' ? cover : '', productIds: offers.map(item => item.id) });
  if (!settings) return null;
  const { enabled: _active, productIds: _ids, ...display } = settings;
  return { ...display, cover: display.cover || offers.at(-1)!.image, featureCover: display.featureCover || display.cover || offers[0]!.image,
    products: offers, maxDiscount: Math.max(...offers.map(offer => offer.discountPercent)) };
}

export function blackFridayCollections(campaign: BlackFridayCampaign, now = Date.now()) {
  return resolveBlackFridayCollections(campaign.collections.length ? campaign.collections : [{
    id: 'all', titleFr: campaign.featureTitleFr, titleAr: campaign.featureTitleAr, cover: campaign.featureCover,
    endsAt: campaign.endsAt, productIds: campaign.products.map(offer => offer.id), demo: false,
  }], campaign.products, campaign.endsAt, now);
}
export type BlackFridaySelection = ReturnType<typeof blackFridayCollections>[number];

export function useBlackFriday() {
  return useQuery<BlackFridayCampaign | null>({ queryKey: ['home', 'black-friday'], staleTime: 30_000,
    refetchInterval: query => {
      const campaign = query.state.data;
      if (!campaign) return false;
      const now = Date.now();
      const deadlines = [campaign.endsAt, ...campaign.collections.map(item => item.endsAt)]
        .map(value => Date.parse(value)).filter(Number.isFinite);
      return deadlines.length ? Math.max(1_000, Math.min(60_000, ...deadlines.map(end => end - now))) : false;
    },
    queryFn: async ({ signal }) => parseBlackFriday(await apiGetData<unknown>('/api/public/home-black-friday', { signal })),
  });
}
