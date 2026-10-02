import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { nextSequenceNumber } from '../erp-core/sequences';
import { parsePublicHttpUrl, UnsafeUrlError } from '../services/safeUrl';
import { ayWebsSourceDomain, detectAyWebsStore, findAyWebsStore } from '../../shared/aywebsStores';
import type {
  AyWebsPurchaseRequestReason,
  AyWebsPurchaseRequestStatus,
  AyWebsStoreRequestStatus,
} from '../../shared/aywebsTypes';
import { ensureAyWebsSchema } from './schema';
import { ayWebsPurchaseRequestMachine } from './stateMachines';
import { AyWebsDomainError } from './errors';
import { emitAyWebsEvent, writeAyWebsAudit } from './events';
import { normalizeAttributes, normalizeQuantity, sanitizeNote } from './cart';

/**
 * AYWEBs — « Order with URL » (§23) et Store Requests (§38).
 *
 * Le modèle Add-to-Buyee ne s'arrête pas aux boutiques intégrées : quand
 * AYWEBs ne sait pas lire un marchand, le client ne doit PAS se retrouver
 * bloqué. Il décrit ce qu'il veut acheter (URL, quantité, variante libre,
 * exigences, notes) et la demande part en revue humaine avec des états et des
 * raisons explicites.
 *
 * Rien ici ne simule un achat : `SUBMITTED → UNDER_REVIEW → APPROVED →
 * ORDER_READY` ou `REJECTED` avec une raison obligatoire parmi la liste fermée.
 */

export interface AyWebsPurchaseRequest {
  id: string;
  requestNumber: string;
  accountId: string | null;
  sessionId: string;
  storeId: string;
  storeName: string;
  registeredStore: boolean;
  productUrl: string;
  sourceDomain: string;
  quantity: number;
  productName: string;
  variantAttributes: Record<string, string>;
  requirements: string;
  customerNotes: string;
  status: AyWebsPurchaseRequestStatus;
  reason: AyWebsPurchaseRequestReason | null;
  decisionNote: string;
  decidedAt: string | null;
  orderId: string | null;
  /** Ce que le client peut faire maintenant — jamais un état sans issue. */
  nextAction: 'WAIT_FOR_REVIEW' | 'PROVIDE_MORE_DETAILS' | 'VIEW_ORDER' | 'CONTACT_SUPPORT';
  createdAt: string;
  updatedAt: string;
}

export interface CreatePurchaseRequestInput {
  sessionId: string;
  accountId: string | null;
  customerId?: string | null;
  productUrl: string;
  quantity?: number;
  productName?: string;
  variantAttributes?: Record<string, string> | null;
  requirements?: string;
  customerNotes?: string;
  storeId?: string | null;
  requestId?: string | null;
}

const URL_MAX = 4096;

/** Valide le lien produit : HTTPS, public, non privé. Jamais de SSRF via un formulaire. */
export function assertAyWebsProductRequestUrl(rawUrl: unknown): URL {
  const value = String(rawUrl ?? '').trim();
  if (!value || value.length > URL_MAX) throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', {
    userMessage: 'Indiquez le lien exact du produit.',
    technicalMessage: 'product_url vide ou trop long',
  });
  let url: URL;
  try {
    url = parsePublicHttpUrl(value);
  } catch (error) {
    throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', {
      userMessage: 'Ce lien ne peut pas être traité.',
      technicalMessage: error instanceof UnsafeUrlError ? error.message : 'url_hors_allowlist_publique',
    });
  }
  if (url.protocol !== 'https:') {
    throw new AyWebsDomainError('HTTPS_REQUIRED', { technicalMessage: 'product_url doit être en HTTPS' });
  }
  return url;
}

