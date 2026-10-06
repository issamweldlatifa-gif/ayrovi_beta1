import { createHash, randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { calculatePrice, type PricingRules } from '../services/pricing';
import { nextSequenceNumber } from '../erp-core/sequences';
import type { AyWebsStoreDefinition } from '../../shared/aywebsStores';
import { findAyWebsStore } from '../../shared/aywebsStores';
import type {
  AyWebsAvailabilityState,
  AyWebsCartItemStatus,
  AyWebsPriceSnapshot,
  AyWebsVariantSelection,
} from '../../shared/aywebsTypes';
import { ensureAyWebsSchema } from './schema';
import { ayWebsCartMachine } from './stateMachines';
import { AyWebsDomainError } from './errors';
import { ayWebsEvidenceHash, ayWebsVariantLabel, canonicalVariant, recordAyWebsEvidence } from './evidence';
import { emitAyWebsEvent, logAyWebsOperation, writeAyWebsAudit } from './events';
import { ayWebsSplitVariantSelection, ayWebsVariantKey } from './productNormalizer';
import { ayWebsResolveCacheKey } from './resolveCache';
import { inspectAyWebsQuoteToken, shouldReverifyAyWebsQuote } from './quoteToken';
import {
  purchaseModeFor,
  readAyWebsProduct,
  resolveAyWebsProduct,
  type AyWebsResolverDependencies,
  type AyWebsStoredProduct,
} from './productResolver';

/**
 * AYWEBs — Cart Engine (§16, §17, §18).
 *
 * Principes :
 *  • le panier AYWEBs est AYROVI-propriétaire : ce n'est PAS le panier du
 *    marchand (§4). Plusieurs boutiques externes coexistent dans un seul panier ;
 *  • le client n'envoie JAMAIS de prix : il envoie `productId`, les attributs
 *    de variante et une quantité. Le prix, la devise, le devis AYROVI et la
 *    disponibilité viennent du serveur (§45) ;
 *  • chaque ligne conserve un `variantSnapshot` et un `priceSnapshot` complets :
 *    l'identifiant produit externe seul ne suffit pas (§17) ;
 *  • la même variante du même produit met à jour la ligne existante au lieu de
 *    créer un doublon ;
 *  • un changement de prix ou une variante disparue est un ÉTAT de ligne
 *    (`PRICE_CHANGED`, `VARIANT_UNAVAILABLE`), jamais une substitution (§29, §30).
 */

export interface AyWebsCart {
  id: string;
  accountId: string | null;
  sessionId: string;
  status: 'ACTIVE' | 'CHECKOUT' | 'ORDERED' | 'ABANDONED';
  currency: string;
  itemCount: number;
  totalUnits: number;
  createdAt: string;
  updatedAt: string;
}

export interface AyWebsCartItem {
  id: string;
  itemNumber: string;
  cartId: string;
  productId: string | null;
  storeId: string;
  storeName: string;
  sourceUrl: string;
  sourceProductId: string | null;
  title: string;
  images: string[];
  unitPrice: number;
  currency: string;
  variantSnapshot: AyWebsVariantSelection | null;
  variantLabel: string;
  quantity: number;
  availability: AyWebsAvailabilityState;
  priceSnapshot: AyWebsPriceSnapshot | null;
  pricingTnd: number;
  pricingVersion: number;
  lineTotalTnd: number;
  evidenceHash: string;
  status: AyWebsCartItemStatus;
  statusReason: string;
  customerNote: string;
  purchaseMode: string;
  /** Le client peut-il passer en checkout avec cette ligne ? */
  checkoutReady: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AyWebsCartGroup {
  storeId: string;
  storeName: string;
  integrationType: string;
  items: AyWebsCartItem[];
  subtotalTnd: number;
  blockedItems: number;
}

export interface AyWebsCartView {
  cart: AyWebsCart | null;
  items: AyWebsCartItem[];
  groups: AyWebsCartGroup[];
  totals: {
    units: number;
    productSubtotalTnd: number;
    currency: string;
    blockedItems: number;
    checkoutReady: boolean;
  };
  /** Ce qui empêche le checkout, en langage client. */
  blockers: Array<{ itemId: string; code: string; message: string; action: string }>;
  offlineNotice: string | null;
}

export interface AddAyWebsCartItemInput {
  sessionId: string;
  accountId: string | null;
  /** Identité AYROVI du produit résolu : le prix n'est jamais fourni par le client. */
  productId?: string | null;
  /** Ou, à défaut, l'URL source — le serveur résout puis ajoute. */
  sourceUrl?: string | null;
  storeId?: string | null;
  variantAttributes?: Record<string, string> | null;
  quantity?: number;
  customerNote?: string;
  /** Stable caller key for retry-safe Add-to-Cart; distinct from per-HTTP requestId tracing. */
  idempotencyKey?: string | null;
  requestId?: string | null;
  /**
   * DEVIS SIGNÉ (Phase 1, 06/10/2026) — jeton émis par `/product/resolve`.
   * Fourni, il évite la relecture marchande complète à l'ajout (15–22 s en
   * production) SANS faire confiance au client : le prix reste celui que le
   * serveur a scellé, et il est confronté à la ligne produit qu'il a écrite.
   * Absent/invalide/périmé → comportement d'avant : relecture fraîche.
   */
  quoteToken?: string | null;
}

export interface AddAyWebsCartItemResult {
  item: AyWebsCartItem;
  cart: AyWebsCart;
  duplicate: boolean;
  message: string;
  view: AyWebsCartView;
  /** True when the exact stored outcome for this idempotency key was replayed. */
  idempotentReplay: boolean;
  /** Route-level AYROVI synchronization outcome, saved after the cart bridge. */
  ayrovi?: { linked: boolean; cart_item_id: string | null; quantity: number | null; reason: string } | null;
  /** Transparence (§51) : le prix ajouté venait-il du devis signé, ou d'une relecture ? */
  quoteUsed: boolean;
  sourceReread: boolean;
  /** Motif de relecture quand elle a eu lieu (STALE, HIGH_VALUE, SAMPLE, NO_QUOTE…). */
  rereadReason: string | null;
}

const MAX_QUANTITY = 99;
const MAX_ITEMS_PER_CART = 60;

export function getOrCreateAyWebsCart(db: QatafoDatabase, sessionId: string, accountId: string | null): AyWebsCart {
  ensureAyWebsSchema(db);
  const existing = accountId
    ? db.get<any>(`SELECT * FROM ayweb_carts WHERE account_id=? AND status IN ('ACTIVE','CHECKOUT') ORDER BY updated_at DESC LIMIT 1`, accountId)
    : db.get<any>(`SELECT * FROM ayweb_carts WHERE session_id=? AND account_id IS NULL AND status IN ('ACTIVE','CHECKOUT') ORDER BY updated_at DESC LIMIT 1`, sessionId);
  if (existing) return hydrateCart(existing);

  const id = `aywcart_${randomUUID()}`;
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO ayweb_carts (id,account_id,session_id,status,currency,items_count,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    id, accountId, sessionId, 'ACTIVE', 'TND', 0, now, now,
  );
  return hydrateCart(db.get<any>(`SELECT * FROM ayweb_carts WHERE id=?`, id)!);
}

export function readAyWebsCart(db: QatafoDatabase, sessionId: string, accountId: string | null): AyWebsCart | null {
  ensureAyWebsSchema(db);
  const row = accountId
    ? db.get<any>(`SELECT * FROM ayweb_carts WHERE account_id=? AND status IN ('ACTIVE','CHECKOUT') ORDER BY updated_at DESC LIMIT 1`, accountId)
    : db.get<any>(`SELECT * FROM ayweb_carts WHERE session_id=? AND account_id IS NULL AND status IN ('ACTIVE','CHECKOUT') ORDER BY updated_at DESC LIMIT 1`, sessionId);
  return row ? hydrateCart(row) : null;
}

export function listAyWebsCartItems(db: QatafoDatabase, cartId: string): AyWebsCartItem[] {
  ensureAyWebsSchema(db);
  const pricingRules = db.getPricingRules();
  return db.all<any>(
    `SELECT * FROM ayweb_cart_items WHERE cart_id=? AND status!='REMOVED' ORDER BY created_at ASC`,
    cartId,
  ).map((row) => hydrateCartItem(row, pricingRules));
}

/** Vue complète du panier : lignes, groupes par boutique, totaux, bloqueurs. */
export function readAyWebsCartView(db: QatafoDatabase, sessionId: string, accountId: string | null): AyWebsCartView {
  const cart = readAyWebsCart(db, sessionId, accountId);
  if (!cart) {
    return {
      cart: null,
      items: [],
      groups: [],
      totals: { units: 0, productSubtotalTnd: 0, currency: 'TND', blockedItems: 0, checkoutReady: false },
      blockers: [],
      offlineNotice: null,
    };
  }

  const items = listAyWebsCartItems(db, cart.id);
  const groups = groupByStore(items);
  const blockers = items.filter((item) => !item.checkoutReady).map((item) => blockerFor(item));
  const productSubtotalTnd = round2(items.filter((item) => item.checkoutReady).reduce((sum, item) => sum + item.lineTotalTnd, 0));

  return {
    cart,
    items,
    groups,
    totals: {
      units: items.reduce((sum, item) => sum + item.quantity, 0),
      productSubtotalTnd,
      currency: cart.currency,
      blockedItems: blockers.length,
      checkoutReady: blockers.length === 0 && items.length > 0,
    },
    blockers,
    offlineNotice: null,
  };
}

function groupByStore(items: AyWebsCartItem[]): AyWebsCartGroup[] {
  const groups = new Map<string, AyWebsCartGroup>();
  for (const item of items) {
    const store = findAyWebsStore(item.storeId);
    const group = groups.get(item.storeId) || {
      storeId: item.storeId,
      storeName: item.storeName,
      integrationType: store?.integrationType || 'URL_REQUEST',
      items: [],
      subtotalTnd: 0,
      blockedItems: 0,
    };
    group.items.push(item);
    if (item.checkoutReady) group.subtotalTnd = round2(group.subtotalTnd + item.lineTotalTnd);
    else group.blockedItems += 1;
    groups.set(item.storeId, group);
  }
  return [...groups.values()];
}

function blockerFor(item: AyWebsCartItem): { itemId: string; code: string; message: string; action: string } {
  switch (item.status) {
    case 'PRICE_CHANGED':
      return {
        itemId: item.id, code: 'PRICE_CHANGED', action: 'ACCEPT_NEW_PRICE',
        message: 'Le prix marchand a changé depuis l’ajout. Acceptez le nouveau prix ou retirez l’article.',
      };
    case 'VARIANT_UNAVAILABLE':
      return {
        itemId: item.id, code: 'VARIANT_UNAVAILABLE', action: 'CHOOSE_ANOTHER_VARIANT',
        message: 'La version exacte choisie n’est plus disponible. Choisissez-en une autre : aucun remplacement automatique.',
      };
    case 'OUT_OF_STOCK':
      return {
        itemId: item.id, code: 'OUT_OF_STOCK', action: 'CHOOSE_ANOTHER_VARIANT',
        message: 'Le marchand indique cet article épuisé.',
      };
    case 'CUSTOMER_ACTION_REQUIRED':
      return {
        itemId: item.id, code: 'SOURCE_RECHECK_REQUIRED', action: 'RETRY_SOURCE_CHECK',
        message: 'La source marchande n’a pas pu être vérifiée. Réessayez avant le checkout.',
      };
  }
  if (item.availability === 'UNKNOWN') {
    return {
      itemId: item.id, code: 'AVAILABILITY_UNCONFIRMED', action: 'RETRY_SOURCE_CHECK',
      message: 'Le stock de cet article n’est pas confirmé par le marchand. Vérifiez-le avant de continuer.',
    };
  }
  if (item.availability === 'OUT_OF_STOCK') {
    return {
      itemId: item.id, code: 'OUT_OF_STOCK', action: 'CHOOSE_ANOTHER_VARIANT',
      message: 'Le marchand indique cet article épuisé.',
    };
  }
  return { itemId: item.id, code: 'CART_ITEM_BLOCKED', action: 'CONTACT_SUPPORT', message: 'Cet article ne peut pas être commandé en l’état.' };
}

/**
 * Ajout au panier (§15). La machine à états du bouton côté client est
 * IDLE → ADDING → ADDED ; ici, le serveur refuse toute donnée financière
 * fournie par le client et recalcule tout.
 */
export async function addAyWebsCartItem(
  deps: AyWebsResolverDependencies,
  input: AddAyWebsCartItemInput,
): Promise<AddAyWebsCartItemResult> {
  const { db } = deps;
  ensureAyWebsSchema(db);

  const quantity = normalizeQuantity(input.quantity);
  const customerNote = sanitizeNote(input.customerNote);
  const variantAttributes = normalizeAttributes(input.variantAttributes);
  const idempotencyKey = normalizeAddIdempotencyKey(input.idempotencyKey);
  const requestHash = idempotencyKey
    ? addRequestFingerprint({
        productId: input.productId || null,
        sourceUrl: input.sourceUrl || null,
        storeId: input.storeId || null,
        variantAttributes,
        quantity,
        customerNote,
      })
    : '';

  // Fast replay path: a retry must not re-resolve the merchant or touch quantity.
  if (idempotencyKey) {
    const replay = replayAddRequest(db, input, idempotencyKey, requestHash);
    if (replay) return replay;
  }

  // 1. A product ID is only a lookup hint, not a fresh source check. Validate
  //    any accompanying identity, then re-resolve server-side with cache bypass
  //    before trusting price, variant or availability for this new Add intent.
  const priorProduct = input.productId ? readAyWebsProduct(db, input.productId) : null;
  if (priorProduct && input.storeId
    && String(input.storeId).trim().toLowerCase() !== priorProduct.storeId) {
    throw new AyWebsDomainError('STORE_MISMATCH', {
      technicalMessage: `storeId demandé ${String(input.storeId).trim()} ≠ produit résolu ${priorProduct.storeId}`,
    });
  }
  if (priorProduct && input.sourceUrl
    && ayWebsResolveCacheKey(priorProduct.storeId, input.sourceUrl)
      !== ayWebsResolveCacheKey(priorProduct.storeId, priorProduct.sourceUrl)) {
    throw new AyWebsDomainError('STORE_MISMATCH', {
      technicalMessage: 'source_url does not match the server-resolved product identity',
    });
  }

  const sourceUrl = priorProduct?.sourceUrl || input.sourceUrl;
  if (!sourceUrl) throw new AyWebsDomainError('PRODUCT_NOT_FOUND');

  /* ── PHASE 1 (06/10/2026) — DEVIS SIGNÉ ────────────────────────────────────
     Avant : relecture marchande SYSTÉMATIQUE (`refresh: true`) → 15,8 / 17,7 /
     17,9 / 22,2 s mesurées en production pour un seul « Ajouter au panier »,
     alors que la feuille venait de lire la même fiche.
     Maintenant : si le client renvoie un devis signé par le serveur, valide, non
     périmé, correspondant EXACTEMENT à la ligne que l'on s'apprête à facturer,
     l'écriture se fait sans réseau. Sinon → relecture complète, comme avant.
     Le client ne peut rien falsifier : le prix est scellé par HMAC côté serveur. */
  const quote = inspectAyWebsQuoteToken(input.quoteToken);
  /* Décision PRÉLIMINAIRE : elle sert uniquement à décider si le devis signé
     couvre exactement ce qui va être facturé. Elle ne doit JAMAIS lever : le
     chemin d'erreur opposable au client reste celui de la relecture complète
     (ordre historique : prix non confirmé → PRICE_UNAVAILABLE, puis variante).
     Un échec ici ⇒ pas de réutilisation du devis ⇒ relecture ⇒ mêmes erreurs. */
  let preliminaryDecision: ReturnType<typeof selectVariant> | null = null;
  try {
    preliminaryDecision = priorProduct ? selectVariant(priorProduct, variantAttributes, quantity) : null;
  } catch {
    preliminaryDecision = null;
  }
  const preliminaryPrice = preliminaryDecision && priorProduct
    ? (preliminaryDecision.price ?? priorProduct.price)
    : 0;
  const preliminaryCurrency = priorProduct
    ? (preliminaryDecision?.price != null
        ? String(preliminaryDecision.currency || priorProduct.currency)
        : priorProduct.currency).trim().toUpperCase()
    : '';
  const preliminaryPricing = priorProduct && preliminaryPrice > 0 && preliminaryCurrency
    ? calculatePrice(db.getPricingRules(), preliminaryPrice, preliminaryCurrency, { title: priorProduct.title })
    : null;
  const requestedVariantKey = priorProduct
    ? ayWebsVariantKey(ayWebsSplitVariantSelection(priorProduct, variantAttributes).matching)
    : '';
  const quoteMatches = Boolean(
    quote && priorProduct && preliminaryDecision && preliminaryPricing
    && quote.productId === priorProduct.productId
    && quote.storeId === priorProduct.storeId
    && Math.abs(quote.price - preliminaryPrice) < 0.005
    && quote.currency === preliminaryCurrency
    /* Le devis scelle un PRIX, pas seulement un produit. Si le devis désigne
       explicitement une variante (le client l'avait choisie à la résolution),
       il faut la même variante. S'il désigne le produit entier, c'est
       l'égalité de prix ci-dessus qui protège : un devis à 39,99 ne peut pas
       couvrir une variante à 49,99 (mismatch → relecture). */
    && (quote.variantKey ? quote.variantKey === requestedVariantKey : true)
    // L'évidence doit désigner la fiche écrité par CE serveur (jamais un devis
    // recyclé sur une autre fiche) — comparaison seulement si la ligne l'expose.
    && (!quote.evidenceHash || !priorProduct.evidenceHash || quote.evidenceHash === priorProduct.evidenceHash)
    && (!quote.availability || quote.availability === priorProduct.availability.state),
  );
  const rereadGate = quoteMatches && quote
    ? shouldReverifyAyWebsQuote(quote, { totalTND: preliminaryPricing?.totalTND, seed: input.sessionId })
    : { reverify: true, reason: quote ? 'QUOTE_MISMATCH' : 'NO_QUOTE' };
  const quoteUsed = quoteMatches && !rereadGate.reverify;

  let product = priorProduct;
  let sourceReread = false;
  if (!quoteUsed) {
    const resolved = await resolveAyWebsProduct(deps, {
      url: sourceUrl,
      storeId: priorProduct?.storeId || input.storeId || null,
      selectedVariant: variantAttributes,
      quantity,
      sessionId: input.sessionId,
      accountId: input.accountId,
      refresh: true,
    });
    product = readAyWebsProduct(db, resolved.productId);
    sourceReread = true;
  }
  if (!product) throw new AyWebsDomainError('PRODUCT_NOT_FOUND');

  const store = findAyWebsStore(product.storeId);
  if (!store) throw new AyWebsDomainError('STORE_UNKNOWN');
  if (!deps.flags.storeCaptureEnabled(store)) throw new AyWebsDomainError('STORE_CAPTURE_UNSUPPORTED');
  if (!product.priceVerified || !product.currencyVerified) {
    throw new AyWebsDomainError('PRICE_UNAVAILABLE', {
      technicalMessage: `prix/devise marchands non confirmés (price=${product.priceVerified}, currency=${product.currencyVerified})`,
    });
  }

  // 2. Variante : si le marchand publie des attributs, la sélection est exigée (§13).
  const decision = selectVariant(product, variantAttributes, quantity);
  const selection = decision.selection;

  // 3. Aucune ligne ne peut être ajoutée comme disponible sans preuve de stock.
  //    Seuls AVAILABLE/LOW_STOCK passent ; UNKNOWN et OUT_OF_STOCK sont bloqués.
  const availability = decision.availability;
  if (availability === 'OUT_OF_STOCK') {
    emitAyWebsEvent(db, {
      event: 'AYWEB_VARIANT_UNAVAILABLE',
      resourceType: 'product',
      resourceId: product.productId,
      accountId: input.accountId,
      payload: { storeId: store.id, variant: selection?.attributes || null, reason: decision.reason },
    });
    throw new AyWebsDomainError('OUT_OF_STOCK', {
      technicalMessage: `availability=OUT_OF_STOCK (${decision.reason})`,
    });
  }
  if (availability === 'UNKNOWN') {
    throw new AyWebsDomainError('STOCK_UNKNOWN', {
      technicalMessage: `availability=UNKNOWN (${decision.reason}); Add-to-Cart refused until the merchant confirms stock`,
    });
  }

  // 4. Prix source : variante exacte, sinon prix produit; le devis reste celui du
  //    moteur AYROVI partagé. Le client ne fournit jamais de montant.
  const sourcePrice = decision.price ?? product.price;
  const sourceCurrency = decision.price != null
    ? (decision.currency || product.currency).trim().toUpperCase()
    : product.currency.trim().toUpperCase();
  const pricing = sourcePrice > 0 && sourceCurrency
    ? calculatePrice(db.getPricingRules(), sourcePrice, sourceCurrency, { title: product.title })
    : null;
  if (!pricing || pricing.restricted || !(pricing.totalTND > 0)) {
    throw new AyWebsDomainError('PRICE_UNAVAILABLE', {
      technicalMessage: `aucun devis serveur pour la variante exacte (sourcePrice=${sourcePrice}, currency=${sourceCurrency || 'UNKNOWN'})`,
    });
  }

  let result: AddAyWebsCartItemResult;
  try {
    result = db.transaction(() => {
      // Recheck under the same write transaction. A concurrent retry either
      // observes the first row or rolls back on the unique idempotency index.
      if (idempotencyKey) {
        const replay = replayAddRequest(db, input, idempotencyKey, requestHash);
        if (replay) return replay;
      }

      const cart = getOrCreateAyWebsCart(db, input.sessionId, input.accountId);
      if (cart.status !== 'ACTIVE') {
        throw new AyWebsDomainError('CART_LOCKED', { technicalMessage: `cart status=${cart.status}` });
      }

      const existingItems = listAyWebsCartItems(db, cart.id);
      if (existingItems.length >= MAX_ITEMS_PER_CART) {
        throw new AyWebsDomainError('CART_LOCKED', {
          userMessage: 'Le panier AyWebs est plein. Validez une commande avant d’ajouter d’autres articles.',
          technicalMessage: `limite de ${MAX_ITEMS_PER_CART} lignes atteinte`,
        });
      }

      const evidenceHash = ayWebsEvidenceHash({
        sourceUrl: product!.sourceUrl,
        sourceDomain: product!.sourceDomain,
        sourceProductId: product!.sourceProductId,
        title: product!.title,
        image: product!.images[0] || null,
        price: sourcePrice,
        currency: sourceCurrency,
        selectedVariant: selection,
        availability,
        adapter: store.adapter,
        retrievedAt: product!.resolvedAt,
      });

      const priceSnapshot: AyWebsPriceSnapshot = {
        price: sourcePrice,
        currency: sourceCurrency,
        timestamp: product!.resolvedAt || new Date().toISOString(),
        sourceUrl: product!.sourceUrl,
        variant: selection,
        availability,
        pricingVersion: pricing.pricingVersion,
        evidenceHash,
      };

      // Une nouvelle action Add (nouvelle clé) garde le comportement historique :
      // même produit + même variante + même note met à jour la quantité.
      const variantKey = ayWebsVariantKey(selection?.attributes || null);
      const duplicate = existingItems.find((item) =>
        item.productId === product!.productId
        && item.status !== 'REMOVED'
        && ayWebsVariantKey(item.variantSnapshot?.attributes || null) === variantKey
        && item.customerNote === customerNote) || null;

      const now = new Date().toISOString();

      if (duplicate) {
        const nextQuantity = Math.min(MAX_QUANTITY, duplicate.quantity + quantity);
        db.run(
          `UPDATE ayweb_cart_items SET quantity=?, unit_price=?, currency=?, availability=?, price_snapshot=?, pricing_tnd=?, pricing_version=?,
             evidence_hash=?, status='ACTIVE', status_reason='', updated_at=? WHERE id=?`,
          nextQuantity, sourcePrice, sourceCurrency, availability, JSON.stringify(priceSnapshot), pricing.totalTND, pricing.pricingVersion,
          evidenceHash, now, duplicate.id,
        );
        refreshCartCounters(db, cart.id);
        const item = readAyWebsCartItem(db, duplicate.id)!;
        emitAyWebsEvent(db, {
          event: 'AYWEB_CART_ITEM_UPDATED',
          resourceType: 'cart_item',
          resourceId: item.id,
          accountId: input.accountId,
          payload: { storeId: store.id, quantity: nextQuantity, duplicate: true, evidenceHash },
        });
        writeAyWebsAudit(db, {
          actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'cart_item.update',
          resourceType: 'cart_item', resourceId: item.id, beforeState: String(duplicate.quantity), afterState: String(nextQuantity),
          detail: { productId: product!.productId, duplicate: true }, requestId: input.requestId || null,
        });
        const duplicateResult: AddAyWebsCartItemResult = {
          item,
          cart: readAyWebsCart(db, input.sessionId, input.accountId) || cart,
          duplicate: true,
          message: 'Cet article était déjà dans votre panier AyWebs : la quantité a été mise à jour.',
          view: readAyWebsCartView(db, input.sessionId, input.accountId),
          idempotentReplay: false,
          quoteUsed,
          sourceReread,
          rereadReason: sourceReread ? rereadGate.reason : null,
        };
        if (idempotencyKey) saveAddRequest(db, input, idempotencyKey, requestHash, duplicateResult);
        return duplicateResult;
      }

      const id = `aywci_${randomUUID()}`;
      const itemNumber = nextAyWebsItemNumber(db);
      db.run(
        `INSERT INTO ayweb_cart_items (id,item_number,cart_id,product_id,store_id,source_url,source_product_id,title,images,unit_price,currency,
           variant_snapshot,quantity,availability,price_snapshot,pricing_tnd,pricing_version,evidence_hash,status,status_reason,customer_note,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        id, itemNumber, cart.id, product!.productId, store.id, product!.sourceUrl, String(product!.sourceProductId || ''),
        product!.title, JSON.stringify(product!.images.slice(0, 10)), sourcePrice, sourceCurrency,
        JSON.stringify(selection ? canonicalVariant(selection) : null), quantity, availability,
        JSON.stringify(priceSnapshot), pricing.totalTND, pricing.pricingVersion, evidenceHash,
        'ACTIVE', '', customerNote, now, now,
      );
      refreshCartCounters(db, cart.id);

      try {
        recordAyWebsEvidence(db, {
          productId: product!.productId,
          cartItemId: id,
          sourceUrl: product!.sourceUrl,
          sourceDomain: product!.sourceDomain,
          sourceProductId: product!.sourceProductId,
          title: product!.title,
          image: product!.images[0] || null,
          price: sourcePrice,
          currency: sourceCurrency,
          selectedVariant: selection,
          availability,
          adapter: store.adapter,
          retrievedAt: product!.resolvedAt,
          evidenceHash,
        });
      } catch (error) {
        console.warn('[AyWebs Cart] evidence write failed', error instanceof Error ? error.message : error);
      }

      const item = readAyWebsCartItem(db, id)!;
      emitAyWebsEvent(db, {
        event: 'AYWEB_CART_ITEM_ADDED',
        resourceType: 'cart_item',
        resourceId: id,
        accountId: input.accountId,
        payload: {
          storeId: store.id,
          productId: product!.productId,
          itemNumber,
          quantity,
          variant: selection?.attributes || null,
          availability,
          purchaseMode: purchaseModeFor(store),
          evidenceHash,
        },
      });
      writeAyWebsAudit(db, {
        actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'cart_item.add',
        resourceType: 'cart_item', resourceId: id, afterState: 'ACTIVE',
        detail: { productId: product!.productId, storeId: store.id, quantity, itemNumber }, requestId: input.requestId || null,
      });

      const message = availability === 'LOW_STOCK'
        ? 'Ajouté au panier AyWebs. Stock faible chez le marchand : commandez rapidement.'
        : 'Ajouté au panier AyWebs.';
      const addedResult: AddAyWebsCartItemResult = {
        item: { ...item, itemNumber },
        cart: readAyWebsCart(db, input.sessionId, input.accountId) || cart,
        duplicate: false,
        message,
        view: readAyWebsCartView(db, input.sessionId, input.accountId),
        idempotentReplay: false,
        quoteUsed,
        sourceReread,
        rereadReason: sourceReread ? rereadGate.reason : null,
      };
      if (idempotencyKey) saveAddRequest(db, input, idempotencyKey, requestHash, addedResult);
      return addedResult;
    });
  } catch (error) {
    // Two app processes can race after resolution. The unique index wins, the
    // losing transaction rolls back, and the committed first result is replayed.
    if (idempotencyKey) {
      const replay = replayAddRequest(db, input, idempotencyKey, requestHash);
      if (replay) return replay;
    }
    throw error;
  }

  if (!result.idempotentReplay) {
    logAyWebsOperation({
      operation: 'cart_add',
      storeId: store.id,
      productId: product.productId,
      customerId: input.accountId,
      sessionId: input.sessionId,
      requestId: input.requestId,
      result: 'success',
    });
  }
  return result;
}

function normalizeAddIdempotencyKey(value: unknown): string | null {
  const key = String(value ?? '').trim();
  if (!key) return null;
  if (key.length > 128) {
    throw new AyWebsDomainError('IDEMPOTENCY_CONFLICT', {
      technicalMessage: `Idempotency-Key too long (${key.length} > 128)`,
    });
  }
  return key;
}

function addRequestFingerprint(input: {
  productId: string | null;
  sourceUrl: string | null;
  storeId: string | null;
  variantAttributes: Record<string, string> | null;
  quantity: number;
  customerNote: string;
}): string {
  const attributes = input.variantAttributes
    ? Object.fromEntries(Object.entries(input.variantAttributes).sort(([left], [right]) => left.localeCompare(right)))
    : null;
  return createHash('sha256').update(JSON.stringify({
    productId: input.productId?.trim() || null,
    sourceUrl: input.sourceUrl?.trim() || null,
    storeId: input.storeId?.trim().toLowerCase() || null,
    variantAttributes: attributes,
    quantity: input.quantity,
    customerNote: input.customerNote,
  })).digest('hex');
}

function idempotencyScopeKey(input: Pick<AddAyWebsCartItemInput, 'sessionId' | 'accountId'>): string {
  return input.accountId ? `account:${input.accountId}` : `session:${input.sessionId}`;
}

function readAddRequestRow(
  db: QatafoDatabase,
  input: Pick<AddAyWebsCartItemInput, 'sessionId' | 'accountId'>,
  idempotencyKey: string,
): any | null {
  const scopes = [...new Set([
    idempotencyScopeKey(input),
    `session:${input.sessionId}`,
  ])];
  const placeholders = scopes.map(() => '?').join(',');
  return db.get<any>(
    `SELECT * FROM ayweb_cart_add_requests WHERE scope_key IN (${placeholders}) AND idempotency_key=? ORDER BY created_at DESC LIMIT 1`,
    ...scopes, idempotencyKey,
  ) || null;
}

function replayAddRequest(
  db: QatafoDatabase,
  input: AddAyWebsCartItemInput,
  idempotencyKey: string,
  requestHash: string,
): AddAyWebsCartItemResult | null {
  const row = readAddRequestRow(db, input, idempotencyKey);
  if (!row) return null;
  if (String(row.request_hash) !== requestHash) {
    throw new AyWebsDomainError('IDEMPOTENCY_CONFLICT', {
      technicalMessage: `Idempotency-Key reused with different add payload (${idempotencyKey.slice(0, 24)})`,
    });
  }

  try {
    const snapshot = JSON.parse(String(row.result_json || '{}'));
    if (!snapshot?.item || !snapshot?.cart) throw new Error('invalid add result snapshot');
    return {
      item: snapshot.item as AyWebsCartItem,
      cart: snapshot.cart as AyWebsCart,
      duplicate: Boolean(snapshot.duplicate),
      message: String(snapshot.message || 'Ajout au panier AyWebs confirmé.'),
      view: snapshot.view && typeof snapshot.view === 'object'
        ? snapshot.view as AyWebsCartView
        : readAyWebsCartView(db, input.sessionId, input.accountId),
      idempotentReplay: true,
      ayrovi: snapshot.ayrovi && typeof snapshot.ayrovi === 'object' ? snapshot.ayrovi : null,
      // Un rejeu renvoie l'état exact enregistré : on ne rejuge pas l'origine du prix.
      quoteUsed: Boolean(snapshot.quoteUsed),
      sourceReread: Boolean(snapshot.sourceReread),
      rereadReason: snapshot.rereadReason ? String(snapshot.rereadReason) : null,
    };
  } catch (error) {
    if (error instanceof AyWebsDomainError) throw error;
    throw new AyWebsDomainError('INTERNAL_ERROR', {
      technicalMessage: `stored Add-to-Cart idempotency result is invalid: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

function saveAddRequest(
  db: QatafoDatabase,
  input: AddAyWebsCartItemInput,
  idempotencyKey: string,
  requestHash: string,
  result: AddAyWebsCartItemResult,
): void {
  db.run(
    `INSERT INTO ayweb_cart_add_requests (id,scope_key,session_id,account_id,idempotency_key,request_hash,result_json,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    `aywaddreq_${randomUUID()}`,
    idempotencyScopeKey(input),
    input.sessionId,
    input.accountId,
    idempotencyKey,
    requestHash,
    JSON.stringify({
      item: result.item,
      cart: result.cart,
      view: result.view,
      duplicate: result.duplicate,
      message: result.message,
      ayrovi: result.ayrovi ?? null,
    }),
    new Date().toISOString(),
  );
}

/** Persist route-level bridge metadata so an HTTP retry replays its first response too. */
export function saveAyWebsCartAddBridgeOutcome(
  db: QatafoDatabase,
  input: Pick<AddAyWebsCartItemInput, 'sessionId' | 'accountId'>,
  idempotencyKeyValue: unknown,
  outcome: NonNullable<AddAyWebsCartItemResult['ayrovi']>,
): void {
  const idempotencyKey = normalizeAddIdempotencyKey(idempotencyKeyValue);
  if (!idempotencyKey) return;
  ensureAyWebsSchema(db);
  const row = readAddRequestRow(db, input, idempotencyKey);
  if (!row) return;
  try {
    const snapshot = JSON.parse(String(row.result_json || '{}'));
    if (!snapshot?.item || !snapshot?.cart) return;
    snapshot.ayrovi = outcome;
    db.run('UPDATE ayweb_cart_add_requests SET result_json=? WHERE id=?', JSON.stringify(snapshot), row.id);
  } catch {
    // A malformed snapshot will be surfaced by the idempotency replay path.
  }
}

/**
 * Sélection de variante (§13, §30).
 *  • groupes publiés mais aucune sélection → `VARIANT_REQUIRED` ;
 *  • sélection inconnue du marchand → `VARIANT_UNKNOWN` (aucune interprétation) ;
 *  • sélection connue mais indisponible → `VARIANT_UNAVAILABLE` (aucun repli
 *    automatique sur une autre taille/couleur).
 */
/** Résultat de sélection : la sélection normalisée + l'état lu chez le marchand. */
export interface AyWebsVariantDecision {
  selection: AyWebsVariantSelection | null;
  availability: AyWebsAvailabilityState;
  reason: string;
  /** Source variant price when published; null falls back to the product price. */
  price: number | null;
  /** Source variant currency when published; null falls back to the product currency. */
  currency: string | null;
}

export function selectVariant(
  product: AyWebsStoredProduct,
  attributes: Record<string, string> | null,
  quantity: number,
): AyWebsVariantDecision {
  const groups = product.variantGroups || [];
  const hasMeaningfulGroups = groups.some((group) => group.values.length > 0);
  // Les attributs PUBLIÉS identifient la variante ; le reste (ex. `condition`)
  // est conservé comme métadonnée d'affichage, jamais comme critère d'identité.
  const { matching, metadata } = ayWebsSplitVariantSelection(product, attributes);

  if (!matching) {
    if (hasMeaningfulGroups) {
      throw new AyWebsDomainError('VARIANT_REQUIRED', {
        technicalMessage: `groupes publiés : ${groups.map((group) => `${group.attribute}(${group.values.length})`).join(', ')}`,
      });
    }
    // Produit sans attribut publié : la disponibilité produit s'applique telle quelle.
    return { selection: null, availability: product.availability.state, reason: product.availability.reason, price: null, currency: null };
  }

  const key = ayWebsVariantKey(matching);
  const match = (product.variants || []).find((variant) => ayWebsVariantKey(variant.attributes) === key);

  if (!match) {
    // La combinaison n'existe pas chez le marchand : on ne devine pas une proche.
    throw new AyWebsDomainError(hasMeaningfulGroups ? 'VARIANT_UNKNOWN' : 'VARIANT_UNAVAILABLE', {
      technicalMessage: `variante ${key} absente de la résolution source`,
    });
  }

  if (match.availability === 'OUT_OF_STOCK') {
    throw new AyWebsDomainError('VARIANT_UNAVAILABLE', {
      technicalMessage: `variante ${key} : ${match.availabilityReason || 'out_of_stock'}`,
    });
  }

  return {
    selection: {
      variantId: match.sourceVariantId || key,
      attributes: match.attributes,
      quantity,
      ...(metadata ? { metadata } : {}),
    },
    availability: match.availability,
    reason: match.availabilityReason || product.availability.reason,
    price: Number.isFinite(Number(match.price)) && Number(match.price) > 0 ? Number(match.price) : null,
    currency: match.currency ? String(match.currency).trim().toUpperCase() || null : null,
  };
}

interface AyWebsStoredSourceQuote {
  variant: AyWebsStoredProduct['variants'][number] | null;
  price: number;
  currency: string;
  availability: AyWebsAvailabilityState;
}

/** Resolve the server-stored exact variant price first, then the product price. */
function storedSourceQuote(
  product: AyWebsStoredProduct,
  item: Pick<AyWebsCartItem, 'variantSnapshot'>,
): AyWebsStoredSourceQuote {
  const variantKey = ayWebsVariantKey(item.variantSnapshot?.attributes || null);
  const variant = variantKey
    ? (product.variants || []).find((candidate) => ayWebsVariantKey(candidate.attributes) === variantKey) || null
    : null;
  const hasVariantPrice = Boolean(variant && Number.isFinite(Number(variant.price)) && Number(variant.price) > 0);
  return {
    variant,
    price: hasVariantPrice ? Number(variant!.price) : product.price,
    currency: (hasVariantPrice ? variant!.currency || product.currency : product.currency).trim().toUpperCase(),
    availability: variant?.availability || product.availability.state,
  };
}

function sourceQuoteChanged(
  item: Pick<AyWebsCartItem, 'unitPrice' | 'currency' | 'priceSnapshot'>,
  quote: Pick<AyWebsStoredSourceQuote, 'price' | 'currency'>,
): boolean {
  const snapshotPrice = item.priceSnapshot?.price ?? item.unitPrice;
  const snapshotCurrency = (item.priceSnapshot?.currency || item.currency).trim().toUpperCase();
  return Math.abs(quote.price - snapshotPrice) > 0.001
    || quote.currency.trim().toUpperCase() !== snapshotCurrency;
}

function storedSourceEvidenceHash(
  product: AyWebsStoredProduct,
  item: Pick<AyWebsCartItem, 'variantSnapshot'>,
  quote: AyWebsStoredSourceQuote,
): string {
  const store = findAyWebsStore(product.storeId);
  return ayWebsEvidenceHash({
    sourceUrl: product.sourceUrl,
    sourceDomain: product.sourceDomain,
    sourceProductId: product.sourceProductId,
    title: product.title,
    image: product.images[0] || null,
    price: quote.price,
    currency: quote.currency,
    selectedVariant: item.variantSnapshot,
    availability: quote.availability,
    adapter: store?.adapter || product.storeId,
    retrievedAt: product.resolvedAt || new Date().toISOString(),
  });
}

export function readAyWebsCartItem(db: QatafoDatabase, itemId: string): AyWebsCartItem | null {
  ensureAyWebsSchema(db);
  const row = db.get<any>(`SELECT * FROM ayweb_cart_items WHERE id=?`, itemId);
  return row ? hydrateCartItem(row, db.getPricingRules()) : null;
}

function assertItemOwnership(db: QatafoDatabase, itemId: string, sessionId: string, accountId: string | null): AyWebsCartItem {
  const item = readAyWebsCartItem(db, itemId);
  if (!item) throw new AyWebsDomainError('CART_ITEM_NOT_FOUND');
  const cart = db.get<any>(`SELECT * FROM ayweb_carts WHERE id=?`, item.cartId);
  if (!cart) throw new AyWebsDomainError('CART_ITEM_NOT_FOUND');
  const ownedByAccount = Boolean(accountId) && String(cart.account_id || '') === accountId;
  const ownedBySession = String(cart.session_id || '') === sessionId;
  // Un panier de session peut être repris par son compte ; l'inverse jamais.
  if (!ownedByAccount && !(ownedBySession && !cart.account_id)) {
    throw new AyWebsDomainError('CART_ITEM_NOT_FOUND', { technicalMessage: 'ligne hors périmètre du client courant' });
  }
  return item;
}

export function updateAyWebsCartItem(
  db: QatafoDatabase,
  input: { itemId: string; sessionId: string; accountId: string | null; quantity?: number; customerNote?: string; variantAttributes?: Record<string, string> | null; requestId?: string | null },
): { item: AyWebsCartItem | null; removed?: boolean; view: AyWebsCartView } {
  ensureAyWebsSchema(db);
  const item = assertItemOwnership(db, input.itemId, input.sessionId, input.accountId);
  const cart = db.get<any>(`SELECT * FROM ayweb_carts WHERE id=?`, item.cartId)!;
  if (String(cart.status) !== 'ACTIVE') throw new AyWebsDomainError('CART_LOCKED');

  const now = new Date().toISOString();
  // Quantité 0 = retrait explicite de la ligne, comme dans le panier AYROVI.
  if (Number(input.quantity) === 0) {
    const removal = removeAyWebsCartItem(db, input);
    return { item: null, removed: true, view: removal.view };
  }
  const quantity = input.quantity == null ? item.quantity : normalizeQuantity(input.quantity);
  const customerNote = input.customerNote == null ? item.customerNote : sanitizeNote(input.customerNote);

  let variantSnapshot = item.variantSnapshot;
  let availability = item.availability;
  let unitPrice = item.unitPrice;
  let currency = item.currency;
  let priceSnapshot = item.priceSnapshot;
  let pricingTnd = item.pricingTnd;
  let pricingVersion = item.pricingVersion;
  let evidenceHash = item.evidenceHash;
  let status: AyWebsCartItemStatus = item.status === 'PRICE_CHANGED' || item.status === 'VARIANT_UNAVAILABLE' ? item.status : 'ACTIVE';
  let statusReason = item.statusReason;

  // Changer de variante = nouvelle lecture du contrat source, jamais une édition libre.
  if (input.variantAttributes !== undefined) {
    const product = item.productId ? readAyWebsProduct(db, item.productId) : null;
    if (!product) throw new AyWebsDomainError('PRODUCT_NOT_FOUND');
    const store = findAyWebsStore(product.storeId);
    if (!store) throw new AyWebsDomainError('STORE_UNKNOWN');
    const attributes = normalizeAttributes(input.variantAttributes);
    const decision = selectVariant(product, attributes, quantity);
    variantSnapshot = decision.selection;
    availability = decision.availability;
    unitPrice = decision.price ?? product.price;
    currency = decision.price != null
      ? (decision.currency || product.currency).trim().toUpperCase()
      : product.currency.trim().toUpperCase();
    const pricing = unitPrice > 0 && currency
      ? calculatePrice(db.getPricingRules(), unitPrice, currency, { title: product.title })
      : null;
    if (!pricing || pricing.restricted || !(pricing.totalTND > 0)) {
      throw new AyWebsDomainError('PRICE_UNAVAILABLE', {
        technicalMessage: `aucun devis serveur pour la variante exacte (sourcePrice=${unitPrice}, currency=${currency || 'UNKNOWN'})`,
      });
    }
    pricingTnd = pricing.totalTND;
    pricingVersion = pricing.pricingVersion;
    const timestamp = product.resolvedAt || now;
    evidenceHash = ayWebsEvidenceHash({
      sourceUrl: product.sourceUrl,
      sourceDomain: product.sourceDomain,
      sourceProductId: product.sourceProductId,
      title: product.title,
      image: product.images[0] || null,
      price: unitPrice,
      currency,
      selectedVariant: variantSnapshot,
      availability,
      adapter: store.adapter,
      retrievedAt: timestamp,
    });
    priceSnapshot = {
      price: unitPrice,
      currency,
      timestamp,
      sourceUrl: product.sourceUrl,
      variant: variantSnapshot,
      availability,
      pricingVersion,
      evidenceHash,
    };
    try {
      recordAyWebsEvidence(db, {
        productId: product.productId,
        cartItemId: item.id,
        sourceUrl: product.sourceUrl,
        sourceDomain: product.sourceDomain,
        sourceProductId: product.sourceProductId,
        title: product.title,
        image: product.images[0] || null,
        price: unitPrice,
        currency,
        selectedVariant: variantSnapshot,
        availability,
        adapter: store.adapter,
        retrievedAt: timestamp,
        evidenceHash,
      });
    } catch (error) {
      console.warn('[AyWebs Cart] variant evidence write failed', error instanceof Error ? error.message : error);
    }
    if (availability === 'OUT_OF_STOCK') {
      status = 'OUT_OF_STOCK';
      statusReason = product.availability.reason || 'merchant_out_of_stock';
    } else if (status !== 'PRICE_CHANGED') {
      status = 'ACTIVE';
      statusReason = '';
    }
  }

  db.run(
    `UPDATE ayweb_cart_items SET quantity=?, customer_note=?, unit_price=?, currency=?, variant_snapshot=?, availability=?,
       price_snapshot=?, pricing_tnd=?, pricing_version=?, evidence_hash=?, status=?, status_reason=?, updated_at=? WHERE id=?`,
    quantity, customerNote, unitPrice, currency,
    JSON.stringify(variantSnapshot ? canonicalVariant(variantSnapshot) : null), availability,
    JSON.stringify(priceSnapshot), pricingTnd, pricingVersion, evidenceHash, status, statusReason, now, item.id,
  );
  refreshCartCounters(db, item.cartId);

  const updated = readAyWebsCartItem(db, item.id)!;
  emitAyWebsEvent(db, {
    event: 'AYWEB_CART_ITEM_UPDATED',
    resourceType: 'cart_item',
    resourceId: updated.id,
    accountId: input.accountId,
    payload: {
      quantity, variant: updated.variantSnapshot?.attributes || null, availability, status,
      unitPrice: updated.unitPrice, currency: updated.currency, pricingVersion: updated.pricingVersion,
    },
  });
  writeAyWebsAudit(db, {
    actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'cart_item.update',
    resourceType: 'cart_item', resourceId: updated.id, beforeState: item.status, afterState: updated.status,
    detail: {
      quantity, from: item.quantity, unitPrice, currency,
      variant: updated.variantSnapshot?.attributes || null,
    }, requestId: input.requestId || null,
  });
  return { item: updated, view: readAyWebsCartView(db, input.sessionId, input.accountId) };
}

export function removeAyWebsCartItem(
  db: QatafoDatabase,
  input: { itemId: string; sessionId: string; accountId: string | null; requestId?: string | null },
): { removed: true; view: AyWebsCartView } {
  ensureAyWebsSchema(db);
  const item = assertItemOwnership(db, input.itemId, input.sessionId, input.accountId);
  const cart = db.get<any>(`SELECT * FROM ayweb_carts WHERE id=?`, item.cartId)!;
  if (String(cart.status) === 'ORDERED') throw new AyWebsDomainError('CART_LOCKED');

  db.run(`UPDATE ayweb_cart_items SET status='REMOVED', status_reason='customer_removed', updated_at=? WHERE id=?`, new Date().toISOString(), item.id);
  refreshCartCounters(db, item.cartId);
  writeAyWebsAudit(db, {
    actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'cart_item.remove',
    resourceType: 'cart_item', resourceId: item.id, beforeState: item.status, afterState: 'REMOVED',
    requestId: input.requestId || null,
  });
  return { removed: true, view: readAyWebsCartView(db, input.sessionId, input.accountId) };
}

/**
 * Recontrôle prix + variante avant checkout (§18, §29, §30).
 *
 * Règle centrale : si le prix source a bougé, la ligne passe en `PRICE_CHANGED`
 * et le checkout est bloqué tant que le client n'a pas accepté. Si la variante
 * exacte a disparu, la ligne passe en `VARIANT_UNAVAILABLE` — AUCUN
 * remplacement automatique n'est proposé ni appliqué.
 */
export async function verifyAyWebsCart(
  deps: AyWebsResolverDependencies,
  input: { sessionId: string; accountId: string | null; recheckSource?: boolean },
): Promise<{ view: AyWebsCartView; changes: Array<{ itemId: string; code: string; message: string; before?: unknown; after?: unknown }> }> {
  const { db } = deps;
  ensureAyWebsSchema(db);
  const view = readAyWebsCartView(db, input.sessionId, input.accountId);
  const changes: Array<{ itemId: string; code: string; message: string; before?: unknown; after?: unknown }> = [];
  if (!view.cart) return { view, changes };

  for (const item of view.items) {
    if (!item.productId) {
      markItem(db, item.id, 'CUSTOMER_ACTION_REQUIRED', 'product_source_missing');
      changes.push({ itemId: item.id, code: 'PRODUCT_NOT_FOUND', message: 'La fiche source de cet article est introuvable.' });
      continue;
    }

    const stored = readAyWebsProduct(db, item.productId);
    if (!stored) {
      markItem(db, item.id, 'VARIANT_UNAVAILABLE', 'produit_source_introuvable');
      changes.push({ itemId: item.id, code: 'PRODUCT_NOT_FOUND', message: 'La fiche source n’est plus disponible.' });
      continue;
    }

    // Variante et prix : l'option exacte publiée par le marchand prime sur le produit.
    const variantKey = ayWebsVariantKey(item.variantSnapshot?.attributes || null);
    const snapshotPrice = item.priceSnapshot?.price ?? item.unitPrice;
    const snapshotCurrency = (item.priceSnapshot?.currency || item.currency).trim().toUpperCase();
    let latestQuote = storedSourceQuote(stored, item);

    if (input.recheckSource) {
      const store = findAyWebsStore(stored.storeId);
      if (!store || !deps.flags.storeCaptureEnabled(store)) {
        markItem(db, item.id, 'CUSTOMER_ACTION_REQUIRED', 'source_recheck_unavailable');
        changes.push({
          itemId: item.id, code: 'SOURCE_RECHECK_UNAVAILABLE',
          message: 'La source marchande ne peut pas être vérifiée maintenant. Réessayez avant de continuer.',
        });
        continue;
      }

      try {
        const resolved = await resolveAyWebsProduct(deps, {
          url: stored.sourceUrl,
          storeId: stored.storeId,
          selectedVariant: item.variantSnapshot?.attributes || null,
          quantity: item.quantity,
          sessionId: input.sessionId,
          accountId: input.accountId,
          refresh: true,
        });
        const refreshed = readAyWebsProduct(db, resolved.productId);
        if (!refreshed) throw new Error('fresh product snapshot was not persisted');
        if (!refreshed.priceVerified || !refreshed.currencyVerified) {
          markItem(db, item.id, 'CUSTOMER_ACTION_REQUIRED', 'source_price_or_currency_unverified');
          changes.push({
            itemId: item.id, code: 'PRICE_VERIFICATION_REQUIRED',
            message: 'Le marchand n’a pas confirmé le prix et la devise. Aucun devis ne peut être transmis au checkout.',
          });
          continue;
        }
        latestQuote = storedSourceQuote(refreshed, item);

        if (variantKey && !latestQuote.variant) {
          markItem(db, item.id, 'VARIANT_UNAVAILABLE', `variante_absente:${variantKey}`);
          changes.push({
            itemId: item.id, code: 'VARIANT_UNAVAILABLE',
            message: 'La version choisie n’est plus publiée par le marchand. Choisissez-en une autre.',
            before: item.variantSnapshot?.attributes, after: null,
          });
          continue;
        }
        if (latestQuote.availability === 'OUT_OF_STOCK') {
          markItem(
            db, item.id, variantKey ? 'VARIANT_UNAVAILABLE' : 'OUT_OF_STOCK',
            latestQuote.variant?.availabilityReason || refreshed.availability.reason || 'merchant_out_of_stock',
          );
          changes.push({
            itemId: item.id,
            code: variantKey ? 'VARIANT_UNAVAILABLE' : 'OUT_OF_STOCK',
            message: variantKey ? 'La version choisie est épuisée chez le marchand.' : 'Le marchand indique cet article épuisé.',
          });
          continue;
        }

        const changed = sourceQuoteChanged(item, latestQuote);
        applyRefreshedSource(db, item, refreshed, latestQuote);
        if (changed) {
          emitAyWebsEvent(db, {
            event: 'AYWEB_PRICE_CHANGED',
            resourceType: 'cart_item',
            resourceId: item.id,
            accountId: input.accountId,
            payload: {
              before: snapshotPrice, beforeCurrency: snapshotCurrency,
              after: latestQuote.price, currency: latestQuote.currency, storeId: stored.storeId,
            },
          });
          changes.push({
            itemId: item.id, code: 'PRICE_CHANGED',
            message: 'Le prix marchand a changé depuis votre ajout.',
            before: snapshotPrice, after: latestQuote.price,
          });
        } else if (latestQuote.availability === 'UNKNOWN') {
          changes.push({
            itemId: item.id, code: 'AVAILABILITY_UNKNOWN',
            message: 'Le marchand n’a pas confirmé le stock de cette version.',
          });
        }
        continue;
      } catch (error) {
        // Toute erreur de capture rend le résultat invérifiable : jamais de succès caché.
        logAyWebsOperation({
          operation: 'cart_verify_recheck',
          storeId: stored.storeId,
          productId: stored.productId,
          result: 'failure',
          errorCode: error instanceof AyWebsDomainError ? String(error.code) : 'CAPTURE_FAILED',
        });
        markItem(db, item.id, 'CUSTOMER_ACTION_REQUIRED', 'source_recheck_failed');
        changes.push({
          itemId: item.id, code: 'SOURCE_RECHECK_FAILED',
          message: 'La source marchande n’a pas pu être vérifiée. Aucun article ne sera envoyé au checkout.',
        });
        continue;
      }
    }

    if (!stored.priceVerified || !stored.currencyVerified) {
      markItem(db, item.id, 'CUSTOMER_ACTION_REQUIRED', 'source_price_or_currency_unverified');
      changes.push({
        itemId: item.id, code: 'PRICE_VERIFICATION_REQUIRED',
        message: 'Le prix et la devise source doivent être confirmés avant le checkout.',
      });
      continue;
    }
    if (variantKey && !latestQuote.variant) {
      markItem(db, item.id, 'VARIANT_UNAVAILABLE', `variante_absente:${variantKey}`);
      changes.push({
        itemId: item.id, code: 'VARIANT_UNAVAILABLE',
        message: 'La version choisie n’est plus publiée par le marchand. Choisissez-en une autre.',
        before: item.variantSnapshot?.attributes, after: null,
      });
      continue;
    }
    if (latestQuote.availability === 'OUT_OF_STOCK') {
      markItem(
        db, item.id, variantKey ? 'VARIANT_UNAVAILABLE' : 'OUT_OF_STOCK',
        latestQuote.variant?.availabilityReason || stored.availability.reason || 'merchant_out_of_stock',
      );
      changes.push({
        itemId: item.id,
        code: variantKey ? 'VARIANT_UNAVAILABLE' : 'OUT_OF_STOCK',
        message: variantKey ? 'La version choisie est épuisée chez le marchand.' : 'Le marchand indique cet article épuisé.',
      });
      continue;
    }
    if (latestQuote.availability === 'UNKNOWN') {
      changes.push({
        itemId: item.id, code: 'AVAILABILITY_UNKNOWN',
        message: 'Le stock de cet article n’est pas confirmé par le marchand.',
      });
    }

    if (sourceQuoteChanged(item, latestQuote)) {
      markItemPriceChanged(db, item, latestQuote.price, latestQuote.currency);
      emitAyWebsEvent(db, {
        event: 'AYWEB_PRICE_CHANGED',
        resourceType: 'cart_item',
        resourceId: item.id,
        accountId: input.accountId,
        payload: {
          before: snapshotPrice, beforeCurrency: snapshotCurrency,
          after: latestQuote.price, currency: latestQuote.currency, storeId: stored.storeId,
        },
      });
      changes.push({
        itemId: item.id, code: 'PRICE_CHANGED',
        message: 'Le prix marchand a changé depuis votre ajout.',
        before: snapshotPrice, after: latestQuote.price,
      });
    }
  }

  return { view: readAyWebsCartView(db, input.sessionId, input.accountId), changes };
}

function applyRefreshedSource(
  db: QatafoDatabase,
  item: AyWebsCartItem,
  stored: AyWebsStoredProduct,
  quote: AyWebsStoredSourceQuote,
): void {
  const changed = sourceQuoteChanged(item, quote);
  const now = new Date().toISOString();
  if (changed) {
    // Keep the accepted source snapshot untouched until the customer accepts;
    // only publish the current availability and an explicit price-change blocker.
    db.run(
      `UPDATE ayweb_cart_items SET availability=?, status='PRICE_CHANGED', status_reason=?, updated_at=? WHERE id=?`,
      quote.availability,
      `prix_source_actuel:${quote.price};devise:${quote.currency}`.slice(0, 200), now, item.id,
    );
    return;
  }

  const pricing = calculatePrice(db.getPricingRules(), quote.price, quote.currency, { title: stored.title });
  if (!pricing || pricing.restricted || !(pricing.totalTND > 0)) {
    // A source quote that can no longer be priced must not leave a stale active line.
    markItem(db, item.id, 'CUSTOMER_ACTION_REQUIRED', 'source_quote_unusable');
    db.run(`UPDATE ayweb_cart_items SET availability=?, updated_at=? WHERE id=?`, quote.availability, now, item.id);
    return;
  }
  const timestamp = stored.resolvedAt || item.priceSnapshot?.timestamp || now;
  const evidenceHash = storedSourceEvidenceHash(stored, item, quote);
  const nextSnapshot: AyWebsPriceSnapshot = {
    price: quote.price,
    currency: quote.currency,
    timestamp,
    sourceUrl: stored.sourceUrl,
    variant: item.variantSnapshot,
    availability: quote.availability,
    pricingVersion: pricing.pricingVersion,
    evidenceHash,
  };
  const store = findAyWebsStore(stored.storeId);
  try {
    recordAyWebsEvidence(db, {
      productId: stored.productId,
      cartItemId: item.id,
      sourceUrl: stored.sourceUrl,
      sourceDomain: stored.sourceDomain,
      sourceProductId: stored.sourceProductId,
      title: stored.title,
      image: stored.images[0] || null,
      price: quote.price,
      currency: quote.currency,
      selectedVariant: item.variantSnapshot,
      availability: quote.availability,
      adapter: store?.adapter || stored.storeId,
      retrievedAt: timestamp,
      evidenceHash,
    });
  } catch (error) {
    console.warn('[AyWebs Cart] refreshed evidence write failed', error instanceof Error ? error.message : error);
  }
  db.run(
    `UPDATE ayweb_cart_items SET unit_price=?, currency=?, availability=?, price_snapshot=?, pricing_tnd=?, pricing_version=?,
       evidence_hash=?, status=?, status_reason=?, updated_at=? WHERE id=?`,
    quote.price, quote.currency, quote.availability, JSON.stringify(nextSnapshot), pricing.totalTND, pricing.pricingVersion,
    evidenceHash, 'ACTIVE', '', now, item.id,
  );
}

/** Le client accepte explicitement le nouveau prix (§29) — jamais automatique. */
export function acceptAyWebsCartPriceChange(
  db: QatafoDatabase,
  input: { itemId: string; sessionId: string; accountId: string | null; requestId?: string | null },
): { item: AyWebsCartItem; view: AyWebsCartView } {
  const item = assertItemOwnership(db, input.itemId, input.sessionId, input.accountId);
  if (item.status !== 'PRICE_CHANGED') {
    throw new AyWebsDomainError('ORDER_STATE_INVALID', {
      userMessage: 'Aucun changement de prix n’est en attente sur cet article.',
      technicalMessage: `status=${item.status}, acceptation refusée`,
    });
  }
  const stored = item.productId ? readAyWebsProduct(db, item.productId) : null;
  if (!stored) throw new AyWebsDomainError('PRODUCT_NOT_FOUND');

  const quote = storedSourceQuote(stored, item);
  const variantKey = ayWebsVariantKey(item.variantSnapshot?.attributes || null);
  if ((variantKey && !quote.variant) || quote.availability === 'OUT_OF_STOCK') {
    throw new AyWebsDomainError('VARIANT_UNAVAILABLE', {
      userMessage: 'La version exacte choisie n’est plus disponible. Choisissez-en une autre avant de continuer.',
      technicalMessage: `variant=${variantKey || 'product'}, availability=${quote.availability}`,
    });
  }
  const pricing = quote.price > 0 && quote.currency
    ? calculatePrice(db.getPricingRules(), quote.price, quote.currency, { title: stored.title })
    : null;
  if (!pricing || pricing.restricted || !(pricing.totalTND > 0)) {
    throw new AyWebsDomainError('PRICE_UNAVAILABLE', {
      technicalMessage: `aucun devis serveur pour la variante exacte (sourcePrice=${quote.price}, currency=${quote.currency || 'UNKNOWN'})`,
    });
  }
  const now = new Date().toISOString();
  const timestamp = stored.resolvedAt || now;
  const evidenceHash = storedSourceEvidenceHash(stored, item, quote);
  const acceptedSnapshot: AyWebsPriceSnapshot = {
    price: quote.price,
    currency: quote.currency,
    timestamp,
    sourceUrl: stored.sourceUrl,
    variant: item.variantSnapshot,
    availability: quote.availability,
    pricingVersion: pricing.pricingVersion,
    evidenceHash,
  };
  const store = findAyWebsStore(stored.storeId);
  try {
    recordAyWebsEvidence(db, {
      productId: stored.productId,
      cartItemId: item.id,
      sourceUrl: stored.sourceUrl,
      sourceDomain: stored.sourceDomain,
      sourceProductId: stored.sourceProductId,
      title: stored.title,
      image: stored.images[0] || null,
      price: quote.price,
      currency: quote.currency,
      selectedVariant: item.variantSnapshot,
      availability: quote.availability,
      adapter: store?.adapter || stored.storeId,
      retrievedAt: timestamp,
      evidenceHash,
    });
  } catch (error) {
    console.warn('[AyWebs Cart] accepted-price evidence write failed', error instanceof Error ? error.message : error);
  }
  db.run(
    `UPDATE ayweb_cart_items SET unit_price=?, currency=?, price_snapshot=?, pricing_tnd=?, pricing_version=?, evidence_hash=?,
       availability=?, status='ACTIVE', status_reason='prix_accepte_par_le_client', updated_at=? WHERE id=?`,
    quote.price, quote.currency, JSON.stringify(acceptedSnapshot), pricing.totalTND, pricing.pricingVersion,
    evidenceHash, quote.availability, now, item.id,
  );
  const updated = readAyWebsCartItem(db, item.id)!;
  emitAyWebsEvent(db, {
    event: 'AYWEB_CART_ITEM_UPDATED',
    resourceType: 'cart_item',
    resourceId: item.id,
    accountId: input.accountId,
    payload: {
      priceAccepted: true, previousPrice: item.unitPrice, newPrice: quote.price,
      currency: quote.currency, variant: item.variantSnapshot?.attributes || null,
    },
  });
  writeAyWebsAudit(db, {
    actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'cart_item.accept_price',
    resourceType: 'cart_item', resourceId: item.id, beforeState: 'PRICE_CHANGED', afterState: 'ACTIVE',
    detail: {
      previousPrice: item.unitPrice, acceptedPrice: quote.price, currency: quote.currency,
      variant: item.variantSnapshot?.attributes || null,
    }, requestId: input.requestId || null,
  });
  return { item: updated, view: readAyWebsCartView(db, input.sessionId, input.accountId) };
}

/** Verrouille le panier pour le checkout (transition contrôlée par la machine à états). */
export function lockAyWebsCartForCheckout(db: QatafoDatabase, sessionId: string, accountId: string | null): AyWebsCart {
  const cart = readAyWebsCart(db, sessionId, accountId);
  if (!cart) throw new AyWebsDomainError('CART_EMPTY');
  const transition = ayWebsCartMachine.assert(cart.status, 'CHECKOUT');
  if (!transition.allowed) throw new AyWebsDomainError('CART_LOCKED', { technicalMessage: transition.reason });
  db.run(`UPDATE ayweb_carts SET status='CHECKOUT', updated_at=? WHERE id=?`, new Date().toISOString(), cart.id);
  return { ...cart, status: 'CHECKOUT' };
}

export function releaseAyWebsCart(db: QatafoDatabase, cartId: string, status: 'ACTIVE' | 'ORDERED' = 'ACTIVE'): void {
  const transition = ayWebsCartMachine.assert(
    String(db.get<any>(`SELECT status FROM ayweb_carts WHERE id=?`, cartId)?.status || 'ACTIVE') as any,
    status,
  );
  if (!transition.allowed) throw new AyWebsDomainError('CART_LOCKED', { technicalMessage: transition.reason });
  db.run(`UPDATE ayweb_carts SET status=?, updated_at=? WHERE id=?`, status, new Date().toISOString(), cartId);
}

/** Rattache un panier de session au compte après connexion (§26 : le contexte survit). */
export function attachAyWebsCartToAccount(db: QatafoDatabase, sessionId: string, accountId: string): void {
  ensureAyWebsSchema(db);
  const anonymous = db.get<any>(
    `SELECT * FROM ayweb_carts WHERE session_id=? AND account_id IS NULL AND status IN ('ACTIVE','CHECKOUT') ORDER BY updated_at DESC LIMIT 1`,
    sessionId,
  );
  if (!anonymous) return;
  const target = db.get<any>(`SELECT * FROM ayweb_carts WHERE account_id=? AND status IN ('ACTIVE','CHECKOUT') ORDER BY updated_at DESC LIMIT 1`, accountId);
  const now = new Date().toISOString();
  if (!target) {
    db.run(`UPDATE ayweb_carts SET account_id=?, updated_at=? WHERE id=?`, accountId, now, anonymous.id);
  } else {
    // Fusion : les lignes anonymes rejoignent le panier du compte, sans doublon de variante.
    const existing = listAyWebsCartItems(db, target.id);
    for (const item of listAyWebsCartItems(db, anonymous.id)) {
      const clash = existing.find((candidate) => candidate.productId === item.productId
        && ayWebsVariantKey(candidate.variantSnapshot?.attributes || null) === ayWebsVariantKey(item.variantSnapshot?.attributes || null));
      if (clash) {
        db.run(`UPDATE ayweb_cart_items SET quantity=?, updated_at=? WHERE id=?`,
          Math.min(MAX_QUANTITY, clash.quantity + item.quantity), now, clash.id);
        db.run(`UPDATE ayweb_cart_items SET status='REMOVED', status_reason='fusion_compte', updated_at=? WHERE id=?`, now, item.id);
      } else {
        db.run(`UPDATE ayweb_cart_items SET cart_id=?, updated_at=? WHERE id=?`, target.id, now, item.id);
      }
    }
    db.run(`UPDATE ayweb_carts SET status='ABANDONED', account_id=?, updated_at=? WHERE id=?`, accountId, now, anonymous.id);
    refreshCartCounters(db, target.id);
  }
  db.run(`UPDATE ayweb_sessions SET account_id=?, updated_at=? WHERE session_id=?`, accountId, now, sessionId);
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

function markItem(db: QatafoDatabase, itemId: string, status: AyWebsCartItemStatus, reason: string): void {
  db.run(`UPDATE ayweb_cart_items SET status=?, status_reason=?, updated_at=? WHERE id=?`, status, reason.slice(0, 200), new Date().toISOString(), itemId);
}

function markItemPriceChanged(db: QatafoDatabase, item: AyWebsCartItem, latestPrice: number, currency: string): void {
  db.run(
    `UPDATE ayweb_cart_items SET status='PRICE_CHANGED', status_reason=?, updated_at=? WHERE id=?`,
    `prix_snapshot:${item.unitPrice};prix_source:${latestPrice};devise:${currency}`.slice(0, 200),
    new Date().toISOString(), item.id,
  );
}

function refreshCartCounters(db: QatafoDatabase, cartId: string): void {
  const row = db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM ayweb_cart_items WHERE cart_id=? AND status!='REMOVED'`, cartId);
  db.run(`UPDATE ayweb_carts SET items_count=?, updated_at=? WHERE id=?`, Number(row?.count || 0), new Date().toISOString(), cartId);
}

function nextAyWebsItemNumber(db: QatafoDatabase): string {
  try {
    return nextSequenceNumber(db, 'ayweb_cart_item_number');
  } catch {
    return `AYWITEM-${randomUUID().slice(0, 8)}`;
  }
}

export function normalizeQuantity(value: unknown): number {
  const quantity = Number(value ?? 1);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) {
    throw new AyWebsDomainError('CART_ITEM_NOT_FOUND', {
      userMessage: `La quantité doit être un entier entre 1 et ${MAX_QUANTITY}.`,
      technicalMessage: `quantité invalide : ${String(value)}`,
    });
  }
  return quantity;
}

export function normalizeAttributes(value: unknown): Record<string, string> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const name = String(key).trim().toLowerCase().replace(/[^a-z0-9_\-]/g, '').slice(0, 40);
    const text = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 120);
    if (name && text) out[name] = text;
  }
  return Object.keys(out).length ? out : null;
}

export function sanitizeNote(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
}

function round2(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function hydrateCart(row: any): AyWebsCart {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : null,
    sessionId: String(row.session_id || ''),
    status: String(row.status || 'ACTIVE') as AyWebsCart['status'],
    currency: String(row.currency || 'TND'),
    itemCount: Number(row.items_count) || 0,
    totalUnits: 0,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function hydrateCartItem(row: any, pricingRules?: PricingRules): AyWebsCartItem {
  const parse = <T,>(value: unknown, fallback: T): T => {
    try {
      const parsed = JSON.parse(String(value ?? ''));
      return parsed == null ? fallback : parsed as T;
    } catch { return fallback; }
  };
  const store = findAyWebsStore(row.store_id);
  const variantSnapshot = parse<AyWebsVariantSelection | null>(row.variant_snapshot, null);
  const priceSnapshot = parse<AyWebsPriceSnapshot | null>(row.price_snapshot, null);
  const status = String(row.status || 'ACTIVE') as AyWebsCartItemStatus;
  const pricingTnd = Number(row.pricing_tnd) || 0;
  const quantity = Number(row.quantity) || 1;
  const unitPrice = Number(row.unit_price) || 0;
  const currency = String(row.currency || '');
  const availability = String(row.availability || 'UNKNOWN') as AyWebsAvailabilityState;
  // Match checkoutFees: recalculate this line at its actual quantity and exclude
  // order-level local delivery, which checkout charges once for the whole cart.
  const linePricing = pricingRules && unitPrice > 0 && currency
    ? calculatePrice(pricingRules, unitPrice, currency, {
        title: String(row.title || ''), quantity, includeLocalDelivery: false,
      })
    : null;
  const lineTotalTnd = linePricing ? round2(linePricing.totalTND) : round2(pricingTnd * quantity);
  return {
    id: String(row.id),
    itemNumber: String(row.item_number || ''),
    cartId: String(row.cart_id),
    productId: row.product_id ? String(row.product_id) : null,
    storeId: String(row.store_id),
    storeName: store?.displayName || store?.name || String(row.store_id),
    sourceUrl: String(row.source_url || ''),
    sourceProductId: String(row.source_product_id || '') || null,
    title: String(row.title || ''),
    images: parse<string[]>(row.images, []),
    unitPrice,
    currency,
    variantSnapshot,
    variantLabel: ayWebsVariantLabel(variantSnapshot),
    quantity,
    availability,
    priceSnapshot,
    pricingTnd,
    pricingVersion: Number(row.pricing_version) || 0,
    lineTotalTnd,
    evidenceHash: String(row.evidence_hash || ''),
    status,
    statusReason: String(row.status_reason || ''),
    customerNote: String(row.customer_note || ''),
    purchaseMode: store ? purchaseModeFor(store) : 'NOT_IMPLEMENTED',
    checkoutReady: status === 'ACTIVE' && (availability === 'AVAILABLE' || availability === 'LOW_STOCK'),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export { ayWebsVariantLabel };
