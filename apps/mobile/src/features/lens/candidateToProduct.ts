/**
 * Résultat Lens → carte produit de l'application (la MÊME carte que la boutique).
 *
 * Règles (alignées sur la carte boutique du site) :
 *  • le prix affiché est `priceTnd` calculé par le serveur — jamais un calcul local ;
 *  • pas de prix ⇒ « Pas de tarif » (0 n'est jamais affiché comme prix) ;
 *  • disponibilité inconnue ⇒ « Stock non confirmé », jamais « en stock » inventé.
 */
import type { CatalogProduct, StockStatus } from '@/api/catalog';
import type { LensAvailability, LensCandidate } from '@/api/lens';

const STOCK_BY_AVAILABILITY: Record<LensAvailability, StockStatus> = {
  in_stock: 'AVAILABLE',
  limited: 'LIMITED',
  out_of_stock: 'OUT_OF_STOCK',
  unknown: 'UNKNOWN',
};

export function candidateToProduct(candidate: LensCandidate): CatalogProduct {
  const gallery = (candidate.images ?? []).filter((url) => url && url !== candidate.image);
  return {
    id: candidate.id,
    name: candidate.title,
    description: candidate.description ?? '',
    image: candidate.image ?? '',
    additionalImages: gallery,
    brandId: '',
    brandName: candidate.brand ?? '',
    category: '',
    sourceUrl: candidate.sourceUrl ?? '',
    sourcePlatform: candidate.source ?? '',
    originalPrice: candidate.originalPrice ?? 0,
    currency: candidate.currency ?? '',
    convertedPrice: 0,
    customsFee: 0,
    shippingFee: 0,
    serviceFee: 0,
    finalPrice: candidate.priceTnd ?? 0,
    expressAvailable: false,
    stockStatus: STOCK_BY_AVAILABILITY[candidate.availability] ?? 'UNKNOWN',
    arrivalIds: [],
  };
}
