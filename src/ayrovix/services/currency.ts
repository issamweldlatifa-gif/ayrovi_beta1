import type { QatafoDatabase } from '../../db/database';
import { calculatePrice, getExchangeRate } from '../../services/pricing';
import type { PricingRules } from '../../services/pricing';

/**
 * AYROVIX · Currency layer — réutilise EXCLUSIVEMENT les règles du Calculator AYROVI
 * (pricing_config versionné). Aucun taux en dur ici : la même source de vérité que le panier.
 */

export interface TndEstimate {
  priceTnd: number;      // total "tout inclus" (produit + transport + douane + service)
  exchangeRate: number;
  breakdown: {
    convertedPriceTND: number;
    customsFeeTND: number;
    shippingFeeTND: number;
    serviceFeeTND: number;
  };
}

export function estimateTnd(rules: PricingRules, price: number | null, currency: string | null): TndEstimate | null {
  if (!price || !currency || !Number.isFinite(price) || price <= 0) return null;
  const rate = getExchangeRate(rules, currency);
  if (!rate) return null;
  const priced = calculatePrice(rules, price, currency);
  if (priced?.restricted) return null;
  if (!priced) return null;
  return {
    priceTnd: priced.totalTND,
    exchangeRate: rate,
    breakdown: {
      convertedPriceTND: priced.convertedPriceTND,
      customsFeeTND: priced.customsFeeTND,
      shippingFeeTND: priced.shippingFeeTND,
      serviceFeeTND: priced.serviceFeeTND,
    },
  };
}

export function estimateWithDb(db: QatafoDatabase, price: number | null, currency: string | null): TndEstimate | null {
  return estimateTnd(db.getPricingRules(), price, currency);
}
