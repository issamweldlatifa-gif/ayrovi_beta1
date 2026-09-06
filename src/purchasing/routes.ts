/**
 * AYROVI Purchasing (P2.3) — API du back-office.
 *
 * Monté sous `/api/admin/purchasing` par le routeur admin existant : il hérite du cookie de
 * session (`Path=/api/admin`) et rien ici n'est atteignable anonymement. Chaque route compose les
 * deux gardes existantes — `requireAdmin(db)` (session + CSRF sur les écritures) puis le moteur de
 * permissions ERP pour `purchasing:<action>` sur la bonne ressource (refus tracé) — au lieu
 * d'inventer une troisième garde.
 *
 * Contrats respectés :
 *  • les listes parlent le dialecte du framework (`page`, `page_size`/`pageSize`, `search`,
 *  `status`, `sort`, `direction`) et répondent `{ success, data, pagination }` :
 *  `ResourceWorkspace` les rend sans écran dédié ;
 *  • aucune route n'écrit une quantité de stock : le seul verbe qui déplace le stock est
 *  `POST /receipts/:id/post`, et il délègue à `recordMovement` du module Stock ;
 *  • aucune route ne modifie ni ne supprime une réception affichée (immuable) ni un fournisseur
 *  référencé ; les verbes existent mais refusent avec la raison ;
 *  • `POST /orders/:id/approve` exige le droit `approve`, `POST /receipts/*` exige `write` :
 *  ce qui engage l'argent et ce qui ouvre le magasin restent séparables.
 */
import { Router, type Request, type Response } from 'express';
import type { QatafoDatabase } from '../db/database';
import type { AdminIdentity } from '../admin/auth';
import { can } from '../erp-core/permissions';
import { statusVocabulary } from '../domain/statuses';
import { bootstrapPurchasing } from './bootstrap';
import { requirePurchasing } from './permissions';
import {
  cancelOrder, createOrder, getOrder, listOrders, rejectOrder, submitOrder, updateOrder,
  approveOrder, ORDER_LINES_ARE_EDITED_WITH_THE_ORDER,
} from './orders';
import {
  createSupplier, getSupplier, listSuppliers, refuseSupplierDeletion, setSupplierStatus, updateSupplier,
} from './suppliers';
import {
  createReceipt, discardReceipt, getReceipt, listReceipts, postReceipt, RECEIPT_IMMUTABLE_MESSAGE,
  refuseReceiptDeletion, updateReceipt,
} from './receipts';
import { isIdentifier } from './validation';
import {
  MAX_LINES_PER_ORDER, PO_STATUSES, PURCHASING_ACTIONS, PURCHASING_ERRORS, PURCHASING_MODULE_KEY,
  PURCHASING_RESOURCES, PURCHASE_CURRENCIES, RECEIPT_QUALITIES, RECEIPT_STATUSES, SUPPLIER_STATUSES,
} from './types';

type PurchasingRequest = Request & { admin?: AdminIdentity; erpEmployee?: { id: string } | null };

/** code → HTTP status : une réponse contrôlée pour chaque refus, jamais un 500. */
const STATUS_BY_CODE: Record<string, number> = {
  [PURCHASING_ERRORS.SUPPLIER_NOT_FOUND]: 404,
  [PURCHASING_ERRORS.ORDER_NOT_FOUND]: 404,
  [PURCHASING_ERRORS.LINE_NOT_FOUND]: 404,
  [PURCHASING_ERRORS.RECEIPT_NOT_FOUND]: 404,
  [PURCHASING_ERRORS.PRODUCT_NOT_FOUND]: 404,
  [PURCHASING_ERRORS.ARRIVAL_NOT_FOUND]: 404,
  [PURCHASING_ERRORS.DUPLICATE]: 409,
  [PURCHASING_ERRORS.CONFLICT]: 409,
  [PURCHASING_ERRORS.OVER_RECEIPT]: 409,
  [PURCHASING_ERRORS.IMMUTABLE]: 409,
  [PURCHASING_ERRORS.NOT_APPROVED]: 409,
  [PURCHASING_ERRORS.ALREADY_DECIDED]: 409,
  [PURCHASING_ERRORS.EMPTY_LINES]: 409,
  [PURCHASING_ERRORS.NOTHING_TO_RECEIVE]: 409,
  [PURCHASING_ERRORS.PERMISSION_DENIED]: 403,
};

