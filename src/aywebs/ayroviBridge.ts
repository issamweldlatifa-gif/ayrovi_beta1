import type { QatafoDatabase } from '../db/database';
import type { AddToCartRequest } from '../types';
import { createAyrovixPriceToken } from '../ayrovix/priceQuote';
import { recordFunnelEvent, funnelVisitorKey } from '../analytics/funnel';
import { findAyWebsStore } from '../../shared/aywebsStores';
import { ensureAyWebsSchema } from './schema';
import { AyWebsDomainError } from './errors';
import { writeAyWebsAudit, emitAyWebsEvent } from './events';
import { listAyWebsCartItems, readAyWebsCart, readAyWebsCartItem, type AyWebsCartItem } from './cart';

/**
 * AYWEBs → AYROVI : le pont (§2, §16).
 *
 * Le panier AYWEBs est AYROVI-propriétaire et distinct du panier marchand (§4),
 * mais AYROVI dispose déjà d'un panier, d'un checkout, d'un OMS et d'un système
 * de paiement éprouvés. Ce module est le SEUL chemin qui fait passer une ligne
 * AYWEBs dans le panier AYROVI existant — sans dupliquer ce panier et sans
 * court-circuiter ses gardes :
 *
 *  • le prix est signé avec le jeton de devis existant (`createAyrovixPriceToken`)
 *    car il provient d'une capture serveur vérifiée, exactement comme Lens ;
 *  • la porte de variante existante (`inspectVariantOrder`, appelée par
 *    `POST /api/cart/items`) continue de s'appliquer : AYWEBs n'affaiblit
 *    aucune garantie du panier AYROVI ;
 *  • l'identité SOURCE (boutique, URL, identifiant marchand) est conservée, et
 *    l'identité AYWEBs (AYWITEM-…) est portée dans la note de ligne pour que la
 *    revue opérationnelle retrouve la trace (§53).
 */

export interface AyWebsBridgeLine {
  aywebsItemId: string;
  aywebsItemNumber: string;
  cartItemId: string;
  store: string;
  title: string;
  quantity: number;
  priceTnd: number;
  /** Une ligne AYROVI portant la MÊME identité existait déjà. */
  duplicate: boolean;
  /**
   * `true` = la ligne existante a été SYNCHRONISÉE (quantité remise à celle du
   * panier AYWEBs). Jamais une seconde addition : transférer deux fois ne doit
   * pas doubler la quantité (défaut corrigé le 04/10/2026).
   */
  synced: boolean;
}

export interface AyWebsBridgeResult {
  moved: AyWebsBridgeLine[];
  skipped: Array<{ aywebsItemId: string; code: string; message: string }>;
  totalItemsCount: number;
  totalTnd: number;
  deliveryTnd: number;
  message: string;
}

export interface BridgeAyWebsCartInput {
  sessionId: string;
  accountId: string | null;
  /** Ne transférer que certaines lignes (défaut : toutes les lignes prêtes). */
  itemIds?: string[];
  requestId?: string | null;
}

