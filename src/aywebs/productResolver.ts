import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import type { SmartLinkScraper } from '../scraper/scraper';
import type { ScrapedProduct } from '../types';
import { calculatePrice, type PriceBreakdown, type PricingRules } from '../services/pricing';
import type { AyWebsStoreDefinition } from '../../shared/aywebsStores';
import {
  AYWEBS_STORES,
  detectAyWebsStore,
  findAyWebsStore,
} from '../../shared/aywebsStores';
import type {
  AyWebsAvailability,
  AyWebsIntegrationType,
  AyWebsPurchaseMode,
  AyWebsResolvedProduct,
  AyWebsVariantOption,
  AyWebsVariantSelection,
} from '../../shared/aywebsTypes';
import { createAyWebsAdapter } from './adapters/registry';
import { AyWebsCaptureError, type AyWebsSourceProduct } from './adapters/contract';
import {
  ayWebsAvailabilityRecord,
  ayWebsSourceProductFromScraped,
  ayWebsSplitVariantSelection,
  ayWebsVariantGroupsFromScraped,
  ayWebsVariantKey,
  ayWebsVariantOptions,
  ayWebsVariantsFromScraped,
} from './productNormalizer';
import { assertAyWebsProductPage, type AyWebsPageAnalysis } from './browser';
import {
  ayWebsResolveCacheKey,
  readAyWebsResolveCache,
  runAyWebsResolveOnce,
  writeAyWebsResolveCache, readAyWebsResolveFailureCache, writeAyWebsResolveFailureCache } from './resolveCache';
import { AyWebsDomainError } from './errors';
import { ayWebsQuoteTtlMs, createAyWebsQuoteToken } from './quoteToken';
import { withAyWebsReadSlot } from './readGate';
import { ayWebsEvidenceHash, canonicalVariant, recordAyWebsEvidence } from './evidence';
import { emitAyWebsEvent, logAyWebsOperation, measureAyWebsOperation } from './events';
import { ensureAyWebsSchema } from './schema';
import { recordVariantContract } from '../ayrovix/services/variantAvailability';

/**
 * AYWEBs — Product Engine (§11), Variant Engine (§13), Availability Engine (§14).
 *
 * Chaîne unique de résolution :
 *
 *   URL → garde (§10 : HTTPS, registre, type de page, action client)
 *       → adaptateur marchand (lecture via SmartLinkScraper)
 *       → normalisation (titre, prix, devise, images, variantes libres)
 *       → disponibilité (jamais UNKNOWN → AVAILABLE)
 *       → devis AYROVI recalculé côté SERVEUR (aucune formule de prix cliente)
 *       → preuve (§28) + persistance produit/variantes
 *       → événement domaine AYWEB_PRODUCT_RESOLVED (§39)
 *
 * Identités (§53) : `productId` est l'identité AYROVI, `sourceProductId` reste
 * l'identité marchand. Les deux sont conservées, jamais fusionnées.
 */

export interface AyWebsResolverDependencies {
  db: QatafoDatabase;
  scraper: SmartLinkScraper;
  /** Flags runtime : le resolveur ne lit jamais process.env lui-même. */
  flags: { enabled: boolean; captureEnabled: boolean; storeCaptureEnabled: (store: AyWebsStoreDefinition | null | undefined) => boolean };
}

export interface AyWebsResolveInput {
  url: string;
  storeId?: string | null;
  /** Variante déjà choisie par le client (rejeu, retour panier, deep link). */
  selectedVariant?: Record<string, string> | null;
  quantity?: number;
  sessionId?: string | null;
  accountId?: string | null;
  captureId?: string | null;
  /**
   * SOURCE DE LECTURE CÔTÉ CLIENT (04/10/2026) — HTML de la fiche tel que rendu
   * chez le client (WebView Android, navigateur). Amazon répond aux IP de centre
   * de données par une page SANS prix ni variantes, alors que la page affichée
   * chez le client les publie. Le serveur RELIT ce HTML avec son propre parseur
   * et garde le calcul du prix (§45) : le client apporte la page, jamais un prix.
   * Le domaine reste vérifié en amont (§10) et la provenance est tracée.
   */
  pageHtml?: string | null;
  pageUrl?: string | null;
  /**
   * RELECTURE FRAÎCHE : ignore le cache de résolution et relit la fiche chez le
   * marchand. Utilisé pour une nouvelle intention Add et les contrôles finaux
   * panier/checkout ; une vérification servie du cache ne prouverait rien.
   * L'ouverture de fiche et l'affichage initial de la feuille peuvent réutiliser le cache.
   */
  refresh?: boolean;
}

