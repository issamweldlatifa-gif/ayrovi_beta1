import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { nextSequenceNumber } from '../erp-core/sequences';
import { cardGatewayAvailable, initiateKonnectCardPayment, verifyKonnectCardPayment } from '../services/paymentGateway';
import { resolveAcceptedPaymentMethods, type SelectablePaymentMethodCode } from '../db/database';
import type {
  AyWebsExceptionState,
  AyWebsMasterStage,
  AyWebsOrderStatus,
  AyWebsPurchaseStatus,
} from '../../shared/aywebsTypes';
import { ensureAyWebsSchema } from './schema';
import {
  ayWebsCustomerTimeline,
  ayWebsOrderMachine,
  ayWebsPurchaseFailureRequiresReason,
  ayWebsPurchaseMachine,
} from './stateMachines';
import { AyWebsDomainError } from './errors';
import { emitAyWebsEvent, logAyWebsOperation, writeAyWebsAudit } from './events';
import {
  lockAyWebsCartForCheckout,
  listAyWebsCartItems,
  readAyWebsCart,
  releaseAyWebsCart,
  type AyWebsCartItem,
} from './cart';
import { computeAyWebsCheckoutPreview, type AyWebsCheckoutPreview } from './checkoutFees';

/**
 * AYWEBs — Order creation (§21) & Purchase engine (§22).
 *
 * Le parcours d'une commande est piloté par la machine à états, jamais par un
 * écran : `DRAFT → CHECKOUT → PAYMENT_PENDING → PAID → PURCHASE_PENDING`.
 *
 * Paiement (§20) : AYWEBs n'installe AUCUN écosystème de paiement parallèle.
 * Les moyens viennent de la configuration commerciale AYROVI existante
 * (`resolveAcceptedPaymentMethods`) et la passerelle carte est celle déjà en
 * place (`services/paymentGateway.ts` → Konnect). La table `ayweb_payments`
 * n'est que la relation commande ↔ paiement, avec la référence passerelle.
 *
 * Honnêteté (§48) : aucune intégration d'achat marchand automatisé n'existe
 * encore. Après paiement, la commande passe en `PURCHASE_PENDING` et chaque
 * ligne en `PENDING_INTEGRATION` avec revue humaine — jamais un « purchased »
 * simulé.
 */

export interface AyWebsOrderItem {
  id: string;
  orderId: string;
  cartItemId: string | null;
  productId: string | null;
  storeId: string;
  storeName: string;
  sourceUrl: string;
  sourceProductId: string | null;
  title: string;
  images: string[];
  unitPrice: number;
  currency: string;
  quantity: number;
  variantSnapshot: Record<string, unknown> | null;
  variantLabel: string;
  priceSnapshot: Record<string, unknown> | null;
  evidenceHash: string;
  lineTotalTnd: number;
  purchaseStatus: AyWebsPurchaseStatus;
  purchaseReason: string;
  warehouseState: string;
}

