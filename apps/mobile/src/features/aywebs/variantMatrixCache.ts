/**
 * AYWEBs — Cache mémoire temporaire de la MATRICE DE PRIX DES VARIANTES.
 *
 * Objectifs :
 *   1. Stocker temporairement en mémoire la matrice extraite lors de l'ouverture
 *      initiale d'une fiche produit (combinaisons exactes `variantDetails`, devis
 *      par valeur `variantQuotes`, captures vérifiées et `quoteToken` par choix) ;
 *   2. Permettre le changement de Couleur / Taille / Âge / Type en `0 ms` sans
 *      ré-extraire le produit complet ;
 *   3. Fusionner incrémentalement les lectures delta (quand une variante précise
 *      n'avait pas son prix dans la lecture initiale) SANS jamais écraser ni
 *      perdre les variantes déjà vérifiées en mémoire ;
 *   4. Calculer le total TND pour `quantity >= 2` à partir des paliers serveur
 *      (`quantityTotalsTnd`), sans jamais supposer une multiplication linéaire.
 */
import type {
  AyWebsResolvedProduct,
  AyWebsVariantGroup,
  AyWebsVariantOption,
  AyWebsVariantQuote,
} from '@/api/aywebs';
import { ayWebsAttributeKey } from '@/features/aywebs/attributeKeys';
import type { SelectionQuote } from '@/features/aywebs/selectionQuote';

const MAX_CACHED_PRODUCTS = 30;
const MATRIX_TTL_MS = 15 * 60 * 1000;

export interface CachedSelectionProof {
  capture: Record<string, unknown>;
  quoteToken: string;
  sourceUrl: string;
  verifiedAt: number;
}

export interface VariantMatrixSnapshot {
  key: string;
  updatedAt: number;
  variantDetails: AyWebsVariantOption[];
  variantQuotes: AyWebsVariantQuote[];
  proofsBySelection: Map<string, CachedSelectionProof>;
}

interface InternalEntry {
  key: string;
  updatedAt: number;
  combinations: Map<string, AyWebsVariantOption>;
  quotes: Map<string, AyWebsVariantQuote>;
  proofs: Map<string, CachedSelectionProof>;
}

const store = new Map<string, InternalEntry>();

function normalizeText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Signature canonique d'une sélection `{ Couleur: 'Noir', Taille: 'M' }` indépendante de la langue du libellé d'attribut. */
export function selectionMatrixSignature(attributes: Record<string, string> | null | undefined): string {
  if (!attributes) return '';
  const pairs: string[] = [];
  for (const [rawKey, rawVal] of Object.entries(attributes)) {
    const key = ayWebsAttributeKey(rawKey) || normalizeText(rawKey);
    const val = normalizeText(rawVal);
    if (key && val) pairs.push(`${key}=${val}`);
  }
  pairs.sort();
  return pairs.join('|');
}

