/**
 * MOTEUR DE CALCUL — du prix de la PAGE au prix AYROVI.
 *
 * Le moteur « liens d'abord » ne calcule rien lui-même : il passe le prix lu sur
 * la page marchande à l'UNIQUE moteur du projet (`estimateWithDb`) — taux de
 * change effectif, droits de douane, TVA, frais de service, transport — puis
 * applique la promotion du jour que ce même moteur connaît. Aucun taux, aucun
 * pourcentage de remise n'est écrit ici : un tarif ne vit qu'à un seul endroit.
 *
 * Un prix que le moteur ne sait pas convertir (devise sans taux, article
 * soumis à restriction) n'est pas montré : il n'y a pas de prix AYROVI à
 * afficher, donc pas de carte — jamais un montant inventé.
 */
import type { QatafoDatabase } from '../../db/database';
import type { AyrovixPromo, AyrovixVariantOption } from '../types';
import { estimateWithDb } from '../services/currency';
import type { FactVariant, ProductFacts } from './pageFacts';

export interface PricedOffer {
  /** Total « tout inclus » en dinars, remise déduite. */
  priceTnd: number;
  /** Taux effectivement appliqué (pas le taux nu du marché). */
  exchangeRate: number;
  /** Promotion du jour, avec prix d'origine barré — `null` s'il n'y en a pas. */
  promo: AyrovixPromo | null;
}

export function priceOffer(db: QatafoDatabase, amount: number | null, currency: string | null): PricedOffer | null {
  const estimate = estimateWithDb(db, amount, currency);
  if (!estimate || !Number.isFinite(estimate.priceTnd) || estimate.priceTnd <= 0) return null;
  return { priceTnd: estimate.priceTnd, exchangeRate: estimate.exchangeRate, promo: estimate.promo ?? null };
}

/** Les options de la fiche, chiffrées : seul un prix PROPRE à la variante est converti. */
export function priceVariants(db: QatafoDatabase, facts: ProductFacts): AyrovixVariantOption[] {
  return facts.variants.map((variant: FactVariant) => {
    const own = variant.price != null ? priceOffer(db, variant.price, facts.currency) : null;
    return {
      id: variant.id,
      label: variant.color && variant.value !== variant.color ? `${variant.value} · ${variant.color}` : variant.value,
      size: variant.color && variant.value === variant.color ? null : variant.value,
      color: variant.color,
      // Éligible au choix : le marchand ne l'a pas déclarée épuisée ET indisponible d'emblée.
      available: true,
      availability: variant.availability,
      // Pas de prix propre ⇒ aucun prix recopié (la variante hérite du prix général au devis).
      price: own ? variant.price : null,
      currency: own ? facts.currency : null,
      priceTnd: own ? own.priceTnd : null,
    };
  });
}