/** Transfère les lignes AYWEBs prêtes dans le panier AYROVI existant. */
export function bridgeAyWebsCartToAyrovi(db: QatafoDatabase, input: BridgeAyWebsCartInput): AyWebsBridgeResult {
  ensureAyWebsSchema(db);
  const cart = readAyWebsCart(db, input.sessionId, input.accountId);
  if (!cart) throw new AyWebsDomainError('CART_EMPTY');

  const items = listAyWebsCartItems(db, cart.id);
  const selected = input.itemIds?.length
    ? items.filter((item) => input.itemIds!.includes(item.id))
    : items;
  if (!selected.length) throw new AyWebsDomainError('CART_EMPTY');

  const moved: AyWebsBridgeLine[] = [];
  const skipped: AyWebsBridgeResult['skipped'] = [];

  for (const item of selected) {
    // Une ligne bloquée (prix changé, variante disparue, épuisée) ne traverse
    // jamais le pont : le client doit d'abord trancher (§29, §30).
    if (!item.checkoutReady) {
      skipped.push({
        aywebsItemId: item.id,
        code: item.status === 'PRICE_CHANGED' ? 'PRICE_CHANGED'
          : item.status === 'VARIANT_UNAVAILABLE' ? 'VARIANT_UNAVAILABLE'
          : item.status === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK'
          : 'CUSTOMER_ACTION_REQUIRED',
        message: `« ${item.title} » doit être corrigé dans le panier AyWebs avant d’être transféré.`,
      });
      continue;
    }
    if (!(item.pricingTnd > 0)) {
      skipped.push({ aywebsItemId: item.id, code: 'PRICE_UNAVAILABLE', message: `Devis AYROVI indisponible pour « ${item.title} ».` });
      continue;
    }

    try {
      const line = addAyWebsItemToAyroviCart(db, item, input);
      moved.push(line);
    } catch (error) {
      skipped.push({
        aywebsItemId: item.id,
        code: error instanceof AyWebsDomainError ? String(error.code) : 'CART_ADD_FAILED',
        message: error instanceof Error ? error.message : 'L’ajout au panier AYROVI a échoué.',
      });
    }
  }

  if (!moved.length) {
    throw new AyWebsDomainError('CART_LOCKED', {
      userMessage: 'Aucun article transférable : corrigez les lignes signalées dans le panier AyWebs.',
      technicalMessage: `0/${selected.length} lignes transférables (${skipped.map((line) => line.code).join(',')})`,
    });
  }

  const summary = summarizeAyroviCart(db, input.sessionId, input.accountId);
  writeAyWebsAudit(db, {
    actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'cart.bridge_to_ayrovi',
    resourceType: 'cart', resourceId: cart.id, detail: { moved: moved.length, skipped: skipped.length },
    requestId: input.requestId || null,
  });

  return {
    moved,
    skipped,
    ...summary,
    message: skipped.length
      ? `${moved.length} article(s) transféré(s) dans le panier AYROVI ; ${skipped.length} ligne(s) retenue(s).`
      : `${moved.length} article(s) transféré(s) dans le panier AYROVI.`,
  };
}

