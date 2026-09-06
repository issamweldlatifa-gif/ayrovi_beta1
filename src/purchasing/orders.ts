/**
 * AYROVI Purchasing (P2.3) — commandes d'achat et leurs lignes.
 *
 * Le cycle est celui d'un engagement, pas d'un brouillon partagé :
 * `DRAFT → SUBMITTED → APPROVED → (réceptions) → PARTIALLY_RECEIVED | RECEIVED`, avec
 * `CANCELLED` tant que rien n'est entré en stock. Quatre décisions de conception y sont écrites :
 *  • les totaux ne sont **jamais** stockés : `subtotal` / `total_tnd` sont des `SUM` lus sur les
 *  lignes — deux colonnes entretenues par deux écritures finissent fausses ;
 *  • une commande n'est éditable qu'en `DRAFT` : une commande soumise est ce que le fournisseur
 *  a vu, la modifier après coup serait réécrire l'engagement ;
 *  • le coût d'achat vit dans la **devise de la commande** avec un taux de conversion, et
 *  n'écrit jamais dans `products.final_price` (prérogative du moteur Prix, P1/P2.1) ;
 *  • chaque transition passe par `auditPurchasing` (donc `writeAuditEvent`) avec le verbe métier
 *  en note : `ACCESS_DENIED` et les décisions sont déjà dans le journal unique.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { nextSequenceNumber } from '../erp-core/sequences';
import { withSavepoint } from '../db/savepoint';
import { auditPurchasing, auditPurchasingTransition, purchasingContext, type PurchasingActor } from './audit';
import {
  MAX_LINES_PER_ORDER, PO_LINE_STATES, PO_STATUSES, PURCHASING_ERRORS, type PurchaseOrderStatus,
} from './types';
import {
  currencyField, exchangeRateField, invalid, isIdentifier, lineQuantityField, paginationOf,
  propagate, sortOf, textField, unitCostField,
} from './validation';
import { round2, type PurchasingResult } from './suppliers';

export type Result<T> = PurchasingResult<T>;

/** Une ligne d'achat = produit (+ variante optionnelle), quantité, coût unitaire, description libre. */
export interface OrderLineInput {
  product_id: string;
  variant_id: string | null;
  description: string;
  quantity_ordered: number;
  unit_cost: number;
}

/** Ce que la commande peut recevoir comme statut explicite ; le reste est dérivé par `receipts.ts`. */
export const PO_EDITABLE_STATUS: PurchaseOrderStatus = 'DRAFT';

const ORDER_SELECT = `
  SELECT po.id, po.po_number, po.supplier_id, po.status, po.currency, po.exchange_rate, po.note,
         po.arrival_id, po.requested_by, po.requested_at, po.approved_by, po.approved_at,
         po.cancelled_by, po.cancelled_at, po.cancellation_reason, po.rejection_reason, po.created_at, po.updated_at,
         s.name AS supplier_name, s.code AS supplier_code,
         a.name AS arrival_name, a.status AS arrival_status,
         (SELECT COUNT(*) FROM purchase_order_lines l WHERE l.purchase_order_id = po.id) AS lines_count,
         (SELECT COALESCE(SUM(l.quantity_ordered * l.unit_cost), 0) FROM purchase_order_lines l WHERE l.purchase_order_id = po.id) AS subtotal,
         (SELECT COALESCE(SUM(l.quantity_ordered), 0) FROM purchase_order_lines l WHERE l.purchase_order_id = po.id) AS ordered_units,
         (SELECT COALESCE(SUM(rl.quantity), 0)
            FROM goods_receipt_lines rl JOIN goods_receipts r ON r.id = rl.receipt_id AND r.status = 'POSTED'
            WHERE rl.purchase_order_line_id IN (SELECT id FROM purchase_order_lines WHERE purchase_order_id = po.id)
              AND rl.quality IN ('GOOD','DAMAGED')) AS received_units
  FROM purchase_orders po
  JOIN suppliers s ON s.id = po.supplier_id
  LEFT JOIN crm_arrivals a ON a.id = po.arrival_id`;

