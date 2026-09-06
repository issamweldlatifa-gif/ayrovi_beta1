/**
 * AYROVI Purchasing (P2.3) — réceptions de marchandise.
 *
 * **Ce fichier est le seul endroit du module qui fait bouger une quantité**, et il ne le fait
 * pas à sa façon : il appelle `recordMovement` du module Stock (P2.2), qui est l'unique écriture
 * des quantités dans tout le back-office. Aucun `UPDATE inventory_*` ici — la règle est tenue par
 * un test qui lit le texte source de ce module.
 *
 * Quatre règles métier :
 *  • réception **partielle** normale : un bon ne couvre qu'une partie de la commande ;
 *  • **sur-réception refusée** : on ne reçoit pas plus que ce qui est engagé (la borne est
 *  calculée depuis les bons déjà POSTÉS, jamais depuis une colonne « reçus ») ;
 *  • qualité : `GOOD` entre en stock ; `DAMAGED` entre **puis sort** (deux mouvements — ce qui
 *  est physiquement arrivé doit apparaître dans le journal) ; `REJECTED` n'entre pas (refusé au
 *  quai) et ne compte pas comme reçu, donc la ligne reste à re-réceptionner ;
 *  • un bon `POSTED` est **immuable** : une erreur se corrige par un mouvement ADJUST côté stock.
 *
 * Le bon (DRAFT) est un brouillon papier : rien ne bouge avant l'affichage. Tout l'affichage
 * tient dans un `withSavepoint`, donc un refus en plein milieu laisse le stock intact.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { nextSequenceNumber } from '../erp-core/sequences';
import { withSavepoint } from '../db/savepoint';
import { createStockItem, recordMovement } from '../inventory/stock';
import { auditPurchasing, auditPurchasingTransition, purchasingContext, type PurchasingActor } from './audit';
import { MAX_LINES_PER_ORDER, PURCHASING_ERRORS, RECEIPT_QUALITIES, type ReceiptQuality } from './types';
import { invalid, isIdentifier, lineQuantityField, paginationOf, propagate, qualityField, receiptLocationField, sortOf, textField } from './validation';
import type { Result } from './orders';

const RECEIPT_SELECT = `
  SELECT r.id, r.receipt_number, r.purchase_order_id, r.arrival_id, r.status, r.location, r.note,
         r.received_at, r.posted_at, r.posted_by, r.discard_reason, r.created_at, r.updated_at,
         po.po_number, po.currency, po.exchange_rate, po.status AS order_status,
         s.name AS supplier_name, s.code AS supplier_code,
         a.name AS arrival_name,
         (SELECT COALESCE(SUM(rl.quantity), 0) FROM goods_receipt_lines rl WHERE rl.receipt_id = r.id) AS units,
         (SELECT COALESCE(SUM(rl.quantity * l.unit_cost), 0)
            FROM goods_receipt_lines rl JOIN purchase_order_lines l ON l.id = rl.purchase_order_line_id
           WHERE rl.receipt_id = r.id) AS cost
  FROM goods_receipts r
  JOIN purchase_orders po ON po.id = r.purchase_order_id
  JOIN suppliers s ON s.id = po.supplier_id
  LEFT JOIN crm_arrivals a ON a.id = r.arrival_id`;

const RECEIPT_SORTS = ['receipt_number', 'status', 'created_at', 'po_number', 'supplier_name'] as const;
const RECEIPT_SORT_EXPRESSIONS: Record<string, string> = {
  receipt_number: 'r.receipt_number', status: 'r.status', created_at: 'r.created_at',
  po_number: 'po.po_number', supplier_name: 's.name',
};

export function listReceipts(db: QatafoDatabase, query: Record<string, unknown> = {}): Result<{ items: any[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize } = paginationOf(query as any);
  const { key: sortKey, direction } = sortOf(query as any, RECEIPT_SORTS, 'r.created_at');
  const search = String(query.search ?? '').trim().slice(0, 200);
  const status = String(query.status ?? '').trim().toUpperCase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (search) {
    where.push('(r.receipt_number LIKE ? OR po.po_number LIKE ? OR s.name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (status) {
    if (!['DRAFT', 'POSTED', 'DISCARDED'].includes(status)) {
      return { ok: false, code: PURCHASING_ERRORS.VALIDATION, message: '« status » de réception inconnu : DRAFT, POSTED ou DISCARDED.', details: [{ field: 'status', reason: 'ENUM' }] };
    }
    where.push('r.status = ?');
    params.push(status);
  }
  if (isIdentifier(String(query.purchase_order_id ?? ''))) { where.push('r.purchase_order_id = ?'); params.push(String(query.purchase_order_id).trim()); }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM goods_receipts r JOIN purchase_orders po ON po.id = r.purchase_order_id JOIN suppliers s ON s.id = po.supplier_id${clause}`,
    ...params)?.n ?? 0);
  const order = (sortKey && RECEIPT_SORT_EXPRESSIONS[sortKey]) || 'r.created_at';
  const directionSql = sortKey ? direction : 'DESC';
  const items = db.all<any>(`${RECEIPT_SELECT}${clause} ORDER BY ${order} ${directionSql} LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize);
  return { ok: true, value: { items, total, page, pageSize } };
}

export function getReceipt(db: QatafoDatabase, id: string): Result<Record<string, any>> {
  const trimmed = String(id ?? '').trim();
  if (!isIdentifier(trimmed)) return { ok: false, code: PURCHASING_ERRORS.NOT_FOUND, message: 'Identifiant de réception invalide.' };
  const row = db.all<any>(`${RECEIPT_SELECT} WHERE r.id = ?`, trimmed)[0];
  if (!row) return { ok: false, code: PURCHASING_ERRORS.RECEIPT_NOT_FOUND, message: 'Réception introuvable.' };
  const lines = db.all<any>(`
    SELECT rl.id, rl.purchase_order_line_id, rl.product_id, rl.quantity, rl.quality, rl.quality_note, rl.created_at,
           l.quantity_ordered, l.unit_cost, l.variant_id,
           p.name AS product_name, p.product_code AS product_code, v.sku AS sku
    FROM goods_receipt_lines rl
    JOIN purchase_order_lines l ON l.id = rl.purchase_order_line_id
    LEFT JOIN products p ON p.id = rl.product_id
    LEFT JOIN catalogue_variants v ON v.id = l.variant_id
    WHERE rl.receipt_id = ? ORDER BY rl.created_at ASC, rl.rowid ASC`, trimmed)
    .map((line) => ({ ...line, line_cost: Math.round(Number(line.quantity) * Number(line.unit_cost) * 100) / 100 }));
  // Les mouvements ne sont pas copiés ici : ils se relisent dans le journal du stock, par référence.
  const movements = db.all<any>(`
    SELECT id, item_id, direction, quantity, signed_quantity, balance_before, balance_after, reason, note, location, created_at
    FROM inventory_stock_movements WHERE reference_type='goods_receipt' AND reference_id=? ORDER BY created_at ASC, rowid ASC`, trimmed);
  return { ok: true, value: { ...row, lines, movements } };
}

/**
 * Ce qu'il reste à recevoir par ligne de commande, calculé depuis les bons POSTÉS uniquement.
 * `excludeReceiptId` retire le brouillon en cours de son propre cumul : un brouillon ne consomme
 * rien, sinon deux onglets ouverts se bloqueraient l'un l'autre.
 */
