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

  /*
   * LE PRIX DE LA PAGE MARCHANDE PRIME (02/10/2026). La grille portait l'extrait
   * SerpApi (ou déjà le prix lu par le serveur) ; la fiche complète vient de la
   * page elle-même, prix vérifié à la source, passé par le calculateur. Elle
   * remplace donc l'extrait — et emporte le prix barré du marchand avec elle.
   */
  const merchantPrice = full.price != null && full.price > 0 && full.currency
    && (full.priceVerificationStatus === 'VERIFIED' || full.priceVerified === true);
  const priceFields = merchantPrice ? {
    price: full.price,
    currency: full.currency,
    priceTnd: full.priceTnd ?? current.priceTnd,
    promo: full.promo ?? null,
    exchangeRate: full.exchangeRate ?? current.exchangeRate,
    originalPrice: full.originalPrice ?? null,
    originalPriceTnd: full.originalPriceTnd ?? null,
    priceToken: full.priceToken ?? current.priceToken ?? null,
    priceVerified: true,
    priceVerificationStatus: 'VERIFIED' as const,
  } : {};

  return {
    ...current,
    ...priceFields,
    description,
    images,
    colorImages: Object.keys(colorImages).length ? colorImages : current.colorImages ?? null,
    image: current.image || full.image || '',
    sizes: current.sizes.length ? current.sizes : full.sizes || [],
    optionLabel: current.optionLabel || full.optionLabel || null,
    colors: current.colors.length ? current.colors : full.colors || [],
    brand: current.brand || full.brand || null,
    availability: full.availability && full.availability !== 'unknown' ? full.availability : current.availability,
    variantOptions: current.variantOptions?.length ? current.variantOptions
      : signedContextMatches ? full.variantOptions : current.variantOptions,
  };
}
