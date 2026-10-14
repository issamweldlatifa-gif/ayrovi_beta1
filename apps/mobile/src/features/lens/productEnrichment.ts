import type { LensCandidate, LensProductFact } from '@/api/lens';

function canonicalProduct(value: string): string {
  try {
    const url = new URL(value);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    return `${url.protocol}//${url.hostname.toLocaleLowerCase().replace(/^www\./, '')}${path}`;
  } catch {
    return '';
  }
}

/** L'enrichissement ne peut jamais greffer la fiche d'un autre produit. */
export function sameMerchantProduct(left: string, right: string): boolean {
  const a = canonicalProduct(left);
  const b = canonicalProduct(right);
  return Boolean(a && b && a === b);
}

function mergeFacts(current: LensProductFact[] = [], incoming: LensProductFact[] = []): LensProductFact[] {
  const seen = new Set<string>();
  const result: LensProductFact[] = [];
  for (const fact of [...current, ...incoming]) {
    const identity = `${fact.label.trim().toLocaleLowerCase()}|${fact.value.trim().toLocaleLowerCase()}`;
    if (!fact.label.trim() || !fact.value.trim() || seen.has(identity)) continue;
    seen.add(identity);
    result.push(fact);
    if (result.length >= 18) break;
  }
  return result;
}

/**
 * Fusion progressive d'une carte Lens avec la vraie page marchande.
 *
 * Les médias/descriptions peuvent compléter immédiatement. Un prix ou une
 * variante ne remplace la carte que si la nouvelle réponse porte sa propre
 * preuve signée — aucun enrichissement visuel ne peut élever un prix non sûr.
 */
export function mergeLensProduct(current: LensCandidate, full: LensCandidate): LensCandidate {
  if (!sameMerchantProduct(current.sourceUrl, full.sourceUrl)) return current;

  const images = [...new Set([
    current.image,
    ...(current.images || []),
    full.image,
    ...(full.images || []),
  ].filter(Boolean))];
  const colorImages: Record<string, string[]> = { ...(full.colorImages || {}) };
  for (const [color, urls] of Object.entries(current.colorImages || {})) {
    colorImages[color] = [...new Set([...(colorImages[color] || []), ...urls])];
  }
  const description = (full.description || '').trim().length > (current.description || '').trim().length
    ? full.description : current.description;
  // PENDING_MANUAL peut lui aussi porter un jeton serveur valide : le statut ne
  // prétend pas que le prix est vérifié, mais le jeton lie bien montant, titre,
  // URL et statut. Le rejeter cassait l’ajout au panier des offres à réviser.
  const tokenizedPrice = Boolean(full.priceToken) && full.price != null && Boolean(full.currency);
  const enrichedVariants = full.variantOptions.length
    ? (tokenizedPrice ? full.variantOptions : full.variantOptions.map((option) => ({
        ...option,
        // Sans preuve générale assortie au titre enrichi, ces champs ne doivent
        // pas détourner l'ancienne quote. L'option et son stock restent utiles.
        price: null,
        currency: null,
        priceTnd: null,
        priceToken: null,
      })))
    : current.variantOptions;

  return {
    ...current,
    ...(tokenizedPrice ? {
      price: full.price,
      currency: full.currency,
      priceTnd: full.priceTnd,
      originalPrice: full.originalPrice,
      originalPriceTnd: full.originalPriceTnd,
      promo: full.promo,
      priceOrigin: 'merchant' as const,
      priceToken: full.priceToken,
      priceVerificationStatus: full.priceVerificationStatus,
    } : {}),
    // Le titre fait partie de la preuve signée. Ne jamais garder un ancien
    // jeton tout en lui greffant le titre différent d'une réponse non signée.
    title: tokenizedPrice ? (full.title || current.title) : current.title,
    brand: full.brand || current.brand,
    model: full.model || current.model,
    description,
    details: mergeFacts(current.details, full.details),
    image: current.image || full.image || images[0] || '',
    images,
    colorImages: Object.keys(colorImages).length ? colorImages : null,
    colors: full.colors.length ? full.colors : current.colors,
    sizes: full.sizes.length ? full.sizes : current.sizes,
    optionLabel: full.optionLabel || current.optionLabel,
    variantOptions: enrichedVariants,
    availability: full.availability !== 'unknown' ? full.availability : current.availability,
    availabilityCheckedAt: full.availabilityCheckedAt || current.availabilityCheckedAt,
    availabilityExpiresAt: full.availabilityExpiresAt || current.availabilityExpiresAt,
    rating: full.ratingKind === 'merchant' && full.rating != null ? full.rating : current.rating,
    ratingCount: full.ratingKind === 'merchant' && full.rating != null ? full.ratingCount : current.ratingCount,
    ratingKind: full.ratingKind === 'merchant' && full.rating != null ? 'merchant' : current.ratingKind,
  };
}