export interface AyWebsResolveResult {
  captureId: string;
  productId: string;
  product: AyWebsResolvedProduct;
  /** Contrat V1 conservé : le produit AYROVI historique + son prix recalculé. */
  scrapedProduct: ScrapedProduct;
  sourceProduct: AyWebsSourceProduct;
  analysis: AyWebsPageAnalysis;
  pricing: PriceBreakdown | null;
  evidenceHash: string;
  missing: string[];
  resolvedAt: string;
  /** Lecture servie depuis le cache de résolution (âge réel fourni). */
  fromCache: boolean;
  cacheAgeMs: number | null;
  /**
   * DEVIS SIGNÉ (Phase 1, 06/10/2026) — jeton HMAC scellant le prix source, la
   * devise vérifiée, la variante et l'état de stock tels que le SERVEUR vient de
   * les lire. Le client le renvoie à l'ajout au panier, qui n'a donc plus besoin
   * de relire le marchand (15–22 s → quelques ms) sans jamais faire confiance au
   * client : voir `quoteToken.ts`. `null` quand aucun devis n'est publiable
   * (prix ou devise non confirmés).
   */
  quoteToken: string | null;
  quoteExpiresAt: number | null;
  /**
   * ORIGINE RÉELLE DE LA LECTURE (Phase 1) — `'read'` : cache de lecture ;
   * `'failure_memo'` : mémo court d'une fiche ILLISIBLE (voir resolveCache) ;
   * `null` : lecture fraîche du marchand. Transparence §51 : le client ne doit
   * jamais croire qu'une fiche vient d'être relue quand elle ne l'a pas été.
   */
  cacheKind: 'read' | 'failure_memo' | null;
}

