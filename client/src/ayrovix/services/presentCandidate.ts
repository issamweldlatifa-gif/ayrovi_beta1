import type { AyrovixCandidate } from '../types';

/** Read-only presentation projection: flat transport fields cannot override
 * the server's priced and signed canonical source facts. Search-only match and
 * multi-merchant suggestions remain on the candidate, never on the product.
 */
export function presentCandidate(candidate: AyrovixCandidate): AyrovixCandidate {
  const product = candidate.canonical;
  if (!product) return candidate;
  const size = product.variants.groups.find(group => group.type === 'size');
  const color = product.variants.groups.find(group => group.type === 'color');
  return {
    ...candidate,
    title: product.basic.title, description: product.basic.description, brand: product.basic.brand,
    source: product.identity.merchant || '', sourceUrl: product.identity.sourceUrl || '',
    image: product.media.primaryImage || '', images: product.media.originalImages,
    colorImages: product.media.colorImages,
    price: product.pricing.sourcePrice, currency: product.pricing.sourceCurrency,
    priceTnd: product.pricing.ayroviPriceTnd, promo: product.pricing.promotion,
    rating: product.rating.value, ratingCount: product.rating.reviewCount,
    ratingKind: product.rating.value == null ? 'match' : 'merchant',
    sizes: size?.options.map(option => option.label) || [],
    colors: color?.options.map(option => option.label) || [],
    availability: product.availability, priceVerificationStatus: product.verificationStatus,
  };
}
