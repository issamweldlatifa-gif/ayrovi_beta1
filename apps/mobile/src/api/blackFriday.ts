import { useQuery } from '@tanstack/react-query';
import { BLACK_FRIDAY_MAX_PRODUCTS, blackFridayDiscount } from '../../../../shared/blackFriday';
import { apiGetData } from './client';
import { parseLinkedProduct, type LinkedProduct } from './linkedProduct';

export type BlackFridayOffer = LinkedProduct & { discountPercent: number; compareAtPrice: number };
export type BlackFridayCampaign = { title: string; ctaFr: string; ctaAr: string; cover: string; products: BlackFridayOffer[]; maxDiscount: number };

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
  return offers.length ? { title, ctaFr, ctaAr, cover: typeof cover === 'string' && cover ? cover : offers.at(-1)!.image,
    products: offers, maxDiscount: Math.max(...offers.map(offer => offer.discountPercent)) } : null;
}

export function useBlackFriday() {
  return useQuery({ queryKey: ['home', 'black-friday'], staleTime: 30_000,
    queryFn: async ({ signal }) => parseBlackFriday(await apiGetData<unknown>('/api/public/home-black-friday', { signal })),
  });
}