function openQuantities(db: QatafoDatabase, orderId: string, excludeReceiptId: string | null) {
  const rows = db.all<{ id: string; product_id: string; variant_id: string | null; quantity_ordered: number; received: number }>(`
    SELECT l.id, l.product_id, l.variant_id, l.quantity_ordered,
           (SELECT COALESCE(SUM(rl.quantity), 0) FROM goods_receipt_lines rl
              JOIN goods_receipts r ON r.id = rl.receipt_id AND r.status = 'POSTED'
             WHERE rl.purchase_order_line_id = l.id AND rl.quality IN ('GOOD','DAMAGED')
               AND (? IS NULL OR r.id <> ?)) AS received
    FROM purchase_order_lines l WHERE l.purchase_order_id = ?`, excludeReceiptId, excludeReceiptId, orderId);
  const byId = new Map<string, { product_id: string; variant_id: string | null; remaining: number }>();
  for (const row of rows) {
    byId.set(row.id, {
      product_id: row.product_id, variant_id: row.variant_id ?? null,
      remaining: Math.max(0, Number(row.quantity_ordered) - Number(row.received)),
    });
  }
  return byId;
}

interface ReceiptLineInput {
  purchase_order_line_id: string;
  product_id: string;
  variant_id: string | null;
  quantity: number;
  quality: ReceiptQuality;
  quality_note: string;
}

