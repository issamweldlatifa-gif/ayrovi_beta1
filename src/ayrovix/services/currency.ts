import type { QatafoDatabase } from '../../db/database';
import { calculatePrice, getEffectiveExchangeRate } from '../../services/pricing';
import type { PricingRules } from '../../services/pricing';

/**
 * AYROVIX · Currency layer — réutilise EXCLUSIVEMENT les règles du Calculator AYROVI
 * (pricing_config versionné). Aucun taux en dur ici : la même source de vérité que le panier.
 */

export interface TndEstimate {
  priceTnd: number;      // total "tout inclus" (produit + transport + douane + service)
  exchangeRate: number;  // taux EFFECTIF appliqué (marché × buffer) — identique au calcul
  breakdown: {
    convertedPriceTND: number;
    customsFeeTND: number;
    shippingFeeTND: number;
    serviceFeeTND: number;
  };
}

export function estimateTnd(rules: PricingRules, price: number | null, currency: string | null): TndEstimate | null {
  if (!price || !currency || !Number.isFinite(price) || price <= 0) return null;
  // Audit 23/09/2026 : afficher le taux nu (4.0) tandis que le moteur calcule au taux
  // effectif bufferisé (4.12) présentait deux chiffres contradictoires pour un même produit.
  // On expose désormais le taux réellement appliqué.
  const rate = getEffectiveExchangeRate(rules, currency);
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