type Outcome<T = unknown> = { ok?: boolean; value?: T; code?: string; message?: string; details?: { field: string; reason: string }[] };

function answer(res: Response, result: Outcome) {
  if (result.ok) return res.json({ success: true, data: result.value ?? null });
  const code = result.code || PURCHASING_ERRORS.VALIDATION;
  const status = STATUS_BY_CODE[code] ?? 400;
  return res.status(status).json({
    success: false, code,
    error: result.message || 'Requête refusée par le module achats.',
    ...(result.details?.length ? { details: result.details } : {}),
  });
}

/** Une liste de service devient le dialecte du framework à la frontière, pas dans le service. */
function listResponse(res: Response, result: Outcome<{ items: any[]; total: number; page: number; pageSize: number }>) {
  if (!result.ok) return answer(res, result);
  const value = result.value as { items: any[]; total: number; page: number; pageSize: number };
  return res.json({
    success: true,
    data: value.items,
    pagination: {
      page: value.page, pageSize: value.pageSize, total: value.total,
      totalPages: Math.max(1, Math.ceil(value.total / value.pageSize)),
    },
  });
}

/** Un seul endroit lit page/tri/filtres — les trois listes du module ne divergent pas. */
function listParams(req: Request) {
  return {
    search: req.query.search, status: req.query.status, location: req.query.location,
    supplier_id: req.query.supplier_id, purchase_order_id: req.query.purchase_order_id,
    page: req.query.page, pageSize: req.query.pageSize ?? req.query.page_size,
    sort: req.query.sort, direction: req.query.direction,
  };
}