/** Lignes du bon validées contre ce qui reste réellement à recevoir (la sur-réception se refuse ici). */
function parseReceiptLines(db: QatafoDatabase, orderId: string, raw: unknown, excludeReceiptId: string | null): Result<ReceiptLineInput[]> {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, code: PURCHASING_ERRORS.EMPTY_LINES, message: 'Une réception sans ligne ne réceptionne rien : ajoutez au moins une ligne de commande.', details: [{ field: 'lines', reason: 'REQUIRED' }] };
  }
  if (raw.length > MAX_LINES_PER_ORDER) {
    return { ok: false, code: PURCHASING_ERRORS.VALIDATION, message: `« lines » dépasse ${MAX_LINES_PER_ORDER} lignes sur un seul bon.`, details: [{ field: 'lines', reason: 'RANGE' }] };
  }
  const open = openQuantities(db, orderId, excludeReceiptId);
  if (!open.size) {
    return { ok: false, code: PURCHASING_ERRORS.NOTHING_TO_RECEIVE, message: 'Cette commande n’a plus rien à réceptionner : toutes les lignes sont complètes.' };
  }
  const claimed = new Map<string, number>();
  const lines: ReceiptLineInput[] = [];
  for (let index = 0; index < raw.length; index += 1) {
    const body = (raw[index] ?? {}) as Record<string, any>;
    const field = `lines[${index}]`;
    const lineId = String(body.purchase_order_line_id ?? '').trim();
    const openLine = open.get(lineId);
    if (!openLine) {
      return { ok: false, code: PURCHASING_ERRORS.LINE_NOT_FOUND, message: `« ${field}.purchase_order_line_id » n’appartient pas à cette commande ou est déjà complète.`, details: [{ field: `${field}.purchase_order_line_id`, reason: 'FK' }] };
    }
    const quantityCheck = lineQuantityField(body.quantity, `${field}.quantity`);
    if (!quantityCheck.ok) return propagate<ReceiptLineInput[]>(quantityCheck);
    const qualityCheck = qualityField(body.quality, `${field}.quality`);
    if (!qualityCheck.ok) return propagate<ReceiptLineInput[]>(qualityCheck);
    const quality = qualityCheck.value as ReceiptQuality;
    const noteCheck = textField(body.quality_note, `${field}.quality_note`, 500);
    if (!noteCheck.ok) return propagate<ReceiptLineInput[]>(noteCheck);
    const quantity = Number(quantityCheck.value);
    // La sur-réception se refuse sur la somme du bon, pas ligne à ligne : deux lignes du même
    // produit dans un même bon ne doivent pas ouvrir la porte à un dépassement.
    const already = claimed.get(lineId) ?? 0;
    const counted = quality === 'REJECTED' ? 0 : quantity;
    if (already + counted > openLine.remaining) {
      return {
        ok: false, code: PURCHASING_ERRORS.OVER_RECEIPT,
        message: `Sur-réception refusée : ${openLine.remaining} pièce(s) reste(nt) à recevoir sur cette ligne, le bon en déclare ${already + counted}.`
          + (openLine.remaining === 0 ? ' La ligne est déjà complète.' : ''),
        details: [{ field, reason: 'OVER_RECEIPT' }],
      };
    }
    claimed.set(lineId, already + counted);
    lines.push({
      purchase_order_line_id: lineId, product_id: openLine.product_id, variant_id: openLine.variant_id,
      quantity, quality, quality_note: String(noteCheck.value ?? ''),
    });
  }
  return { ok: true, value: lines };
}

function insertReceiptLines(db: QatafoDatabase, receiptId: string, lines: ReceiptLineInput[], now: string): void {
  for (const line of lines) {
    db.run(`INSERT INTO goods_receipt_lines (id,receipt_id,purchase_order_line_id,product_id,quantity,quality,quality_note,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?)`, `grl_${randomUUID()}`, receiptId, line.purchase_order_line_id, line.product_id,
      line.quantity, line.quality, line.quality_note, now, now);
  }
}

