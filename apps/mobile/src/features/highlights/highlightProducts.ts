import type { Reel } from '@/api/social';
import type { LinkedProduct } from '@/api/linkedProduct';

export const hasHighlightImage = (product: LinkedProduct | null): product is LinkedProduct => Boolean(product?.available && product.image);

export function highlightProducts(reel: Reel): LinkedProduct[] {
  const primary = reel.product;
  if (!hasHighlightImage(primary)) return [];
  return [primary, ...(reel.products ?? []).filter(product => product.id !== primary.id && hasHighlightImage(product))];
}