function addAyWebsItemToAyroviCart(db: QatafoDatabase, item: AyWebsCartItem, input: BridgeAyWebsCartInput): AyWebsBridgeLine {
  const store = findAyWebsStore(item.storeId);
  const attributes = (item.variantSnapshot?.attributes || {}) as Record<string, string>;
  const requestedColor = String(attributes.color || '').slice(0, 100);
  const requestedSize = String(attributes.size || '').slice(0, 100);
  const variantLabel = item.variantLabel;
  // La note conserve la traçabilité AYWEBs : identité de ligne, preuve et disponibilité.
  const note = [
    item.customerNote,
    `AyWebs ${item.itemNumber || item.id}`,
    variantLabel && !requestedSize && !requestedColor ? `Version : ${variantLabel}` : '',
    item.availability === 'UNKNOWN' ? 'Stock marchand non publié' : '',
  ].filter(Boolean).join(' · ').slice(0, 1000);

  const priceToken = createAyrovixPriceToken({
    price: item.unitPrice,
    currency: item.currency,
    title: item.title,
    referenceUrl: '',
    status: 'VERIFIED',
  });
  if (!priceToken) {
    throw new AyWebsDomainError('PRICE_UNAVAILABLE', {
      technicalMessage: 'jeton de devis AYROVIX non signé (devise ou prix hors contrat)',
    });
  }

  const existing = findAyroviCartLine(db, input.sessionId, input.accountId, item);
  if (existing) {
    // ── Idempotence du pont (04/10/2026) ──────────────────────────────────────
    // Avant : chaque appel de `/cart/bridge-to-ayrovi` repassait par `db.addItem`,
    // qui INCRÉMENTE la quantité d'une ligne identique → appuyer deux fois sur
    // « Proceed to order page » doublait l'article. Désormais la ligne existante
    // est REMISE au niveau du panier AYWEBs (synchronisation), jamais additionnée.
    if (Number(existing.quantity) !== Number(item.quantity)) {
      db.updateQuantity(existing.id, item.quantity, input.sessionId, input.accountId);
    }
    const syncedItem = db.getItemById(existing.id, input.sessionId, input.accountId) || existing;
    rememberAyWebsCartLink(db, item.id, String(syncedItem.id), input);
    return {
      aywebsItemId: item.id,
      aywebsItemNumber: item.itemNumber,
      cartItemId: String(syncedItem.id),
      store: store?.displayName || item.storeName,
      title: item.title,
      quantity: Number(syncedItem.quantity) || item.quantity,
      priceTnd: Number(syncedItem.priceTND) || item.pricingTnd,
      duplicate: true,
      synced: true,
    };
  }

  const payload: AddToCartRequest = {
    store: store?.id || item.storeId,
    externalId: item.sourceProductId || null,
    url: item.sourceUrl,
    title: item.title,
    imageUrl: item.images[0] || '',
    sourcePrice: item.unitPrice,
    sourceCurrency: item.currency,
    // Le montant AYROVI est recalculé par la route du panier : on ne lui impose rien.
    priceTND: item.pricingTnd,
    variant: variantLabel || null,
    requestedSize,
    requestedColor,
    customerNote: note,
    referenceUrl: '',
    priceVerificationStatus: 'VERIFIED',
    quantity: item.quantity,
    priceToken,
  } as AddToCartRequest;

  const cartItem = db.addItem(input.sessionId, payload, input.accountId);
  rememberAyWebsCartLink(db, item.id, String(cartItem.id), input);
  recordFunnelEvent(db, 'cart_item_added', { locale: null, visitorKey: funnelVisitorKey(input.sessionId) });

  return {
    aywebsItemId: item.id,
    aywebsItemNumber: item.itemNumber,
    cartItemId: String(cartItem.id),
    store: store?.displayName || item.storeName,
    title: item.title,
    quantity: item.quantity,
    priceTnd: item.pricingTnd,
    duplicate: false,
    synced: false,
  };
}

/**
 * Clé d'identité d'une ligne AYWEBs dans le panier AYROVI.
 *
 * La note de ligne porte l'identité AYWEBs (`AyWebs AYWITEM-…`) : elle sert la
 * revue opérationnelle, PAS la correspondance — sinon la moindre retouche de
 * note créerait un doublon. L'identité est : boutique + URL source + identifiant
 * marchand + taille + couleur demandées (et le titre en dernier recours quand le
 * marchand ne publie aucun identifiant).
 */
export function findAyroviCartLine(
  db: QatafoDatabase,
  sessionId: string,
  accountId: string | null,
  item: AyWebsCartItem,
): ReturnType<QatafoDatabase['getItems']>[number] | null {
  const mapped = db.get<{ ayrovi_cart_item_id: string }>(
    `SELECT ayrovi_cart_item_id FROM ayweb_cart_ayrovi_links WHERE aywebs_item_id=?`, item.id,
  );
  if (mapped?.ayrovi_cart_item_id) {
    const linkedLine = db.getItemById(String(mapped.ayrovi_cart_item_id), sessionId, accountId);
    if (linkedLine) return linkedLine;
    // The AYROVI line was independently removed; discard only the stale mapping.
    db.run(`DELETE FROM ayweb_cart_ayrovi_links WHERE aywebs_item_id=?`, item.id);
  }

  const store = findAyWebsStore(item.storeId);
  const attributes = (item.variantSnapshot?.attributes || {}) as Record<string, string>;
  const requestedColor = String(attributes.color || '').slice(0, 100);
  const requestedSize = String(attributes.size || '').slice(0, 100);
  const storeId = store?.id || item.storeId;
  const externalId = item.sourceProductId || '';
  return db.getItems(sessionId, accountId).find((candidate) =>
    candidate.store.toUpperCase() === String(storeId).toUpperCase()
    && candidate.sourceUrl === item.sourceUrl
    && (candidate.externalId || '') === externalId
    && (candidate.requestedSize || '') === requestedSize
    && (candidate.requestedColor || '') === requestedColor
    // `variant` is the complete human label AYWEBs builds from every published
    // attribute (format/model/capacity included), not only color + size.
    && (candidate.variant || '') === (item.variantLabel || '')
    && (externalId ? true : candidate.title === item.title)) || null;
}

