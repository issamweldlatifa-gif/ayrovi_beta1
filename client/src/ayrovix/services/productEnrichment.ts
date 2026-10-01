import type { AyrovixProduct } from '../types';

/** Only merge a full extraction from the exact merchant page Lens opened. */
function sameMerchantProduct(left: string, right: string): boolean {
  try {
    const a = new URL(left);
    const b = new URL(right);
    const normalizePath = (value: string) => value.replace(/\/+$/, '') || '/';
    return ['http:', 'https:'].includes(a.protocol)
      && ['http:', 'https:'].includes(b.protocol)
      && a.hostname.toLowerCase().replace(/^www\./, '') === b.hostname.toLowerCase().replace(/^www\./, '')
      && normalizePath(a.pathname) === normalizePath(b.pathname);
  } catch {
    return false;
  }
}

export function mergeProductEnrichment(
  current: AyrovixProduct | null,
  full: AyrovixProduct,
  requestedUrl: string,
): AyrovixProduct | null {
  if (!current || current.sourceUrl !== requestedUrl || !sameMerchantProduct(full.sourceUrl, requestedUrl)) return current;

  const images = [...new Set([...(current.images || []), ...(full.images || [])].filter(Boolean))];
  const colorImages = { ...(full.colorImages || {}) };
  for (const [key, currentSet] of Object.entries(current.colorImages || {})) {
    colorImages[key] = [...new Set([...(colorImages[key] || []), ...currentSet])];
  }
  const description = (full.description || '').trim().length > (current.description || '').trim().length
    ? full.description : current.description;
  const signedContextMatches = full.title === current.title
    && full.sourceUrl === current.sourceUrl
    && full.priceVerificationStatus === current.priceVerificationStatus;

  return {
    ...current,
    description,
    images,
    colorImages: Object.keys(colorImages).length ? colorImages : current.colorImages ?? null,
    image: current.image || full.image || '',
    sizes: current.sizes.length ? current.sizes : full.sizes || [],
    optionLabel: current.optionLabel || full.optionLabel || null,
    colors: current.colors.length ? current.colors : full.colors || [],
    brand: current.brand || full.brand || null,
    availability: full.availability && full.availability !== 'unknown' ? full.availability : current.availability,
    // La date de lecture suit la source du stock affiché : celle de la fiche ouverte,
    // sauf si la carte arrivait déjà avec la sienne (page lue par la grille).
    availabilityCheckedAt: current.availabilityCheckedAt ?? full.availabilityCheckedAt ?? null,
    availabilityExpiresAt: current.availabilityCheckedAt ? current.availabilityExpiresAt ?? null : full.availabilityExpiresAt ?? null,
    variantOptions: current.variantOptions?.length ? current.variantOptions
      : signedContextMatches ? full.variantOptions : current.variantOptions,
  };
}
