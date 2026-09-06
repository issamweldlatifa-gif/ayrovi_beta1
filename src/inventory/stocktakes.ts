/**
 * AYROVI Inventory (P2.2) — inventaires physiques (stocktakes).
 *
 * Un inventaire est le SEUL chemin qui applique un écart sans pièce de justification :
 *  • à la création, chaque ligne active du lieu est photographiée (`expected_quantity`) ;
 *  • on compte ligne par ligne — `variance = comptée − attendue`, calculée ici, jamais
 *    laissée au client ;
 *  • la soumission fige le comptage, et seul `approve` (droit distinct `inventory:approve`)
 *    applique les écarts ;
 *  • l'application passe par `recordMovement` — la même écriture que tout le reste du
 *    module, dans un seul point de sauvegarde : un échec en cours d'approbation ne laisse
 *    pas un stock à moitié corrigé.
 *
 * Le rejet n'écrit aucun mouvement : l'écart reste lisible dans les lignes, la décision
 * est tracée, et une nouvelle session de comptage peut être ouverte.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { nextSequenceNumber } from '../erp-core/sequences';
import { auditInventory, type InventoryActor, type InventoryAuditInput } from './audit';
import { recordMovement, type StockResult } from './stock';
import { countedQuantityField, isIdentifier, paginationOf, sortOf, textField } from './validation';
import { INVENTORY_ERRORS, MAX_MOVEMENT_QUANTITY } from './types';

export interface CreateStocktakeInput {
  location: string;
  note: string;
  /** Inclure les lignes à zéro (défaut : oui — un absent se compte aussi). */
  includeZeroQuantity?: boolean;
  actor: InventoryActor;
  context?: InventoryAuditInput['context'];
}

const STOCKTAKE_SORTS = ['created_at', 'status', 'location', 'code', 'updated_at'] as const;

function fail(code: string, message: string): StockResult<never> {
  return { ok: false, code, message };
}

export function createStocktake(db: QatafoDatabase, input: CreateStocktakeInput): StockResult<Record<string, any>> {
  const note = textField(input.note, 'note', 500);
  if (!note.ok) return fail(note.code!, note.message!);
  const location = String(input.location || 'MAIN').toUpperCase();
  const items = db.all<{ id: string; quantity: number }>(
    `SELECT id, quantity FROM inventory_stock_items WHERE location=? AND status='ACTIVE'`, location);
  const snapshot = input.includeZeroQuantity === false ? items.filter((item) => Number(item.quantity) > 0) : items;
  if (!snapshot.length) return fail(INVENTORY_ERRORS.EMPTY_LINES, `Aucune ligne de stock active à l’emplacement ${location} : rien à inventorier.`);
  const now = new Date().toISOString();
  const id = `stkt_${randomUUID()}`;
  const code = nextSequenceNumber(db, 'stocktake_code');
  db.run(`SAVEPOINT sp_stocktake_create`);
  try {
    db.run(`INSERT INTO inventory_stocktakes (id,code,location,status,note,started_at,created_by,created_at,updated_at)
      VALUES (?, ?, ?, 'COUNTING', ?, ?, ?, ?, ?)`, id, code, location, note.value ?? '', now, input.actor.id ?? null, now, now);
    for (const item of snapshot) {
      db.run(`INSERT INTO inventory_stocktake_lines
        (id,stocktake_id,item_id,expected_quantity,counted_quantity,variance,comment,created_at,updated_at)
        VALUES (?,?,?,?,NULL,0,'',?,?)`, `stkl_${randomUUID()}`, id, item.id, Number(item.quantity), now, now);
    }
    db.run('RELEASE sp_stocktake_create');
  } catch (error) {
    try { db.run('ROLLBACK TO sp_stocktake_create'); db.run('RELEASE sp_stocktake_create'); } catch { /* la cause d'origine prime */ }
    throw error;
  }
  auditInventory(db, {
    actor: input.actor, action: 'CREATE', resourceType: 'stocktake', resourceId: id,
    before: null, after: { code, location, note: note.value ?? '' }, note: { lines: snapshot.length },
    context: input.context ?? null,
  });
  return { ok: true, value: getStocktake(db, id) };
}