/** Brouillon de réception : le bon se prépare à quai, rien n'entre en stock avant l'affichage. */
export function createReceipt(db: QatafoDatabase, orderId: string, body: Record<string, any> = {}, actor: PurchasingActor, req?: any): Result<Record<string, any>> {
  const order = db.get<Record<string, any>>('SELECT * FROM purchase_orders WHERE id=?', String(orderId ?? '').trim());
  if (!order) return { ok: false, code: PURCHASING_ERRORS.ORDER_NOT_FOUND, message: 'Commande d’achat introuvable.' };
  if (order.status !== 'APPROVED' && order.status !== 'PARTIALLY_RECEIVED') {
    return { ok: false, code: PURCHASING_ERRORS.NOT_APPROVED, message: `Réception impossible sur une commande ${String(order.status)} : le magasin ne reçoit que ce qui a été approuvé.`, details: [{ field: 'status', reason: 'APPROVAL' }] };
  }
  const location = receiptLocationField(body.location);
  if (!location.ok) return propagate<Record<string, any>>(location);
  const note = textField(body.note, 'note', 1000);
  if (!note.ok) return propagate<Record<string, any>>(note);
  const linesCheck = parseReceiptLines(db, order.id, body.lines, null);
  if (!linesCheck.ok) return propagate<Record<string, any>>(linesCheck);
  let arrivalId: string | null = null;
  if (body.arrival_id !== undefined && body.arrival_id !== null && String(body.arrival_id).trim() !== '') {
    const raw = String(body.arrival_id).trim();
    if (!isIdentifier(raw)) return invalid('« arrival_id » est un identifiant invalide.', [{ field: 'arrival_id', reason: 'FORMAT' }]);
    const arrival = db.get<{ id: string }>('SELECT id FROM crm_arrivals WHERE id=?', raw);
    if (!arrival) return { ok: false, code: PURCHASING_ERRORS.ARRIVAL_NOT_FOUND, message: 'Arrivage introuvable côté CRM.', details: [{ field: 'arrival_id', reason: 'FK' }] };
    arrivalId = arrival.id;
  }

  const lines = linesCheck.value as ReceiptLineInput[];
  const now = new Date().toISOString();
  const id = `rcpt_${randomUUID()}`;
  const receiptNumber = nextSequenceNumber(db, 'goods_receipt_number');
  withSavepoint(db, 'rcpt_create', () => {
    db.run(`INSERT INTO goods_receipts (id,receipt_number,purchase_order_id,arrival_id,status,location,note,received_at,created_at,updated_at,created_by,updated_by)
      VALUES (?,?,?,?,'DRAFT',?,?,?,?,?,?,?)`,
      id, receiptNumber, order.id, arrivalId ?? order.arrival_id ?? null, String(location.value), String(note.value ?? ''),
      body.received_at ? String(body.received_at).slice(0, 40) : now, now, now, actor.id, actor.id);
    insertReceiptLines(db, id, lines, now);
  });
  auditPurchasing(db, {
    actor, action: 'CREATE', resourceType: 'goods_receipt', resourceId: id,
    before: null,
    after: { receipt_number: receiptNumber, purchase_order_id: order.id, location: location.value, note: note.value, lines: lines.length, units: lines.reduce((sum, line) => sum + (line.quality === 'REJECTED' ? 0 : line.quantity), 0) },
    context: purchasingContext(db, req),
  });
  return getReceipt(db, id);
}

