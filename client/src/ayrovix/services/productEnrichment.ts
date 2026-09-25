import type { AyrovixProduct } from '../types';

/** Add source-backed details without mixing two differently signed offers.
 * A candidate's general quote remains intact; a variant's own price/currency/
 * token may be adopted only when the server signed it for that same product,
 * URL and verification status. A different identity still enriches media and
 * description, but keeps variant choices on the clearly labelled general quote.
 */
export function mergeProductEnrichment(
  current: AyrovixProduct | null,
  full: AyrovixProduct,
  requestedUrl: string,
): AyrovixProduct | null {
  if (!current || current.sourceUrl !== requestedUrl) return current;

  const images = [...new Set([...(current.images || []), ...(full.images || [])].filter(Boolean))];
  const colorImages = { ...(full.colorImages || {}) };
  if (current.colorImages) {
    for (const [key, set] of Object.entries(current.colorImages)) {
      colorImages[key] = [...new Set([...(colorImages[key] || []), ...set])];
    }
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
    colors: current.colors.length ? current.colors : full.colors || [],
    brand: current.brand || full.brand || null,
    availability: full.availability && full.availability !== 'unknown' ? full.availability : current.availability,
    variantOptions: current.variantOptions?.length ? current.variantOptions
      : signedContextMatches ? full.variantOptions : current.variantOptions,
  };
}
