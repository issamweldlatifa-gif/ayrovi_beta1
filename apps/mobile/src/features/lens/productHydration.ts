/** Fonctions pures d'enrichissement d'une fiche Lens — aucune vue, aucun réseau. */
import type { LensCandidate, LensLiveStock, LensVariantOption } from '@/api/lens';

const unique = (values: readonly (string | null | undefined)[]): string[] => {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    output.push(value);
  }
  return output;
};

/** Même hôte et même chemin : une redirection vers un autre produit ne se fusionne jamais. */
export function sameMerchantProduct(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const path = (value: string) => value.replace(/\/+$/, '') || '/';
    return (a.protocol === 'http:' || a.protocol === 'https:')
      && (b.protocol === 'http:' || b.protocol === 'https:')
      && a.hostname.toLocaleLowerCase().replace(/^www\./, '') === b.hostname.toLocaleLowerCase().replace(/^www\./, '')
      && path(a.pathname) === path(b.pathname);
  } catch {
    return false;
  }
}

function mergeColorImages(
  current: Record<string, string[]> | null,
  incoming: Record<string, string[]> | null,
): Record<string, string[]> | null {
  const output: Record<string, string[]> = {};
  for (const [name, images] of Object.entries(incoming ?? {})) output[name] = unique(images);
  for (const [name, images] of Object.entries(current ?? {})) output[name] = unique([...(output[name] ?? []), ...images]);
  return Object.keys(output).length ? output : null;
}

/** Résultat complet de `/analyze-url`, limité strictement au lien ouvert. */
export function mergeProductEnrichment(
  current: LensCandidate,
  incoming: LensCandidate,
  requestedUrl: string,
): LensCandidate {
  if (!sameMerchantProduct(current.sourceUrl, requestedUrl)
    || !sameMerchantProduct(incoming.sourceUrl, requestedUrl)) return current;

  const incomingDescription = incoming.description?.trim() ?? '';
  const currentDescription = current.description?.trim() ?? '';
  const merchantPrice = incoming.price != null && incoming.price > 0
    && Boolean(incoming.currency)
    && incoming.priceVerificationStatus === 'VERIFIED';
  const images = unique([current.image, ...current.images, incoming.image, ...incoming.images]);

  return {
    ...current,
    ...(merchantPrice ? {
      price: incoming.price,
      currency: incoming.currency,
      priceTnd: incoming.priceTnd ?? current.priceTnd,
      originalPrice: incoming.originalPrice,
      originalPriceTnd: incoming.originalPriceTnd,
      promo: incoming.promo,
      priceOrigin: 'merchant' as const,
      priceToken: incoming.priceToken,
      priceVerificationStatus: incoming.priceVerificationStatus,
    } : null),
    brand: incoming.brand || current.brand,
    model: incoming.model || current.model,
    description: incomingDescription.length > currentDescription.length ? incoming.description : current.description,
    image: current.image || incoming.image || images[0] || '',
    images,
    colorImages: mergeColorImages(current.colorImages, incoming.colorImages),
    sizes: unique([...incoming.sizes, ...current.sizes]),
    colors: unique([...incoming.colors, ...current.colors]),
    optionLabel: incoming.optionLabel || current.optionLabel,
    availability: incoming.availability !== 'unknown' ? incoming.availability : current.availability,
    availabilityCheckedAt: incoming.availabilityCheckedAt || current.availabilityCheckedAt,
    availabilityExpiresAt: incoming.availabilityExpiresAt || current.availabilityExpiresAt,
    sourceRead: incoming.sourceRead || current.sourceRead,
    sourceCondition: incoming.sourceCondition || current.sourceCondition,
    rating: incoming.rating ?? current.rating,
    ratingCount: incoming.ratingCount ?? current.ratingCount,
    ratingKind: incoming.ratingKind || current.ratingKind,
    variantOptions: incoming.variantOptions.length ? incoming.variantOptions : current.variantOptions,
  };
}

/** Lecture fraîche de `/live-stock` : prix, galerie et variantes deviennent visibles ensemble. */
export function mergeLiveStock(current: LensCandidate, live: LensLiveStock): LensCandidate {
  if (!sameMerchantProduct(current.sourceUrl, live.url)) return current;
  const hasPrice = live.price != null && live.price > 0 && Boolean(live.currency) && Boolean(live.priceToken);
  const images = unique([...live.images, current.image, ...current.images]);
  const variantOptions: LensVariantOption[] = live.variants.map((variant, index) => ({
    id: `${variant.value}-${variant.color || index}`,
    label: variant.color ? `${variant.value} · ${variant.color}` : variant.value,
    size: variant.value || null,
    color: variant.color,
    available: variant.availability !== 'unavailable',
    availability: variant.availability,
    price: live.price,
    currency: live.currency,
    priceTnd: live.priceTnd,
    priceToken: live.priceToken,
  }));
  const expiresAt = Number.isFinite(Date.parse(live.checkedAt))
    ? new Date(Date.parse(live.checkedAt) + 6 * 60 * 60 * 1000).toISOString()
    : current.availabilityExpiresAt;
  const promoStillMatches = current.promo?.priceTnd != null && live.priceTnd != null
    && Math.abs(current.promo.priceTnd - live.priceTnd) < 0.01;

  return {
    ...current,
    ...(hasPrice ? {
      price: live.price,
      currency: live.currency,
      priceTnd: live.priceTnd,
      originalPrice: live.originalPrice,
      originalPriceTnd: live.originalPriceTnd,
      promo: promoStillMatches ? current.promo : null,
      priceOrigin: 'merchant' as const,
      priceToken: live.priceToken,
      priceVerificationStatus: 'VERIFIED' as const,
    } : null),
    availability: live.availability,
    availabilityCheckedAt: live.checkedAt || current.availabilityCheckedAt,
    availabilityExpiresAt: expiresAt,
    image: images[0] || current.image,
    images,
    sizes: live.sizes.length ? unique([...live.sizes, ...current.sizes]) : current.sizes,
    colors: live.colors.length ? unique([...live.colors, ...current.colors]) : current.colors,
    variantOptions: variantOptions.length ? variantOptions : current.variantOptions,
  };
}