export function listStocktakes(db: QatafoDatabase, query: Record<string, any> = {}) {
  const { page, pageSize } = paginationOf(query);
  const { key: sortKey, direction } = sortOf(query, STOCKTAKE_SORTS, 'stocktake.created_at');
  const where: string[] = [];
  const params: Array<string | number> = [];
  const status = String(query.status ?? '').trim().toUpperCase();
  const statuses = ['DRAFT', 'COUNTING', 'SUBMITTED', 'APPROVED', 'REJECTED'] as readonly string[];
  if (statuses.includes(status)) { where.push('stocktake.status=?'); params.push(status); }
  const location = String(query.location ?? '').trim().toUpperCase();
  if (location) { where.push('stocktake.location=?'); params.push(location); }
  const search = String(query.search ?? '').trim().slice(0, 200);
  if (search) { where.push('(stocktake.code LIKE ? OR stocktake.note LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM inventory_stocktakes stocktake ${clause}`, ...params)?.count ?? 0);
  const rows = db.all<Record<string, any>>(`
    SELECT stocktake.*,
      (SELECT COUNT(*) FROM inventory_stocktake_lines line WHERE line.stocktake_id=stocktake.id) AS lines_count,
      (SELECT COUNT(*) FROM inventory_stocktake_lines line WHERE line.stocktake_id=stocktake.id AND line.counted_quantity IS NOT NULL) AS counted_count,
      (SELECT COUNT(*) FROM inventory_stocktake_lines line WHERE line.stocktake_id=stocktake.id AND line.variance<>0) AS variance_count,
      (SELECT COALESCE(SUM(line.variance),0) FROM inventory_stocktake_lines line WHERE line.stocktake_id=stocktake.id) AS variance_units
    FROM inventory_stocktakes stocktake ${clause}
    ORDER BY ${sortKey ? `stocktake.${sortKey} ${direction}` : 'stocktake.created_at DESC'}
    LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { data: rows, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

export function getStocktake(db: QatafoDatabase, id: string): Record<string, any> {
  const header = db.get<Record<string, any>>('SELECT * FROM inventory_stocktakes WHERE id=?', id);
  if (!header) return {} as Record<string, any>;
  const lines = db.all<Record<string, any>>(`
    SELECT line.*, item.location, item.product_id, item.variant_id, product.name AS product_name,
           product.product_code AS product_code, variant.sku AS sku
    FROM inventory_stocktake_lines line
    JOIN inventory_stock_items item ON item.id = line.item_id
    LEFT JOIN products product ON product.id = item.product_id
    LEFT JOIN catalogue_variants variant ON variant.id = item.variant_id
    WHERE line.stocktake_id=? ORDER BY product.name COLLATE NOCASE, variant.size`, id);
  return {
    ...header,
    lines_count: lines.length,
    counted_count: lines.filter((line) => line.counted_quantity !== null && line.counted_quantity !== undefined).length,
    variance_count: lines.filter((line) => Number(line.variance) !== 0).length,
    variance_units: lines.reduce((sum, line) => sum + Number(line.variance), 0),
    lines,
    applied_movements: db.all<Record<string, any>>(
      'SELECT id, item_id, signed_quantity, created_at FROM inventory_stock_movements WHERE stocktake_id=? ORDER BY created_at', id),
  };
}

/** Un inventaire n'est modifiable que tant qu'il n'a pas été décidé. */
function editableStocktake(db: QatafoDatabase, id: string): { header?: Record<string, any>; error?: StockResult<never> } {
  const header = db.get<Record<string, any>>('SELECT * FROM inventory_stocktakes WHERE id=?', id);
  if (!header) return { error: fail(INVENTORY_ERRORS.STOCKTAKE_NOT_FOUND, 'Inventaire introuvable.') };
  if (header.status === 'APPROVED' || header.status === 'REJECTED') {
    return { error: fail(INVENTORY_ERRORS.ALREADY_APPROVED, 'Cet inventaire est déjà tranché : il ne se rouvre pas, ouvrez une nouvelle session.') };
  }
  return { header };
}

export interface CountInput {
  stocktakeId: string;
  lineId: string;
  countedQuantity: unknown;
  comment?: unknown;
  actor: InventoryActor;
  context?: InventoryAuditInput['context'];
}

/** Saisie d'un comptage : la variance est calculée ici, jamais reçue du client. */
export function recordCount(db: QatafoDatabase, input: CountInput): StockResult<Record<string, any>> {
  const { header, error } = editableStocktake(db, input.stocktakeId);
  if (error) return error;
  if (!isIdentifier(input.lineId)) return fail(INVENTORY_ERRORS.VALIDATION, '« line_id » n’est pas un identifiant valide.');
  const quantity = countedQuantityField(input.countedQuantity);
  if (!quantity.ok) return fail(quantity.code!, quantity.message!);
  const comment = textField(input.comment ?? '', 'comment', 300);
  if (!comment.ok) return fail(comment.code!, comment.message!);
  const line = db.get<Record<string, any>>(
    'SELECT id, stocktake_id, item_id, expected_quantity, counted_quantity FROM inventory_stocktake_lines WHERE id=? AND stocktake_id=?',
    input.lineId, header!.id);
  if (!line) return fail(INVENTORY_ERRORS.LINE_NOT_FOUND, 'Ligne d’inventaire introuvable pour cette session.');
  const variance = Number(quantity.value) - Number(line.expected_quantity);
  const now = new Date().toISOString();
  db.run(`UPDATE inventory_stocktake_lines
    SET counted_quantity=?, variance=?, comment=?, counted_at=?, counted_by=?, updated_at=? WHERE id=?`,
  quantity.value, variance, comment.value ?? '', now, input.actor.id ?? null, now, line.id);
  db.run(`UPDATE inventory_stocktakes SET status='COUNTING', updated_at=? WHERE id=? AND status='DRAFT'`, now, header!.id);
  auditInventory(db, {
    actor: input.actor, action: 'UPDATE', resourceType: 'stocktake', resourceId: header!.id,
    before: line, after: { ...line, counted_quantity: quantity.value, variance },
    note: { line_id: line.id, expected: line.expected_quantity, counted: quantity.value },
    context: input.context ?? null,
  });
  return { ok: true, value: db.get<Record<string, any>>('SELECT * FROM inventory_stocktake_lines WHERE id=?', line.id) };
}

export function submitStocktake(db: QatafoDatabase, id: string, actor: InventoryActor, context?: InventoryAuditInput['context']): StockResult<Record<string, any>> {
  const { header, error } = editableStocktake(db, id);
  if (error) return error;
  const uncounted = Number(db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM inventory_stocktake_lines WHERE stocktake_id=? AND counted_quantity IS NULL', id)?.n ?? 0);
  if (uncounted > 0) {
    return fail(INVENTORY_ERRORS.VALIDATION, `${uncounted} ligne(s) non comptée(s) : le comptage doit être complet avant soumission.`);
  }
  const now = new Date().toISOString();
  db.run(`UPDATE inventory_stocktakes SET status='SUBMITTED', submitted_at=?, updated_at=? WHERE id=?`, now, now, id);
  auditInventory(db, {
    actor, action: 'UPDATE', resourceType: 'stocktake', resourceId: id,
    before: header, after: { ...header, status: 'SUBMITTED', submitted_at: now },
    context: context ?? null,
  });
  return { ok: true, value: getStocktake(db, id) };
}

/**
 * Approuver = appliquer les écarts. La décision exige `inventory:approve` (contrôlé par la
 * route) et le résultat est un mouvement ADJUST par ligne avec écart, rattaché à l'inventaire.
 */
export function approveStocktake(db: QatafoDatabase, id: string, actor: InventoryActor, context?: InventoryAuditInput['context']): StockResult<Record<string, any>> {
  const header = db.get<Record<string, any>>('SELECT * FROM inventory_stocktakes WHERE id=?', id);
  if (!header) return fail(INVENTORY_ERRORS.STOCKTAKE_NOT_FOUND, 'Inventaire introuvable.');
  if (header.status === 'APPROVED') return fail(INVENTORY_ERRORS.ALREADY_APPROVED, 'Cet inventaire a déjà été validé ; la validation n’est jamais rejouée.');
  if (header.status === 'REJECTED') return fail(INVENTORY_ERRORS.ALREADY_APPROVED, 'Cet inventaire a été refusé : sa décision est définitive, ouvrez une nouvelle session.');
  if (header.status !== 'SUBMITTED') return fail(INVENTORY_ERRORS.NOT_SUBMITTED, 'Un inventaire se soumet avant d’être validé.');
  const uncounted = Number(db.get<{ n: number }>(
    'SELECT COUNT(*) AS n FROM inventory_stocktake_lines WHERE stocktake_id=? AND counted_quantity IS NULL', id)?.n ?? 0);
  if (uncounted > 0) return fail(INVENTORY_ERRORS.NOT_SUBMITTED, `${uncounted} ligne(s) non comptée(s) : validation impossible.`);
  const lines = db.all<Record<string, any>>(
    `SELECT id, item_id, expected_quantity, counted_quantity, variance FROM inventory_stocktake_lines
     WHERE stocktake_id=? AND variance<>0 ORDER BY created_at`, id);
  const applied: Array<Record<string, any>> = [];
  const refusals: Array<{ line: string; message: string }> = [];
  db.run('SAVEPOINT sp_stocktake_approve');
  try {
    for (const line of lines) {
      const movement = recordMovement(db, {
        itemId: String(line.item_id),
        location: String(header.location),
        direction: 'ADJUST',
        quantity: Number(line.variance),
        reason: 'STOCKTAKE_VARIANCE',
        note: `Écart validé de l’inventaire ${header.code}`,
        referenceType: 'stocktake',
        referenceId: String(header.id),
        idempotencyKey: `stocktake:${header.id}:line:${line.id}`,
        stocktakeId: String(header.id),
        actor,
        context: context ?? null,
      });
      if (!movement.ok) {
        refusals.push({ line: String(line.id), message: String(movement.message) });
        continue;
      }
      applied.push({ line_id: String(line.id), item_id: String(line.item_id), variance: Number(line.variance) });
      db.run(`UPDATE inventory_stocktake_lines SET comment=CASE WHEN comment='' THEN ? ELSE comment END, updated_at=? WHERE id=?`,
        `Écart appliqué le ${new Date().toISOString()}`, new Date().toISOString(), line.id);
    }
    if (refusals.length) throw new Error(`STOCKTAKE_APPLY_REFUSED:${refusals.length}`);
    const now = new Date().toISOString();
    db.run(`UPDATE inventory_stocktakes SET status='APPROVED', decided_at=?, decided_by=?, updated_at=? WHERE id=?`,
      now, actor.id ?? null, now, id);
    db.run('RELEASE sp_stocktake_approve');
  } catch (error) {
    try { db.run('ROLLBACK TO sp_stocktake_approve'); db.run('RELEASE sp_stocktake_approve'); } catch { /* cause d'origine */ }
    return fail(INVENTORY_ERRORS.CONFLICT,
      `Écarts non appliqués (${(error as Error).message || 'refus serveur'}) : l’inventaire reste soumis, aucune quantité n’a bougé.`);
  }
  auditInventory(db, {
    actor, action: 'UPDATE', resourceType: 'stocktake', resourceId: id,
    before: header, after: { ...header, status: 'APPROVED' },
    note: { applied_movements: applied.length, variance_units: applied.reduce((sum, entry) => sum + entry.variance, 0) },
    context: context ?? null,
  });
  return { ok: true, value: { ...getStocktake(db, id), applied } };
}

export function rejectStocktake(
  db: QatafoDatabase, id: string, input: { reason?: unknown; actor: InventoryActor; context?: InventoryAuditInput['context'] },
): StockResult<Record<string, any>> {
  const header = db.get<Record<string, any>>('SELECT * FROM inventory_stocktakes WHERE id=?', id);
  if (!header) return fail(INVENTORY_ERRORS.STOCKTAKE_NOT_FOUND, 'Inventaire introuvable.');
  if (header.status === 'APPROVED' || header.status === 'REJECTED') {
    return fail(INVENTORY_ERRORS.ALREADY_APPROVED, 'La décision est déjà prise : elle ne se remplace pas.');
  }
  if (header.status !== 'SUBMITTED') return fail(INVENTORY_ERRORS.NOT_SUBMITTED, 'Un inventaire se soumet avant d’être refusé.');
  const reason = textField(input.reason, 'motif', 500);
  if (!reason.ok) return fail(reason.code!, reason.message!);
  if (!reason.value) return fail(INVENTORY_ERRORS.VALIDATION, 'Un refus s’écrit : le motif est obligatoire.');
  const now = new Date().toISOString();
  db.run(`UPDATE inventory_stocktakes SET status='REJECTED', decided_at=?, decided_by=?, rejection_reason=?, updated_at=? WHERE id=?`,
    now, input.actor.id ?? null, reason.value, now, id);
  auditInventory(db, {
    actor: input.actor, action: 'UPDATE', resourceType: 'stocktake', resourceId: id,
    before: header, after: { ...header, status: 'REJECTED', rejection_reason: reason.value },
    context: input.context ?? null,
  });
  return { ok: true, value: getStocktake(db, id) };
}

/** Bornage défensif réutilisé par la route (le client ne fixe jamais les seuils). */
export const STOCKTAKE_LIMITS = { maxComment: 300, maxNote: 500, maxQuantity: MAX_MOVEMENT_QUANTITY };