/** Résolution complète d'un produit. Toute erreur sort en `AyWebsDomainError`. */
export async function resolveAyWebsProduct(
  deps: AyWebsResolverDependencies,
  input: AyWebsResolveInput,
): Promise<AyWebsResolveResult> {
  const captureId = input.captureId || `ayw_${randomUUID()}`;
  const startedAt = Date.now();

  const { analysis, store, url } = assertAyWebsProductPage(input.url, deps.scraper, {
    captureEnabled: deps.flags.captureEnabled,
    storeCaptureEnabled: deps.flags.storeCaptureEnabled,
  });

  if (input.storeId) {
    const requested = findAyWebsStore(input.storeId);
    if (!requested) throw new AyWebsDomainError('STORE_UNKNOWN');
    if (requested.id !== store.id) {
      throw new AyWebsDomainError('STORE_MISMATCH', {
        technicalMessage: `storeId demandé ${requested.id} ≠ domaine résolu ${store.id}`,
      });
    }
  }

  const adapter = createAyWebsAdapter(store, deps.scraper);

  /*
   * CACHE DE RÉSOLUTION (05/10/2026).
   *
   * Une fiche déjà lue il y a quelques minutes — pendant l'ouverture ou
   * l'affichage initial de la feuille de variantes — peut réutiliser la lecture
   * mémorisée. Le prix AYROVI est TOUJOURS recalculé ci-dessous par le moteur
   * tarifaire (§45 : le cache ne sert jamais un prix, seulement une lecture).
   *
   * `refresh: true` force une relecture fraîche pour toute nouvelle intention
   * Add et les contrôles panier/checkout : une vérification servie du cache ne
   * détecterait pas un changement de prix ou de stock marchand.
   */
  const cacheKey = ayWebsResolveCacheKey(store.id, url.toString());
  const cacheAllowed = !input.refresh && !input.pageHtml;
  const cached = cacheAllowed ? readAyWebsResolveCache(deps.scraper, cacheKey) : null;
  /* Mémo « fiche illisible » : une lecture SANS prix échoue en 13–17 s (sondes
     vouées à l'échec). Le mémo, séparé et à TTL court (90 s), évite de repayer
     ce coût à chaque réessai — sans jamais se faire passer pour un succès. */
  const failedCached = cached ? null : readAyWebsResolveFailureCache(deps.scraper, cacheKey);

  let sourceProduct: AyWebsSourceProduct;
  let fromCache = false;
  let cacheAgeMs: number | null = null;
  let cacheKind: 'read' | 'failure_memo' | null = null;
  if (cached) {
    sourceProduct = cached.sourceProduct;
    fromCache = true;
    cacheAgeMs = cached.ageMs;
    cacheKind = 'read';
  } else if (failedCached) {
    sourceProduct = failedCached.sourceProduct;
    fromCache = true;
    cacheAgeMs = failedCached.ageMs;
    cacheKind = 'failure_memo';
  } else {
    sourceProduct = await measureAyWebsOperation(
      {
        operation: 'product_resolve',
        storeId: store.id,
        adapter: adapter.id,
        sessionId: input.sessionId || null,
        customerId: input.accountId || null,
      },
      // Single-flight : deux appels simultanés pour le même produit ne
      // déclenchent qu'UNE lecture marchande (feuille + cartes de variantes,
      // ou deux clients sur le même article).
      () => runAyWebsResolveOnce(deps.scraper, cacheKey, () => withAyWebsReadSlot(async () => {
        try {
          return await adapter.resolveProduct(url.toString());
        } catch (error) {
          if (error instanceof AyWebsCaptureError) {
            throw new AyWebsDomainError(error.code === 'PRODUCT_PAGE_REQUIRED' ? 'PRODUCT_PAGE_REQUIRED' : 'STORE_MISMATCH', {
              userMessage: error.message,
              technicalMessage: `${adapter.id}: ${error.message}`,
            });
          }
          throw error;
        }
      })),
    );
    // Mémorisée seulement si elle est exploitable (prix lu) — voir resolveCache.
    writeAyWebsResolveCache(deps.scraper, cacheKey, sourceProduct);
  }

  const missing = missingProductFields(sourceProduct);
  /* Une lecture fraîche qui n'a pas su lire de prix est mémorisée 90 s : les
     réessais suivants répondent « prix non lu » en quelques ms au lieu de
     relancer 13–17 s de sondes. Le succès, lui, passe par le cache normal. */
  const freshRead = !cached && !failedCached;
  if (freshRead && missing.length) {
    writeAyWebsResolveFailureCache(deps.scraper, cacheKey, sourceProduct);
  }
  // Le client peut joindre des métadonnées de contexte (ex. `condition`) : elles
  // n'identifient pas la variante et ne doivent jamais la faire « disparaître ».
  const { matching: matchingAttributes, metadata: variantMetadata } = ayWebsSplitVariantSelection(
    { variantGroups: sourceProduct.variantGroups, variants: sourceProduct.variants },
    input.selectedVariant || null,
  );
  const availability = await adapter.checkAvailability(sourceProduct, matchingAttributes);

  // Le prix AYROVI est recalculé côté serveur, uniquement si le marchand a
  // confirmé le prix ET la devise. Une devise déduite de l'URL n'est pas un devis.
  const quoteEvidenceComplete = sourceProduct.scrapedProduct.priceVerified === true
    && sourceProduct.scrapedProduct.currencyVerified === true;
  const pricing = quoteEvidenceComplete
    ? calculatePrice(deps.db.getPricingRules(), sourceProduct.price, sourceProduct.currency, {
        title: sourceProduct.title,
        quantity: Math.max(1, Number(input.quantity) || 1),
      })
    : null;

  const selection: AyWebsVariantSelection | null = matchingAttributes
    ? {
        variantId: ayWebsVariantKey(matchingAttributes),
        attributes: matchingAttributes,
        quantity: Math.max(1, Number(input.quantity) || 1),
        ...(variantMetadata ? { metadata: variantMetadata } : {}),
      }
    : null;

  const evidenceHash = ayWebsEvidenceHash({
    sourceUrl: sourceProduct.sourceUrl,
    sourceDomain: sourceProduct.sourceDomain,
    sourceProductId: sourceProduct.sourceProductId,
    title: sourceProduct.title,
    image: sourceProduct.images[0] || null,
    price: sourceProduct.price,
    currency: sourceProduct.currency,
    selectedVariant: selection,
    availability: availability.state,
    adapter: adapter.id,
    retrievedAt: sourceProduct.capturedAt,
    fingerprintParts: {
      brand: sourceProduct.brand,
      variantCount: sourceProduct.variants.length,
      groupCount: sourceProduct.variantGroups.length,
    },
  });

  const productId = persistAyWebsProduct(deps.db, {
    store,
    sourceProduct,
    availability,
    pricing,
    evidenceHash,
    captureId,
    adapterId: adapter.id,
  });

  recordAyWebsVariantContract(sourceProduct, store);

  try {
    recordAyWebsEvidence(deps.db, {
      productId,
      sourceUrl: sourceProduct.sourceUrl,
      sourceDomain: sourceProduct.sourceDomain,
      sourceProductId: sourceProduct.sourceProductId,
      title: sourceProduct.title,
      image: sourceProduct.images[0] || null,
      price: sourceProduct.price,
      currency: sourceProduct.currency,
      selectedVariant: selection,
      availability: availability.state,
      adapter: adapter.id,
      retrievedAt: sourceProduct.capturedAt,
      fingerprintParts: {
        brand: sourceProduct.brand,
        variantCount: sourceProduct.variants.length,
        groupCount: sourceProduct.variantGroups.length,
      },
      // Même empreinte que celle publiée sur le produit et la ligne de panier.
      evidenceHash,
    });
  } catch (error) {
    console.warn('[AyWebs] evidence write failed', error instanceof Error ? error.message : error);
  }

  const product = toResolvedProduct({
    productId,
    store,
    sourceProduct,
    availability,
    pricing,
    evidenceHash,
    captureId,
    selection,
  });

  emitAyWebsEvent(deps.db, {
    event: 'AYWEB_PRODUCT_RESOLVED',
    resourceType: 'product',
    resourceId: productId,
    accountId: input.accountId || null,
    payload: {
      captureId,
      storeId: store.id,
      sourceProductId: sourceProduct.sourceProductId,
      price: sourceProduct.price,
      currency: sourceProduct.currency,
      availability: availability.state,
      purchaseMode: product.purchaseMode,
      missing,
    },
  });

  logAyWebsOperation({
    operation: 'product_resolve_total',
    storeId: store.id,
    adapter: adapter.id,
    productId,
    durationMs: Date.now() - startedAt,
    result: missing.length ? 'failure' : 'success',
    errorCode: missing.length ? 'CAPTURE_INCOMPLETE' : null,
  });

  /* Devis signé — émis ici, au seul endroit où le serveur connaît à la fois le
     produit persisté, la variante retenue, la devise VÉRIFIÉE et l'empreinte
     d'évidence. Sans prix + devise confirmés, aucun jeton : pas de promesse. */
  const quoteToken = quoteEvidenceComplete
    ? createAyWebsQuoteToken({
        productId,
        storeId: store.id,
        variantKey: selection?.variantId || '',
        price: sourceProduct.price,
        currency: sourceProduct.currency.trim().toUpperCase(),
        evidenceHash,
        availability: availability.state,
      })
    : null;
  const quoteExpiresAt = quoteToken ? Date.now() + ayWebsQuoteTtlMs() : null;

  return {
    captureId,
    productId,
    product,
    scrapedProduct: pricedScrapedProduct(sourceProduct.scrapedProduct, pricing, captureId),
    sourceProduct,
    analysis,
    pricing,
    evidenceHash,
    missing,
    resolvedAt: sourceProduct.capturedAt,
    fromCache,
    cacheAgeMs,
    quoteToken,
    quoteExpiresAt,
    cacheKind,
  };
}