/** Édition d'un brouillon uniquement (remplacement des lignes). */
export function updateReceipt(db: QatafoDatabase, id: string, body: Record<string, any> = {}, actor: PurchasingActor, req?: any): Result<Record<string, any>> {
  const current = db.get<Record<string, any>>('SELECT * FROM goods_receipts WHERE id=?', String(id ?? '').trim());
  if (!current) return { ok: false, code: PURCHASING_ERRORS.RECEIPT_NOT_FOUND, message: 'Réception introuvable.' };
  if (current.status !== 'DRAFT') {
    return { ok: false, code: PURCHASING_ERRORS.IMMUTABLE, message: RECEIPT_IMMUTABLE_MESSAGE };
  }
  const patch: Record<string, unknown> = {};
  if (body.location !== undefined) {
    const check = receiptLocationField(body.location);
    if (!check.ok) return propagate<Record<string, any>>(check);
    patch.location = check.value;
  }
  if (body.note !== undefined) {
    const check = textField(body.note, 'note', 1000);
    if (!check.ok) return propagate<Record<string, any>>(check);
    patch.note = check.value;
  }
  const linesCheck = body.lines !== undefined ? parseReceiptLines(db, current.purchase_order_id, body.lines, current.id) : null;
  if (linesCheck && !linesCheck.ok) return propagate<Record<string, any>>(linesCheck);
  const replacement = linesCheck ? (linesCheck.value as ReceiptLineInput[]) : null;

  const now = new Date().toISOString();
  patch.updated_at = now;
  patch.updated_by = actor.id;
  const columns = Object.keys(patch);
  withSavepoint(db, 'rcpt_update', () => {
    db.run(`UPDATE goods_receipts SET ${columns.map((column) => `${column}=?`).join(', ')} WHERE id=?`,
      ...columns.map((column) => patch[column]), current.id);
    if (replacement) {
      db.run('DELETE FROM goods_receipt_lines WHERE receipt_id=?', current.id);
      insertReceiptLines(db, current.id, replacement, now);
    }
  });
  auditPurchasing(db, {
    actor, action: 'UPDATE', resourceType: 'goods_receipt', resourceId: current.id,
    before: current, after: db.get<Record<string, any>>('SELECT * FROM goods_receipts WHERE id=?', current.id),
    note: replacement ? { lines_replaced: replacement.length } : null,
    context: purchasingContext(db, req),
  });
  return getReceipt(db, current.id);
}

/** Une anomalie d'affichage annule le point de sauvegarde : on ne garde jamais moitié d'un bon. */
class ReceiptAbort extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'ReceiptAbort'; }
}

/**
 * Affichage du bon : la seule écriture de quantité du module achats.
 *
 * Chaque ligne produit un mouvement `IN` (raison `RECEPTION`, référence `goods_receipt`), plus un
 * mouvement `OUT` (raison `DAMAGE`) pour une ligne marquée endommagée. La ligne de stock est ouverte
 * à zéro par `createStockItem` si elle n'existe pas encore — c'est le stock qui décide d'ouvrir une
 * ligne, jamais ce module qui écrit une quantité.
 */