const ORDER_SORTS = ['po_number', 'status', 'created_at', 'updated_at', 'supplier_name', 'subtotal'] as const;
const ORDER_SORT_EXPRESSIONS: Record<string, string> = {
  po_number: 'po.po_number', status: 'po.status', created_at: 'po.created_at',
  updated_at: 'po.updated_at', supplier_name: 's.name', subtotal: 'subtotal',
};

export function listOrders(db: QatafoDatabase, query: Record<string, unknown> = {}): Result<{ items: any[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize } = paginationOf(query as any);
  const { key: sortKey, direction } = sortOf(query as any, ORDER_SORTS, 'po.created_at');
  const search = String(query.search ?? '').trim().slice(0, 200);
  const status = String(query.status ?? '').trim().toUpperCase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (search) {
    where.push('(po.po_number LIKE ? OR s.name LIKE ? OR s.code LIKE ? OR po.note LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }
  if (status) {
    if (!(PO_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, code: PURCHASING_ERRORS.VALIDATION, message: `« status » inconnu : ${PO_STATUSES.join(', ')}.`, details: [{ field: 'status', reason: 'ENUM' }] };
    }
    where.push('po.status = ?');
    params.push(status);
  }
  if (isIdentifier(String(query.supplier_id ?? ''))) { where.push('po.supplier_id = ?'); params.push(String(query.supplier_id).trim()); }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM purchase_orders po JOIN suppliers s ON s.id = po.supplier_id${clause}`, ...params)?.n ?? 0);
  const order = (sortKey && ORDER_SORT_EXPRESSIONS[sortKey]) || 'po.created_at';
  const directionSql = sortKey ? direction : 'DESC';
  const items = db.all<any>(`${ORDER_SELECT}${clause} ORDER BY ${order} ${directionSql} LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize).map(decorateOrder);
  return { ok: true, value: { items, total, page, pageSize } };
}

/** Taux appliqué à la lecture : la devise de commande reste la valeur saisie, jamais réécrite. */
function decorateOrder(row: Record<string, any>) {
  const subtotal = round2(Number(row.subtotal) || 0);
  const rate = Number(row.exchange_rate) > 0 ? Number(row.exchange_rate) : 1;
  const ordered = Number(row.ordered_units) || 0;
  const received = Number(row.received_units) || 0;
  return {
    ...row,
    subtotal,
    total_amount: subtotal,
    total_tnd: row.currency === 'TND' ? subtotal : round2(subtotal * rate),
    fulfillment: ordered <= 0 ? 'NONE' : received >= ordered ? 'COMPLETE' : received > 0 ? 'PARTIAL' : 'NONE',
  };
}

export function getOrder(db: QatafoDatabase, id: string): Result<Record<string, any>> {
  const trimmed = String(id ?? '').trim();
  if (!isIdentifier(trimmed)) return { ok: false, code: PURCHASING_ERRORS.NOT_FOUND, message: 'Identifiant de commande invalide.' };
  const row = db.all<any>(`${ORDER_SELECT} WHERE po.id = ?`, trimmed)[0];
  if (!row) return { ok: false, code: PURCHASING_ERRORS.ORDER_NOT_FOUND, message: 'Commande d’achat introuvable.' };
  const lines = db.all<any>(`
    SELECT l.id, l.purchase_order_id, l.product_id, l.variant_id, l.description,
           l.quantity_ordered, l.unit_cost, l.created_at, l.updated_at,
           p.name AS product_name, p.product_code AS product_code, v.sku AS sku,
           (SELECT COALESCE(SUM(rl.quantity), 0) FROM goods_receipt_lines rl
              JOIN goods_receipts r ON r.id = rl.receipt_id AND r.status = 'POSTED'
             WHERE rl.purchase_order_line_id = l.id AND rl.quality IN ('GOOD','DAMAGED')) AS received_quantity,
           (SELECT COALESCE(SUM(rl.quantity), 0) FROM goods_receipt_lines rl
              JOIN goods_receipts r ON r.id = rl.receipt_id AND r.status = 'POSTED'
             WHERE rl.purchase_order_line_id = l.id AND rl.quality = 'REJECTED') AS rejected_quantity
    FROM purchase_order_lines l
    LEFT JOIN products p ON p.id = l.product_id
    LEFT JOIN catalogue_variants v ON v.id = l.variant_id
    WHERE l.purchase_order_id = ? ORDER BY l.created_at ASC, l.rowid ASC`, trimmed)
    .map((line) => {
      const ordered = Number(line.quantity_ordered);
      const received = Number(line.received_quantity);
      return {
        ...line,
        line_total: round2(ordered * Number(line.unit_cost)),
        remaining: Math.max(0, ordered - received),
        state: received <= 0 ? PO_LINE_STATES[0] : received >= ordered ? PO_LINE_STATES[2] : PO_LINE_STATES[1],
      };
    });
  const receipts = db.all<any>(`
    SELECT r.id, r.receipt_number, r.status, r.location, r.note, r.received_at, r.posted_at, r.created_at,
           (SELECT COALESCE(SUM(quantity),0) FROM goods_receipt_lines WHERE receipt_id = r.id) AS units
    FROM goods_receipts r WHERE r.purchase_order_id = ? ORDER BY r.created_at DESC`, trimmed);
  // Ce que la commande a bougé dans le stock se lit dans le journal du stock, pas dans une copie locale.
  const movements = db.all<any>(`
    SELECT m.id, m.direction, m.quantity, m.signed_quantity, m.reason, m.note, m.created_at, m.location, m.product_id
    FROM inventory_stock_movements m WHERE m.reference_type='goods_receipt'
      AND m.reference_id IN (SELECT id FROM goods_receipts WHERE purchase_order_id = ?)
    ORDER BY m.created_at ASC`, trimmed);
  return { ok: true, value: { ...decorateOrder(row), lines, receipts, movements } };
}

/** Lignes validées d'un bloc : une commande à moitié correcte n'engage à rien. */
function parseLines(db: QatafoDatabase, raw: unknown): Result<OrderLineInput[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, code: PURCHASING_ERRORS.EMPTY_LINES, message: 'Une commande d’achat se définit par ses lignes : au moins une est requise.', details: [{ field: 'lines', reason: 'REQUIRED' }] };
  }
  if (raw.length > MAX_LINES_PER_ORDER) {
    return { ok: false, code: PURCHASING_ERRORS.VALIDATION, message: `« lines » dépasse ${MAX_LINES_PER_ORDER} lignes : créez deux commandes plutôt qu’une liste non contrôlable.`, details: [{ field: 'lines', reason: 'RANGE' }] };
  }
  const seen = new Set<string>();
  const lines: OrderLineInput[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const body = (raw[index] ?? {}) as Record<string, any>;
    const field = `lines[${index}]`;
    const productId = String(body.product_id ?? '').trim();
    if (!isIdentifier(productId)) return invalid(`« ${field}.product_id » est un identifiant produit requis.`, [{ field: `${field}.product_id`, reason: 'REQUIRED' }]);
    const product = db.get<{ id: string }>('SELECT id FROM products WHERE id=?', productId);
    if (!product) return { ok: false, code: PURCHASING_ERRORS.PRODUCT_NOT_FOUND, message: `Produit introuvable pour la ligne ${index + 1} : la commande d’achat ne crée pas de fiche produit.`, details: [{ field: `${field}.product_id`, reason: 'FK' }] };
    const variantRaw = body.variant_id === undefined || body.variant_id === null || String(body.variant_id).trim() === '' ? null : String(body.variant_id).trim();
    if (variantRaw) {
      if (!isIdentifier(variantRaw)) return invalid(`« ${field}.variant_id » est un identifiant invalide.`, [{ field: `${field}.variant_id`, reason: 'FORMAT' }]);
      const variant = db.get<{ id: string }>('SELECT id FROM catalogue_variants WHERE id=? AND product_id=?', variantRaw, product.id);
      if (!variant) return { ok: false, code: PURCHASING_ERRORS.CONFLICT, message: `Variante inconnue ou hors produit pour la ligne ${index + 1}.`, details: [{ field: `${field}.variant_id`, reason: 'FK' }] };
    }
    // Deux lignes pour le même produit+variante, c'est une quantité à additionner à la main à la
    // réception. La base la refuse (index unique) ; le service le dit avant elle.
    const identity = `${product.id}::${variantRaw ?? ''}`;
    if (seen.has(identity)) {
      return { ok: false, code: PURCHASING_ERRORS.DUPLICATE, message: `Deux lignes portent le même produit${variantRaw ? ' et la même variante' : ''} (ligne ${index + 1}).`, details: [{ field, reason: 'UNIQUE' }] };
    }
    seen.add(identity);
    const quantity = lineQuantityField(body.quantity_ordered ?? body.quantity, `${field}.quantity_ordered`);
    if (!quantity.ok) return propagate(quantity);
    const unitCost = unitCostField(body.unit_cost, `${field}.unit_cost`);
    if (!unitCost.ok) return propagate(unitCost);
    const description = textField(body.description, `${field}.description`, 300);
    if (!description.ok) return propagate(description);
    lines.push({
      product_id: product.id, variant_id: variantRaw, description: String(description.value ?? ''),
      quantity_ordered: Number(quantity.value), unit_cost: Number(unitCost.value),
    });
  }
  return { ok: true, value: lines };
}