/** Clé stable de la famille produit en mémoire (survit au changement d'ASIN sœur ou de `goods_id` sœur dans la même feuille). */
export function buildVariantMatrixKey(input: {
  storeId?: string | null;
  sourceUrl?: string | null;
  productId?: string | null;
}): string {
  const storePart = normalizeText(input.storeId) || 'external';
  const pid = normalizeText(input.productId);
  if (pid) return `${storePart}::pid::${pid}`;
  const rawUrl = String(input.sourceUrl ?? '').trim();
  if (!rawUrl) return `${storePart}::empty`;
  try {
    const parsed = new URL(rawUrl);
    return `${storePart}::url::${parsed.host.toLowerCase()}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return `${storePart}::raw::${rawUrl.toLowerCase()}`;
  }
}

function pruneExpired(now = Date.now()): void {
  for (const [k, entry] of store.entries()) {
    if (now - entry.updatedAt > MATRIX_TTL_MS) store.delete(k);
  }
  while (store.size > MAX_CACHED_PRODUCTS) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    store.delete(oldestKey);
  }
}

function mergeVariantOption(existing: AyWebsVariantOption | undefined, incoming: AyWebsVariantOption): AyWebsVariantOption {
  if (!existing) return { ...incoming, attributes: { ...incoming.attributes } };
  const hasIncomingPrice = incoming.totalTnd != null && incoming.totalTnd > 0;
  const hasExistingPrice = existing.totalTnd != null && existing.totalTnd > 0;
  return {
    sourceVariantId: incoming.sourceVariantId || existing.sourceVariantId,
    variantUrl: incoming.variantUrl || existing.variantUrl || null,
    attributes: Object.keys(incoming.attributes).length ? { ...incoming.attributes } : { ...existing.attributes },
    label: incoming.label || existing.label,
    price: hasIncomingPrice ? incoming.price : (existing.price ?? incoming.price),
    currency: incoming.currency || existing.currency,
    quotedPrice: hasIncomingPrice ? incoming.quotedPrice : (existing.quotedPrice ?? incoming.quotedPrice),
    quotedCurrency: incoming.quotedCurrency || existing.quotedCurrency,
    priceSource: hasIncomingPrice ? incoming.priceSource : (hasExistingPrice ? existing.priceSource : incoming.priceSource),
    availability: incoming.availability !== 'UNKNOWN' ? incoming.availability : existing.availability,
    availabilityReason: incoming.availability !== 'UNKNOWN' ? incoming.availabilityReason : existing.availabilityReason,
    stock: incoming.stock ?? existing.stock ?? null,
    evidenceSource: incoming.evidenceSource || existing.evidenceSource || null,
    quantityTiers: (incoming.quantityTiers && incoming.quantityTiers.length > 0)
      ? incoming.quantityTiers
      : existing.quantityTiers,
    image: incoming.image || existing.image,
    totalTnd: hasIncomingPrice ? incoming.totalTnd : existing.totalTnd,
    quantityTotalsTnd: hasIncomingPrice
      ? (incoming.quantityTotalsTnd ?? existing.quantityTotalsTnd ?? null)
      : (existing.quantityTotalsTnd ?? incoming.quantityTotalsTnd ?? null),
  };
}

/**
 * Enregistre ou enrichit la matrice d'un produit en mémoire (lecture initiale OU
 * lecture delta d'une variante manquante). Ne supprime jamais une combinaison
 * déjà vérifiée lors d'une lecture précédente de la même fiche.
 */
export function upsertVariantMatrixCache(input: {
  matrixKey: string;
  product: AyWebsResolvedProduct;
  groups?: readonly AyWebsVariantGroup[];
  selection?: Record<string, string> | null;
  capture?: Record<string, unknown> | null;
  quoteToken?: string | null;
  sourceUrl?: string | null;
}): VariantMatrixSnapshot {
  const now = Date.now();
  pruneExpired(now);
  let entry = store.get(input.matrixKey);
  if (!entry) {
    entry = {
      key: input.matrixKey,
      updatedAt: now,
      combinations: new Map(),
      quotes: new Map(),
      proofs: new Map(),
    };
    store.set(input.matrixKey, entry);
  }
  entry.updatedAt = now;

  const pageSourceUrl = input.sourceUrl || input.product.sourceUrl || '';
  for (const detail of input.product.variantDetails || []) {
    const sig = selectionMatrixSignature(detail.attributes);
    if (!sig) continue;
    entry.combinations.set(sig, mergeVariantOption(entry.combinations.get(sig), detail));
    if (input.capture && input.quoteToken && detail.totalTnd != null && !entry.proofs.has(sig)) {
      entry.proofs.set(sig, {
        capture: input.capture,
        quoteToken: input.quoteToken,
        sourceUrl: pageSourceUrl,
        verifiedAt: now,
      });
    }
  }

  /* Si le serveur vient de vérifier une sélection précise (initiale ou delta) avec un
     prix ferme en dinars, on matérialise aussi cette combinaison exacte dans la matrice ! */
  const selSig = selectionMatrixSignature(input.selection);
  if (selSig && input.selection && Object.keys(input.selection).length > 0) {
    const prodTnd = input.product.ayroviPricing?.totalTnd ?? null;
    const prodVerified = input.product.priceVerified && input.product.currencyVerified && prodTnd != null && prodTnd > 0;
    const availState = String(input.product.availability?.state || 'UNKNOWN').toUpperCase();
    if (prodVerified || availState === 'OUT_OF_STOCK') {
      const synthesized: AyWebsVariantOption = {
        sourceVariantId: `verified:${selSig.slice(0, 60)}`,
        variantUrl: input.sourceUrl || input.product.sourceUrl || null,
        attributes: { ...input.selection },
        label: Object.values(input.selection).join(' / '),
        price: availState === 'OUT_OF_STOCK' ? null : input.product.price,
        currency: input.product.currency,
        quotedPrice: availState === 'OUT_OF_STOCK' ? null : input.product.price,
        quotedCurrency: input.product.currency,
        priceSource: prodVerified ? 'VARIANT' : 'UNKNOWN',
        availability: availState,
        availabilityReason: input.product.availability?.reason || '',
        stock: input.product.availability?.quantityHint ?? null,
        evidenceSource: 'delta_verified',
        image: input.product.images[0] || '',
        totalTnd: availState === 'OUT_OF_STOCK' ? null : prodTnd,
        quantityTotalsTnd: availState === 'OUT_OF_STOCK' ? null : (input.product.ayroviPricing?.quantityTotalsTnd ?? null),
      };
      entry.combinations.set(selSig, mergeVariantOption(entry.combinations.get(selSig), synthesized));
    }
    if (input.capture && input.quoteToken) {
      entry.proofs.set(selSig, {
        capture: input.capture,
        quoteToken: input.quoteToken,
        sourceUrl: input.sourceUrl || input.product.sourceUrl || '',
        verifiedAt: now,
      });
    }
  }

  /* Fusion prudente des devis 1D : uniquement si un groupe n'entre pas en conflit
     avec un montant différent déjà enregistré (les combinaisons 2D/3D vivent dans `combinations`). */
  for (const q of input.product.variantQuotes || []) {
    const qKey = `${ayWebsAttributeKey(q.group) || normalizeText(q.group)}=${normalizeText(q.value)}`;
    const prev = entry.quotes.get(qKey);
    if (!prev) {
      entry.quotes.set(qKey, { ...q });
    } else if (prev.totalTnd != null && q.totalTnd != null && Math.round(prev.totalTnd * 100) !== Math.round(q.totalTnd * 100)) {
      /* Deux lectures (ex. deux couleurs sœurs) donnent deux prix différents pour la même taille 1D :
         la taille seule est ambiguë, seule la combinaison complète (Couleur + Taille) fait foi. */
      entry.quotes.set(qKey, {
        ...prev,
        sourcePrice: null,
        totalTnd: null,
        quantityTotalsTnd: null,
      });
    } else if (prev.totalTnd == null && q.totalTnd != null) {
      entry.quotes.set(qKey, { ...q });
    }
  }

  return readVariantMatrixCache(input.matrixKey)!;
}

export function readVariantMatrixCache(matrixKey: string): VariantMatrixSnapshot | null {
  pruneExpired();
  const entry = store.get(matrixKey);
  if (!entry) return null;
  return {
    key: entry.key,
    updatedAt: entry.updatedAt,
    variantDetails: [...entry.combinations.values()],
    variantQuotes: [...entry.quotes.values()],
    proofsBySelection: new Map(entry.proofs),
  };
}

export function readCachedSelectionProof(
  matrixKey: string,
  selection: Record<string, string> | null | undefined,
): CachedSelectionProof | null {
  const sig = selectionMatrixSignature(selection);
  if (!sig) return null;
  const entry = store.get(matrixKey);
  if (!entry) return null;
  return entry.proofs.get(sig) ?? null;
}

export function clearVariantMatrixCache(): void {
  store.clear();
}

/**
 * Total en dinars pour `quantity` unités d'une variante vérifiée :
 *   • utilise d'abord `quote.quantityTotalsTnd[quantity - 1]` calculé par le serveur
 *     (qui intègre les remises sur quantité du marchand, la livraison locale facturée
 *     une seule fois, et les planchers RPD/commission non linéaires) ;
 *   • au-delà de 10 unités, prolonge par le coût marginal unitaire serveur
 *     (`totals[last] - totals[last - 1]`) afin de ne jamais multiplier les frais fixes ;
 *   • ne retombe sur `unitTnd * quantity` que si le serveur est ancien et n'a pas
 *     encore publié `quantityTotalsTnd`.
 */
export function resolveQuantityTotalTnd(
  quote: Pick<SelectionQuote, 'unitTnd' | 'quantityTotalsTnd'>,
  quantity: number,
): number | null {
  if (quote.unitTnd == null || !(quote.unitTnd > 0)) return null;
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const table = quote.quantityTotalsTnd;
  if (Array.isArray(table) && table.length > 0) {
    if (qty <= table.length) {
      const exact = table[qty - 1];
      return typeof exact === 'number' && exact > 0 ? Math.round(exact * 100) / 100 : null;
    }
    if (table.length >= 2) {
      const last = table[table.length - 1];
      const prev = table[table.length - 2];
      const marginalUnit = Math.max(0, last - prev);
      return Math.round((last + marginalUnit * (qty - table.length)) * 100) / 100;
    }
  }
  return qty === 1 ? quote.unitTnd : Math.round(quote.unitTnd * qty * 100) / 100;
}
