import type { QatafoDatabase } from '../../db/database';
import { calculatePrice, getEffectiveExchangeRate } from '../../services/pricing';
import { resolvePromoForQuote } from '../../services/promotions';
import type { PricingRules } from '../../services/pricing';

/**
 * AYROVIX · Currency layer — réutilise EXCLUSIVEMENT les règles du Calculator AYROVI
 * (pricing_config versionné). Aucun taux en dur ici : la même source de vérité que le panier.
 */

export interface TndEstimate {
  priceTnd: number;      // total "tout inclus" (produit + transport + douane + service)
  exchangeRate: number;  // taux EFFECTIF appliqué (marché × buffer) — identique au calcul
  /** Cargo lourd > 5 kg : fret soumis à validation finale de l'équipe ops. */
  requiresWeightValidation: boolean;
  /** Promo du jour (management 23/09/2026) : prix affiché remisé + original. */
  promo: { percent: number; label: string; priceTnd: number; originalPriceTnd: number } | null;
  breakdown: {
    convertedPriceTND: number;
    customsFeeTND: number;
    shippingFeeTND: number;
    serviceFeeTND: number;
  };
}

export function estimateTnd(
  rules: PricingRules,
  price: number | null,
  currency: string | null,
  promo?: { percent: number; label: string } | null,
): TndEstimate | null {
  if (!price || !currency || !Number.isFinite(price) || price <= 0) return null;
  // Audit 23/09/2026 : afficher le taux nu (4.0) tandis que le moteur calcule au taux
  // effectif bufferisé (4.12) présentait deux chiffres contradictoires pour un même produit.
  // On expose désormais le taux réellement appliqué.
  const rate = getEffectiveExchangeRate(rules, currency);
  if (!rate) return null;
  const priced = calculatePrice(rules, price, currency);
  if (priced?.restricted) return null;
  if (!priced) return null;
  // Promo (management 23/09/2026) : remise sur le prix converti, recalculée par
  // LE moteur (discountTND) — l'affichage montre l'original barré + le remisé.
  let promoInfo: TndEstimate['promo'] = null;
  let totalTND = priced.totalTND;
  if (promo && promo.percent > 0) {
    const discount = Math.round(priced.convertedPriceTND * promo.percent / 100 * 1000) / 1000;
    if (discount > 0) {
      const repriced = calculatePrice(rules, price, currency, { discountTND: discount });
      if (repriced && !repriced.restricted) {
        promoInfo = { percent: promo.percent, label: promo.label, priceTnd: repriced.totalTND, originalPriceTnd: priced.totalTND };
        totalTND = repriced.totalTND;
      }
    }
  }
  return {
    priceTnd: totalTND,
    exchangeRate: rate,
    requiresWeightValidation: priced.requiresWeightValidation,
    promo: promoInfo,
    breakdown: {
      convertedPriceTND: priced.convertedPriceTND,
      customsFeeTND: priced.customsFeeTND,
      shippingFeeTND: priced.shippingFeeTND,
      serviceFeeTND: priced.serviceFeeTND,
    },
  };
}

export function estimateWithDb(db: QatafoDatabase, price: number | null, currency: string | null): TndEstimate | null {
  // Promo du JOUR pour les estimations Lens/Scraper (la catégorie n'est pas
  // encore résolue ici — le panier/checkout appliquent la promo catégorisée).
  const promo = resolvePromoForQuote(db);
  return estimateTnd(db.getPricingRules(), price, currency, promo ? { percent: promo.percent, label: promo.label } : null);
}