export function postReceipt(db: QatafoDatabase, id: string, actor: PurchasingActor, req?: any): Result<Record<string, any>> {
  const current = db.get<Record<string, any>>('SELECT * FROM goods_receipts WHERE id=?', String(id ?? '').trim());
  if (!current) return { ok: false, code: PURCHASING_ERRORS.RECEIPT_NOT_FOUND, message: 'Réception introuvable.' };
  if (current.status === 'POSTED') return { ok: false, code: PURCHASING_ERRORS.IMMUTABLE, message: RECEIPT_IMMUTABLE_MESSAGE };
  if (current.status !== 'DRAFT') {
    return { ok: false, code: PURCHASING_ERRORS.CONFLICT, message: `Une réception ${String(current.status)} n’est pas affichable : recréez un bon en brouillon.` };
  }
  const order = db.get<Record<string, any>>('SELECT * FROM purchase_orders WHERE id=?', current.purchase_order_id);
  if (!order) return { ok: false, code: PURCHASING_ERRORS.ORDER_NOT_FOUND, message: 'La commande liée de la réception a disparu : anomalie à corriger en base, pas en écrasant le bon.' };
  if (order.status !== 'APPROVED' && order.status !== 'PARTIALLY_RECEIVED') {
    return { ok: false, code: PURCHASING_ERRORS.NOT_APPROVED, message: `Affichage refusé : la commande est ${String(order.status)}.` };
  }
  const lines = db.all<Record<string, any>>('SELECT * FROM goods_receipt_lines WHERE receipt_id=? ORDER BY created_at ASC, rowid ASC', current.id);
  if (!lines.length) return { ok: false, code: PURCHASING_ERRORS.EMPTY_LINES, message: 'Bon sans ligne : il n’y a rien à afficher en stock.' };
  // Re-validation à l'affichage : un autre bon a pu être posté entre le brouillon et maintenant.
  const linesCheck = parseReceiptLines(db, order.id, lines.map((line) => ({
    purchase_order_line_id: line.purchase_order_line_id, quantity: line.quantity,
    quality: line.quality, quality_note: line.quality_note,
  })), current.id);
  if (!linesCheck.ok) return propagate<Record<string, any>>(linesCheck);
  const prepared = linesCheck.value as ReceiptLineInput[];

  const context = purchasingContext(db, req);
  const inventoryActor = { id: actor.id ?? null, name: actor.name ?? null, ipAddress: actor.ipAddress ?? null };
  const now = new Date().toISOString();
  const movementIds: string[] = [];
  let postedUnits = 0;
  let orderComplete = false;
  try {
    withSavepoint(db, 'rcpt_post', () => {
      for (const line of prepared) {
        const movementBase = {
          actor: inventoryActor, employeeId: null as string | null, context,
          productId: line.product_id, variantId: line.variant_id, location: String(current.location || 'MAIN').toUpperCase(),
          referenceType: 'goods_receipt', referenceId: current.id,
          idempotencyKey: `rcpt:${current.id}:${line.purchase_order_line_id}:${line.quality}`,
        };
        if (line.quality === 'REJECTED') {
          // Refusé au quai : rien n'entre, donc rien n'est mouvementé. La ligne reste à re-réceptionner.
          continue;
        }
        // Le stock ne s'ouvre pas tout seul, et surtout on ne sonde pas `recordMovement` avec une
        // quantité de test : un mouvement de 0 encrasserait le journal append-only. On LIT la ligne
        // (lire le stock est permis), et si elle manque c'est le module Stock qui l'ouvre, à zéro.
        const item = db.get<{ id: string }>(
          `SELECT id FROM inventory_stock_items WHERE product_id=? AND COALESCE(variant_id,'')=? AND location=?`,
          line.product_id, line.variant_id ?? '', movementBase.location);
        if (!item) {
          const opened = createStockItem(db, {
            productId: line.product_id, variantId: line.variant_id, location: movementBase.location,
            quantity: 0, reorderPoint: 0, actor: inventoryActor, context,
          });
          if (!opened.ok && opened.code !== 'INVENTORY_DUPLICATE_ITEM') {
            throw new ReceiptAbort(PURCHASING_ERRORS.CONFLICT, `Ligne de stock non ouverte pour le produit ${line.product_id} : ${opened.message ?? 'refus du module Stock'}`);
          }
        }
        const moved = recordMovement(db, {
          ...movementBase, direction: 'IN', quantity: line.quantity, reason: 'RECEPTION',
          note: `Réception ${String(current.receipt_number)} sur commande ${String(order.po_number)}`,
        });
        if (!moved.ok) throw new ReceiptAbort(moved.code ?? PURCHASING_ERRORS.CONFLICT, moved.message ?? 'Mouvement d’entrée refusé.');
        movementIds.push(String(moved.value?.id ?? ''));
        postedUnits += line.quantity;
        if (line.quality === 'DAMAGED') {
          const out = recordMovement(db, {
            ...movementBase, idempotencyKey: `${movementBase.idempotencyKey}:out`, direction: 'OUT', quantity: line.quantity,
            reason: 'DAMAGE', note: `Endommagé à la réception ${String(current.receipt_number)} — sorti du stock disponible`,
          });
          if (!out.ok) throw new ReceiptAbort(out.code ?? PURCHASING_ERRORS.CONFLICT, out.message ?? 'Sortie du dommage refusée.');
          movementIds.push(String(out.value?.id ?? ''));
        }
      }
      const remaining = db.all<{ id: string; quantity_ordered: number; received: number }>(`
        SELECT l.id, l.quantity_ordered,
               (SELECT COALESCE(SUM(rl.quantity), 0) FROM goods_receipt_lines rl
                  JOIN goods_receipts r ON r.id = rl.receipt_id AND r.status = 'POSTED'
                 WHERE rl.purchase_order_line_id = l.id AND rl.quality IN ('GOOD','DAMAGED')) AS received
        FROM purchase_order_lines l WHERE l.purchase_order_id = ?`, order.id);
      orderComplete = remaining.every((row) => Number(row.received) >= Number(row.quantity_ordered));
      db.run('UPDATE purchase_orders SET status=?, updated_at=?, updated_by=? WHERE id=?',
        orderComplete ? 'RECEIVED' : 'PARTIALLY_RECEIVED', now, actor.id, order.id);
      db.run('UPDATE goods_receipts SET status=?, posted_at=?, posted_by=?, updated_at=?, updated_by=? WHERE id=?',
        'POSTED', now, actor.id, now, actor.id, current.id);
    });
  } catch (error) {
    if (error instanceof ReceiptAbort) return { ok: false, code: error.code, message: error.message };
    throw error;
  }
  auditPurchasingTransition(db, {
    actor, transition: 'POST', resourceType: 'goods_receipt', resourceId: current.id,
    before: { status: current.status },
    after: { status: 'POSTED', units: postedUnits, movements: movementIds.length, order_status: orderComplete ? 'RECEIVED' : 'PARTIALLY_RECEIVED' },
    context,
  });
  return getReceipt(db, current.id);
}

