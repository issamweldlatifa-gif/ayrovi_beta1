import type { QatafoDatabase } from '../db/database';
import { calculatePrice, millimes } from './pricing';
import { resolvePromoForQuote } from './promotions';

/** One authoritative quote for a product line in the detail, cart and order.
 * Local delivery is charged once per order, never once per product line.
 */
export function quoteCartLine(
  db: QatafoDatabase,
  item: { sourcePrice: number; sourceCurrency: string; title: string; quantity: number },
) {
  const rules = db.getPricingRules();
  const options = { quantity: item.quantity, includeLocalDelivery: false, title: item.title };
  const original = calculatePrice(rules, item.sourcePrice, item.sourceCurrency, options);
  if (!original || original.restricted) throw new Error('INVALID_CART_PRICE');

  const candidate = resolvePromoForQuote(db, { categoryId: original.categoryId });
  const discountTND = candidate ? millimes(original.convertedPriceTND * candidate.percent / 100) : 0;
  const repriced = discountTND > 0
    ? calculatePrice(rules, item.sourcePrice, item.sourceCurrency, { ...options, discountTND })
    : null;
  if (repriced?.restricted) throw new Error('INVALID_CART_PRICE');
  const promo = candidate && discountTND > 0 && repriced ? candidate : null;
  const price = promo && repriced ? repriced : original;
  return {
    price,
    originalLineTotalTND: promo ? original.totalTND : null,
    promo: promo ? { ...promo, discountTND } : null,
  };
}
