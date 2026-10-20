import type {
  AyWebsProduct,
  AyWebsVariantGroup,
  AyWebsVariantPrice,
} from '@/api/aywebs';

export type AyWebsAddBlockReason =
  | 'SESSION_REQUIRED'
  | 'VARIANT_REQUIRED'
  | 'VARIANT_UNPUBLISHED'
  | 'OUT_OF_STOCK'
  | 'AVAILABILITY_UNKNOWN'
  | 'PRICE_UNVERIFIED'
  | 'PRICE_UNAVAILABLE'
  | 'QUOTE_MISSING';

export interface AyWebsAddReadiness {
  ready: boolean;
  reason: AyWebsAddBlockReason | null;
  selectedVariant: AyWebsVariantPrice | null;
}

const normalize = (value: string): string => value.trim().toLocaleLowerCase();

function optionValue(attributes: Record<string, string>, attribute: string): string {
  const match = Object.entries(attributes).find(([key]) => normalize(key) === normalize(attribute));
  return match?.[1] ?? '';
}

export function findAyWebsVariant(
  groups: AyWebsVariantGroup[],
  variants: AyWebsVariantPrice[],
  selected: Record<string, string>,
): AyWebsVariantPrice | null {
  const requiredGroups = groups.filter((group) => group.values.length > 0);
  if (!requiredGroups.length) return null;
  if (requiredGroups.some((group) => !selected[group.attribute]?.trim())) return null;
  return variants.find((variant) => requiredGroups.every((group) => (
    normalize(optionValue(variant.attributes, group.attribute)) === normalize(selected[group.attribute] ?? '')
  ))) ?? null;
}

export function ayWebsAddReadiness(input: {
  product: AyWebsProduct;
  groups: AyWebsVariantGroup[];
  variants: AyWebsVariantPrice[];
  selected: Record<string, string>;
  sessionId: string;
  quoteToken: string;
}): AyWebsAddReadiness {
  const { product, sessionId, quoteToken } = input;
  const groups = input.groups.length ? input.groups : product.variantGroups;
  const variants = input.variants.length ? input.variants : product.variantPrices;
  if (!sessionId) return { ready: false, reason: 'SESSION_REQUIRED', selectedVariant: null };

  const hasOptions = groups.some((group) => group.values.length > 0);
  let selectedVariant: AyWebsVariantPrice | null = null;
  if (hasOptions) {
    if (groups.some((group) => group.values.length > 0 && !input.selected[group.attribute]?.trim())) {
      return { ready: false, reason: 'VARIANT_REQUIRED', selectedVariant: null };
    }
    selectedVariant = findAyWebsVariant(groups, variants, input.selected);
    if (!selectedVariant) return { ready: false, reason: 'VARIANT_UNPUBLISHED', selectedVariant: null };
    if (selectedVariant.availability === 'OUT_OF_STOCK') {
      return { ready: false, reason: 'OUT_OF_STOCK', selectedVariant };
    }
    if (selectedVariant.availability === 'UNKNOWN') {
      return { ready: false, reason: 'AVAILABILITY_UNKNOWN', selectedVariant };
    }
    if (selectedVariant.priceTnd === null || selectedVariant.priceTnd <= 0) {
      return { ready: false, reason: 'PRICE_UNAVAILABLE', selectedVariant };
    }
  } else {
    if (product.availability === 'OUT_OF_STOCK') {
      return { ready: false, reason: 'OUT_OF_STOCK', selectedVariant: null };
    }
    if (product.availability === 'UNKNOWN') {
      return { ready: false, reason: 'AVAILABILITY_UNKNOWN', selectedVariant: null };
    }
    if (product.ayroviPriceTnd === null || product.ayroviPriceTnd <= 0) {
      return { ready: false, reason: 'PRICE_UNAVAILABLE', selectedVariant: null };
    }
  }

  if (!product.priceVerified || !product.currencyVerified) {
    return { ready: false, reason: 'PRICE_UNVERIFIED', selectedVariant };
  }
  if (!quoteToken) return { ready: false, reason: 'QUOTE_MISSING', selectedVariant };
  return { ready: true, reason: null, selectedVariant };
}