export interface AyWebsOrder {
  id: string;
  orderNumber: string;
  cartId: string | null;
  accountId: string | null;
  status: AyWebsOrderStatus;
  masterStage: AyWebsMasterStage;
  exceptionState: AyWebsExceptionState | null;
  exceptionReason: string;
  currency: string;
  totals: {
    productSubtotalTnd: number;
    serviceFeeTnd: number;
    importFeeTnd: number;
    shippingEstimateTnd: number;
    otherFeeTnd: number;
    payableTnd: number;
  };
  fees: Array<{ kind: string; code: string; label: string; amountTnd: number; detail: Record<string, unknown> }>;
  pricingVersion: number;
  paymentStatus: string;
  paymentMethod: string;
  paymentReference: string;
  paidAt: string | null;
  submittedAt: string | null;
  notes: string;
  shippingAddress: Record<string, unknown>;
  items: AyWebsOrderItem[];
  timeline: Array<{ key: string; state: 'done' | 'current' | 'pending' }>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAyWebsOrderInput {
  sessionId: string;
  accountId: string | null;
  customerId?: string | null;
  notes?: string;
  requestId?: string | null;
  express?: boolean;
  includeLocalDelivery?: boolean;
  /** Adresse de livraison saisie au checkout (§21) — conservée telle quelle. */
  shippingAddress?: { name: string; phone: string; city: string; line: string } | null;
}

const round2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

const parseJsonObject = (raw: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(raw || '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

/* ------------------------------------------------------------------ *
 * Création
 * ------------------------------------------------------------------ */

/**
 * Crée la commande depuis le panier AYWEBs. Le devis est RECALCULÉ ici :
 * un montant fourni par le client n'est jamais accepté (§45).
 */
export function createAyWebsOrder(db: QatafoDatabase, input: CreateAyWebsOrderInput): {
  order: AyWebsOrder;
  preview: AyWebsCheckoutPreview;
} {
  ensureAyWebsSchema(db);
  const cart = readAyWebsCart(db, input.sessionId, input.accountId);
  if (!cart) throw new AyWebsDomainError('CART_EMPTY');

  const items = listAyWebsCartItems(db, cart.id);
  if (!items.length) throw new AyWebsDomainError('CART_EMPTY');

  const preview = computeAyWebsCheckoutPreview(db, items, {
    express: Boolean(input.express),
    includeLocalDelivery: input.includeLocalDelivery !== false,
  });
  if (preview.blockers.length) {
    throw new AyWebsDomainError(preview.blockers[0].code === 'PRICE_CHANGED' ? 'PRICE_CHANGED'
      : preview.blockers[0].code === 'VARIANT_UNAVAILABLE' ? 'VARIANT_UNAVAILABLE'
      : preview.blockers[0].code === 'OUT_OF_STOCK' ? 'OUT_OF_STOCK'
      : 'ORDER_STATE_INVALID', {
      userMessage: preview.blockers[0].message,
      technicalMessage: `checkout bloqué : ${preview.blockers.map((blocker) => `${blocker.itemId}:${blocker.code}`).join(', ')}`,
      requiredAction: preview.blockers[0].action as any,
    });
  }

  return db.transaction(() => {
    const lockedCart = lockAyWebsCartForCheckout(db, input.sessionId, input.accountId);
    const now = new Date().toISOString();
    const orderId = `ayword_${randomUUID()}`;
    const orderNumber = nextAyWebsOrderNumber(db);

    db.run(
      `INSERT INTO ayweb_orders (id,order_number,cart_id,account_id,customer_id,status,master_stage,exception_state,exception_reason,
         currency,product_subtotal_tnd,service_fee_tnd,import_fee_tnd,shipping_estimate_tnd,other_fee_tnd,payable_tnd,
         fees_snapshot,pricing_version,payment_reference,payment_status,paid_at,submitted_at,notes,shipping_address,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      orderId, orderNumber, lockedCart.id, input.accountId, input.customerId || null, 'DRAFT', 'CHECKOUT', null, '',
      'TND', preview.totals.productSubtotalTnd, preview.totals.serviceFeeTnd, preview.totals.importFeeTnd,
      preview.totals.shippingEstimateTnd, preview.totals.otherFeeTnd, preview.totals.payableTnd,
      JSON.stringify(preview.fees), preview.pricingVersion, '', 'PENDING', null, null,
      sanitizeNotes(input.notes), JSON.stringify(input.shippingAddress || {}), now, now,
    );

    for (const [index, line] of preview.lines.entries()) {
      const source = items[index];
      db.run(
        `INSERT INTO ayweb_order_items (id,order_id,cart_item_id,product_id,store_id,source_url,source_product_id,title,images,
           unit_price,currency,quantity,variant_snapshot,price_snapshot,evidence_hash,line_total_tnd,purchase_status,purchase_reason,
           warehouse_state,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        `aywoi_${randomUUID()}`, orderId, line.itemId, source?.productId || null, line.storeId, source?.sourceUrl || '',
        source?.sourceProductId || '', line.title, JSON.stringify((source?.images || []).slice(0, 10)),
        line.sourceUnitPrice, line.sourceCurrency, line.quantity,
        JSON.stringify(source?.variantSnapshot ?? null), JSON.stringify(source?.priceSnapshot ?? null),
        source?.evidenceHash || '', line.lineTotalTnd, 'PURCHASE_PENDING', '', 'WAITING_SUPPLIER', now, now,
      );
    }

    for (const fee of preview.fees) {
      db.run(
        `INSERT INTO ayweb_checkout_fees (id,order_id,kind,label,amount_tnd,currency,source,computed_at,detail)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        `aywfee_${randomUUID()}`, orderId, fee.kind, fee.labelFr, fee.amountTnd, 'TND', 'ayrovi_pricing_engine',
        preview.computedAt, JSON.stringify({ code: fee.code, labelAr: fee.labelAr, uncertain: fee.uncertain, ...fee.detail }),
      );
    }

    writeAyWebsAudit(db, {
      actorType: 'customer', actorId: input.accountId || input.sessionId, action: 'order.create',
      resourceType: 'order', resourceId: orderId, afterState: 'DRAFT',
      detail: { orderNumber, payableTnd: preview.totals.payableTnd, lines: preview.lines.length },
      requestId: input.requestId || null,
    });
    emitAyWebsEvent(db, {
      event: 'AYWEB_ORDER_CREATED',
      resourceType: 'order',
      resourceId: orderId,
      accountId: input.accountId,
      orderId,
      orderNumber,
      payload: { payableTnd: preview.totals.payableTnd, lines: preview.lines.length, pricingVersion: preview.pricingVersion },
    });

    const order = readAyWebsOrder(db, orderId, input.accountId)!;
    return { order, preview };
  });
}

function nextAyWebsOrderNumber(db: QatafoDatabase): string {
  try {
    return nextSequenceNumber(db, 'ayweb_order_number');
  } catch {
    return `AYW-${Date.now().toString(36).toUpperCase()}`;
  }
}

function sanitizeNotes(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}

/* ------------------------------------------------------------------ *
 * Transitions
 * ------------------------------------------------------------------ */

/** Transition contrôlée : tout saut d'état est refusé (§54). */
export function transitionAyWebsOrder(
  db: QatafoDatabase,
  input: {
    orderId: string;
    to: AyWebsOrderStatus;
    actorType?: 'customer' | 'admin' | 'system' | 'adapter';
    actorId?: string | null;
    reason?: string;
    exception?: AyWebsExceptionState | null;
    requestId?: string | null;
    patch?: Record<string, unknown>;
  },
): AyWebsOrder {
  ensureAyWebsSchema(db);
  const row = db.get<any>(`SELECT * FROM ayweb_orders WHERE id=?`, input.orderId);
  if (!row) throw new AyWebsDomainError('ORDER_NOT_FOUND');
  const from = String(row.status) as AyWebsOrderStatus;
  const transition = ayWebsOrderMachine.assert(from, input.to);
  if (!transition.allowed) {
    throw new AyWebsDomainError('ORDER_STATE_INVALID', {
      userMessage: `Cette action n’est pas possible à ce stade (${from}).`,
      technicalMessage: transition.reason,
    });
  }

  const now = new Date().toISOString();
  const stage = masterStageFor(input.to);
  db.run(
    `UPDATE ayweb_orders SET status=?, master_stage=?, exception_state=?, exception_reason=?, updated_at=? WHERE id=?`,
    input.to, stage, input.exception ?? null, String(input.reason || '').slice(0, 500), now, input.orderId,
  );

  if (input.patch && Object.keys(input.patch).length) applyOrderPatch(db, input.orderId, input.patch);

  writeAyWebsAudit(db, {
    actorType: input.actorType || 'system', actorId: input.actorId || '', action: 'order.transition',
    resourceType: 'order', resourceId: input.orderId, beforeState: from, afterState: input.to,
    detail: { reason: input.reason || '', exception: input.exception || null }, requestId: input.requestId || null,
  });

  return readAyWebsOrderById(db, input.orderId)!;
}

function applyOrderPatch(db: QatafoDatabase, orderId: string, patch: Record<string, unknown>): void {
  const allowed: Record<string, string> = {
    paymentStatus: 'payment_status',
    paymentReference: 'payment_reference',
    paidAt: 'paid_at',
    submittedAt: 'submitted_at',
    notes: 'notes',
  };
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    const column = allowed[key];
    if (!column) continue;
    sets.push(`${column}=?`);
    values.push(value == null ? null : String(value).slice(0, 2000));
  }
  if (!sets.length) return;
  db.run(`UPDATE ayweb_orders SET ${sets.join(', ')} WHERE id=?`, ...values, orderId);
}

/** Chaque statut métier correspond à une étape du parcours maître (§54). */
export function masterStageFor(status: AyWebsOrderStatus): AyWebsMasterStage {
  const direct: Partial<Record<AyWebsOrderStatus, AyWebsMasterStage>> = {
    DRAFT: 'DISCOVERY',
    CHECKOUT: 'CHECKOUT',
    PAYMENT_PENDING: 'PAYMENT_PENDING',
    PAID: 'PAID',
    PURCHASE_PENDING: 'PURCHASE_PENDING',
    PURCHASING: 'PURCHASING',
    PURCHASED: 'PURCHASED',
    SUPPLIER_SHIPPED: 'SUPPLIER_SHIPPED',
    WAREHOUSE_RECEIVED: 'WAREHOUSE_RECEIVED',
    CONSOLIDATION: 'CONSOLIDATION',
    PACKED: 'PACKED',
    SHIPPING_PAYMENT: 'SHIPPING_PAYMENT',
    DISPATCHED: 'DISPATCHED',
    IN_TRANSIT: 'IN_TRANSIT',
    DELIVERED: 'DELIVERED',
  };
  // CANCELLED n'est pas une étape du parcours nominal : on conserve la dernière
  // étape atteinte via `master_stage` déjà persisté, d'où le repli CHECKOUT.
  return direct[status] || 'CHECKOUT';
}

/** Soumission client : DRAFT/CHECKOUT → PAYMENT_PENDING (§21). */
export function submitAyWebsOrder(
  db: QatafoDatabase,
  input: { orderId: string; accountId: string | null; requestId?: string | null },
): AyWebsOrder {
  const order = requireOwnedOrder(db, input.orderId, input.accountId);
  if (!['DRAFT', 'CHECKOUT'].includes(order.status)) {
    throw new AyWebsDomainError('ORDER_STATE_INVALID', {
      userMessage: 'Cette commande a déjà été soumise.',
      technicalMessage: `status=${order.status}`,
    });
  }
  const now = new Date().toISOString();
  if (order.status === 'DRAFT') transitionAyWebsOrder(db, { orderId: order.id, to: 'CHECKOUT', actorType: 'customer', actorId: input.accountId, requestId: input.requestId });
  const updated = transitionAyWebsOrder(db, {
    orderId: order.id, to: 'PAYMENT_PENDING', actorType: 'customer', actorId: input.accountId,
    requestId: input.requestId, patch: { submittedAt: now },
  });
  emitAyWebsEvent(db, {
    event: 'AYWEB_ORDER_SUBMITTED',
    resourceType: 'order',
    resourceId: order.id,
    accountId: input.accountId,
    orderId: order.id,
    orderNumber: order.orderNumber,
    payload: { payableTnd: updated.totals.payableTnd },
  });
  return updated;
}

/* ------------------------------------------------------------------ *
 * Paiement (§20) — passerelle AYROVI existante, aucun écosystème parallèle
 * ------------------------------------------------------------------ */

export interface AyWebsPaymentIntent {
  paymentId: string;
  paymentNumber: string;
  orderId: string;
  orderNumber: string;
  method: string;
  status: string;
  amountTnd: number;
  /** URL de paiement passerelle (carte) — vide pour un virement. */
  payUrl: string;
  provider: string;
  providerReference: string;
  /** Coordonnées publiées par l'Admin pour un virement/mandat. */
  transferInstructions: { available: boolean; label: string; details: string };
  /** Ce que le client doit faire ensuite, sans ambiguïté. */
  nextAction: 'REDIRECT_TO_GATEWAY' | 'UPLOAD_TRANSFER_PROOF' | 'WAIT_FOR_VERIFICATION' | 'NONE';
  createdAt: string;
}

export function acceptedAyWebsPaymentMethods(db: QatafoDatabase): SelectablePaymentMethodCode[] {
  const setting = db.get<any>(`SELECT setting_value FROM settings WHERE setting_key='payment_methods'`);
  return resolveAcceptedPaymentMethods(setting?.setting_value);
}

/**
 * `POST /payments/intents` : démarre le paiement d'une commande AYWEBs avec la
 * configuration et la passerelle AYROVI existantes.
 *
 * Si la passerelle carte n'est pas configurée, la réponse le dit explicitement
 * (`CARD_GATEWAY_UNAVAILABLE`) — aucun débit simulé, aucun statut « payé »
 * inventé (§48).
 */
export async function createAyWebsPaymentIntent(
  db: QatafoDatabase,
  input: { orderId: string; accountId: string | null; method: string; requestId?: string | null },
): Promise<AyWebsPaymentIntent> {
  ensureAyWebsSchema(db);
  const order = requireOwnedOrder(db, input.orderId, input.accountId);
  const method = String(input.method || '').trim().toUpperCase() as SelectablePaymentMethodCode;
  const accepted = acceptedAyWebsPaymentMethods(db);

  if (!accepted.includes(method)) {
    throw new AyWebsDomainError('PAYMENT_FAILED', {
      userMessage: 'Ce moyen de paiement n’est pas disponible.',
      technicalMessage: `method=${method} hors configuration commerciale (${accepted.join(',')})`,
      requiredAction: 'CHOOSE_PAYMENT',
    });
  }
  if (!(order.totals.payableTnd > 0)) {
    throw new AyWebsDomainError('ORDER_STATE_INVALID', {
      userMessage: 'Le montant de cette commande n’est pas payable en l’état.',
      technicalMessage: `payable_tnd=${order.totals.payableTnd}`,
    });
  }
  if (!['CHECKOUT', 'PAYMENT_PENDING'].includes(order.status)) {
    throw new AyWebsDomainError('ORDER_STATE_INVALID', {
      userMessage: 'Cette commande n’attend plus de paiement.',
      technicalMessage: `status=${order.status}`,
    });
  }

  // Un paiement déjà PAID ne se relance pas ; un PENDING existant est réutilisé.
  const existing = db.get<any>(
    `SELECT * FROM ayweb_payments WHERE order_id=? AND status IN ('PENDING','PENDING_VERIFICATION') ORDER BY created_at DESC LIMIT 1`,
    order.id,
  );
  if (existing && String(existing.method) === method) {
    return toIntent(db, order, existing);
  }
  if (existing) {
    db.run(`UPDATE ayweb_payments SET status='CANCELLED', failure_reason='moyen_de_paiement_change', updated_at=? WHERE id=?`,
      new Date().toISOString(), existing.id);
  }

  const now = new Date().toISOString();
  const paymentId = `aywpay_${randomUUID()}`;
  const paymentNumber = nextPaymentNumber(db);
  db.run(
    `INSERT INTO ayweb_payments (id,payment_number,order_id,account_id,method,status,amount_tnd,currency,provider,provider_reference,
       pay_url,initiated_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    paymentId, paymentNumber, order.id, input.accountId, method, 'PENDING', order.totals.payableTnd, 'TND',
    method === 'CARD' ? 'KONNECT' : 'AYROVI_MANUAL', '', '', now, now, now,
  );

  if (order.status === 'CHECKOUT') {
    transitionAyWebsOrder(db, {
      orderId: order.id, to: 'PAYMENT_PENDING', actorType: 'customer', actorId: input.accountId,
      requestId: input.requestId, patch: { submittedAt: order.submittedAt || now },
    });
  }
  db.run(`UPDATE ayweb_orders SET payment_reference=?, updated_at=? WHERE id=?`, paymentNumber, now, order.id);

  const record = db.get<any>(`SELECT * FROM ayweb_payments WHERE id=?`, paymentId)!;

  if (method === 'CARD') {
    if (!cardGatewayAvailable()) {
      db.run(`UPDATE ayweb_payments SET status='FAILED', failure_reason='CARD_GATEWAY_UNAVAILABLE', updated_at=? WHERE id=?`, now, paymentId);
      throw new AyWebsDomainError('PAYMENT_FAILED', {
        userMessage: 'La passerelle carte n’est pas configurée. Aucun débit n’a été tenté.',
        technicalMessage: 'cardGatewayAvailable()=false : Konnect non configuré sur cet environnement',
        requiredAction: 'CHOOSE_PAYMENT',
      });
    }
    try {
      const account = input.accountId
        ? db.get<any>(`SELECT display_name,email,phone FROM customer_accounts WHERE id=?`, input.accountId)
        : null;
      const names = String(account?.display_name || 'Client AYROVI').trim().split(/\s+/);
      const gateway = await initiateKonnectCardPayment({
        orderId: order.id,
        orderNumber: order.orderNumber,
        transactionNumber: paymentNumber,
        amountTnd: order.totals.payableTnd,
        firstName: names.shift() || 'Client',
        lastName: names.join(' ') || 'AYROVI',
        phone: String(account?.phone || ''),
        email: String(account?.email || ''),
      });
      db.run(`UPDATE ayweb_payments SET provider_reference=?, pay_url=?, updated_at=? WHERE id=?`,
        gateway.paymentRef, gateway.payUrl, new Date().toISOString(), paymentId);
      writeAyWebsAudit(db, {
        actorType: 'customer', actorId: input.accountId, action: 'payment.initiate',
        resourceType: 'payment', resourceId: paymentId, afterState: 'PENDING',
        detail: { method, provider: 'KONNECT', amountTnd: order.totals.payableTnd }, requestId: input.requestId || null,
      });
      logAyWebsOperation({ operation: 'payment_intent', orderId: order.id, customerId: input.accountId, result: 'success' });
    } catch (error) {
      db.run(`UPDATE ayweb_payments SET status='FAILED', failure_reason=?, updated_at=? WHERE id=?`,
        String(error instanceof Error ? error.message : error).slice(0, 300), new Date().toISOString(), paymentId);
      logAyWebsOperation({ operation: 'payment_intent', orderId: order.id, result: 'failure', errorCode: 'PAYMENT_FAILED' });
      throw new AyWebsDomainError('PAYMENT_FAILED', {
        userMessage: 'La passerelle carte n’a pas pu démarrer le paiement. Aucun succès n’a été enregistré.',
        technicalMessage: error instanceof Error ? error.message : String(error),
        requiredAction: 'CHOOSE_PAYMENT',
      });
    }
  } else if (method === 'BANK_TRANSFER' || method === 'POSTE') {
    const coordinateKey = method === 'POSTE' ? 'poste_account' : 'bank_rib';
    const details = String(db.get<any>(`SELECT setting_value FROM settings WHERE setting_key=?`, coordinateKey)?.setting_value || '').trim();
    db.run(`UPDATE ayweb_payments SET status='PENDING', updated_at=? WHERE id=?`, new Date().toISOString(), paymentId);
    if (!details) {
      throw new AyWebsDomainError('PAYMENT_FAILED', {
        userMessage: 'Les coordonnées officielles de ce moyen de paiement ne sont pas publiées.',
        technicalMessage: `settings.${coordinateKey} vide`,
        requiredAction: 'CHOOSE_PAYMENT',
      });
    }
  }

  return toIntent(db, readAyWebsOrderById(db, order.id)!, db.get<any>(`SELECT * FROM ayweb_payments WHERE id=?`, paymentId)!);
}

function toIntent(db: QatafoDatabase, order: AyWebsOrder, payment: any): AyWebsPaymentIntent {
  const method = String(payment.method);
  const coordinateKey = method === 'POSTE' ? 'poste_account' : 'bank_rib';
  const details = ['BANK_TRANSFER', 'POSTE'].includes(method)
    ? String(db.get<any>(`SELECT setting_value FROM settings WHERE setting_key=?`, coordinateKey)?.setting_value || '').trim()
    : '';
  return {
    paymentId: String(payment.id),
    paymentNumber: String(payment.payment_number || ''),
    orderId: order.id,
    orderNumber: order.orderNumber,
    method,
    status: String(payment.status),
    amountTnd: Number(payment.amount_tnd) || 0,
    payUrl: String(payment.pay_url || ''),
    provider: String(payment.provider || ''),
    providerReference: String(payment.provider_reference || ''),
    transferInstructions: {
      available: Boolean(details),
      label: method === 'POSTE' ? 'Mandat postal' : 'Virement bancaire',
      details,
    },
    nextAction: method === 'CARD' && payment.pay_url ? 'REDIRECT_TO_GATEWAY'
      : ['BANK_TRANSFER', 'POSTE'].includes(method) ? 'UPLOAD_TRANSFER_PROOF'
      : 'WAIT_FOR_VERIFICATION',
    createdAt: String(payment.created_at),
  };
}

function nextPaymentNumber(db: QatafoDatabase): string {
  try {
    return nextSequenceNumber(db, 'ayweb_payment_number');
  } catch {
    return `AYWPAY-${randomUUID().slice(0, 8).toUpperCase()}`;
  }
}

/**
 * `POST /payments/confirm` : confirme auprès de la passerelle, puis fait passer
 * la commande en PAID → PURCHASE_PENDING. La confirmation vient TOUJOURS du
 * provider : le client ne peut pas déclarer un paiement réussi (§45, §48).
 */
export async function confirmAyWebsPayment(
  db: QatafoDatabase,
  input: { orderId: string; accountId: string | null; paymentId?: string | null; requestId?: string | null },
): Promise<{ order: AyWebsOrder; payment: Record<string, unknown> }> {
  ensureAyWebsSchema(db);
  const order = requireOwnedOrder(db, input.orderId, input.accountId);
  const payment = db.get<any>(
    input.paymentId
      ? `SELECT * FROM ayweb_payments WHERE id=? AND order_id=?`
      : `SELECT * FROM ayweb_payments WHERE order_id=? AND status IN ('PENDING','PENDING_VERIFICATION') ORDER BY created_at DESC LIMIT 1`,
    ...(input.paymentId ? [input.paymentId, order.id] : [order.id]),
  );
  if (!payment) throw new AyWebsDomainError('PAYMENT_FAILED', { technicalMessage: 'aucune transaction en attente pour cette commande' });
  if (String(payment.status) === 'PAID') {
    return { order, payment: sanitizePayment(payment) };
  }

  const method = String(payment.method);
  if (method === 'CARD') {
    if (!cardGatewayAvailable()) {
      throw new AyWebsDomainError('PAYMENT_FAILED', {
        userMessage: 'La vérification bancaire est temporairement indisponible.',
        technicalMessage: 'cardGatewayAvailable()=false',
      });
    }
    if (!payment.provider_reference) {
      throw new AyWebsDomainError('PAYMENT_FAILED', {
        userMessage: 'La passerelle n’a pas encore fourni de référence.',
        technicalMessage: 'provider_reference vide : paiement non démarré',
        requiredAction: 'CHOOSE_PAYMENT',
      });
    }
    const verification = await verifyKonnectCardPayment({
      paymentRef: String(payment.provider_reference),
      expectedAmountTnd: Number(payment.amount_tnd),
      expectedOrderNumber: order.orderNumber,
      expectedTransactionNumber: String(payment.payment_number),
    });
    const now = new Date().toISOString();
    if (verification.state === 'PAID') {
      db.run(
        `UPDATE ayweb_payments SET status='PAID', confirmed_at=?, verified_payload=?, failure_reason='', updated_at=? WHERE id=?`,
        now, JSON.stringify(verification.auditPayload || {}).slice(0, 4000), now, payment.id,
      );
      return { order: markOrderPaid(db, order, payment, now, input), payment: sanitizePayment(db.get<any>(`SELECT * FROM ayweb_payments WHERE id=?`, payment.id)) };
    }
    if (verification.state === 'FAILED') {
      db.run(`UPDATE ayweb_payments SET status='FAILED', failure_reason='passerelle_carte_refus_ou_expiration', updated_at=? WHERE id=?`, now, payment.id);
      transitionAyWebsOrder(db, {
        orderId: order.id, to: order.status, actorType: 'system', actorId: null,
        exception: 'PAYMENT_FAILED', reason: 'passerelle_carte_refus_ou_expiration', requestId: input.requestId || null,
      });
      throw new AyWebsDomainError('PAYMENT_FAILED', {
        userMessage: 'Le paiement carte a été refusé ou a expiré.',
        technicalMessage: 'verifyKonnectCardPayment → FAILED',
        requiredAction: 'CHOOSE_PAYMENT',
      });
    }
    return { order, payment: sanitizePayment(payment) };
  }

  if (method === 'BANK_TRANSFER' || method === 'POSTE') {
    // Le justificatif est revu par l'Admin : aucun « payé » auto-déclaré.
    if (String(payment.status) !== 'PENDING_VERIFICATION') {
      throw new AyWebsDomainError('PAYMENT_FAILED', {
        userMessage: 'Déposez d’abord le justificatif de virement pour cette commande.',
        technicalMessage: `payment.status=${payment.status} : aucune preuve déposée`,
        requiredAction: 'CHOOSE_PAYMENT',
      });
    }
    return { order, payment: sanitizePayment(payment) };
  }

  throw new AyWebsDomainError('PAYMENT_FAILED', {
    userMessage: 'Ce moyen de paiement nécessite un traitement par l’équipe AYROVI.',
    technicalMessage: `method=${method} sans confirmation automatique disponible`,
    requiredAction: 'WAIT_FOR_REVIEW',
  });
}

function markOrderPaid(db: QatafoDatabase, order: AyWebsOrder, payment: any, now: string, input: { accountId: string | null; requestId?: string | null }): AyWebsOrder {
  const updated = transitionAyWebsOrder(db, {
    orderId: order.id, to: 'PAID', actorType: 'system', actorId: input.accountId,
    requestId: input.requestId || null,
    patch: { paymentStatus: 'PAID', paidAt: now, paymentReference: String(payment.payment_number || '') },
  });
  // Après paiement, l'achat part en procurement. Sans intégration marchand
  // automatisée, les lignes sont en PENDING_INTEGRATION : revue humaine (§48).
  const purchaseReady = transitionAyWebsOrder(db, {
    orderId: order.id, to: 'PURCHASE_PENDING', actorType: 'system', actorId: null, requestId: input.requestId || null,
  });
  setOrderItemsPurchaseStatus(db, order.id, 'PENDING_INTEGRATION',
    'aucune_intégration_achat_marchand_automatisée:revue_humaine_requise');
  releaseAyWebsCart(db, order.cartId || '', 'ORDERED');
  emitAyWebsEvent(db, {
    event: 'AYWEB_PAYMENT_CONFIRMED',
    resourceType: 'order', resourceId: order.id, accountId: input.accountId, orderId: order.id, orderNumber: order.orderNumber,
    payload: { amountTnd: Number(payment.amount_tnd), method: String(payment.method), provider: String(payment.provider || '') },
  });
  return purchaseReady;
}

/** Dépôt d'un justificatif de virement : statut PENDING_VERIFICATION, revue Admin. */
export function recordAyWebsTransferProof(
  db: QatafoDatabase,
  input: {
    orderId: string; accountId: string | null; transferReference: string;
    proofPath: string; originalName: string; requestId?: string | null;
  },
): { payment: Record<string, unknown> } {
  const order = requireOwnedOrder(db, input.orderId, input.accountId);
  const payment = db.get<any>(
    `SELECT * FROM ayweb_payments WHERE order_id=? AND method IN ('BANK_TRANSFER','POSTE') AND status IN ('PENDING','FAILED') ORDER BY created_at DESC LIMIT 1`,
    order.id,
  );
  if (!payment) {
    throw new AyWebsDomainError('PAYMENT_FAILED', {
      userMessage: 'Démarrez d’abord un paiement par virement ou mandat postal.',
      technicalMessage: 'aucune transaction BANK_TRANSFER/POSTE en attente',
      requiredAction: 'CHOOSE_PAYMENT',
    });
  }
  const now = new Date().toISOString();
  db.run(
    `UPDATE ayweb_payments SET status='PENDING_VERIFICATION', transfer_reference=?, proof_path=?, proof_original_name=?, updated_at=? WHERE id=?`,
    String(input.transferReference).slice(0, 120), input.proofPath, String(input.originalName).slice(0, 200), now, payment.id,
  );
  db.run(`UPDATE ayweb_orders SET payment_status='PENDING_VERIFICATION', updated_at=? WHERE id=?`, now, order.id);
  writeAyWebsAudit(db, {
    actorType: 'customer', actorId: input.accountId, action: 'payment.proof_submitted',
    resourceType: 'payment', resourceId: payment.id, beforeState: String(payment.status), afterState: 'PENDING_VERIFICATION',
    detail: { transferReference: input.transferReference }, requestId: input.requestId || null,
  });
  return { payment: sanitizePayment(db.get<any>(`SELECT * FROM ayweb_payments WHERE id=?`, payment.id)) };
}

/** Validation Admin d'un justificatif : même chemin que la confirmation passerelle. */
export function approveAyWebsTransferPayment(
  db: QatafoDatabase,
  input: { orderId: string; adminId: string; requestId?: string | null },
): AyWebsOrder {
  ensureAyWebsSchema(db);
  const order = readAyWebsOrderById(db, input.orderId);
  if (!order) throw new AyWebsDomainError('ORDER_NOT_FOUND');
  const payment = db.get<any>(`SELECT * FROM ayweb_payments WHERE order_id=? AND status='PENDING_VERIFICATION' ORDER BY created_at DESC LIMIT 1`, order.id);
  if (!payment) throw new AyWebsDomainError('PAYMENT_FAILED', { technicalMessage: 'aucun justificatif en attente de revue' });
  const now = new Date().toISOString();
  db.run(`UPDATE ayweb_payments SET status='PAID', confirmed_at=?, confirmed_by=?, updated_at=? WHERE id=?`, now, input.adminId, now, payment.id);
  writeAyWebsAudit(db, {
    actorType: 'admin', actorId: input.adminId, action: 'payment.approve',
    resourceType: 'payment', resourceId: payment.id, beforeState: 'PENDING_VERIFICATION', afterState: 'PAID',
    requestId: input.requestId || null,
  });
  return markOrderPaid(db, order, payment, now, { accountId: order.accountId, requestId: input.requestId || null });
}

function sanitizePayment(payment: any): Record<string, unknown> {
  return {
    id: String(payment.id),
    payment_number: String(payment.payment_number || ''),
    method: String(payment.method),
    status: String(payment.status),
    amount_tnd: Number(payment.amount_tnd) || 0,
    currency: String(payment.currency || 'TND'),
    provider: String(payment.provider || ''),
    pay_url: String(payment.pay_url || ''),
    transfer_reference: String(payment.transfer_reference || ''),
    failure_reason: String(payment.failure_reason || ''),
    initiated_at: payment.initiated_at ? String(payment.initiated_at) : null,
    confirmed_at: payment.confirmed_at ? String(payment.confirmed_at) : null,
  };
}

/* ------------------------------------------------------------------ *
 * Purchase engine (§22) — aucun échec silencieux
 * ------------------------------------------------------------------ */

export function setOrderItemsPurchaseStatus(
  db: QatafoDatabase,
  orderId: string,
  status: AyWebsPurchaseStatus,
  reason: string,
  options: { orderItemId?: string | null; actorId?: string | null; requestId?: string | null } = {},
): void {
  ensureAyWebsSchema(db);
  if (ayWebsPurchaseFailureRequiresReason(status) && !String(reason || '').trim()) {
    throw new AyWebsDomainError('PURCHASE_FAILED', {
      technicalMessage: `statut d'échec ${status} sans raison : interdit (§22)`,
    });
  }
  const now = new Date().toISOString();
  const items = db.all<any>(
    options.orderItemId
      ? `SELECT * FROM ayweb_order_items WHERE id=? AND order_id=?`
      : `SELECT * FROM ayweb_order_items WHERE order_id=?`,
    ...(options.orderItemId ? [options.orderItemId, orderId] : [orderId]),
  );
  for (const item of items) {
    const from = String(item.purchase_status) as AyWebsPurchaseStatus;
    if (from === status) continue;
    const transition = ayWebsPurchaseMachine.assert(from, status);
    if (!transition.allowed) {
      // On ne force jamais une transition d'achat : l'incohérence est journalisée.
      writeAyWebsAudit(db, {
        actorType: 'system', actorId: options.actorId || '', action: 'purchase.transition_refused',
        resourceType: 'order_item', resourceId: String(item.id), beforeState: from, afterState: status,
        detail: { reason: transition.reason }, requestId: options.requestId || null,
      });
      continue;
    }
    db.run(`UPDATE ayweb_order_items SET purchase_status=?, purchase_reason=?, updated_at=? WHERE id=?`,
      status, String(reason || '').slice(0, 500), now, item.id);
    db.run(
      `INSERT INTO ayweb_purchase_attempts (id,order_item_id,adapter,attempt_number,status,reason,source_price,source_currency,evidence_hash,started_at,finished_at,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      `aywat_${randomUUID()}`, String(item.id), String(item.store_id || ''), 1, status, String(reason || '').slice(0, 500),
      Number(item.unit_price) || 0, String(item.currency || ''), String(item.evidence_hash || ''), now, now, now,
    );
  }
}

/**
 * Démarrage de l'achat après paiement. Sans intégration marchand automatisée,
 * l'état réel est `PENDING_INTEGRATION` + revue humaine : c'est ce que voit
 * l'Admin, et le client voit « achat en cours de préparation ».
 */
export function startAyWebsPurchase(
  db: QatafoDatabase,
  input: { orderId: string; actorType?: 'admin' | 'system'; actorId?: string | null; requestId?: string | null },
): AyWebsOrder {
  const order = readAyWebsOrderById(db, input.orderId);
  if (!order) throw new AyWebsDomainError('ORDER_NOT_FOUND');
  if (order.status !== 'PURCHASE_PENDING') {
    throw new AyWebsDomainError('ORDER_STATE_INVALID', { technicalMessage: `status=${order.status}` });
  }
  const purchaseStatus: AyWebsPurchaseStatus = 'PENDING_INTEGRATION';
  setOrderItemsPurchaseStatus(db, order.id, purchaseStatus,
    'aucune_intégration_achat_marchand_automatisée:revue_humaine_requise', { actorId: input.actorId, requestId: input.requestId });
  emitAyWebsEvent(db, {
    event: 'AYWEB_PURCHASE_STARTED',
    resourceType: 'order', resourceId: order.id, accountId: order.accountId, orderId: order.id, orderNumber: order.orderNumber,
    payload: { purchaseStatus, reason: 'pending_integration' },
  });
  return transitionAyWebsOrder(db, {
    orderId: order.id, to: 'PURCHASING', actorType: input.actorType || 'system', actorId: input.actorId,
    exception: 'PENDING_INTEGRATION', reason: 'revue_humaine_requise', requestId: input.requestId || null,
  });
}

/** Enregistre un échec d'achat avec sa raison obligatoire (§22). */
export function failAyWebsPurchase(
  db: QatafoDatabase,
  input: {
    orderId: string;
    reason: string;
    status?: AyWebsPurchaseStatus;
    exception?: AyWebsExceptionState;
    orderItemId?: string | null;
    actorType?: 'admin' | 'system' | 'adapter';
    actorId?: string | null;
    requestId?: string | null;
  },
): AyWebsOrder {
  const order = readAyWebsOrderById(db, input.orderId);
  if (!order) throw new AyWebsDomainError('ORDER_NOT_FOUND');
  const status = input.status || 'PURCHASE_FAILED';
  if (!String(input.reason || '').trim()) {
    throw new AyWebsDomainError('PURCHASE_FAILED', { technicalMessage: 'raison obligatoire pour tout échec d’achat' });
  }
  setOrderItemsPurchaseStatus(db, order.id, status, input.reason, {
    orderItemId: input.orderItemId || null, actorId: input.actorId, requestId: input.requestId,
  });
  emitAyWebsEvent(db, {
    event: status === 'PRICE_CHANGED' ? 'AYWEB_PRICE_CHANGED'
      : status === 'VARIANT_UNAVAILABLE' ? 'AYWEB_VARIANT_UNAVAILABLE'
      : 'AYWEB_PURCHASE_FAILED',
    resourceType: 'order', resourceId: order.id, accountId: order.accountId, orderId: order.id, orderNumber: order.orderNumber,
    payload: { status, reason: input.reason },
  });
  writeAyWebsAudit(db, {
    actorType: input.actorType || 'system', actorId: input.actorId || '', action: 'purchase.failed',
    resourceType: 'order', resourceId: order.id, beforeState: order.status, afterState: order.status,
    detail: { status, reason: input.reason }, requestId: input.requestId || null,
  });
  return transitionAyWebsOrder(db, {
    orderId: order.id, to: order.status, actorType: input.actorType || 'system', actorId: input.actorId,
    exception: input.exception || 'PURCHASE_FAILED', reason: input.reason, requestId: input.requestId || null,
  });
}

/** Confirmation d'achat (après exécution réelle ou revue humaine validée). */
export function confirmAyWebsPurchase(
  db: QatafoDatabase,
  input: { orderId: string; actorType?: 'admin' | 'system'; actorId?: string | null; note?: string; requestId?: string | null },
): AyWebsOrder {
  const order = readAyWebsOrderById(db, input.orderId);
  if (!order) throw new AyWebsDomainError('ORDER_NOT_FOUND');
  if (!['PURCHASE_PENDING', 'PURCHASING'].includes(order.status)) {
    throw new AyWebsDomainError('ORDER_STATE_INVALID', { technicalMessage: `status=${order.status}` });
  }
  setOrderItemsPurchaseStatus(db, order.id, 'PURCHASED', input.note || 'achat_confirmé_par_opérateur', {
    actorId: input.actorId, requestId: input.requestId,
  });
  const updated = transitionAyWebsOrder(db, {
    orderId: order.id, to: 'PURCHASED', actorType: input.actorType || 'admin', actorId: input.actorId,
    reason: input.note || '', requestId: input.requestId || null,
  });
  emitAyWebsEvent(db, {
    event: 'AYWEB_PURCHASE_CONFIRMED',
    resourceType: 'order', resourceId: order.id, accountId: order.accountId, orderId: order.id, orderNumber: order.orderNumber,
    payload: { note: input.note || '' },
  });
  return updated;
}

/* ------------------------------------------------------------------ *
 * Lectures
 * ------------------------------------------------------------------ */

export function requireOwnedOrder(db: QatafoDatabase, orderId: string, accountId: string | null): AyWebsOrder {
  const order = readAyWebsOrderById(db, orderId);
  if (!order) throw new AyWebsDomainError('ORDER_NOT_FOUND');
  if (accountId && order.accountId && order.accountId !== accountId) {
    throw new AyWebsDomainError('ORDER_NOT_FOUND', { technicalMessage: 'commande hors périmètre du compte courant' });
  }
  if (!accountId && !order.accountId) return order;
  if (!accountId && order.accountId) {
    throw new AyWebsDomainError('AUTH_REQUIRED', { technicalMessage: 'commande rattachée à un compte : authentification requise' });
  }
  return order;
}

export function readAyWebsOrderById(db: QatafoDatabase, orderId: string): AyWebsOrder | null {
  ensureAyWebsSchema(db);
  const row = db.get<any>(`SELECT * FROM ayweb_orders WHERE id=?`, orderId);
  return row ? hydrateOrder(db, row) : null;
}

export function readAyWebsOrder(db: QatafoDatabase, orderId: string, accountId: string | null): AyWebsOrder | null {
  const order = readAyWebsOrderById(db, orderId);
  if (!order) return null;
  if (accountId && order.accountId && order.accountId !== accountId) return null;
  return order;
}

export function readAyWebsOrderByNumber(db: QatafoDatabase, orderNumber: string, accountId: string | null): AyWebsOrder | null {
  ensureAyWebsSchema(db);
  const row = db.get<any>(`SELECT * FROM ayweb_orders WHERE order_number=?`, orderNumber);
  if (!row) return null;
  const order = hydrateOrder(db, row);
  if (accountId && order.accountId && order.accountId !== accountId) return null;
  return order;
}

export function listAyWebsOrders(db: QatafoDatabase, input: { accountId: string | null; sessionId?: string; limit?: number }): AyWebsOrder[] {
  ensureAyWebsSchema(db);
  const limit = Math.max(1, Math.min(100, Number(input.limit) || 25));
  const rows = input.accountId
    ? db.all<any>(`SELECT * FROM ayweb_orders WHERE account_id=? ORDER BY created_at DESC LIMIT ?`, input.accountId, limit)
    : db.all<any>(
        `SELECT o.* FROM ayweb_orders o JOIN ayweb_carts c ON c.id=o.cart_id
         WHERE o.account_id IS NULL AND c.session_id=? ORDER BY o.created_at DESC LIMIT ?`,
        input.sessionId || '', limit,
      );
  return rows.map((row) => hydrateOrder(db, row));
}

function hydrateOrder(db: QatafoDatabase, row: any): AyWebsOrder {
  const parse = <T,>(value: unknown, fallback: T): T => {
    try {
      const parsed = JSON.parse(String(value ?? ''));
      return parsed == null ? fallback : parsed as T;
    } catch { return fallback; }
  };
  const status = String(row.status) as AyWebsOrderStatus;
  const itemRows = db.all<any>(`SELECT * FROM ayweb_order_items WHERE order_id=? ORDER BY created_at ASC`, row.id);
  const feeRows = db.all<any>(`SELECT * FROM ayweb_checkout_fees WHERE order_id=? ORDER BY rowid ASC`, row.id);
  const payment = db.get<any>(`SELECT * FROM ayweb_payments WHERE order_id=? ORDER BY created_at DESC LIMIT 1`, row.id);
  return {
    id: String(row.id),
    orderNumber: String(row.order_number),
    cartId: row.cart_id ? String(row.cart_id) : null,
    accountId: row.account_id ? String(row.account_id) : null,
    status,
    masterStage: String(row.master_stage) as AyWebsMasterStage,
    exceptionState: row.exception_state ? String(row.exception_state) as AyWebsExceptionState : null,
    exceptionReason: String(row.exception_reason || ''),
    currency: String(row.currency || 'TND'),
    totals: {
      productSubtotalTnd: round2(row.product_subtotal_tnd),
      serviceFeeTnd: round2(row.service_fee_tnd),
      importFeeTnd: round2(row.import_fee_tnd),
      shippingEstimateTnd: round2(row.shipping_estimate_tnd),
      otherFeeTnd: round2(row.other_fee_tnd),
      payableTnd: round2(row.payable_tnd),
    },
    fees: feeRows.length
      ? feeRows.map((fee) => ({
          kind: String(fee.kind),
          code: String(parse<Record<string, unknown>>(fee.detail, {}).code || fee.kind),
          label: String(fee.label),
          amountTnd: round2(fee.amount_tnd),
          detail: parse(fee.detail, {}),
        }))
      : parse(row.fees_snapshot, []),
    pricingVersion: Number(row.pricing_version) || 0,
    paymentStatus: payment ? String(payment.status) : String(row.payment_status || 'PENDING'),
    paymentMethod: payment ? String(payment.method) : 'PENDING_SELECTION',
    paymentReference: String(row.payment_reference || ''),
    paidAt: row.paid_at ? String(row.paid_at) : null,
    submittedAt: row.submitted_at ? String(row.submitted_at) : null,
    notes: String(row.notes || ''),
    shippingAddress: parseJsonObject(row.shipping_address),
    items: itemRows.map((item) => hydrateOrderItem(item)),
    timeline: ayWebsCustomerTimeline(status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function hydrateOrderItem(row: any): AyWebsOrderItem {
  const parse = <T,>(value: unknown, fallback: T): T => {
    try {
      const parsed = JSON.parse(String(value ?? ''));
      return parsed == null ? fallback : parsed as T;
    } catch { return fallback; }
  };
  const variantSnapshot = parse<Record<string, unknown> | null>(row.variant_snapshot, null);
  const attributes = (variantSnapshot?.attributes || {}) as Record<string, string>;
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    cartItemId: row.cart_item_id ? String(row.cart_item_id) : null,
    productId: row.product_id ? String(row.product_id) : null,
    storeId: String(row.store_id),
    storeName: String(row.store_id),
    sourceUrl: String(row.source_url || ''),
    sourceProductId: String(row.source_product_id || '') || null,
    title: String(row.title || ''),
    images: parse<string[]>(row.images, []),
    unitPrice: Number(row.unit_price) || 0,
    currency: String(row.currency || ''),
    quantity: Number(row.quantity) || 1,
    variantSnapshot,
    variantLabel: Object.keys(attributes).sort().map((key) => attributes[key]).filter(Boolean).join(' · '),
    priceSnapshot: parse<Record<string, unknown> | null>(row.price_snapshot, null),
    evidenceHash: String(row.evidence_hash || ''),
    lineTotalTnd: round2(row.line_total_tnd),
    purchaseStatus: String(row.purchase_status) as AyWebsPurchaseStatus,
    purchaseReason: String(row.purchase_reason || ''),
    warehouseState: String(row.warehouse_state || 'WAITING_SUPPLIER'),
  };
}

export { ayWebsCustomerTimeline };