/** Resolve an AYROVI cart row back to its AYWEBs source using the durable link. */
export function findAyWebsItemForAyroviCartLine(
  db: QatafoDatabase,
  cartItemId: string,
  sessionId: string,
  accountId: string | null,
): AyWebsCartItem | null {
  ensureAyWebsSchema(db);
  const mapped = db.get<{ aywebs_item_id: string }>(
    `SELECT aywebs_item_id FROM ayweb_cart_ayrovi_links WHERE ayrovi_cart_item_id=?`, cartItemId,
  );
  if (mapped?.aywebs_item_id) {
    const item = readAyWebsCartItem(db, String(mapped.aywebs_item_id));
    if (item) return item;
  }

  // Backward compatibility for AYROVI rows created before durable links existed.
  const cart = readAyWebsCart(db, sessionId, accountId);
  if (!cart) return null;
  return listAyWebsCartItems(db, cart.id).find((item) =>
    findAyroviCartLine(db, sessionId, accountId, item)?.id === cartItemId,
  ) || null;
}

function rememberAyWebsCartLink(
  db: QatafoDatabase,
  aywebsItemId: string,
  ayroviCartItemId: string,
  input: { sessionId: string; accountId: string | null },
): void {
  const now = new Date().toISOString();
  db.run(
    `DELETE FROM ayweb_cart_ayrovi_links WHERE ayrovi_cart_item_id=? AND aywebs_item_id<>?`,
    ayroviCartItemId, aywebsItemId,
  );
  db.run(
    `INSERT INTO ayweb_cart_ayrovi_links (aywebs_item_id,ayrovi_cart_item_id,session_id,account_id,created_at,updated_at)
     VALUES (?,?,?,?,?,?)
     ON CONFLICT(aywebs_item_id) DO UPDATE SET ayrovi_cart_item_id=excluded.ayrovi_cart_item_id,
       session_id=excluded.session_id, account_id=excluded.account_id, updated_at=excluded.updated_at`,
    aywebsItemId, ayroviCartItemId, input.sessionId, input.accountId, now, now,
  );
}

/**
 * Synchronise UNE ligne AYWEBs vers le panier AYROVI après une action client
 * (ajout confirmé, changement de quantité, retrait). C'est le SEUL point de
 * liaison toléré par le §2 : le panier AYWEBs reste la source, le panier AYROVI
 * n'est jamais deviné ni dupliqué.
 */
export function syncAyWebsItemToAyroviCart(
  db: QatafoDatabase,
  input: { sessionId: string; accountId: string | null; aywebsItemId: string; requestId?: string | null },
): { linked: boolean; removed: boolean; cartItemId: string | null; quantity: number | null; reason: string } {
  ensureAyWebsSchema(db);
  const item = readAyWebsCartItem(db, input.aywebsItemId);
  if (!item) return { linked: false, removed: false, cartItemId: null, quantity: null, reason: 'AYWEBS_ITEM_NOT_FOUND' };
  const existing = findAyroviCartLine(db, input.sessionId, input.accountId, item);
  if (!existing) return { linked: false, removed: false, cartItemId: null, quantity: null, reason: 'NOT_BRIDGED' };

  if (item.status === 'REMOVED') {
    db.removeItem(existing.id, input.sessionId, input.accountId);
    writeAyWebsAudit(db, {
      actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'cart.ayrovi_unlink',
      resourceType: 'cart_item', resourceId: item.id, beforeState: String(existing.quantity), afterState: 'REMOVED',
      detail: { cartItemId: existing.id }, requestId: input.requestId || null,
    });
    return { linked: false, removed: true, cartItemId: String(existing.id), quantity: 0, reason: 'AYWEBS_ITEM_REMOVED' };
  }

  const target = Math.max(1, Math.min(99, Number(item.quantity) || 1));
  if (Number(existing.quantity) !== target) {
    db.updateQuantity(existing.id, target, input.sessionId, input.accountId);
  }
  return { linked: true, removed: false, cartItemId: String(existing.id), quantity: target, reason: 'SYNCED' };
}