export function createAyWebsPurchaseRequest(db: QatafoDatabase, input: CreatePurchaseRequestInput): AyWebsPurchaseRequest {
  ensureAyWebsSchema(db);
  const url = assertAyWebsProductRequestUrl(input.productUrl);
  const quantity = normalizeQuantity(input.quantity ?? 1);
  const detected = detectAyWebsStore(url.toString());
  const requested = input.storeId ? findAyWebsStore(input.storeId) : null;
  if (input.storeId && !requested) throw new AyWebsDomainError('STORE_UNKNOWN');
  if (requested && detected && requested.id !== detected.id) {
    throw new AyWebsDomainError('STORE_MISMATCH', {
      technicalMessage: `storeId=${requested.id} ≠ domaine ${detected.id}`,
    });
  }
  const storeId = (detected || requested)?.id || '';
  const productName = sanitizeNote(input.productName).slice(0, 300);
  const variantAttributes = normalizeAttributes(input.variantAttributes) || {};
  const requirements = sanitizeNote(input.requirements).slice(0, 1000);
  const customerNotes = sanitizeNote(input.customerNotes).slice(0, 2000);

  if (!productName && !Object.keys(variantAttributes).length && !requirements) {
    // Sans description ni variante, la revue humaine ne peut rien décider : on
    // refuse au lieu de créer une demande inutilement bloquée.
    throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', {
      userMessage: 'Précisez au moins le nom du produit, la version souhaitée ou vos exigences.',
      technicalMessage: 'product_name, variant_attributes et requirements tous vides',
    });
  }

  const now = new Date().toISOString();
  const id = `aywpr_${randomUUID()}`;
  const requestNumber = nextPurchaseRequestNumber(db);
  db.run(
    `INSERT INTO ayweb_purchase_requests (id,request_number,account_id,customer_id,session_id,store_id,product_url,quantity,
       product_name,variant_attributes,requirements,customer_notes,status,reason,decision_note,decided_by,decided_at,order_id,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, requestNumber, input.accountId, input.customerId || null, input.sessionId, storeId, url.toString().slice(0, URL_MAX), quantity,
    productName, JSON.stringify(variantAttributes), requirements, customerNotes, 'SUBMITTED', null, '', null, null, null, now, now,
  );

  writeAyWebsAudit(db, {
    actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'purchase_request.create',
    resourceType: 'purchase_request', resourceId: id, afterState: 'SUBMITTED',
    detail: { storeId, quantity, sourceDomain: ayWebsSourceDomain(url.toString()) }, requestId: input.requestId || null,
  });
  emitAyWebsEvent(db, {
    event: 'AYWEB_PURCHASE_REQUEST_SUBMITTED',
    resourceType: 'purchase_request', resourceId: id, accountId: input.accountId,
    payload: { requestNumber, storeId, quantity, registered: Boolean(detected) },
  });

  return readAyWebsPurchaseRequest(db, id)!;
}

function nextPurchaseRequestNumber(db: QatafoDatabase): string {
  try {
    return nextSequenceNumber(db, 'ayweb_purchase_request_number');
  } catch {
    return `AYWREQ-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}

export function readAyWebsPurchaseRequest(db: QatafoDatabase, id: string): AyWebsPurchaseRequest | null {
  ensureAyWebsSchema(db);
  const row = db.get<any>(`SELECT * FROM ayweb_purchase_requests WHERE id=? OR request_number=?`, id, id);
  return row ? hydratePurchaseRequest(row) : null;
}

export function listAyWebsPurchaseRequests(
  db: QatafoDatabase,
  input: { accountId?: string | null; sessionId?: string; status?: string; limit?: number } = {},
): AyWebsPurchaseRequest[] {
  ensureAyWebsSchema(db);
  const limit = Math.max(1, Math.min(200, Number(input.limit) || 25));
  if (input.status) {
    return db.all<any>(
      `SELECT * FROM ayweb_purchase_requests WHERE status=? ORDER BY created_at DESC LIMIT ?`,
      input.status, limit,
    ).map(hydratePurchaseRequest);
  }
  if (input.accountId) {
    return db.all<any>(
      `SELECT * FROM ayweb_purchase_requests WHERE account_id=? ORDER BY created_at DESC LIMIT ?`,
      input.accountId, limit,
    ).map(hydratePurchaseRequest);
  }
  return db.all<any>(
    `SELECT * FROM ayweb_purchase_requests WHERE session_id=? ORDER BY created_at DESC LIMIT ?`,
    input.sessionId || '', limit,
  ).map(hydratePurchaseRequest);
}

/** Décision Admin : transition validée par la machine à états, raison obligatoire au refus. */
export function decideAyWebsPurchaseRequest(
  db: QatafoDatabase,
  input: {
    id: string;
    to: AyWebsPurchaseRequestStatus;
    adminId: string;
    reason?: AyWebsPurchaseRequestReason | null;
    decisionNote?: string;
    orderId?: string | null;
    requestId?: string | null;
  },
): AyWebsPurchaseRequest {
  ensureAyWebsSchema(db);
  const current = readAyWebsPurchaseRequest(db, input.id);
  if (!current) throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', { technicalMessage: 'demande introuvable' });
  const transition = ayWebsPurchaseRequestMachine.assert(current.status, input.to);
  if (!transition.allowed) {
    throw new AyWebsDomainError('ORDER_STATE_INVALID', { technicalMessage: transition.reason });
  }
  if (input.to === 'REJECTED' && !input.reason) {
    throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', {
      userMessage: 'Un refus exige une raison.',
      technicalMessage: 'status=REJECTED sans reason (§23)',
    });
  }
  const now = new Date().toISOString();
  db.run(
    `UPDATE ayweb_purchase_requests SET status=?, reason=?, decision_note=?, decided_by=?, decided_at=?, order_id=?, updated_at=? WHERE id=?`,
    input.to, input.reason || null, sanitizeNote(input.decisionNote).slice(0, 2000), input.adminId, now,
    input.orderId || current.orderId, now, current.id,
  );
  writeAyWebsAudit(db, {
    actorType: 'admin', actorId: input.adminId, action: 'purchase_request.decide',
    resourceType: 'purchase_request', resourceId: current.id, beforeState: current.status, afterState: input.to,
    detail: { reason: input.reason || null, orderId: input.orderId || null }, requestId: input.requestId || null,
  });
  emitAyWebsEvent(db, {
    event: 'AYWEB_PURCHASE_REQUEST_DECIDED',
    resourceType: 'purchase_request', resourceId: current.id, accountId: current.accountId,
    payload: { status: input.to, reason: input.reason || null, requestNumber: current.requestNumber },
  });
  return readAyWebsPurchaseRequest(db, current.id)!;
}

