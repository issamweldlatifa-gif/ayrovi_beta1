import type { CommerceProduct, VariantGroup, VariantOffer } from '../../../../shared/commerceProduct';
import type { AyrovixProduct } from '../types';
import { validProductUrl } from './resultPolicy';

/** Compatibility adapter for old screenshot/manual flows. No conversion, extra
 * specs, reviews or sizes are inferred from category/title. The server-supplied
 * canonical product, when present, ALWAYS wins.
 */
export function displayProduct(product: AyrovixProduct): CommerceProduct {
  if (product.canonical) return product.canonical;
  const groups: VariantGroup[] = [];
  for (const [id, name, values] of [['size', 'Size', product.sizes], ['color', 'Color', product.colors]] as const) {
    const unique = [...new Set(values || [])].filter(Boolean);
    if (unique.length) groups.push({ id, name, type: id, required: unique.length > 1,
      options: unique.map(value => ({ id: value, label: value, available: null })) });
  }
  const offers: VariantOffer[] = (product.variantOptions || []).filter(option => option.available).map(option => ({
    id: option.id, selection: { ...(option.size ? { size: option.size } : {}), ...(option.color ? { color: option.color } : {}) },
    sourcePrice: option.price, sourceCurrency: option.currency, ayroviPriceTnd: option.priceTnd,
    available: option.available, unitBreakdown: null, promotion: null,
  }));
  const images = [...new Set([product.image, ...(product.images || [])])].filter(Boolean);
  return {
    id: `${product.source}|${product.sourceUrl || product.title}`,
    identity: { source: 'vision', sourceProductId: null, sourceUrl: validProductUrl(product.sourceUrl) ? product.sourceUrl : null, merchant: product.source || null },
    basic: { title: product.title, brand: product.brand, description: product.description || null, category: null },
    media: { originalImages: images, primaryImage: images[0] || null, processedImage: null, colorImages: product.colorImages || {} },
    pricing: { sourcePrice: product.price, sourceCurrency: product.currency, referencePrice: null,
      discountPercent: null, ayroviPriceTnd: product.priceTnd, ayroviReferenceTnd: product.promo?.originalPriceTnd ?? null,
      pricingVersion: null, unitBreakdown: null, promotion: product.promo || null },
    rating: { value: product.ratingKind === 'merchant' ? product.rating ?? null : null,
      reviewCount: product.ratingKind === 'merchant' ? product.ratingCount ?? null : null },
    variants: { groups, offers }, availability: product.availability,
    attributes: {}, sourceMetadata: {}, verificationStatus: product.priceVerificationStatus || 'PENDING_MANUAL', quoteToken: product.priceToken || null,
  };
}