/** Champs normalisés manquants : la liste est renvoyée au client, jamais devinée. */
export function missingProductFields(product: AyWebsSourceProduct): string[] {
  return [
    !product.title?.trim() ? 'title' : '',
    !(Number(product.price) > 0) ? 'price' : '',
    product.scrapedProduct?.priceVerified !== true ? 'verified_price' : '',
    !/^[A-Z]{3}$/.test(String(product.currency || '')) ? 'currency' : '',
    product.scrapedProduct?.currencyVerified !== true ? 'verified_currency' : '',
    !(product.images?.length) ? 'image' : '',
  ].filter(Boolean);
}

function pricedScrapedProduct(product: ScrapedProduct, pricing: PriceBreakdown | null, captureId: string): ScrapedProduct {
  if (!pricing || pricing.restricted) return { ...product, captureId };
  return {
    ...product,
    captureId,
    convertedPriceTND: pricing.convertedPriceTND,
    estimatedShippingTND: pricing.shippingFeeTND,
    serviceFeeTND: pricing.serviceFeeTND,
    totalPriceTND: pricing.totalTND,
  };
}

function toResolvedProduct(input: {
  productId: string;
  store: AyWebsStoreDefinition;
  sourceProduct: AyWebsSourceProduct;
  availability: AyWebsAvailability;
  pricing: PriceBreakdown | null;
  evidenceHash: string;
  captureId: string;
  selection: AyWebsVariantSelection | null;
}): AyWebsResolvedProduct {
  const { store, sourceProduct, availability, pricing, selection } = input;
  const groups = sourceProduct.variantGroups.length
    ? sourceProduct.variantGroups
    : ayWebsVariantGroupsFromScraped(sourceProduct.scrapedProduct?.variants);
  const options: AyWebsVariantOption[] = groups.length
    ? ayWebsVariantOptions(groups, sourceProduct.scrapedProduct?.colorImages || {})
    : [];

  return {
    productId: input.productId,
    storeId: store.id,
    storeName: store.displayName || store.name,
    sourceUrl: sourceProduct.sourceUrl,
    sourceDomain: sourceProduct.sourceDomain,
    sourceProductId: sourceProduct.sourceProductId,
    title: sourceProduct.title,
    description: sourceProduct.description,
    brand: sourceProduct.brand,
    images: sourceProduct.images,
    price: sourceProduct.price,
    currency: sourceProduct.currency,
    variants: options,
    variantGroups: groups,
    selectedVariant: selection,
    condition: sourceProduct.condition || null,
    availability: ayWebsAvailabilityRecord(
      availability.state,
      availability.reason,
      availability.source,
      availability.checkedAt,
      availability.quantityHint,
    ),
    merchant: sourceProduct.merchant,
    purchaseMode: purchaseModeFor(store),
    integrationType: store.integrationType,
    capturedAt: sourceProduct.capturedAt,
    evidenceHash: input.evidenceHash,
    ayroviPricing: pricing && !pricing.restricted
      ? {
          totalTnd: pricing.totalTND,
          pricingVersion: pricing.pricingVersion,
          breakdown: {
            convertedSourcePrice: pricing.convertedPriceTND,
            shipping: pricing.shippingFeeTND,
            customs: pricing.customsFeeTND,
            serviceFee: pricing.serviceFeeTND,
            other: pricing.freightTND + pricing.expressFeeTND,
          },
        }
      : null,
  };
}