function hydratePurchaseRequest(row: any): AyWebsPurchaseRequest {
  let variantAttributes: Record<string, string> = {};
  try {
    const parsed = JSON.parse(row.variant_attributes || '{}');
    if (parsed && typeof parsed === 'object') variantAttributes = parsed;
  } catch { variantAttributes = {}; }
  const store = findAyWebsStore(row.store_id);
  const status = String(row.status) as AyWebsPurchaseRequestStatus;
  return {
    id: String(row.id),
    requestNumber: String(row.request_number || ''),
    accountId: row.account_id ? String(row.account_id) : null,
    sessionId: String(row.session_id || ''),
    storeId: String(row.store_id || ''),
    storeName: store?.displayName || store?.name || ayWebsSourceDomain(String(row.product_url || '')) || 'Boutique non référencée',
    registeredStore: Boolean(store),
    productUrl: String(row.product_url || ''),
    sourceDomain: ayWebsSourceDomain(String(row.product_url || '')),
    quantity: Number(row.quantity) || 1,
    productName: String(row.product_name || ''),
    variantAttributes,
    requirements: String(row.requirements || ''),
    customerNotes: String(row.customer_notes || ''),
    status,
    reason: row.reason ? String(row.reason) as AyWebsPurchaseRequestReason : null,
    decisionNote: String(row.decision_note || ''),
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    orderId: row.order_id ? String(row.order_id) : null,
    nextAction: status === 'ORDER_READY' ? 'VIEW_ORDER'
      : status === 'REJECTED' ? 'CONTACT_SUPPORT'
      : status === 'APPROVED' ? 'WAIT_FOR_REVIEW'
      : 'WAIT_FOR_REVIEW',
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

/* ------------------------------------------------------------------ *
 * Store requests (§38) — « Can't find your store? »
 * ------------------------------------------------------------------ */

export interface AyWebsStoreRequest {
  id: string;
  accountId: string | null;
  storeUrl: string;
  storeName: string;
  sourceDomain: string;
  intent: string;
  notes: string;
  status: AyWebsStoreRequestStatus;
  decisionNote: string;
  decidedAt: string | null;
  promotedStoreId: string | null;
  createdAt: string;
}

export function createAyWebsStoreRequest(
  db: QatafoDatabase,
  input: { sessionId: string; accountId: string | null; storeUrl: string; storeName?: string; intent?: string; notes?: string; requestId?: string | null },
): AyWebsStoreRequest {
  ensureAyWebsSchema(db);
  const url = assertAyWebsProductRequestUrl(input.storeUrl);
  const storeName = sanitizeNote(input.storeName).slice(0, 200) || ayWebsSourceDomain(url.toString());
  const intent = sanitizeNote(input.intent).slice(0, 500);
  const notes = sanitizeNote(input.notes).slice(0, 2000);
  if (!intent && !notes) {
    throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', {
      userMessage: 'Dites-nous ce que vous souhaitez acheter dans cette boutique.',
      technicalMessage: 'store_request sans intent ni notes',
    });
  }
  const now = new Date().toISOString();
  const id = `aywsr_${randomUUID()}`;
  db.run(
    `INSERT INTO ayweb_store_requests (id,account_id,session_id,store_url,store_name,intent,notes,status,decision_note,decided_by,decided_at,promoted_store_id,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, input.accountId, input.sessionId, url.toString().slice(0, URL_MAX), storeName, intent, notes,
    'SUBMITTED', '', null, null, null, now, now,
  );
  writeAyWebsAudit(db, {
    actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'store_request.create',
    resourceType: 'store_request', resourceId: id, afterState: 'SUBMITTED',
    detail: { domain: ayWebsSourceDomain(url.toString()) }, requestId: input.requestId || null,
  });
  emitAyWebsEvent(db, {
    event: 'AYWEB_STORE_REQUEST_SUBMITTED',
    resourceType: 'store_request', resourceId: id, accountId: input.accountId,
    payload: { domain: ayWebsSourceDomain(url.toString()), storeName },
  });
  return readAyWebsStoreRequest(db, id)!;
}

export function readAyWebsStoreRequest(db: QatafoDatabase, id: string): AyWebsStoreRequest | null {
  ensureAyWebsSchema(db);
  const row = db.get<any>(`SELECT * FROM ayweb_store_requests WHERE id=?`, id);
  return row ? hydrateStoreRequest(row) : null;
}

export function listAyWebsStoreRequests(
  db: QatafoDatabase,
  input: { accountId?: string | null; status?: string; limit?: number } = {},
): AyWebsStoreRequest[] {
  ensureAyWebsSchema(db);
  const limit = Math.max(1, Math.min(200, Number(input.limit) || 25));
  if (input.status) {
    return db.all<any>(`SELECT * FROM ayweb_store_requests WHERE status=? ORDER BY created_at DESC LIMIT ?`, input.status, limit).map(hydrateStoreRequest);
  }
  if (input.accountId) {
    return db.all<any>(`SELECT * FROM ayweb_store_requests WHERE account_id=? ORDER BY created_at DESC LIMIT ?`, input.accountId, limit).map(hydrateStoreRequest);
  }
  return db.all<any>(`SELECT * FROM ayweb_store_requests ORDER BY created_at DESC LIMIT ?`, limit).map(hydrateStoreRequest);
}

const STORE_REQUEST_FLOW: Record<AyWebsStoreRequestStatus, AyWebsStoreRequestStatus[]> = {
  SUBMITTED: ['UNDER_REVIEW', 'REJECTED'],
  UNDER_REVIEW: ['APPROVED', 'REJECTED'],
  APPROVED: ['PROMOTED', 'REJECTED'],
  REJECTED: [],
  PROMOTED: [],
};

/**
 * Décision Admin sur une demande de boutique. `PROMOTED` exige un storeId du
 * registre : on ne promeut pas une boutique qui n'existe pas dans les données.
 */
export function decideAyWebsStoreRequest(
  db: QatafoDatabase,
  input: { id: string; to: AyWebsStoreRequestStatus; adminId: string; decisionNote?: string; promotedStoreId?: string | null; requestId?: string | null },
): AyWebsStoreRequest {
  ensureAyWebsSchema(db);
  const current = readAyWebsStoreRequest(db, input.id);
  if (!current) throw new AyWebsDomainError('PURCHASE_REQUEST_INVALID', { technicalMessage: 'demande de boutique introuvable' });
  if (current.status === input.to) return current;
  if (!(STORE_REQUEST_FLOW[current.status] || []).includes(input.to)) {
    throw new AyWebsDomainError('ORDER_STATE_INVALID', {
      technicalMessage: `transition refusée : ${current.status} → ${input.to}`,
    });
  }
  if (input.to === 'PROMOTED') {
    const store = findAyWebsStore(input.promotedStoreId);
    if (!store) {
      throw new AyWebsDomainError('STORE_UNKNOWN', {
        userMessage: 'La boutique promue doit exister dans le registre AyWebs.',
        technicalMessage: `promotedStoreId=${String(input.promotedStoreId)} absent du Store Registry`,
      });
    }
  }
  const now = new Date().toISOString();
  db.run(
    `UPDATE ayweb_store_requests SET status=?, decision_note=?, decided_by=?, decided_at=?, promoted_store_id=?, updated_at=? WHERE id=?`,
    input.to, sanitizeNote(input.decisionNote).slice(0, 2000), input.adminId, now,
    input.to === 'PROMOTED' ? String(input.promotedStoreId) : null, now, current.id,
  );
  writeAyWebsAudit(db, {
    actorType: 'admin', actorId: input.adminId, action: 'store_request.decide',
    resourceType: 'store_request', resourceId: current.id, beforeState: current.status, afterState: input.to,
    detail: { promotedStoreId: input.promotedStoreId || null }, requestId: input.requestId || null,
  });
  return readAyWebsStoreRequest(db, current.id)!;
}

function hydrateStoreRequest(row: any): AyWebsStoreRequest {
  return {
    id: String(row.id),
    accountId: row.account_id ? String(row.account_id) : null,
    storeUrl: String(row.store_url || ''),
    storeName: String(row.store_name || ''),
    sourceDomain: ayWebsSourceDomain(String(row.store_url || '')),
    intent: String(row.intent || ''),
    notes: String(row.notes || ''),
    status: String(row.status) as AyWebsStoreRequestStatus,
    decisionNote: String(row.decision_note || ''),
    decidedAt: row.decided_at ? String(row.decided_at) : null,
    promotedStoreId: row.promoted_store_id ? String(row.promoted_store_id) : null,
    createdAt: String(row.created_at),
  };
}
