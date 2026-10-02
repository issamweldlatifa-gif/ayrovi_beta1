import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
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
import { ayWebsVariantKey } from './productNormalizer';
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
  requestId?: string | null;
}

export interface AddAyWebsCartItemResult {
  item: AyWebsCartItem;
  cart: AyWebsCart;
  duplicate: boolean;
  message: string;
  view: AyWebsCartView;
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
  return db.all<any>(
    `SELECT * FROM ayweb_cart_items WHERE cart_id=? AND status!='REMOVED' ORDER BY created_at ASC`,
    cartId,
  ).map(hydrateCartItem);
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
        itemId: item.id, code: 'CUSTOMER_ACTION_REQUIRED', action: 'CUSTOMER_BROWSER_ACTION',
        message: 'Une action est nécessaire dans la boutique (connexion ou vérification) avant l’achat.',
      };
    default:
      return { itemId: item.id, code: 'CART_ITEM_BLOCKED', action: 'CONTACT_SUPPORT', message: 'Cet article ne peut pas être commandé en l’état.' };
  }
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

  // 1. Résolution serveur du produit : soit il est déjà résolu, soit on le relit.
  let product: AyWebsStoredProduct | null = input.productId ? readAyWebsProduct(db, input.productId) : null;
  let resolved: Awaited<ReturnType<typeof resolveAyWebsProduct>> | null = null;

  if (!product) {
    if (!input.sourceUrl) throw new AyWebsDomainError('PRODUCT_NOT_FOUND');
    resolved = await resolveAyWebsProduct(deps, {
      url: input.sourceUrl,
      storeId: input.storeId || null,
      selectedVariant: variantAttributes,
      quantity,
      sessionId: input.sessionId,
      accountId: input.accountId,
    });
    product = readAyWebsProduct(db, resolved.productId);
    if (!product) throw new AyWebsDomainError('PRODUCT_NOT_FOUND');
  }

  const store = findAyWebsStore(product.storeId);
  if (!store) throw new AyWebsDomainError('STORE_UNKNOWN');
  if (!deps.flags.storeCaptureEnabled(store)) throw new AyWebsDomainError('STORE_CAPTURE_UNSUPPORTED');

  // 2. Variante : si le marchand publie des attributs, la sélection est exigée (§13).
  const decision = selectVariant(product, variantAttributes, quantity);
  const selection = decision.selection;

  // 3. Disponibilité : OUT_OF_STOCK bloque, UNKNOWN reste incertain et le dit (§14).
  const availability = decision.availability;
  if (availability === 'OUT_OF_STOCK') {
    emitAyWebsEvent(db, {
      event: 'AYWEB_VARIANT_UNAVAILABLE',
      resourceType: 'product',
      resourceId: product.productId,
      accountId: input.accountId,
      payload: { storeId: store.id, variant: selection?.attributes || null, reason: product.availability.reason },
    });
    throw new AyWebsDomainError('OUT_OF_STOCK', {
      technicalMessage: `availability=OUT_OF_STOCK (${product.availability.reason})`,
    });
  }

  // 4. Devis AYROVI recalculé ici — jamais celui fourni par le client.
  if (!(product.pricingTnd > 0)) {
    throw new AyWebsDomainError('PRICE_UNAVAILABLE', {
      technicalMessage: 'aucun devis AYROVI exploitable pour ce produit (devise hors moteur ou catégorie restreinte)',
    });
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
    sourceUrl: product.sourceUrl,
    sourceDomain: product.sourceDomain,
    sourceProductId: product.sourceProductId,
    title: product.title,
    image: product.images[0] || null,
    price: product.price,
    currency: product.currency,
    selectedVariant: selection,
    availability,
    adapter: store.adapter,
    retrievedAt: product.resolvedAt,
  });

  const priceSnapshot: AyWebsPriceSnapshot = {
    price: product.price,
    currency: product.currency,
    timestamp: product.resolvedAt || new Date().toISOString(),
    sourceUrl: product.sourceUrl,
    variant: selection,
    availability,
    pricingVersion: product.pricingVersion,
    evidenceHash,
  };

  // 5. Déduplication : même produit + même variante + même note = mise à jour.
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
      `UPDATE ayweb_cart_items SET quantity=?, availability=?, price_snapshot=?, pricing_tnd=?, pricing_version=?,
         evidence_hash=?, status='ACTIVE', status_reason='', updated_at=? WHERE id=?`,
      nextQuantity, availability, JSON.stringify(priceSnapshot), product.pricingTnd, product.pricingVersion,
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
      detail: { productId: product.productId, duplicate: true }, requestId: input.requestId || null,
    });
    return {
      item,
      cart: readAyWebsCart(db, input.sessionId, input.accountId) || cart,
      duplicate: true,
      message: 'Cet article était déjà dans votre panier AyWebs : la quantité a été mise à jour.',
      view: readAyWebsCartView(db, input.sessionId, input.accountId),
    };
  }

  const id = `aywci_${randomUUID()}`;
  const itemNumber = nextAyWebsItemNumber(db);
  db.run(
    `INSERT INTO ayweb_cart_items (id,item_number,cart_id,product_id,store_id,source_url,source_product_id,title,images,unit_price,currency,
       variant_snapshot,quantity,availability,price_snapshot,pricing_tnd,pricing_version,evidence_hash,status,status_reason,customer_note,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, itemNumber, cart.id, product.productId, store.id, product.sourceUrl, String(product.sourceProductId || ''),
    product.title, JSON.stringify(product.images.slice(0, 10)), product.price, product.currency,
    JSON.stringify(selection ? canonicalVariant(selection) : null), quantity, availability,
    JSON.stringify(priceSnapshot), product.pricingTnd, product.pricingVersion, evidenceHash,
    'ACTIVE', '', customerNote, now, now,
  );
  refreshCartCounters(db, cart.id);

  try {
    recordAyWebsEvidence(db, {
      productId: product.productId,
      cartItemId: id,
      sourceUrl: product.sourceUrl,
      sourceDomain: product.sourceDomain,
      sourceProductId: product.sourceProductId,
      title: product.title,
      image: product.images[0] || null,
      price: product.price,
      currency: product.currency,
      selectedVariant: selection,
      availability,
      adapter: store.adapter,
      retrievedAt: product.resolvedAt,
      // Empreinte identique à celle de la ligne : la preuve est vérifiable.
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
      productId: product.productId,
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
    detail: { productId: product.productId, storeId: store.id, quantity, itemNumber }, requestId: input.requestId || null,
  });
  logAyWebsOperation({
    operation: 'cart_add',
    storeId: store.id,
    productId: product.productId,
    customerId: input.accountId,
    sessionId: input.sessionId,
    result: 'success',
  });

  return {
    item: { ...item, itemNumber },
    cart: readAyWebsCart(db, input.sessionId, input.accountId) || cart,
    duplicate: false,
    message: availability === 'UNKNOWN'
      ? 'Ajouté au panier AyWebs. Le marchand ne publie pas le stock de cette version : il sera vérifié avant l’achat.'
      : availability === 'LOW_STOCK'
        ? 'Ajouté au panier AyWebs. Stock faible chez le marchand : commandez rapidement.'
        : 'Ajouté au panier AyWebs.',
    view: readAyWebsCartView(db, input.sessionId, input.accountId),
  };
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
}

export function selectVariant(
  product: AyWebsStoredProduct,
  attributes: Record<string, string> | null,
  quantity: number,
): AyWebsVariantDecision {
  const groups = product.variantGroups || [];
  const hasMeaningfulGroups = groups.some((group) => group.values.length > 0);

  if (!attributes || !Object.keys(attributes).length) {
    if (hasMeaningfulGroups) {
      throw new AyWebsDomainError('VARIANT_REQUIRED', {
        technicalMessage: `groupes publiés : ${groups.map((group) => `${group.attribute}(${group.values.length})`).join(', ')}`,
      });
    }
    // Produit sans attribut publié : la disponibilité produit s'applique telle quelle.
    return { selection: null, availability: product.availability.state, reason: product.availability.reason };
  }

  const key = ayWebsVariantKey(attributes);
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
    selection: { variantId: match.sourceVariantId || key, attributes: match.attributes, quantity },
    availability: match.availability,
    reason: match.availabilityReason || product.availability.reason,
  };
}

export function readAyWebsCartItem(db: QatafoDatabase, itemId: string): AyWebsCartItem | null {
  ensureAyWebsSchema(db);
  const row = db.get<any>(`SELECT * FROM ayweb_cart_items WHERE id=?`, itemId);
  return row ? hydrateCartItem(row) : null;
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
  let status: AyWebsCartItemStatus = item.status === 'PRICE_CHANGED' || item.status === 'VARIANT_UNAVAILABLE' ? item.status : 'ACTIVE';
  let statusReason = item.statusReason;

  // Changer de variante = nouvelle lecture du contrat source, jamais une édition libre.
  if (input.variantAttributes !== undefined) {
    const product = item.productId ? readAyWebsProduct(db, item.productId) : null;
    if (!product) throw new AyWebsDomainError('PRODUCT_NOT_FOUND');
    const attributes = normalizeAttributes(input.variantAttributes);
    const decision = selectVariant(product, attributes, quantity);
    variantSnapshot = decision.selection;
    availability = decision.availability;
    if (availability === 'OUT_OF_STOCK') {
      status = 'OUT_OF_STOCK';
      statusReason = product.availability.reason || 'merchant_out_of_stock';
    } else if (status !== 'PRICE_CHANGED') {
      status = 'ACTIVE';
      statusReason = '';
    }
  }

  db.run(
    `UPDATE ayweb_cart_items SET quantity=?, customer_note=?, variant_snapshot=?, availability=?, status=?, status_reason=?, updated_at=? WHERE id=?`,
    quantity, customerNote, JSON.stringify(variantSnapshot ? canonicalVariant(variantSnapshot) : null), availability, status, statusReason, now, item.id,
  );
  refreshCartCounters(db, item.cartId);

  const updated = readAyWebsCartItem(db, item.id)!;
  emitAyWebsEvent(db, {
    event: 'AYWEB_CART_ITEM_UPDATED',
    resourceType: 'cart_item',
    resourceId: updated.id,
    accountId: input.accountId,
    payload: { quantity, variant: updated.variantSnapshot?.attributes || null, availability, status },
  });
  writeAyWebsAudit(db, {
    actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'cart_item.update',
    resourceType: 'cart_item', resourceId: updated.id, beforeState: item.status, afterState: updated.status,
    detail: { quantity, from: item.quantity }, requestId: input.requestId || null,
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
    if (!item.productId) continue;
    const stored = readAyWebsProduct(db, item.productId);
    if (!stored) {
      markItem(db, item.id, 'VARIANT_UNAVAILABLE', 'produit_source_introuvable');
      changes.push({ itemId: item.id, code: 'PRODUCT_NOT_FOUND', message: 'La fiche source n’est plus disponible.' });
      continue;
    }

    // Variante : comparaison au contrat source le plus récent, sans relecture réseau.
    const variantKey = ayWebsVariantKey(item.variantSnapshot?.attributes || null);
    if (variantKey) {
      const match = (stored.variants || []).find((variant) => ayWebsVariantKey(variant.attributes) === variantKey);
      if (!match) {
        markItem(db, item.id, 'VARIANT_UNAVAILABLE', `variante_absente:${variantKey}`);
        changes.push({
          itemId: item.id, code: 'VARIANT_UNAVAILABLE',
          message: 'La version choisie n’est plus publiée par le marchand. Choisissez-en une autre.',
          before: item.variantSnapshot?.attributes, after: null,
        });
        continue;
      }
      if (match.availability === 'OUT_OF_STOCK') {
        markItem(db, item.id, 'VARIANT_UNAVAILABLE', match.availabilityReason || 'merchant_variant_out_of_stock');
        changes.push({ itemId: item.id, code: 'VARIANT_UNAVAILABLE', message: 'La version choisie est épuisée chez le marchand.' });
        continue;
      }
    } else if (stored.availability.state === 'OUT_OF_STOCK') {
      markItem(db, item.id, 'OUT_OF_STOCK', stored.availability.reason || 'merchant_out_of_stock');
      changes.push({ itemId: item.id, code: 'OUT_OF_STOCK', message: 'Le marchand indique ce produit épuisé.' });
      continue;
    }

    // Prix : la dernière résolution fait foi. Une relecture réseau est optionnelle.
    const latestPrice = stored.price;
    const snapshotPrice = item.priceSnapshot?.price ?? item.unitPrice;
    if (input.recheckSource) {
      const store = findAyWebsStore(stored.storeId);
      if (store && deps.flags.storeCaptureEnabled(store)) {
        try {
          const resolved = await resolveAyWebsProduct(deps, {
            url: stored.sourceUrl,
            storeId: stored.storeId,
            selectedVariant: item.variantSnapshot?.attributes || null,
            quantity: item.quantity,
            sessionId: input.sessionId,
            accountId: input.accountId,
          });
          const refreshed = readAyWebsProduct(db, resolved.productId);
          if (refreshed) {
            applyRefreshedSource(db, item, refreshed);
            if (Math.abs(refreshed.price - snapshotPrice) > 0.001) {
              changes.push({
                itemId: item.id, code: 'PRICE_CHANGED',
                message: 'Le prix marchand a changé depuis votre ajout.',
                before: snapshotPrice, after: refreshed.price,
              });
            }
            continue;
          }
        } catch (error) {
          // Une source injoignable ne justifie ni un prix inventé ni un succès.
          logAyWebsOperation({
            operation: 'cart_verify_recheck',
            storeId: stored.storeId,
            productId: stored.productId,
            result: 'failure',
            errorCode: error instanceof AyWebsDomainError ? String(error.code) : 'CAPTURE_FAILED',
          });
        }
      }
    }

    if (Math.abs(latestPrice - snapshotPrice) > 0.001) {
      markItemPriceChanged(db, item, latestPrice, stored.currency);
      emitAyWebsEvent(db, {
        event: 'AYWEB_PRICE_CHANGED',
        resourceType: 'cart_item',
        resourceId: item.id,
        accountId: input.accountId,
        payload: { before: snapshotPrice, after: latestPrice, currency: stored.currency, storeId: stored.storeId },
      });
      changes.push({
        itemId: item.id, code: 'PRICE_CHANGED',
        message: 'Le prix marchand a changé depuis votre ajout.',
        before: snapshotPrice, after: latestPrice,
      });
    }
  }

  return { view: readAyWebsCartView(db, input.sessionId, input.accountId), changes };
}

function applyRefreshedSource(db: QatafoDatabase, item: AyWebsCartItem, stored: AyWebsStoredProduct): void {
  const snapshot = item.priceSnapshot;
  const changed = Math.abs(stored.price - (snapshot?.price ?? item.unitPrice)) > 0.001;
  const nextSnapshot: AyWebsPriceSnapshot = {
    price: snapshot?.price ?? item.unitPrice,
    currency: snapshot?.currency ?? item.currency,
    timestamp: snapshot?.timestamp ?? item.createdAt,
    sourceUrl: stored.sourceUrl,
    variant: item.variantSnapshot,
    availability: stored.availability.state,
    pricingVersion: stored.pricingVersion,
    evidenceHash: stored.evidenceHash,
  };
  db.run(
    `UPDATE ayweb_cart_items SET availability=?, price_snapshot=?, pricing_tnd=?, pricing_version=?, status=?, status_reason=?, updated_at=? WHERE id=?`,
    stored.availability.state, JSON.stringify(nextSnapshot), stored.pricingTnd, stored.pricingVersion,
    changed ? 'PRICE_CHANGED' : (item.status === 'PRICE_CHANGED' ? 'ACTIVE' : item.status),
    changed ? `prix_source_actuel:${stored.price}` : '', new Date().toISOString(), item.id,
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

  const now = new Date().toISOString();
  const acceptedSnapshot: AyWebsPriceSnapshot = {
    price: stored.price,
    currency: stored.currency,
    timestamp: now,
    sourceUrl: stored.sourceUrl,
    variant: item.variantSnapshot,
    availability: stored.availability.state,
    pricingVersion: stored.pricingVersion,
    evidenceHash: stored.evidenceHash,
  };
  db.run(
    `UPDATE ayweb_cart_items SET unit_price=?, currency=?, price_snapshot=?, pricing_tnd=?, pricing_version=?, evidence_hash=?,
       availability=?, status='ACTIVE', status_reason='prix_accepte_par_le_client', updated_at=? WHERE id=?`,
    stored.price, stored.currency, JSON.stringify(acceptedSnapshot), stored.pricingTnd, stored.pricingVersion,
    stored.evidenceHash, stored.availability.state, now, item.id,
  );
  const updated = readAyWebsCartItem(db, item.id)!;
  emitAyWebsEvent(db, {
    event: 'AYWEB_CART_ITEM_UPDATED',
    resourceType: 'cart_item',
    resourceId: item.id,
    accountId: input.accountId,
    payload: { priceAccepted: true, previousPrice: item.unitPrice, newPrice: stored.price },
  });
  writeAyWebsAudit(db, {
    actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'cart_item.accept_price',
    resourceType: 'cart_item', resourceId: item.id, beforeState: 'PRICE_CHANGED', afterState: 'ACTIVE',
    detail: { previousPrice: item.unitPrice, acceptedPrice: stored.price }, requestId: input.requestId || null,
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

function hydrateCartItem(row: any): AyWebsCartItem {
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
    unitPrice: Number(row.unit_price) || 0,
    currency: String(row.currency || ''),
    variantSnapshot,
    variantLabel: ayWebsVariantLabel(variantSnapshot),
    quantity,
    availability: String(row.availability || 'UNKNOWN') as AyWebsAvailabilityState,
    priceSnapshot,
    pricingTnd,
    pricingVersion: Number(row.pricing_version) || 0,
    lineTotalTnd: round2(pricingTnd * quantity),
    evidenceHash: String(row.evidence_hash || ''),
    status,
    statusReason: String(row.status_reason || ''),
    customerNote: String(row.customer_note || ''),
    purchaseMode: store ? purchaseModeFor(store) : 'NOT_IMPLEMENTED',
    checkoutReady: status === 'ACTIVE',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

export { ayWebsVariantLabel };