export function createPurchasingRouter(db: QatafoDatabase): Router {
  const router = Router();

  // Même convention d'amorçage à la demande que le catalogue et le stock : celui qui monte le
  // module obtient le schéma, la numérotation et les grants, une seule fois, et un échec ici ne
  // fait jamais tomber le back office (le constructeur de la base a déjà essayé).
  let booted = false;
  router.use((req, _res, next) => {
    if (booted || req.path === '/health') return next();
    booted = true;
    try { bootstrapPurchasing(db); } catch { /* schéma déjà assuré au démarrage */ }
    return next();
  });
  router.get('/health', (_req, res) => {
    const report = (() => { try { return bootstrapPurchasing(db); } catch (error: any) { return { error: String(error?.message || error) }; } })();
    res.json({ success: true, data: { module: PURCHASING_MODULE_KEY, ...report } });
  });

  const actorOf = (req: PurchasingRequest) => ({
    id: req.admin?.id ?? null,
    name: req.admin?.name ?? null,
    ipAddress: req.ip || null,
  });

  /** Ce que le rôle appelant peut faire, calculé par `can()` — la source de vérité du grisage. */
  const capabilitiesFor = (req: PurchasingRequest) => {
    const role = req.admin?.role ?? null;
    const employee = req.erpEmployee ?? null;
    const out: Record<string, Record<string, boolean>> = {};
    for (const resource of PURCHASING_RESOURCES) {
      const perResource: Record<string, boolean> = {};
      for (const action of PURCHASING_ACTIONS) {
        perResource[action] = can(db, role, { module: PURCHASING_MODULE_KEY, action, resourceType: resource, employee }).allowed;
      }
      out[resource] = perResource;
    }
    return out;
  };

  router.get('/meta', requirePurchasing(db, 'read', 'supplier'), (req: PurchasingRequest, res: Response) => {
    const pending = db.get<{ n: number; units: number }>(
      `SELECT COUNT(*) AS n, COALESCE(SUM(
          (SELECT COALESCE(SUM(l.quantity_ordered * l.unit_cost), 0) FROM purchase_order_lines l WHERE l.purchase_order_id = po.id)
        ), 0) AS units FROM purchase_orders po WHERE po.status IN ('DRAFT','SUBMITTED')`);
    res.json({
      success: true,
      data: {
        module: PURCHASING_MODULE_KEY,
        capabilities: capabilitiesFor(req),
        orderStatuses: PO_STATUSES,
        receiptStatuses: RECEIPT_STATUSES,
        qualities: RECEIPT_QUALITIES,
        supplierStatuses: SUPPLIER_STATUSES,
        currencies: PURCHASE_CURRENCIES,
        // Les libellés viennent du vocabulaire partagé, jamais d'une copie locale.
        statusVocabulary: {
          order: statusVocabulary('purchasing.order') ?? PO_STATUSES,
          receipt: statusVocabulary('purchasing.receipt') ?? RECEIPT_STATUSES,
        },
        limits: { maxLinesPerOrder: MAX_LINES_PER_ORDER },
        // Le stock n'est pas dupliqué ici : on compte les commandes en attente, pas les pièces.
        summary: {
          orders_pending: Number(pending?.n ?? 0),
          orders_pending_amount: Math.round(Number(pending?.units ?? 0) * 100) / 100,
          receipts_draft: Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM goods_receipts WHERE status='DRAFT'`)?.n ?? 0),
          suppliers_active: Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM suppliers WHERE status='ACTIVE'`)?.n ?? 0),
        },
        rules: {
          lines: ORDER_LINES_ARE_EDITED_WITH_THE_ORDER,
          receipt: RECEIPT_IMMUTABLE_MESSAGE,
        },
      },
    });
  });

  // ---------- Fournisseurs ----------
  router.get('/suppliers', requirePurchasing(db, 'read', 'supplier'), (req, res) => {
    listResponse(res, listSuppliers(db, listParams(req)));
  });

  router.get('/suppliers/:id', requirePurchasing(db, 'read', 'supplier'), (req: PurchasingRequest, res) => {
    answer(res, getSupplier(db, String(req.params.id)));
  });

  router.post('/suppliers', requirePurchasing(db, 'create', 'supplier'), (req: PurchasingRequest, res) => {
    answer(res, createSupplier(db, (req.body ?? {}) as Record<string, any>, actorOf(req), req));
  });

  router.put('/suppliers/:id', requirePurchasing(db, 'update', 'supplier'), (req: PurchasingRequest, res) => {
    answer(res, updateSupplier(db, String(req.params.id), (req.body ?? {}) as Record<string, any>, actorOf(req), req));
  });

  router.patch('/suppliers/:id', requirePurchasing(db, 'update', 'supplier'), (req: PurchasingRequest, res) => {
    answer(res, updateSupplier(db, String(req.params.id), (req.body ?? {}) as Record<string, any>, actorOf(req), req));
  });

  router.post('/suppliers/:id/status', requirePurchasing(db, 'update', 'supplier'), (req: PurchasingRequest, res) => {
    const status = String((req.body ?? {}).status ?? '').trim().toUpperCase();
    if (status !== 'ACTIVE' && status !== 'INACTIVE') {
      return answer(res, { ok: false, code: PURCHASING_ERRORS.VALIDATION, message: '« status » doit valoir ACTIVE ou INACTIVE.' });
    }
    answer(res, setSupplierStatus(db, String(req.params.id), status as 'ACTIVE' | 'INACTIVE', actorOf(req), req));
  });

  /** Verbe présent pour que le refus soit motivé par l'API, pas par un 404 muet. */
  router.delete('/suppliers/:id', requirePurchasing(db, 'update', 'supplier'), (req: PurchasingRequest, res) => {
    answer(res, refuseSupplierDeletion(db, String(req.params.id)));
  });

  // ---------- Commandes ----------
  router.get('/orders', requirePurchasing(db, 'read', 'purchase_order'), (req, res) => {
    listResponse(res, listOrders(db, listParams(req)));
  });

  router.get('/orders/:id', requirePurchasing(db, 'read', 'purchase_order'), (req: PurchasingRequest, res) => {
    answer(res, getOrder(db, String(req.params.id)));
  });

  router.post('/orders', requirePurchasing(db, 'create', 'purchase_order'), (req: PurchasingRequest, res) => {
    answer(res, createOrder(db, (req.body ?? {}) as Record<string, any>, actorOf(req), req));
  });

  router.put('/orders/:id', requirePurchasing(db, 'update', 'purchase_order'), (req: PurchasingRequest, res) => {
    answer(res, updateOrder(db, String(req.params.id), (req.body ?? {}) as Record<string, any>, actorOf(req), req));
  });

  router.patch('/orders/:id', requirePurchasing(db, 'update', 'purchase_order'), (req: PurchasingRequest, res) => {
    answer(res, updateOrder(db, String(req.params.id), (req.body ?? {}) as Record<string, any>, actorOf(req), req));
  });

  // Une route ligne à ligne ouvrirait la porte à un coût sans quantité ; la commande est l'unité.
  router.post('/orders/:id/lines', requirePurchasing(db, 'update', 'purchase_order_line'), (req: PurchasingRequest, res) => {
    answer(res, { ok: false, code: PURCHASING_ERRORS.CONFLICT, message: ORDER_LINES_ARE_EDITED_WITH_THE_ORDER });
  });

  router.post('/orders/:id/submit', requirePurchasing(db, 'update', 'purchase_order'), (req: PurchasingRequest, res) => {
    answer(res, submitOrder(db, String(req.params.id), actorOf(req), req));
  });

  router.post('/orders/:id/approve', requirePurchasing(db, 'approve', 'purchase_order'), (req: PurchasingRequest, res) => {
    answer(res, approveOrder(db, String(req.params.id), actorOf(req), req));
  });

  router.post('/orders/:id/reject', requirePurchasing(db, 'approve', 'purchase_order'), (req: PurchasingRequest, res) => {
    answer(res, rejectOrder(db, String(req.params.id), String((req.body ?? {}).reason ?? ''), actorOf(req), req));
  });

  router.post('/orders/:id/cancel', requirePurchasing(db, 'update', 'purchase_order'), (req: PurchasingRequest, res) => {
    answer(res, cancelOrder(db, String(req.params.id), String((req.body ?? {}).reason ?? ''), actorOf(req), req));
  });

  // ---------- Réceptions (seule voie qui mouvemente le stock) ----------
  router.get('/receipts', requirePurchasing(db, 'read', 'goods_receipt'), (req, res) => {
    listResponse(res, listReceipts(db, listParams(req)));
  });

  router.get('/receipts/:id', requirePurchasing(db, 'read', 'goods_receipt'), (req: PurchasingRequest, res) => {
    answer(res, getReceipt(db, String(req.params.id)));
  });

  // Pas de clé d'idempotence à ce verbe : un second brouillon est un second bon papier, et le
  // dire « idempotent » serait faire croire qu'il ne se passe rien deux fois. Ce qui ne doit pas
  // se rejouer, c'est l'affichage — et ses mouvements portent une clé dérivée du bon (receipts.ts).
  router.post('/orders/:orderId/receipts', requirePurchasing(db, 'write', 'goods_receipt'), (req: PurchasingRequest, res) => {
    const body = (req.body ?? {}) as Record<string, any>;
    const purchaseOrderId = String(body.purchase_order_id ?? req.params.orderId ?? '').trim();
    if (!isIdentifier(purchaseOrderId)) {
      return answer(res, { ok: false, code: PURCHASING_ERRORS.VALIDATION, message: '« orderId » doit être un identifiant de commande.' });
    }
    answer(res, createReceipt(db, purchaseOrderId, body, actorOf(req), req));
  });

  router.put('/receipts/:id', requirePurchasing(db, 'write', 'goods_receipt'), (req: PurchasingRequest, res) => {
    answer(res, updateReceipt(db, String(req.params.id), (req.body ?? {}) as Record<string, any>, actorOf(req), req));
  });

  router.patch('/receipts/:id', requirePurchasing(db, 'write', 'goods_receipt'), (req: PurchasingRequest, res) => {
    answer(res, updateReceipt(db, String(req.params.id), (req.body ?? {}) as Record<string, any>, actorOf(req), req));
  });

  /** L'affichage du bon : le seul verbe du module qui écrit dans le stock, via `recordMovement`. */
  router.post('/receipts/:id/post', requirePurchasing(db, 'write', 'goods_receipt'), (req: PurchasingRequest, res) => {
    answer(res, postReceipt(db, String(req.params.id), actorOf(req), req));
  });

  router.post('/receipts/:id/discard', requirePurchasing(db, 'write', 'goods_receipt'), (req: PurchasingRequest, res) => {
    answer(res, discardReceipt(db, String(req.params.id), String((req.body ?? {}).reason ?? ''), actorOf(req), req));
  });

  router.delete('/receipts/:id', requirePurchasing(db, 'write', 'goods_receipt'), (req: PurchasingRequest, res) => {
    answer(res, refuseReceiptDeletion(db, String(req.params.id)));
  });

  return router;
}
