import { Router, type RequestHandler, type Request, type Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import type { AdminIdentity } from '../admin/auth';
import { requireAdmin } from '../admin/auth';
import { can } from '../erp-core/permissions';
import { AYWEBS_STORES } from '../../shared/aywebsStores';
import { AYWEBS_ADAPTER_DESCRIPTORS } from './adapters/registry';
import { ayWebsAnalyticsSummary } from './analytics';
import { ayWebsMetrics, listAyWebsAudit, listAyWebsDomainEvents } from './events';
import { ensureAyWebsSchema } from './schema';
import { ayWebsOrderMachine, ayWebsPurchaseRequestMachine } from './stateMachines';
import {
  approveAyWebsTransferPayment,
  confirmAyWebsPurchase,
  failAyWebsPurchase,
  listAyWebsOrders,
  readAyWebsOrderById,
  startAyWebsPurchase,
  transitionAyWebsOrder,
} from './orders';
import {
  decideAyWebsPurchaseRequest,
  decideAyWebsStoreRequest,
  listAyWebsPurchaseRequests,
  listAyWebsStoreRequests,
  readAyWebsPurchaseRequest,
} from './purchaseRequests';
import { latestAyWebsEvidence } from './evidence';
import { AyWebsDomainError, ayWebsErrorPayload } from './errors';
import { AYWEBS_MODULE_KEY, AYWEBS_RESOURCES } from './permissions';
import type { AyWebsPurchaseRequestReason, AyWebsPurchaseRequestStatus, AyWebsStoreRequestStatus } from '../../shared/aywebsTypes';

/**
 * AYWEBs — section Admin (§31).
 *
 * Montée sous `/api/admin/aywebs` par le routeur Admin existant : AYWEBs n'a pas
 * sa propre application d'administration et n'installe ni session ni CSRF
 * parallèles. Chaque route compose les deux gardes déjà en place —
 * `requireAdmin(db, permission)` (session + CSRF sur les écritures) puis le
 * moteur ERP `can()` pour le module `aywebs`.
 *
 * Ce qui est réellement pilotable aujourd'hui (phases 1-5) :
 *   Dashboard, Stores, Store Adapters, Store Requests, Orders, Purchase
 *   Requests, Exceptions, Payments, Audit Log, Events.
 * Ce qui ne l'est pas encore (phases 6-8) — Warehouse, Consolidation, Shipping —
 * répond `NOT_IMPLEMENTED` (§48) au lieu d'afficher des données simulées.
 */

type AyWebsAdminRequest = Request & { admin?: AdminIdentity };

/** Refus tracé : un 403 est aussi une ligne dans le moteur ERP. */
/**
 * Garde legacy existante, choisie parmi les permissions réellement déclarées
 * dans `admin/permissions.ts` : aucune chaîne inventée.
 *   read → commerce:read | write → orders:write | approve → payments:write
 * Le moteur ERP (`can()` sur le module `aywebs`) affine ensuite par ressource.
 */
const LEGACY_GUARD_BY_ACTION = {
  read: 'commerce:read',
  write: 'orders:write',
  approve: 'payments:write',
} as const;

function requireAyWebsAdmin(db: QatafoDatabase, action: 'read' | 'write' | 'approve', resourceType: string | null = null): RequestHandler[] {
  return [
    requireAdmin(db, LEGACY_GUARD_BY_ACTION[action]),
    (req: Request, res: Response, next: () => void) => {
      const admin = (req as AyWebsAdminRequest).admin;
      const decision = can(db, String(admin?.role || ''), { module: AYWEBS_MODULE_KEY, action, resourceType: resourceType as any });
      if (!decision.allowed) {
        res.status(403).json({
          success: false,
          code: 'PERMISSION_DENIED',
          error: 'Vous ne disposez pas de cette permission sur le module AyWebs.',
          detail: { module: AYWEBS_MODULE_KEY, action, resourceType, reason: decision.reason || 'grant absent' },
        });
        return;
      }
      next();
    },
  ];
}

const wrap = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response) => {
  try {
    await fn(req, res);
  } catch (error) {
    if (res.headersSent) return;
    if (error instanceof AyWebsDomainError) {
      res.status(409).json(ayWebsErrorPayload(error));
      return;
    }
    console.error('[AyWebs Admin]', error instanceof Error ? error.message : error);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', error: 'Une erreur est survenue dans la section AyWebs.' });
  }
};