/**
 * Mode d'achat décidé par les DONNÉES du registre (§7) — jamais par l'écran,
 * jamais optimiste. Sans capacité `purchase`, l'achat est en revue humaine.
 */
export function purchaseModeFor(store: AyWebsStoreDefinition | null): AyWebsPurchaseMode {
  if (!store) return 'NOT_IMPLEMENTED';
  if (store.integrationType === 'BLOCKED') return 'NOT_IMPLEMENTED';
  if (store.integrationType === 'URL_REQUEST') return 'URL_REQUEST';
  if (store.capabilities.includes('purchase')) return 'SUPPORTED';
  return 'MANUAL_REVIEW';
}

/** Persistance produit + variantes (§42). Échec non bloquant : la capture prime. */
export function persistAyWebsProduct(
  db: QatafoDatabase,
  input: {
    store: AyWebsStoreDefinition;
    sourceProduct: AyWebsSourceProduct;
    availability: AyWebsAvailability;
    pricing: PriceBreakdown | null;
    evidenceHash: string;
    captureId: string;
    adapterId: string;
  },
): string {
  const { store, sourceProduct, availability, pricing } = input;
  const now = new Date().toISOString();
  try {
    ensureAyWebsSchema(db);
    const existing = sourceProduct.sourceProductId
      ? db.get<{ id: string }>(
          `SELECT id FROM ayweb_products WHERE store_id=? AND source_product_id=? AND source_url=?`,
          store.id, sourceProduct.sourceProductId, sourceProduct.sourceUrl,
        )
      : db.get<{ id: string }>(`SELECT id FROM ayweb_products WHERE store_id=? AND source_url=?`, store.id, sourceProduct.sourceUrl);
    const productId = existing?.id || `aywprd_${randomUUID()}`;
    const pricingBreakdown = pricing && !pricing.restricted
      ? {
          convertedSourcePrice: pricing.convertedPriceTND,
          shipping: pricing.shippingFeeTND,
          customs: pricing.customsFeeTND,
          serviceFee: pricing.serviceFeeTND,
          other: pricing.freightTND + pricing.expressFeeTND,
        }
      : {};

    if (existing) {
      db.run(
        `UPDATE ayweb_products SET title=?, description=?, brand=?, images=?, price=?, currency=?, price_verified=?, currency_verified=?, variant_groups=?, variants=?, condition=?,
           availability=?, availability_reason=?, availability_checked_at=?, purchase_mode=?, integration_type=?,
           pricing_tnd=?, pricing_version=?, pricing_breakdown=?, evidence_hash=?, capture_id=?, resolved_at=?, updated_at=?
         WHERE id=?`,
        sourceProduct.title.slice(0, 500), String(sourceProduct.description || '').slice(0, 4000), String(sourceProduct.brand || '').slice(0, 200),
        JSON.stringify(sourceProduct.images.slice(0, 20)), sourceProduct.price, sourceProduct.currency,
        sourceProduct.scrapedProduct?.priceVerified === true ? 1 : 0,
        sourceProduct.scrapedProduct?.currencyVerified === true ? 1 : 0,
        JSON.stringify(sourceProduct.variantGroups), JSON.stringify(sourceProduct.variants.slice(0, 300)),
        String(sourceProduct.condition || ''), availability.state, availability.reason.slice(0, 200), availability.checkedAt, purchaseModeFor(store), store.integrationType,
        pricing && !pricing.restricted ? pricing.totalTND : 0, pricing?.pricingVersion || 0, JSON.stringify(pricingBreakdown),
        input.evidenceHash, input.captureId, sourceProduct.capturedAt, now, productId,
      );
      db.run(`DELETE FROM ayweb_product_variants WHERE product_id=?`, productId);
    } else {
      db.run(
        `INSERT INTO ayweb_products (id,store_id,source_url,source_domain,source_product_id,title,description,brand,images,
           price,currency,price_verified,currency_verified,variant_groups,variants,condition,availability,availability_reason,availability_checked_at,purchase_mode,
           integration_type,page_type,pricing_tnd,pricing_version,pricing_breakdown,evidence_hash,capture_id,resolved_at,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        productId, store.id, sourceProduct.sourceUrl.slice(0, 4096), sourceProduct.sourceDomain,
        String(sourceProduct.sourceProductId || '').slice(0, 300), sourceProduct.title.slice(0, 500),
        String(sourceProduct.description || '').slice(0, 4000), String(sourceProduct.brand || '').slice(0, 200),
        JSON.stringify(sourceProduct.images.slice(0, 20)), sourceProduct.price, sourceProduct.currency,
        sourceProduct.scrapedProduct?.priceVerified === true ? 1 : 0,
        sourceProduct.scrapedProduct?.currencyVerified === true ? 1 : 0,
        JSON.stringify(sourceProduct.variantGroups), JSON.stringify(sourceProduct.variants.slice(0, 300)),
        String(sourceProduct.condition || ''), availability.state, availability.reason.slice(0, 200), availability.checkedAt, purchaseModeFor(store),
        store.integrationType, 'PRODUCT', pricing && !pricing.restricted ? pricing.totalTND : 0, pricing?.pricingVersion || 0,
        JSON.stringify(pricingBreakdown), input.evidenceHash, input.captureId, sourceProduct.capturedAt, now, now,
      );
    }

    for (const [index, variant] of sourceProduct.variants.slice(0, 300).entries()) {
      db.run(
        `INSERT INTO ayweb_product_variants (id,product_id,source_variant_id,attributes,label,price,currency,availability,availability_reason,sort_order,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        `aywvar_${randomUUID()}`, productId, String(variant.sourceVariantId || '').slice(0, 200),
        JSON.stringify(variant.attributes), String(variant.label || '').slice(0, 300),
        variant.price, String(variant.currency || ''), variant.availability, String(variant.availabilityReason || '').slice(0, 200),
        index, now, now,
      );
    }
    return productId;
  } catch (error) {
    console.warn('[AyWebs] product persistence failed', error instanceof Error ? error.message : error);
    return `aywprd_${randomUUID()}`;
  }
}

/**
 * Pont avec la porte de variantes existante (`ayrovix/variantAvailability`) :
 * AYWEBs alimente le contrat déjà utilisé par le panier AYROVI, il n'en crée
 * pas un second. Le silence marchand reste le chemin de revue historique.
 */
function recordAyWebsVariantContract(sourceProduct: AyWebsSourceProduct, store: AyWebsStoreDefinition): void {
  try {
    const productAvailability = sourceProduct.availability === 'AVAILABLE' ? 'available' as const
      : sourceProduct.availability === 'OUT_OF_STOCK' ? 'unavailable' as const
      : sourceProduct.availability === 'LOW_STOCK' ? 'available' as const
      : 'unknown' as const;
    const variants = (sourceProduct.variants || []).slice(0, 200).map((variant) => ({
      value: variant.label || Object.values(variant.attributes).join(' '),
      color: variant.attributes.color || null,
      availability: variant.availability === 'AVAILABLE' ? 'available' as const
        : variant.availability === 'OUT_OF_STOCK' ? 'unavailable' as const
        : 'unknown' as const,
      reason: variant.availabilityReason || 'merchant_stock_unspecified',
    })).filter((variant) => variant.value.trim());

    if (productAvailability === 'unknown' && !variants.some((variant) => variant.availability !== 'unknown')) return;
    const attribute = sourceProduct.variantGroups.find((group) => group.attribute === 'size') ? 'Taille'
      : sourceProduct.variantGroups.find((group) => group.attribute === 'color') ? 'Couleur'
      : sourceProduct.variantGroups[0]?.attribute || '';

    recordVariantContract(sourceProduct.sourceUrl, {
      attribute,
      productAvailability,
      source: sourceProduct.scrapedProduct?.verificationProvider || store.id,
      variants,
    }, sourceProduct.capturedAt);
  } catch (error) {
    console.warn('[AyWebs] variant contract failed', error instanceof Error ? error.message : error);
  }
}

/* ------------------------------------------------------------------ *
 * Lectures
 * ------------------------------------------------------------------ */

export interface AyWebsStoredProduct {
  productId: string;
  storeId: string;
  storeName: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceProductId: string | null;
  title: string;
  description: string | null;
  brand: string | null;
  images: string[];
  price: number;
  currency: string;
  priceVerified: boolean;
  currencyVerified: boolean;
  variantGroups: Array<{ attribute: string; values: string[] }>;
  variants: Array<{
    sourceVariantId: string | null;
    attributes: Record<string, string>;
    label: string;
    price: number | null;
    currency: string | null;
    available: boolean | null;
    availability: AyWebsAvailability['state'];
    availabilityReason: string;
    image: string | null;
  }>;
  /** État publié par la source (neuf / occasion / reconditionné) ou `null`. */
  condition: 'new' | 'used' | 'refurbished' | null;
  availability: AyWebsAvailability;
  purchaseMode: AyWebsPurchaseMode;
  integrationType: AyWebsIntegrationType;
  pricingTnd: number;
  pricingVersion: number;
  pricingBreakdown: Record<string, number>;
  evidenceHash: string;
  captureId: string;
  resolvedAt: string;
}

export function readAyWebsProduct(db: QatafoDatabase, productId: string): AyWebsStoredProduct | null {
  ensureAyWebsSchema(db);
  const row = db.get<any>(`SELECT * FROM ayweb_products WHERE id=?`, productId);
  if (!row) return null;
  return hydrateStoredProduct(row);
}

export function readAyWebsProductBySource(db: QatafoDatabase, storeId: string, sourceUrl: string): AyWebsStoredProduct | null {
  ensureAyWebsSchema(db);
  const row = db.get<any>(`SELECT * FROM ayweb_products WHERE store_id=? AND source_url=? ORDER BY resolved_at DESC LIMIT 1`, storeId, sourceUrl);
  return row ? hydrateStoredProduct(row) : null;
}

export function listAyWebsRecentProducts(db: QatafoDatabase, limit = 8): AyWebsStoredProduct[] {
  ensureAyWebsSchema(db);
  const cap = Math.max(1, Math.min(40, Number(limit) || 8));
  return db.all<any>(`SELECT * FROM ayweb_products ORDER BY resolved_at DESC LIMIT ?`, cap).map(hydrateStoredProduct);
}

function hydrateStoredProduct(row: any): AyWebsStoredProduct {
  const store = findAyWebsStore(row.store_id);
  const parse = <T,>(value: unknown, fallback: T): T => {
    try {
      const parsed = JSON.parse(String(value ?? ''));
      return parsed == null ? fallback : parsed as T;
    } catch { return fallback; }
  };
  return {
    productId: String(row.id),
    storeId: String(row.store_id),
    storeName: store?.displayName || store?.name || String(row.store_id),
    sourceUrl: String(row.source_url || ''),
    sourceDomain: String(row.source_domain || ''),
    sourceProductId: String(row.source_product_id || '') || null,
    title: String(row.title || ''),
    description: String(row.description || '') || null,
    brand: String(row.brand || '') || null,
    images: parse<string[]>(row.images, []),
    price: Number(row.price) || 0,
    currency: String(row.currency || ''),
    priceVerified: Number(row.price_verified) === 1,
    currencyVerified: Number(row.currency_verified) === 1,
    variantGroups: parse(row.variant_groups, []),
    variants: parse(row.variants, []),
    condition: ['new', 'used', 'refurbished'].includes(String(row.condition || ''))
      ? String(row.condition) as 'new' | 'used' | 'refurbished'
      : null,
    availability: ayWebsAvailabilityRecord(
      String(row.availability || 'UNKNOWN') as AyWebsAvailability['state'],
      String(row.availability_reason || ''),
      String(row.store_id || 'aywebs'),
      String(row.availability_checked_at || row.resolved_at || ''),
      null,
    ),
    purchaseMode: String(row.purchase_mode || 'NOT_IMPLEMENTED') as AyWebsPurchaseMode,
    integrationType: String(row.integration_type || 'URL_REQUEST') as AyWebsIntegrationType,
    pricingTnd: Number(row.pricing_tnd) || 0,
    pricingVersion: Number(row.pricing_version) || 0,
    pricingBreakdown: parse(row.pricing_breakdown, {}),
    evidenceHash: String(row.evidence_hash || ''),
    captureId: String(row.capture_id || ''),
    resolvedAt: String(row.resolved_at || ''),
  };
}

/** A failed live check cannot present an old positive stock signal as current. */
export function ayWebsAvailabilityAfterFailedRecheck(
  stored: AyWebsAvailability,
  failureReason: string,
): AyWebsAvailability {
  const reason = [
    String(failureReason || 'source_recheck_failed').slice(0, 80),
    `last_known_state=${stored.state}`,
    stored.reason ? `last_known_reason=${stored.reason}` : '',
  ].filter(Boolean).join(';').slice(0, 400);
  return { ...stored, state: 'UNKNOWN', reason };
}

/**
 * Disponibilité à la demande (§14) : relit la source quand c'est possible.
 * Si la lecture échoue ou est désactivée, l'ancien état est conservé comme
 * contexte mais la disponibilité courante devient `UNKNOWN` (jamais AVAILABLE).
 */
export async function checkAyWebsProductAvailability(
  deps: AyWebsResolverDependencies,
  input: { productId: string; variantAttributes?: Record<string, string> | null },
): Promise<{ availability: AyWebsAvailability; variant: AyWebsVariantSelection | null; fromCache: boolean; product: AyWebsStoredProduct | null }> {
  const stored = readAyWebsProduct(deps.db, input.productId);
  if (!stored) throw new AyWebsDomainError('PRODUCT_NOT_FOUND');

  const store = findAyWebsStore(stored.storeId);
  if (!store || !deps.flags.storeCaptureEnabled(store)) {
    const availability = ayWebsAvailabilityAfterFailedRecheck(stored.availability, 'source_recheck_unavailable');
    return {
      availability,
      variant: input.variantAttributes
        ? { variantId: ayWebsVariantKey(input.variantAttributes), attributes: input.variantAttributes, quantity: 1 }
        : null,
      fromCache: true,
      product: { ...stored, availability },
    };
  }

  try {
    const result = await resolveAyWebsProduct(deps, {
      url: stored.sourceUrl,
      storeId: stored.storeId,
      selectedVariant: input.variantAttributes || null,
      // Re-vérification : jamais servie depuis le cache (§18, §29).
      refresh: true,
    });
    return {
      availability: result.product.availability,
      variant: result.product.selectedVariant,
      fromCache: false,
      product: readAyWebsProduct(deps.db, result.productId),
    };
  } catch (error) {
    // Une source injoignable ne transforme pas l'état en « disponible ».
    logAyWebsOperation({
      operation: 'availability_recheck',
      storeId: stored.storeId,
      productId: stored.productId,
      result: 'failure',
      errorCode: error instanceof AyWebsDomainError ? String(error.code) : 'CAPTURE_FAILED',
    });
    const availability = ayWebsAvailabilityAfterFailedRecheck(stored.availability, 'source_reread_failed');
    return {
      availability,
      variant: input.variantAttributes
        ? { variantId: ayWebsVariantKey(input.variantAttributes), attributes: input.variantAttributes, quantity: 1 }
        : null,
      fromCache: true,
      product: { ...stored, availability },
    };
  }
}

export { ayWebsSourceProductFromScraped, ayWebsVariantsFromScraped, canonicalVariant, detectAyWebsStore, AYWEBS_STORES, type PricingRules };