/** Le brouillon qui ne sera jamais affiché se jette à la corbeille *marquée*, pas supprimée. */
export function discardReceipt(db: QatafoDatabase, id: string, reason: string, actor: PurchasingActor, req?: any): Result<Record<string, any>> {
  const current = db.get<Record<string, any>>('SELECT * FROM goods_receipts WHERE id=?', String(id ?? '').trim());
  if (!current) return { ok: false, code: PURCHASING_ERRORS.RECEIPT_NOT_FOUND, message: 'Réception introuvable.' };
  if (current.status === 'POSTED') return { ok: false, code: PURCHASING_ERRORS.IMMUTABLE, message: RECEIPT_IMMUTABLE_MESSAGE };
  if (current.status === 'DISCARDED') return { ok: false, code: PURCHASING_ERRORS.ALREADY_DECIDED, message: 'Cette réception est déjà écartée : la décision n’est pas rejouable.' };
  const check = textField(reason, 'reason', 500);
  if (!check.ok) return propagate<Record<string, any>>(check);
  const now = new Date().toISOString();
  const text = String(check.value ?? '').trim() || 'Bon écarté sans motif écrit';
  db.run('UPDATE goods_receipts SET status=?, discard_reason=?, updated_at=?, updated_by=? WHERE id=?',
    'DISCARDED', text, now, actor.id, current.id);
  auditPurchasingTransition(db, {
    actor, transition: 'DISCARD', resourceType: 'goods_receipt', resourceId: current.id,
    before: { status: current.status }, after: { status: 'DISCARDED' }, reason: text,
    context: purchasingContext(db, req),
  });
  return getReceipt(db, current.id);
}

export const RECEIPT_IMMUTABLE_MESSAGE =
  'Une réception affichée est immuable : le stock a bougé par des mouvements eux-mêmes append-only. Corrigez l’écart par un mouvement ADJUST côté stock, jamais en réécrivant le bon.';

/** Un bon ne se supprime pas : il se jette en brouillon ou se corrige par un mouvement. */
export function refuseReceiptDeletion(db: QatafoDatabase, id: string): Result<never> {
  const receipt = db.get<Record<string, any>>('SELECT * FROM goods_receipts WHERE id=?', String(id ?? '').trim());
  if (!receipt) return { ok: false, code: PURCHASING_ERRORS.RECEIPT_NOT_FOUND, message: 'Réception introuvable.' };
  return {
    ok: false, code: receipt.status === 'POSTED' ? PURCHASING_ERRORS.IMMUTABLE : PURCHASING_ERRORS.CONFLICT,
    message: receipt.status === 'POSTED' ? RECEIPT_IMMUTABLE_MESSAGE
      : 'Un brouillon de réception ne se supprime pas : écartez-le (POST /receipts/:id/discard), le motif reste lisible.',
  };
}

/** Bornes et vocabulaire exportés pour le `/meta` du module et pour le client. */
export const RECEIPT_META = {
  qualities: RECEIPT_QUALITIES,
  statuses: ['DRAFT', 'POSTED', 'DISCARDED'] as const,
  maxLines: MAX_LINES_PER_ORDER,
};