function summarizeAyroviCart(db: QatafoDatabase, sessionId: string, accountId: string | null) {
  const items = db.getItems(sessionId, accountId);
  const totalTnd = items.reduce((sum, item) => sum + (Number(item.priceTND) || 0) * (Number(item.quantity) || 1), 0);
  return {
    totalItemsCount: items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0),
    totalTnd: Math.round(totalTnd * 100) / 100,
    deliveryTnd: 0,
  };
}

/**
 * Signale au domaine AYWEBs qu'une commande AYROVI issue du pont a été payée :
 * la ligne AYWEBs reste traçable sans dupliquer l'OMS (§2 : non-destructif).
 */
export function linkAyWebsOrderToAyroviOrder(
  db: QatafoDatabase,
  input: { aywebOrderId: string; ayroviOrderId: string; ayroviOrderNumber?: string; detail?: Record<string, unknown> },
): void {
  ensureAyWebsSchema(db);
  db.run(
    `INSERT INTO ayweb_order_links (id,ayweb_order_id,link_type,external_id,external_number,detail,created_at)
     VALUES (?,?,?,?,?,?,?)`,
    `aywlnk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    input.aywebOrderId, 'AYROVI_ORDER', input.ayroviOrderId, String(input.ayroviOrderNumber || ''),
    JSON.stringify(input.detail || {}).slice(0, 4000), new Date().toISOString(),
  );
  emitAyWebsEvent(db, {
    event: 'AYWEB_ORDER_SUBMITTED',
    resourceType: 'order',
    resourceId: input.aywebOrderId,
    orderId: input.aywebOrderId,
    payload: { bridgedToAyroviOrder: input.ayroviOrderId, orderNumber: input.ayroviOrderNumber || '' },
  });
}

export function listAyWebsOrderLinks(db: QatafoDatabase, aywebOrderId: string): Array<Record<string, unknown>> {
  ensureAyWebsSchema(db);
  return db.all<any>(`SELECT * FROM ayweb_order_links WHERE ayweb_order_id=? ORDER BY created_at DESC`, aywebOrderId)
    .map((row) => ({
      id: String(row.id),
      linkType: String(row.link_type),
      externalId: String(row.external_id),
      externalNumber: String(row.external_number || ''),
      createdAt: String(row.created_at),
    }));
}

/**
 * Panier UNIFIÉ (04/10/2026) : pour chaque ligne AYWEBs, dit si elle est déjà
 * présente dans le panier AYROVI (synchronisation à l'ajout). Le client somme
 * alors `panier AYROVI + unités non liées` SANS jamais doubler les lignes
 * synchronisées — c'est la fin du « deux paniers, deux compteurs ».
 */
export function ayWebsCartLinkedMap(
  db: QatafoDatabase,
  sessionId: string,
  accountId: string | null,
  items: AyWebsCartItem[],
): { byId: Record<string, boolean>; unlinkedUnits: number } {
  const byId: Record<string, boolean> = {};
  let unlinkedUnits = 0;
  for (const item of items) {
    const linked = item.status !== 'REMOVED' && Boolean(findAyroviCartLine(db, sessionId, accountId, item));
    byId[item.id] = linked;
    if (!linked) unlinkedUnits += item.quantity;
  }
  return { byId, unlinkedUnits };
}
