/**
 * AYROVI Purchasing (P2.3) — fournisseurs.
 *
 * Un fournisseur est une fiche d'engagement, pas une étiquette : devise de paiement, délai,
 * conditions et statut portent le coût et la planification des commandes. Trois règles
 * tiennent ici :
 *  • le nom est unique à la casse près (deux fiches pour un seul interlocuteur = deux historiques) ;
 *  • le `code` est réservé par `erp_sequences` et ne se modifie jamais ;
 *  • on ne supprime pas un fournisseur : il est lié à des commandes déjà engagées. Il devient
 *  `INACTIVE`, reste consultable, et cesse d'être proposé à la sélection.
 *
 * Les totaux visibles (`orders_count`, `received_cost`) sont des lectures agrégées, jamais des
 * colonnes qu'une écriture devrait entretenir.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { nextSequenceNumber } from '../erp-core/sequences';
import { auditPurchasing, type PurchasingActor, purchasingContext } from './audit';
import { PURCHASING_ERRORS, type SupplierStatus } from './types';
import {
  currencyField, invalid, isIdentifier, leadTimeField, paginationOf, propagate, sortOf,
  supplierStatusField, textField,
} from './validation';

export interface PurchasingResult<T> {
  ok: boolean;
  value?: T;
  code?: string;
  message?: string;
  /** Champs en cause, renvoyés tels quels au client : un refus doit dire quoi corriger. */
  details?: { field: string; reason: string }[];
}
type Result<T> = PurchasingResult<T>;

/** Montants : deux décimales à l'affichage, la valeur brute reste en base. */
export function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

const SUPPLIER_COLUMNS = `s.id, s.code, s.name, s.contact_name, s.phone, s.email, s.address, s.currency,
         s.payment_terms, s.lead_time_days, s.status, s.notes, s.created_at, s.updated_at,`

/** Agrégats lus sur les tables du module : aucune colonne ne les recopie. */
const SUPPLIER_AGGREGATES = `
         (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id) AS orders_count,
         (SELECT COUNT(*) FROM purchase_orders po WHERE po.supplier_id = s.id
            AND po.status IN ('DRAFT','SUBMITTED','APPROVED','PARTIALLY_RECEIVED')) AS orders_open,
         (SELECT COALESCE(SUM(rl.quantity * l.unit_cost), 0)
            FROM goods_receipt_lines rl
            JOIN goods_receipts r ON r.id = rl.receipt_id AND r.status = 'POSTED'
            JOIN purchase_order_lines l ON l.id = rl.purchase_order_line_id
            JOIN purchase_orders po ON po.id = l.purchase_order_id
           WHERE po.supplier_id = s.id) AS received_cost`;

const SUPPLIER_SELECT = `SELECT ${SUPPLIER_COLUMNS}${SUPPLIER_AGGREGATES} FROM suppliers s`;

const SUPPLIER_SORTS = ['name', 'code', 'lead_time_days', 'orders_count', 'updated_at'] as const;
const SORT_EXPRESSIONS: Record<string, string> = {
  name: 's.name', code: 's.code', lead_time_days: 's.lead_time_days',
  orders_count: 'orders_count', updated_at: 's.updated_at',
};