function insertLines(db: QatafoDatabase, orderId: string, lines: OrderLineInput[], now: string): void {
  for (const line of lines) {
    db.run(`INSERT INTO purchase_order_lines (id,purchase_order_id,product_id,variant_id,description,quantity_ordered,unit_cost,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, `pol_${randomUUID()}`, orderId, line.product_id, line.variant_id, line.description,
      line.quantity_ordered, line.unit_cost, now, now);
  }
}

/** `arrival_id` validé une seule fois, à la création comme à l'édition. */
function resolveArrival(db: QatafoDatabase, value: unknown): Result<string | null> {
  const raw = value === undefined || value === null ? '' : String(value).trim();
  if (raw === '') return { ok: true, value: null };
  if (!isIdentifier(raw)) return invalid('« arrival_id » est un identifiant invalide.', [{ field: 'arrival_id', reason: 'FORMAT' }]);
  const arrival = db.get<{ id: string }>('SELECT id FROM crm_arrivals WHERE id=?', raw);
  if (!arrival) return { ok: false, code: PURCHASING_ERRORS.ARRIVAL_NOT_FOUND, message: 'Arrivage introuvable côté CRM : le lien est une référence, pas un texte libre.', details: [{ field: 'arrival_id', reason: 'FK' }] };
  return { ok: true, value: arrival.id };
}

export function createOrder(db: QatafoDatabase, body: Record<string, any> = {}, actor: PurchasingActor, req?: any): Result<Record<string, any>> {
  const supplierId = String(body.supplier_id ?? '').trim();
  if (!isIdentifier(supplierId)) return invalid('« supplier_id » est un identifiant requis.', [{ field: 'supplier_id', reason: 'REQUIRED' }]);
  const supplier = db.get<{ id: string; status: string; currency: string; name: string }>('SELECT id,status,currency,name FROM suppliers WHERE id=?', supplierId);
  if (!supplier) return { ok: false, code: PURCHASING_ERRORS.SUPPLIER_NOT_FOUND, message: 'Fournisseur introuvable : une commande s’adresse à une fiche existante.', details: [{ field: 'supplier_id', reason: 'FK' }] };
  if (supplier.status !== 'ACTIVE') return { ok: false, code: PURCHASING_ERRORS.CONFLICT, message: `Le fournisseur « ${supplier.name} » est ${supplier.status} : réactivez-le avant d’engager une commande.`, details: [{ field: 'supplier_id', reason: 'STATUS' }] };

  const currency = currencyField(body.currency ?? supplier.currency);
  if (!currency.ok) return propagate(currency);
  const rate = exchangeRateField(body.exchange_rate);
  if (!rate.ok) return propagate(rate);
  const note = textField(body.note, 'note', 1000);
  if (!note.ok) return propagate(note);
  const linesCheck = parseLines(db, body.lines);
  if (!linesCheck.ok) return propagate<Record<string, any>>(linesCheck);
  const arrival = resolveArrival(db, body.arrival_id);
  if (!arrival.ok) return propagate<Record<string, any>>(arrival);

  const now = new Date().toISOString();
  const id = `po_${randomUUID()}`;
  const poNumber = nextSequenceNumber(db, 'purchase_order_number');
  const lines = linesCheck.value as OrderLineInput[];
  withSavepoint(db, 'po_create', () => {
    db.run(`INSERT INTO purchase_orders (id,po_number,supplier_id,status,currency,exchange_rate,note,arrival_id,created_at,updated_at,created_by,updated_by)
      VALUES (?,?,?,'DRAFT',?,?,?,?,?,?,?,?)`,
      id, poNumber, supplier.id, String(currency.value), Number(rate.value), String(note.value ?? ''), arrival.value ?? null, now, now, actor.id, actor.id);
    insertLines(db, id, lines, now);
  });
  auditPurchasing(db, {
    actor, action: 'CREATE', resourceType: 'purchase_order', resourceId: id,
    before: null,
    after: { po_number: poNumber, supplier_id: supplier.id, status: 'DRAFT', currency: currency.value, exchange_rate: rate.value, note: note.value, arrival_id: arrival.value ?? null, lines: lines.length, subtotal: round2(lines.reduce((sum, line) => sum + line.quantity_ordered * line.unit_cost, 0)) },
    context: purchasingContext(db, req),
  });
  return getOrder(db, id);
}

/** Édition : tant que la commande est un brouillon, et jamais son numéro. */
export function updateOrder(db: QatafoDatabase, id: string, body: Record<string, any> = {}, actor: PurchasingActor, req?: any): Result<Record<string, any>> {
  const current = db.get<Record<string, any>>('SELECT * FROM purchase_orders WHERE id=?', String(id ?? '').trim());
  if (!current) return { ok: false, code: PURCHASING_ERRORS.ORDER_NOT_FOUND, message: 'Commande d’achat introuvable.' };
  if (current.status !== PO_EDITABLE_STATUS) {
    return { ok: false, code: PURCHASING_ERRORS.CONFLICT, message: `Une commande ${String(current.status)} n’est plus modifiable : c’est ce que le fournisseur a reçu. Annulez-la et recréez-la.`, details: [{ field: 'status', reason: 'FROZEN' }] };
  }
  if (body.po_number !== undefined && String(body.po_number) !== String(current.po_number)) {
    return { ok: false, code: PURCHASING_ERRORS.IMMUTABLE, message: '« po_number » est attribué par la numérotation et ne se modifie pas.', details: [{ field: 'po_number', reason: 'IMMUTABLE' }] };
  }
  const patch: Record<string, unknown> = {};
  if (body.supplier_id !== undefined) {
    const supplierId = String(body.supplier_id).trim();
    if (!isIdentifier(supplierId)) return invalid('« supplier_id » est un identifiant requis.', [{ field: 'supplier_id', reason: 'REQUIRED' }]);
    const supplier = db.get<{ id: string; status: string }>('SELECT id,status FROM suppliers WHERE id=?', supplierId);
    if (!supplier) return { ok: false, code: PURCHASING_ERRORS.SUPPLIER_NOT_FOUND, message: 'Fournisseur introuvable.', details: [{ field: 'supplier_id', reason: 'FK' }] };
    if (supplier.status !== 'ACTIVE') return { ok: false, code: PURCHASING_ERRORS.CONFLICT, message: 'Le fournisseur visé est inactif.', details: [{ field: 'supplier_id', reason: 'STATUS' }] };
    patch.supplier_id = supplier.id;
  }
  if (body.currency !== undefined) {
    const check = currencyField(body.currency);
    if (!check.ok) return propagate(check);
    patch.currency = check.value;
  }
  if (body.exchange_rate !== undefined) {
    const check = exchangeRateField(body.exchange_rate);
    if (!check.ok) return propagate(check);
    patch.exchange_rate = check.value;
  }
  if (body.note !== undefined) {
    const check = textField(body.note, 'note', 1000);
    if (!check.ok) return propagate(check);
    patch.note = check.value;
  }
  if (body.arrival_id !== undefined) {
    const check = resolveArrival(db, body.arrival_id);
    if (!check.ok) return propagate<Record<string, any>>(check);
    patch.arrival_id = check.value ?? null;
  }
  const linesCheck = body.lines !== undefined ? parseLines(db, body.lines) : null;
  if (linesCheck && !linesCheck.ok) return propagate<Record<string, any>>(linesCheck);
  const replacement = linesCheck ? (linesCheck.value as OrderLineInput[]) : null;

  const now = new Date().toISOString();
  patch.updated_at = now;
  patch.updated_by = actor.id;
  const before = db.get<Record<string, any>>('SELECT * FROM purchase_orders WHERE id=?', current.id);
  const beforeLines = db.all<any>('SELECT product_id,variant_id,quantity_ordered,unit_cost FROM purchase_order_lines WHERE purchase_order_id=?', current.id);
  withSavepoint(db, 'po_update', () => {
    const columns = Object.keys(patch);
    db.run(`UPDATE purchase_orders SET ${columns.map((column) => `${column}=?`).join(', ')} WHERE id=?`,
      ...columns.map((column) => patch[column]), current.id);
    if (replacement) {
      db.run('DELETE FROM purchase_order_lines WHERE purchase_order_id=?', current.id);
      insertLines(db, current.id, replacement, now);
    }
  });
  auditPurchasing(db, {
    actor, action: 'UPDATE', resourceType: 'purchase_order', resourceId: current.id,
    before, after: { ...(db.get<Record<string, any>>('SELECT * FROM purchase_orders WHERE id=?', current.id) ?? {}) },
    note: replacement ? { lines_replaced: replacement.length, lines_before: beforeLines.length } : null,
    context: purchasingContext(db, req),
  });
  return getOrder(db, current.id);
}

/** Table de ce qui est permis, sinon la raison du refus : aucune transition « par confiance ». */
const TRANSITIONS: Record<string, { from: PurchaseOrderStatus[]; to: PurchaseOrderStatus; verb: 'SUBMIT' | 'APPROVE' | 'REJECT' | 'CANCEL' }> = {
  submit: { from: ['DRAFT'], to: 'SUBMITTED', verb: 'SUBMIT' },
  approve: { from: ['SUBMITTED'], to: 'APPROVED', verb: 'APPROVE' },
  reject: { from: ['SUBMITTED'], to: 'DRAFT', verb: 'REJECT' },
  cancel: { from: ['DRAFT', 'SUBMITTED', 'APPROVED'], to: 'CANCELLED', verb: 'CANCEL' },
};

function runTransition(
  db: QatafoDatabase,
  id: string,
  verb: keyof typeof TRANSITIONS,
  actor: PurchasingActor,
  extra: Record<string, unknown> = {},
  req?: any,
  reason?: string | null,
): Result<Record<string, any>> {
  const rule = TRANSITIONS[verb];
  const current = db.get<Record<string, any>>('SELECT * FROM purchase_orders WHERE id=?', String(id ?? '').trim());
  if (!current) return { ok: false, code: PURCHASING_ERRORS.ORDER_NOT_FOUND, message: 'Commande d’achat introuvable.' };
  if (!rule.from.includes(current.status as PurchaseOrderStatus)) {
    const decided = ['APPROVED', 'CANCELLED', 'PARTIALLY_RECEIVED', 'RECEIVED'].includes(String(current.status));
    const message = verb === 'approve'
      ? decided
        ? `Cette commande a déjà été decidée (${String(current.status)}) : la décision n’est pas rejouable.`
        : `Une commande doit être soumise avant d’être approuvée (statut actuel : ${String(current.status)}).`
      : `Transition « ${verb} » impossible depuis ${String(current.status)}.`;
    return { ok: false, code: decided && verb === 'approve' ? PURCHASING_ERRORS.ALREADY_DECIDED : PURCHASING_ERRORS.CONFLICT, message };
  }
  const lineCount = Number(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM purchase_order_lines WHERE purchase_order_id=?', current.id)?.n ?? 0);
  if (lineCount === 0) {
    return { ok: false, code: PURCHASING_ERRORS.EMPTY_LINES, message: 'Aucune ligne : il n’y a rien à engager auprès du fournisseur.' };
  }
  if (verb === 'cancel') {
    const posted = Number(db.get<{ n: number }>(
      `SELECT COUNT(*) AS n FROM goods_receipts WHERE purchase_order_id=? AND status='POSTED'`, current.id)?.n ?? 0);
    if (posted > 0) {
      return { ok: false, code: PURCHASING_ERRORS.CONFLICT, message: `Annulation refusée : ${posted} réception(s) sont déjà affichées en stock. Un écart se corrige par un mouvement côté stock, pas en effaçant la commande.` };
    }
  }
  // Le motif du refus d'approbation écrit `rejection_reason` : il n'écrase jamais `note`, qui
  // reste la note d'intention saisie par l'acheteur (vérifié par test).
  if (verb === 'approve') {
    const arrival = String(current.arrival_id ?? '');
    if (arrival && !db.get<{ id: string }>('SELECT id FROM crm_arrivals WHERE id=?', arrival)) {
      return { ok: false, code: PURCHASING_ERRORS.ARRIVAL_NOT_FOUND, message: 'L’arrivage CRM lié n’existe plus : détachez-le avant d’approuver.' };
    }
  }
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status: rule.to, updated_at: now, updated_by: actor.id, ...extra };
  const columns = Object.keys(patch);
  withSavepoint(db, `po_${verb}`, () => {
    db.run(`UPDATE purchase_orders SET ${columns.map((column) => `${column}=?`).join(', ')} WHERE id=?`,
      ...columns.map((column) => patch[column]), current.id);
  });
  auditPurchasingTransition(db, {
    actor, transition: rule.verb, resourceType: 'purchase_order', resourceId: current.id,
    before: { status: current.status }, after: { status: rule.to }, reason: reason ?? null,
    context: purchasingContext(db, req),
  });
  return getOrder(db, current.id);
}

/** Soumission : la commande part chez le fournisseur et se congèle. */
export function submitOrder(db: QatafoDatabase, id: string, actor: PurchasingActor, req?: any): Result<Record<string, any>> {
  const now = new Date().toISOString();
  return runTransition(db, id, 'submit', actor, { requested_by: actor.id, requested_at: now }, req);
}

/** Approbation : droit `approve`, distinct de `write` — qui engage n'est pas qui reçoit. */
export function approveOrder(db: QatafoDatabase, id: string, actor: PurchasingActor, req?: any): Result<Record<string, any>> {
  const now = new Date().toISOString();
  return runTransition(db, id, 'approve', actor, { approved_by: actor.id, approved_at: now }, req);
}

/** Refus en revue : retour en brouillon, motif écrit et visible. */
export function rejectOrder(db: QatafoDatabase, id: string, reason: string, actor: PurchasingActor, req?: any): Result<Record<string, any>> {
  const check = textField(reason, 'reason', 500);
  if (!check.ok) return propagate<Record<string, any>>(check);
  const text = String(check.value ?? '').trim();
  if (!text) return invalid('Un refus d’approbation s’écrit : sans motif, la commande revient sans direction.', [{ field: 'reason', reason: 'REQUIRED' }]);
  return runTransition(db, id, 'reject', actor, { rejection_reason: text }, req, text);
}

export function cancelOrder(db: QatafoDatabase, id: string, reason: string, actor: PurchasingActor, req?: any): Result<Record<string, any>> {
  const check = textField(reason, 'reason', 500);
  if (!check.ok) return propagate<Record<string, any>>(check);
  const now = new Date().toISOString();
  const text = String(check.value ?? '').trim() || 'Annulation simple';
  return runTransition(db, id, 'cancel', actor, { cancelled_by: actor.id, cancelled_at: now, cancellation_reason: text }, req, text);
}

/**
 * Les lignes ne s'écrivent pas par une route séparée : la commande et ses lignes forment un
 * seul engagement. La note est là pour que la phrase soit trouvable dans le code plutôt que
 * devinée par un futur appelant.
 */
export const ORDER_LINES_ARE_EDITED_WITH_THE_ORDER =
  'Les lignes d’une commande se modifient avec la commande (PUT /orders/:id), jamais ligne à ligne : une quantité et un coût séparés n’engagent personne.';
