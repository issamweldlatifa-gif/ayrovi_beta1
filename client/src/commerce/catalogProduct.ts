import type { ScrapedProduct, StoreType } from '../types';

/**
 * Catalogue → produit de commande.
 *
 * Pourquoi ce fichier : le parcours d'achat a deux portes — la recherche visuelle (LENS, qui produit
 * un `ScrapedProduct` extrait d'un lien) et le catalogue (qui sert des produits déjà connus, avec
 * leurs prix calculés côté serveur). Ces deux portes mènent au MÊME tiroir de commande.
 * Sans convertisseur, le catalogue s'arrêtait à l'image : on voyait le produit, on ne pouvait pas le
 * commander. Une seule fonction fait la traduction, et elle est testée.
 *
 * Règle : on ne recalcule RIEN ici. Les prix servis par l'API (`convertedPrice`, `customsFee`,
 * `shippingFee`, `serviceFee`, `finalPrice`) sont ceux qui font foi ; le tiroir les affiche tels
 * quels et le serveur reste seul juge au moment de la commande.
 */

/** Plateformes connues du modèle : le catalogue nomme sa source en clair, on la ramène au type. */
const STORE_BY_PLATFORM: Record<string, StoreType> = {
  SHEIN: 'shein',
  AMAZON: 'amazon',
  TEMU: 'temu',
  ALIEXPRESS: 'aliexpress',
};

export interface CatalogProduct {
  id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  additionalImages?: string[] | null;
  brandName?: string | null;
  category?: string | null;
  sourceUrl?: string | null;
  sourcePlatform?: string | null;
  originalPrice?: number | null;
  currency?: string | null;
  convertedPrice?: number | null;
  shippingFee?: number | null;
  serviceFee?: number | null;
  finalPrice?: number | null;
  stockStatus?: string | null;
}

const numberOrZero = (value: unknown): number => (Number.isFinite(Number(value)) ? Number(value) : 0);

export function catalogProductToScraped(product: CatalogProduct): ScrapedProduct {
  const platform = String(product.sourcePlatform || '').trim().toUpperCase();
  const images = [product.image, ...(Array.isArray(product.additionalImages) ? product.additionalImages : [])]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const outOfStock = String(product.stockStatus || '').toUpperCase() === 'OUT_OF_STOCK';
  return {
    // L'identité garde la trace du catalogue : un produit du catalogue n'est pas une extraction.
    id: `catalog:${product.id}`,
    store: STORE_BY_PLATFORM[platform] ?? 'generic',
    storeName: product.sourcePlatform || product.brandName || 'AYROVI',
    url: product.sourceUrl || '',
    externalId: product.id,
    title: product.name,
    description: product.description ?? null,
    images: images.length ? images : [''],
    mainImage: images[0] ?? '',
    sourcePrice: numberOrZero(product.originalPrice),
    sourceCurrency: product.currency || 'EUR',
    convertedPriceTND: numberOrZero(product.convertedPrice),
    estimatedShippingTND: numberOrZero(product.shippingFee),
    serviceFeeTND: numberOrZero(product.serviceFee),
    totalPriceTND: numberOrZero(product.finalPrice),
    variants: {},
    selectedVariant: null,
    availability: outOfStock ? 'out_of_stock' : 'in_stock',
    brand: product.brandName ?? null,
    scrapedAt: new Date().toISOString(),
  };
}
