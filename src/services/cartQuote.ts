import { CatalogueSaleError, catalogId } from '../catalogue/localSale';
import type { PriceBreakdown } from './pricing';
import type { QatafoDatabase } from '../db/database';
import { calculatePrice, millimes } from './pricing';
import { resolvePromoForQuote } from './promotions';

/** One authoritative quote for a product line in the detail, cart and order.
 * Local delivery is charged once per order, never once per product line.
 */
export function quoteCartLine(
  db: QatafoDatabase,
  item: {
    sourcePrice: number;
    sourceCurrency: string;
    title: string;
    quantity: number;
    externalId?: string | null;
    priceTND?: number;
  }
) {
  const rules = db.getPricingRules();
  const id = catalogId(item.externalId);
  let product = id
    ? db.get<any>(
        "SELECT final_price FROM products WHERE id=? AND status='ACTIVE'",
        id
      )
    : null;
  // Keep an unavailable line readable/removable at its last recorded amount.
  // Price trust and the order stock gate still block its purchase.
  if (id && !(product?.final_price > 0) && Number(item.priceTND) > 0)
    product = { final_price: item.priceTND };
  if (id && !(product?.final_price > 0))
    throw new CatalogueSaleError(
      'PRODUCT_UNAVAILABLE',
      'Produit indisponible.'
    );
  if (product?.final_price > 0) {
    const amount = millimes(product.final_price * item.quantity);
    const price: PriceBreakdown = {
      originalPrice: product.final_price,
      currency: 'TND',
      exchangeRate: 1,
      convertedPriceTND: amount,
      freightTND: 0,
      cifTND: amount,
      dutyTND: 0,
      tvaTND: 0,
      rpdTND: 0,
      customsFeeTND: 0,
      shippingFeeTND: 0,
      serviceFeeTND: 0,
      expressFeeTND: 0,
      discountTND: 0,
      localDeliveryTND: 0,
      weightKg: 0,
      requiresWeightValidation: false,
      categoryId: 'local_catalogue',
      categoryLabel: 'Catalogue',
      categoryStatus: 'ALLOWED',
      restricted: false,
      estimateUncertain: false,
      totalTND: amount,
      pricingVersion: rules.version,
    };
    return { price, promo: null, originalLineTotalTND: null };
  }

  const options = {
    quantity: item.quantity,
    includeLocalDelivery: false,
    title: item.title,
  };
  const original = calculatePrice(
    rules,
    item.sourcePrice,
    item.sourceCurrency,
    options
  );
  if (!original || original.restricted) throw new Error('INVALID_CART_PRICE');

  const candidate = resolvePromoForQuote(db, {
    categoryId: original.categoryId,
  });
  const discountTND = candidate
    ? millimes((original.convertedPriceTND * candidate.percent) / 100)
    : 0;
  const repriced =
    discountTND > 0
      ? calculatePrice(rules, item.sourcePrice, item.sourceCurrency, {
          ...options,
          discountTND,
        })
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