export function listSuppliers(db: QatafoDatabase, query: Record<string, unknown> = {}): Result<{ items: any[]; total: number; page: number; pageSize: number }> {
  const { page, pageSize } = paginationOf(query as any);
  const { key: sortKey, direction } = sortOf(query as any, SUPPLIER_SORTS, 's.name');
  const search = String(query.search ?? '').trim().slice(0, 200);
  const status = String(query.status ?? '').trim().toUpperCase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (search) {
    where.push('(s.name LIKE ? OR s.code LIKE ? OR s.contact_name LIKE ? OR s.phone LIKE ? OR s.email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }
  if (status) {
    const checked = supplierStatusField(status, 'status');
    if (!checked.ok) return { ok: false, code: checked.code, message: checked.message };
    where.push('s.status = ?');
    params.push(String(checked.value));
  }
  const clause = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM suppliers s${clause}`, ...params)[0]?.n ?? 0);
  const order = (sortKey && SORT_EXPRESSIONS[sortKey]) || 's.name';
  const items = db.all<any>(`${SUPPLIER_SELECT}${clause} ORDER BY ${order} ${direction} LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize);
  return { ok: true, value: { items, total, page, pageSize } };
}

export function getSupplier(db: QatafoDatabase, id: string): Result<Record<string, unknown>> {
  const trimmed = String(id ?? '').trim();
  if (!isIdentifier(trimmed)) return { ok: false, code: PURCHASING_ERRORS.NOT_FOUND, message: 'Identifiant de fournisseur invalide.' };
  const row = db.all<any>(`${SUPPLIER_SELECT} WHERE s.id = ?`, trimmed)[0];
  if (!row) return { ok: false, code: PURCHASING_ERRORS.SUPPLIER_NOT_FOUND, message: 'Fournisseur introuvable.' };
  const recent = db.all<any>(`
    SELECT po.id, po.po_number, po.status, po.currency, po.created_at, po.updated_at,
           (SELECT COALESCE(SUM(l.quantity_ordered * l.unit_cost), 0) FROM purchase_order_lines l WHERE l.purchase_order_id = po.id) AS total_amount
    FROM purchase_orders po WHERE po.supplier_id = ? ORDER BY po.created_at DESC LIMIT 5`, trimmed);
  return { ok: true, value: { ...row, recent_orders: recent } };
}

/** Un nom ne se répète pas, à la casse près. `exceptId` autorise le renommage vers soi-même. */
function supplierNameClash(db: QatafoDatabase, name: string, exceptId: string | null): { id: string } | undefined {
  return exceptId
    ? db.get<{ id: string }>('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE AND id <> ?', name, exceptId)
    : db.get<{ id: string }>('SELECT id FROM suppliers WHERE name = ? COLLATE NOCASE', name);
}

export function createSupplier(db: QatafoDatabase, body: Record<string, any> = {}, actor: PurchasingActor, req?: any): Result<Record<string, unknown>> {
  const nameCheck = textField(body.name, 'name', 160);
  if (!nameCheck.ok) return propagate(nameCheck);
  const name = String(nameCheck.value ?? '').trim();
  if (!name) return invalid('« name » est obligatoire : un fournisseur sans nom n’est pas engageable.', [{ field: 'name', reason: 'REQUIRED' }]);
  const clash = supplierNameClash(db, name, null);
  if (clash) {
    return { ok: false, code: PURCHASING_ERRORS.DUPLICATE, message: `Un fournisseur nommé « ${name} » existe déjà (${clash.id}).`, details: [{ field: 'name', reason: 'UNIQUE' }] };
  }

  const currency = currencyField(body.currency);
  if (!currency.ok) return propagate(currency);
  const leadTime = leadTimeField(body.lead_time_days);
  if (!leadTime.ok) return propagate(leadTime);
  const status = supplierStatusField(body.status ?? 'ACTIVE');
  if (!status.ok) return propagate(status);
  const texts = {
    contact_name: textField(body.contact_name, 'contact_name', 120),
    phone: textField(body.phone, 'phone', 40),
    email: textField(body.email, 'email', 160),
    address: textField(body.address, 'address', 300),
    payment_terms: textField(body.payment_terms, 'payment_terms', 160),
    notes: textField(body.notes, 'notes', 1000),
  };
  for (const check of Object.values(texts)) if (!check.ok) return propagate(check);

  const now = new Date().toISOString();
  const id = `sup_${randomUUID()}`;
  const code = nextSequenceNumber(db, 'supplier_code');
  const values: Record<string, unknown> = {
    id, code, name,
    contact_name: String(texts.contact_name.value ?? ''), phone: String(texts.phone.value ?? ''),
    email: String(texts.email.value ?? ''), address: String(texts.address.value ?? ''),
    currency: String(currency.value), payment_terms: String(texts.payment_terms.value ?? ''),
    lead_time_days: Number(leadTime.value), status: String(status.value), notes: String(texts.notes.value ?? ''),
    created_at: now, updated_at: now, created_by: actor.id, updated_by: actor.id,
  };
  const columns = Object.keys(values);
  try {
    db.run(`INSERT INTO suppliers (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
      ...columns.map((column) => values[column]));
  } catch (error) {
    // Contrainte `UNIQUE` sur `code` ou index de nom : la base a parlé avant nous, on traduit.
    return { ok: false, code: PURCHASING_ERRORS.CONFLICT, message: `Fournisseur non créé : ${(error as Error).message.slice(0, 160)}.` };
  }
  auditPurchasing(db, {
    actor, action: 'CREATE', resourceType: 'supplier', resourceId: id,
    before: null, after: values, context: purchasingContext(db, req),
  });
  return getSupplier(db, id);
}

export function updateSupplier(db: QatafoDatabase, id: string, body: Record<string, any> = {}, actor: PurchasingActor, req?: any): Result<Record<string, unknown>> {
  const current = db.get<any>('SELECT * FROM suppliers WHERE id = ?', String(id ?? '').trim());
  if (!current) return { ok: false, code: PURCHASING_ERRORS.SUPPLIER_NOT_FOUND, message: 'Fournisseur introuvable.' };
  // Le code est réservé par la numérotation : le modifier casserait ce que les commandes ont écrit.
  if (body.code !== undefined && String(body.code) !== String(current.code)) {
    return { ok: false, code: PURCHASING_ERRORS.IMMUTABLE, message: '« code » fournisseur est attribué par la numérotation et ne se modifie pas.', details: [{ field: 'code', reason: 'IMMUTABLE' }] };
  }
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const check = textField(body.name, 'name', 160);
    if (!check.ok) return propagate(check);
    const name = String(check.value ?? '').trim();
    if (!name) return invalid('« name » ne peut pas être vide.', [{ field: 'name', reason: 'REQUIRED' }]);
    if (supplierNameClash(db, name, current.id)) {
      return { ok: false, code: PURCHASING_ERRORS.DUPLICATE, message: `Un fournisseur nommé « ${name} » existe déjà.`, details: [{ field: 'name', reason: 'UNIQUE' }] };
    }
    patch.name = name;
  }
  if (body.currency !== undefined) {
    const check = currencyField(body.currency);
    if (!check.ok) return propagate(check);
    patch.currency = check.value;
  }
  if (body.lead_time_days !== undefined) {
    const check = leadTimeField(body.lead_time_days);
    if (!check.ok) return propagate(check);
    patch.lead_time_days = check.value;
  }
  if (body.status !== undefined) {
    const check = supplierStatusField(body.status);
    if (!check.ok) return propagate(check);
    patch.status = check.value;
  }
  for (const field of ['contact_name', 'phone', 'email', 'address', 'payment_terms'] as const) {
    if (body[field] === undefined) continue;
    const check = textField(body[field], field, field === 'address' ? 300 : 160);
    if (!check.ok) return propagate(check);
    patch[field] = check.value;
  }
  if (body.notes !== undefined) {
    const check = textField(body.notes, 'notes', 1000);
    if (!check.ok) return propagate(check);
    patch.notes = check.value;
  }
  if (!Object.keys(patch).length) return getSupplier(db, current.id);

  const now = new Date().toISOString();
  patch.updated_at = now;
  patch.updated_by = actor.id;
  const columns = Object.keys(patch);
  db.run(`UPDATE suppliers SET ${columns.map((column) => `${column}=?`).join(', ')} WHERE id=?`,
    ...columns.map((column) => patch[column]), current.id);
  auditPurchasing(db, {
    actor, action: 'UPDATE', resourceType: 'supplier', resourceId: current.id,
    before: current, after: { ...current, ...patch }, context: purchasingContext(db, req),
  });
  return getSupplier(db, current.id);
}

/** Désactivation assumée : la fiche reste, ses commandes restent, elle cesse d'être proposée. */
export function setSupplierStatus(db: QatafoDatabase, id: string, status: SupplierStatus, actor: PurchasingActor, req?: any): Result<Record<string, unknown>> {
  const current = db.get<any>('SELECT * FROM suppliers WHERE id = ?', String(id ?? '').trim());
  if (!current) return { ok: false, code: PURCHASING_ERRORS.SUPPLIER_NOT_FOUND, message: 'Fournisseur introuvable.' };
  const now = new Date().toISOString();
  db.run('UPDATE suppliers SET status=?, updated_at=?, updated_by=? WHERE id=?', status, now, actor.id, current.id);
  auditPurchasing(db, {
    actor, action: 'STATUS_CHANGE', resourceType: 'supplier', resourceId: current.id,
    before: { status: current.status }, after: { status },
    note: { transition: status === 'ACTIVE' ? 'ACTIVATE' : 'DEACTIVATE' },
    context: purchasingContext(db, req),
  });
  return getSupplier(db, current.id);
}

/** Un fournisseur référencé ne se supprime pas : la commande engagée doit rester lisible. */
export function refuseSupplierDeletion(db: QatafoDatabase, id: string): Result<never> {
  const orders = Number(db.all<{ n: number }>('SELECT COUNT(*) AS n FROM purchase_orders WHERE supplier_id=?', String(id ?? '').trim())[0]?.n ?? 0);
  return {
    ok: false, code: PURCHASING_ERRORS.CONFLICT,
    message: orders > 0
      ? `Suppression refusée : ${orders} commande(s) d’achat sont engagées auprès de ce fournisseur. Passez-le en INACTIVE.`
      : 'Suppression refusée : une fiche fournisseur reste dans le système. Passez-la en INACTIVE.',
    details: [{ field: 'id', reason: 'FOREIGN_KEY' }],
  };
}
