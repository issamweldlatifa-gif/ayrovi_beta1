/**
 * OCEREX does not own a pricing formula. Display and order both go through
 * the cart quote and the order-level local delivery already used by checkout.
 */
import type { QatafoDatabase } from '../db/database';
import { quoteCartLine } from '../services/cartQuote';
import { getExchangeRate, millimes, orderLocalDelivery, type PriceBreakdown, type PricingRules } from '../services/pricing';

const PROBE = ['TND', 'EUR', 'USD', 'GBP', 'JPY', 'CNY', 'CAD', 'CHF', 'AUD'];

export function supportedPricingCurrencies(rules: PricingRules): string[] {
  return PROBE.filter((code) => getExchangeRate(rules, code) != null);
}

export interface OcerexQuote {
  line: PriceBreakdown;
  deliveryTND: number;
  totalTND: number;
  pricingVersion: number;
}

export function quoteOcerex(
  db: QatafoDatabase,
  referencePrice: number,
  currency: string,
  title: string,
): OcerexQuote {
  const quoted = quoteCartLine(db, {
    sourcePrice: referencePrice,
    sourceCurrency: currency,
    title: title || 'OCEREX',
    quantity: 1,
  });
  const deliveryTND = orderLocalDelivery(db.getPricingRules());
  return {
    line: quoted.price,
    deliveryTND,
    totalTND: millimes(quoted.price.totalTND + deliveryTND),
    pricingVersion: quoted.price.pricingVersion,
  };
}