export function createAyWebsAdminRouter(db: QatafoDatabase): Router {
  const router = Router();
  ensureAyWebsSchema(db);

  /* ---- Dashboard ---- */
  router.get('/overview', ...requireAyWebsAdmin(db, 'read'), wrap((req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const orders = db.all<any>(
      `SELECT status, COUNT(*) AS count, COALESCE(SUM(payable_tnd),0) AS amount
       FROM ayweb_orders WHERE created_at >= date('now', ?) GROUP BY status`, `-${days} days`,
    );
    const exceptions = db.all<any>(
      `SELECT COALESCE(exception_state,'NONE') AS state, COUNT(*) AS count FROM ayweb_orders
       WHERE exception_state IS NOT NULL AND created_at >= date('now', ?) GROUP BY exception_state ORDER BY count DESC`, `-${days} days`,
    );
    const blockedCartItems = db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ayweb_cart_items WHERE status!='ACTIVE' AND status!='REMOVED'`,
    );
    const purchaseRequests = db.all<any>(
      `SELECT status, COUNT(*) AS count FROM ayweb_purchase_requests GROUP BY status`,
    );
    const storeRequests = db.get<{ count: number }>(
      `SELECT COUNT(*) AS count FROM ayweb_store_requests WHERE status IN ('SUBMITTED','UNDER_REVIEW')`,
    );
    res.json({
      success: true,
      data: {
        days,
        analytics: ayWebsAnalyticsSummary(db, days),
        metrics: ayWebsMetrics(1),
        orders: orders.map((row) => ({ status: String(row.status), count: Number(row.count), amount_tnd: Math.round(Number(row.amount) * 100) / 100 })),
        exceptions: exceptions.map((row) => ({ state: String(row.state), count: Number(row.count) })),
        blocked_cart_items: Number(blockedCartItems?.count || 0),
        purchase_requests: purchaseRequests.map((row) => ({ status: String(row.status), count: Number(row.count) })),
        pending_store_requests: Number(storeRequests?.count || 0),
        stores: AYWEBS_STORES.length,
        adapters: AYWEBS_ADAPTER_DESCRIPTORS.length,
        /** §48 : l'état réel de l'intégration d'achat, visible par l'opérateur. */
        purchase_integration: 'PENDING_INTEGRATION',
        resources: AYWEBS_RESOURCES,
      },
    });
  }));

  /* ---- Stores & Store Adapters ---- */
  router.get('/stores', ...requireAyWebsAdmin(db, 'read'), wrap((_req, res) => {
    res.json({
      success: true,
      data: AYWEBS_STORES.map((store) => ({
        id: store.id,
        name: store.name,
        display_name: store.displayName,
        domains: [...store.domains],
        country: store.country,
        currency: store.currency,
        status: store.status,
        integration_type: store.integrationType,
        capabilities: [...store.capabilities],
        browser_mode: store.browserMode,
        popular: store.popular,
        phase: store.phase,
        categories: [...store.categories],
      })),
    });
  }));

  router.get('/adapters', ...requireAyWebsAdmin(db, 'read'), wrap((_req, res) => {
    res.json({ success: true, data: AYWEBS_ADAPTER_DESCRIPTORS });
  }));

  /* ---- Orders ---- */
  router.get('/orders', ...requireAyWebsAdmin(db, 'read'), wrap((req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const status = String(req.query.status || '').trim();
    const rows = status
      ? db.all<any>(`SELECT * FROM ayweb_orders WHERE status=? ORDER BY created_at DESC LIMIT ?`, status, limit)
      : db.all<any>(`SELECT * FROM ayweb_orders ORDER BY created_at DESC LIMIT ?`, limit);
    const orders = rows.map((row) => readAyWebsOrderById(db, String(row.id))).filter(Boolean);
    res.json({
      success: true,
      data: orders,
      pagination: { page: 1, page_size: limit, total: orders.length },
      statuses: ayWebsOrderMachine.states(),
    });
  }));

  router.get('/orders/:id', ...requireAyWebsAdmin(db, 'read'), wrap((req, res) => {
    const order = readAyWebsOrderById(db, String(req.params.id));
    if (!order) {
      res.status(404).json({ success: false, code: 'ORDER_NOT_FOUND', error: 'Commande AyWebs introuvable.' });
      return;
    }
    const evidence = order.items.map((item) => ({
      order_item_id: item.id,
      evidence: item.productId ? latestAyWebsEvidence(db, item.productId) : null,
    }));
    res.json({
      success: true,
      data: order,
      evidence,
      audit: listAyWebsAudit(db, { resourceType: 'order', resourceId: order.id, limit: 50 }),
      events: listAyWebsDomainEvents(db, { resourceId: order.id, limit: 50 }),
      allowed_transitions: ayWebsOrderMachine.next(order.status),
    });
  }));

  /** Démarrage du procurement : état réel PENDING_INTEGRATION, jamais un achat simulé. */
  router.post('/orders/:id/purchase/start', ...requireAyWebsAdmin(db, 'write', 'order'), wrap((req, res) => {
    const order = startAyWebsPurchase(db, {
      orderId: String(req.params.id),
      actorType: 'admin',
      actorId: String((req as AyWebsAdminRequest).admin?.id || ''),
      requestId: String((req as any).requestId || ''),
    });
    res.json({ success: true, data: order });
  }));

  router.post('/orders/:id/purchase/confirm', ...requireAyWebsAdmin(db, 'approve', 'order'), wrap((req, res) => {
    const order = confirmAyWebsPurchase(db, {
      orderId: String(req.params.id),
      actorType: 'admin',
      actorId: String((req as AyWebsAdminRequest).admin?.id || ''),
      note: String(req.body?.note || ''),
      requestId: String((req as any).requestId || ''),
    });
    res.json({ success: true, data: order });
  }));

  router.post('/orders/:id/purchase/fail', ...requireAyWebsAdmin(db, 'write', 'order'), wrap((req, res) => {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) {
      res.status(400).json({ success: false, code: 'REASON_REQUIRED', error: 'Un échec d’achat exige une raison (§22).' });
      return;
    }
    const order = failAyWebsPurchase(db, {
      orderId: String(req.params.id),
      reason,
      actorType: 'admin',
      actorId: String((req as AyWebsAdminRequest).admin?.id || ''),
      requestId: String((req as any).requestId || ''),
    });
    res.json({ success: true, data: order });
  }));

  /** Transition contrôlée par la machine à états (logistique, annulation). */
  router.post('/orders/:id/transition', ...requireAyWebsAdmin(db, 'write', 'order'), wrap((req, res) => {
    const to = String(req.body?.to || '').trim();
    const order = transitionAyWebsOrder(db, {
      orderId: String(req.params.id),
      to: to as any,
      actorType: 'admin',
      actorId: String((req as AyWebsAdminRequest).admin?.id || ''),
      reason: String(req.body?.reason || ''),
      requestId: String((req as any).requestId || ''),
    });
    res.json({ success: true, data: order });
  }));

  /* ---- Payments : validation d'un justificatif de virement ---- */
  router.get('/payments', ...requireAyWebsAdmin(db, 'read'), wrap((req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const status = String(req.query.status || '').trim();
    const rows = status
      ? db.all<any>(
          `SELECT p.*, o.order_number FROM ayweb_payments p JOIN ayweb_orders o ON o.id=p.order_id
           WHERE p.status=? ORDER BY p.created_at DESC LIMIT ?`, status, limit)
      : db.all<any>(
          `SELECT p.*, o.order_number FROM ayweb_payments p JOIN ayweb_orders o ON o.id=p.order_id
           ORDER BY p.created_at DESC LIMIT ?`, limit);
    res.json({
      success: true,
      data: rows.map((row) => ({
        id: String(row.id),
        payment_number: String(row.payment_number),
        order_id: String(row.order_id),
        order_number: String(row.order_number),
        method: String(row.method),
        status: String(row.status),
        amount_tnd: Number(row.amount_tnd),
        provider: String(row.provider || ''),
        transfer_reference: String(row.transfer_reference || ''),
        proof_path: String(row.proof_path || ''),
        failure_reason: String(row.failure_reason || ''),
        initiated_at: row.initiated_at ? String(row.initiated_at) : null,
        confirmed_at: row.confirmed_at ? String(row.confirmed_at) : null,
        created_at: String(row.created_at),
      })),
    });
  }));

  router.post('/payments/:id/approve', ...requireAyWebsAdmin(db, 'approve', 'order'), wrap((req, res) => {
    const payment = db.get<any>(`SELECT order_id FROM ayweb_payments WHERE id=?`, String(req.params.id));
    if (!payment) {
      res.status(404).json({ success: false, code: 'PAYMENT_NOT_FOUND', error: 'Transaction AyWebs introuvable.' });
      return;
    }
    const order = approveAyWebsTransferPayment(db, {
      orderId: String(payment.order_id),
      adminId: String((req as AyWebsAdminRequest).admin?.id || ''),
      requestId: String((req as any).requestId || ''),
    });
    res.json({ success: true, data: order });
  }));

  /* ---- Purchase Requests (§23) ---- */
  router.get('/purchase-requests', ...requireAyWebsAdmin(db, 'read'), wrap((req, res) => {
    const status = String(req.query.status || '').trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const requests = listAyWebsPurchaseRequests(db, { ...(status ? { status } : {}), limit });
    res.json({
      success: true,
      data: requests,
      pagination: { page: 1, page_size: limit, total: requests.length },
      statuses: ayWebsPurchaseRequestMachine.states(),
    });
  }));

  router.get('/purchase-requests/:id', ...requireAyWebsAdmin(db, 'read'), wrap((req, res) => {
    const request = readAyWebsPurchaseRequest(db, String(req.params.id));
    if (!request) {
      res.status(404).json({ success: false, code: 'PURCHASE_REQUEST_NOT_FOUND', error: 'Demande introuvable.' });
      return;
    }
    res.json({
      success: true,
      data: request,
      allowed_transitions: ayWebsPurchaseRequestMachine.next(request.status),
      audit: listAyWebsAudit(db, { resourceType: 'purchase_request', resourceId: request.id, limit: 50 }),
    });
  }));

  router.post('/purchase-requests/:id/decide', ...requireAyWebsAdmin(db, 'approve', 'purchase_request'), wrap((req, res) => {
    const to = String(req.body?.to || '').trim() as AyWebsPurchaseRequestStatus;
    const request = decideAyWebsPurchaseRequest(db, {
      id: String(req.params.id),
      to,
      adminId: String((req as AyWebsAdminRequest).admin?.id || ''),
      reason: (req.body?.reason ? String(req.body.reason) : null) as AyWebsPurchaseRequestReason | null,
      decisionNote: req.body?.decision_note ? String(req.body.decision_note) : '',
      orderId: req.body?.order_id ? String(req.body.order_id) : null,
      requestId: String((req as any).requestId || ''),
    });
    res.json({ success: true, data: request });
  }));

  /* ---- Store Requests (§38) ---- */
  router.get('/store-requests', ...requireAyWebsAdmin(db, 'read'), wrap((req, res) => {
    const status = String(req.query.status || '').trim();
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    res.json({ success: true, data: listAyWebsStoreRequests(db, { ...(status ? { status } : {}), limit }) });
  }));

  router.post('/store-requests/:id/decide', ...requireAyWebsAdmin(db, 'approve', 'store_request'), wrap((req, res) => {
    const request = decideAyWebsStoreRequest(db, {
      id: String(req.params.id),
      to: String(req.body?.to || '').trim() as AyWebsStoreRequestStatus,
      adminId: String((req as AyWebsAdminRequest).admin?.id || ''),
      decisionNote: req.body?.decision_note ? String(req.body.decision_note) : '',
      promotedStoreId: req.body?.promoted_store_id ? String(req.body.promoted_store_id) : null,
      requestId: String((req as any).requestId || ''),
    });
    res.json({ success: true, data: request });
  }));

  /* ---- Exceptions : ce qui bloque réellement, avec sa raison ---- */
  router.get('/exceptions', ...requireAyWebsAdmin(db, 'read', 'exception'), wrap((req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const orders = db.all<any>(
      `SELECT id,order_number,status,exception_state,exception_reason,payable_tnd,updated_at
       FROM ayweb_orders WHERE exception_state IS NOT NULL ORDER BY updated_at DESC LIMIT ?`, limit,
    );
    const items = db.all<any>(
      `SELECT i.id,i.title,i.status,i.status_reason,i.store_id,o.order_number
       FROM ayweb_order_items i JOIN ayweb_orders o ON o.id=i.order_id
       WHERE i.purchase_status IN ('PRICE_CHANGED','VARIANT_UNAVAILABLE','OUT_OF_STOCK','PURCHASE_FAILED','REQUIRES_REVIEW','PENDING_INTEGRATION','MANUAL_REVIEW')
       ORDER BY i.updated_at DESC LIMIT ?`, limit,
    );
    const cartItems = db.all<any>(
      `SELECT id,title,status,status_reason,store_id,updated_at FROM ayweb_cart_items
       WHERE status NOT IN ('ACTIVE','REMOVED') ORDER BY updated_at DESC LIMIT ?`, limit,
    );
    res.json({ success: true, data: { orders, order_items: items, cart_items: cartItems } });
  }));

  /* ---- Audit & Events ---- */
  router.get('/audit', ...requireAyWebsAdmin(db, 'read', 'audit'), wrap((req, res) => {
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const resourceType = String(req.query.resource_type || '').trim();
    res.json({ success: true, data: listAyWebsAudit(db, { limit, ...(resourceType ? { resourceType } : {}) }) });
  }));

  router.get('/events', ...requireAyWebsAdmin(db, 'read'), wrap((req, res) => {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const eventName = String(req.query.event || '').trim();
    res.json({ success: true, data: listAyWebsDomainEvents(db, { limit, ...(eventName ? { eventName } : {}) }) });
  }));

  /* ---- Warehouse / Consolidation / Shipping : phases 6-8 (§48) ---- */
  const notImplemented = (what: string) => wrap((_req, res) => {
    res.status(501).json({
      success: false,
      code: 'NOT_IMPLEMENTED',
      error: `${what} n’est pas encore disponible : aucune donnée simulée n’est renvoyée.`,
      error_contract: {
        errorCode: 'NOT_IMPLEMENTED',
        userMessage: `${what} n’est pas encore disponible.`,
        technicalMessage: 'Master Order phases 6-8 : procurement physique, entrepôt, groupement, expédition',
        recoverable: false,
        retryAllowed: false,
        requiredAction: 'WAIT_FOR_REVIEW',
      },
    });
  });

  router.get('/warehouse', ...requireAyWebsAdmin(db, 'read'), notImplemented('Le suivi entrepôt AyWebs'));
  router.get('/consolidation', ...requireAyWebsAdmin(db, 'read'), notImplemented('Le groupement de colis AyWebs'));
  router.get('/shipping', ...requireAyWebsAdmin(db, 'read'), notImplemented('L’expédition internationale AyWebs'));

  return router;
}

/** Commandes clientes en attente d'achat — utile au tableau de bord global. */
export function ayWebsPendingPurchaseCount(db: QatafoDatabase): number {
  ensureAyWebsSchema(db);
  const row = db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM ayweb_orders WHERE status IN ('PAID','PURCHASE_PENDING','PURCHASING')`,
  );
  return Number(row?.count || 0);
}

export { listAyWebsOrders };
