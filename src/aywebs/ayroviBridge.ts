import type { QatafoDatabase } from '../db/database';
import type { AddToCartRequest } from '../types';
import { createAyrovixPriceToken } from '../ayrovix/priceQuote';
import { recordFunnelEvent, funnelVisitorKey } from '../analytics/funnel';
import { findAyWebsStore } from '../../shared/aywebsStores';
import { ensureAyWebsSchema } from './schema';
import { AyWebsDomainError } from './errors';
import { writeAyWebsAudit, emitAyWebsEvent } from './events';
import { listAyWebsCartItems, readAyWebsCart, type AyWebsCartItem } from './cart';

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
  duplicate: boolean;
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

  const existing = db.getItems(input.sessionId, input.accountId).find((candidate) =>
    candidate.store === (store?.id || item.storeId)
    && candidate.sourceUrl === item.sourceUrl
    && (candidate.externalId || '') === (item.sourceProductId || '')
    && (candidate.requestedSize || '') === requestedSize
    && (candidate.requestedColor || '') === requestedColor) || null;

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
  recordFunnelEvent(db, 'cart_item_added', { locale: null, visitorKey: funnelVisitorKey(input.sessionId) });

  return {
    aywebsItemId: item.id,
    aywebsItemNumber: item.itemNumber,
    cartItemId: String(cartItem.id),
    store: store?.displayName || item.storeName,
    title: item.title,
    quantity: item.quantity,
    priceTnd: item.pricingTnd,
    duplicate: Boolean(existing),
  };
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
