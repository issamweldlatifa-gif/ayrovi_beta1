/**
 * AYROVI Inventory (P2.2) — lignes de stock et mouvements.
 *
 * Ce fichier est la seule écriture du stock : ni la coquille, ni un écran, ni un futur
 * module Achats ne touchent `inventory_stock_items` sans passer par ici. Trois
 * invariants y sont tenus, et aucun n'est « de confiance » :
 *  • une quantité ne descend jamais sous zéro — vérifié avant l'écriture, et `CHECK`
 *    en base pour tout autre écriveur ;
 *  • `inventory_stock_movements` est append-only : aucun UPDATE, aucun DELETE ; une
 *    erreur se corrige par un mouvement de plus ;
 *  • le mouvement et la quantité sont écrits dans le même point de sauvegarde, donc un
 *    échec au milieu laisse le stock exactement où il était.
 *
 * `QatafoDatabase` n'expose pas de transaction publique ; un `SAVEPOINT` est l'idiome
 * SQLite qui marche aussi bien au niveau racine qu'imbriqué dans une transaction déjà
 * ouverte (appel futur depuis un job), contrairement à `BEGIN`.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { auditInventory, type InventoryActor, type InventoryAuditInput } from './audit';
import { isIdentifier, paginationOf, sortOf } from './validation';
import { INVENTORY_ERRORS, MAX_MOVEMENT_QUANTITY } from './types';

/**
 * Forme plate (comme `Check` du catalogue) : avec `strict: false`, une union discriminée
 * ne se réduit pas, et chaque appelant finirait par un `!`. On teste `ok`, puis on lit
 * `value` (succès) ou `code`/`message` (refus).
 */
export interface StockResult<T> { ok: boolean; value?: T; code?: string; message?: string }

type Result<T> = StockResult<T>;

function fail(code: string, message: string): Result<never> {
  return { ok: false, code, message };
}

/** Transaction imbriquable (voir en-tête). */
function withSavepoint<T>(db: QatafoDatabase, label: string, body: () => T): T {
  const name = `sp_${label.replace(/[^a-z0-9_]/gi, '')}_${Date.now().toString(36)}`;
  db.run(`SAVEPOINT ${name}`);
  try {
    const value = body();
    db.run(`RELEASE ${name}`);
    return value;
  } catch (error) {
    try { db.run(`ROLLBACK TO ${name}`); db.run(`RELEASE ${name}`); } catch { /* la cause d'origine prime */ }
    throw error;
  }
}

const STOCK_SELECT = `
  SELECT item.id, item.product_id, item.variant_id, item.location, item.quantity, item.reorder_point,
         item.status, item.last_movement_at, item.created_at, item.updated_at,
         product.name AS product_name, product.product_code AS product_code, product.slug AS product_slug,
         variant.sku AS sku, variant.size AS variant_size, variant.color AS variant_color
  FROM inventory_stock_items item
  LEFT JOIN products product ON product.id = item.product_id
  LEFT JOIN catalogue_variants variant ON variant.id = item.variant_id`;

const STOCK_SORTS = ['quantity', 'reorder_point', 'location', 'product_name', 'last_movement_at', 'updated_at'] as const;

export interface StockListQuery {
  search?: unknown; location?: unknown; status?: unknown; low?: unknown;
  productId?: unknown; page?: unknown; pageSize?: unknown; page_size?: unknown;
  sort?: unknown; direction?: unknown;
}

/** État dérivé, jamais stocké : « bas » et « vide » sont des lectures, pas des colonnes. */
function stockState(quantity: number, reorderPoint: number): 'OUT' | 'LOW' | 'OK' {
  if (quantity <= 0) return 'OUT';
  if (reorderPoint > 0 && quantity <= reorderPoint) return 'LOW';
  return 'OK';
}

export function listStock(db: QatafoDatabase, query: StockListQuery = {}) {
  const { page, pageSize } = paginationOf(query);
  const { key: sortKey, direction, fallback } = sortOf(query, STOCK_SORTS, 'item.updated_at');
  const search = String(query.search ?? '').trim().slice(0, 200);
  const location = String(query.location ?? '').trim().toUpperCase();
  const status = String(query.status ?? '').trim().toUpperCase();
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (search) {
    where.push('(product.name LIKE ? OR product.product_code LIKE ? OR variant.sku LIKE ? OR item.location LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (location) { where.push('item.location = ?'); params.push(location); }
  if (status === 'ACTIVE' || status === 'ARCHIVED') { where.push('item.status = ?'); params.push(status); }
  else if (status === 'LOW') { where.push('item.quantity > 0 AND item.reorder_point > 0 AND item.quantity <= item.reorder_point'); }
  else if (status === 'OUT') { where.push('item.quantity <= 0'); }
  else { where.push("item.status = 'ACTIVE'"); }
  if (isIdentifier(String(query.productId ?? ''))) { where.push('item.product_id = ?'); params.push(String(query.productId).trim()); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM inventory_stock_items item
     LEFT JOIN products product ON product.id = item.product_id
     LEFT JOIN catalogue_variants variant ON variant.id = item.variant_id ${clause}`,
    ...params,
  )?.count ?? 0);
  const orderBy = sortKey
    ? (sortKey === 'product_name' ? `product.name ${direction}` : `item.${sortKey} ${direction}`)
    : `${fallback} DESC`;
  const rows = db.all<Record<string, any>>(
    `${STOCK_SELECT} ${clause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize,
  );
  return {
    data: rows.map((row) => ({
      ...row,
      stock_state: stockState(Number(row.quantity), Number(row.reorder_point)),
      movement_count: Number(db.get<{ n: number }>(
        'SELECT COUNT(*) AS n FROM inventory_stock_movements WHERE item_id=?', String(row.id),
      )?.n ?? 0),
    })),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

export function getStockItem(db: QatafoDatabase, id: string): Record<string, any> | null {
  if (!isIdentifier(id)) return null;
  const row = db.get<Record<string, any>>(`${STOCK_SELECT} WHERE item.id = ?`, id);
  if (!row) return null;
  return {
    ...row,
    stock_state: stockState(Number(row.quantity), Number(row.reorder_point)),
    movements: listMovements(db, { itemId: row.id, pageSize: 50 }).data,
  };
}

/** Emplacements distincts — la liste vient des données, jamais d'un menu écrit à la main. */
export function listLocations(db: QatafoDatabase): Array<{ location: string; lines: number; units: number }> {
  return db.all<{ location: string; lines: number; units: number }>(
    `SELECT location, COUNT(*) AS lines, COALESCE(SUM(quantity), 0) AS units
     FROM inventory_stock_items WHERE status='ACTIVE' GROUP BY location ORDER BY location`,
  );
}

export function stockSummary(db: QatafoDatabase) {
  const totals = db.get<{ lines: number; units: number; low: number; out: number }>(
    `SELECT COUNT(*) AS lines, COALESCE(SUM(quantity),0) AS units,
            SUM(CASE WHEN quantity > 0 AND reorder_point > 0 AND quantity <= reorder_point THEN 1 ELSE 0 END) AS low,
            SUM(CASE WHEN quantity <= 0 THEN 1 ELSE 0 END) AS out
     FROM inventory_stock_items WHERE status='ACTIVE'`,
  );
  const lastMovement = db.get<{ created_at: string | null }>(
    'SELECT MAX(created_at) AS created_at FROM inventory_stock_movements',
  );
  return {
    lines: Number(totals?.lines ?? 0),
    units: Number(totals?.units ?? 0),
    lowStock: Number(totals?.low ?? 0),
    outOfStock: Number(totals?.out ?? 0),
    locations: listLocations(db).length,
    lastMovementAt: lastMovement?.created_at ?? null,
  };
}

export interface CreateItemInput {
  productId?: string;
  productCode?: string;
  variantId?: string | null;
  location: string;
  quantity: number;
  reorderPoint: number;
  actor: InventoryActor;
  context?: InventoryAuditInput['context'];
}

/**
 * Ouvre une ligne de stock. La quantité d'ouverture est écrite COMME un mouvement
 * (`OPENING_BALANCE`) : une quantité sans origine ne doit pas exister dans un ERP.
 */
export function createStockItem(db: QatafoDatabase, input: CreateItemInput): Result<Record<string, any>> {
  const product = input.productId
    ? db.get<{ id: string; name: string }>('SELECT id, name FROM products WHERE id=?', input.productId)
    : db.get<{ id: string; name: string }>('SELECT id, name FROM products WHERE product_code=? COLLATE NOCASE', String(input.productCode));
  if (!product) return fail(INVENTORY_ERRORS.PRODUCT_NOT_FOUND, 'Produit introuvable : le stock ne crée pas de fiche produit.');
  if (input.variantId) {
    const variant = db.get<{ id: string, product_id: string }>(
      'SELECT id, product_id FROM catalogue_variants WHERE id=?', String(input.variantId));
    if (!variant) return fail(INVENTORY_ERRORS.VALIDATION, 'Variante introuvable pour ce produit.');
    if (variant.product_id !== product.id) return fail(INVENTORY_ERRORS.VALIDATION, 'Cette variante n’appartient pas au produit indiqué.');
  }
  const location = String(input.location || 'MAIN').toUpperCase();
  const clash = db.get<{ id: string }>(
    `SELECT id FROM inventory_stock_items WHERE product_id=? AND COALESCE(variant_id,'')=? AND location=?`,
    product.id, input.variantId ?? '', location,
  );
  if (clash) return fail(INVENTORY_ERRORS.DUPLICATE, `Une ligne de stock existe déjà pour ce produit à l’emplacement ${location}.`);
  const now = new Date().toISOString();
  const id = `stki_${randomUUID()}`;
  const quantity = Math.max(0, Math.min(MAX_MOVEMENT_QUANTITY, Number(input.quantity) || 0));
  const reorderPoint = Math.max(0, Math.min(MAX_MOVEMENT_QUANTITY, Number(input.reorderPoint) || 0));
  withSavepoint(db, 'stock_create', () => {
    db.run(`INSERT INTO inventory_stock_items
      (id,product_id,variant_id,location,quantity,reorder_point,status,last_movement_at,created_at,updated_at,created_by,updated_by)
      VALUES (?,?,?,?,?,?, 'ACTIVE', ?,?,?,?,?)`,
    id, product.id, input.variantId ?? null, location, quantity, reorderPoint,
    quantity > 0 ? now : null, now, now, input.actor.id ?? null, input.actor.id ?? null);
    if (quantity > 0) {
      db.run(`INSERT INTO inventory_stock_movements
        (id,item_id,product_id,variant_id,location,direction,quantity,signed_quantity,balance_before,balance_after,
         reason,note,reference_type,reference_id,stocktake_id,idempotency_key,performed_by,performed_by_employee_id,created_at)
        VALUES (?,?,?,?,?, 'IN', ?,?,0,?, 'OPENING_BALANCE','Quantité d’ouverture de la ligne',NULL,NULL,NULL,NULL,?,NULL,?)`,
      `stkm_${randomUUID()}`, id, product.id, input.variantId ?? null, location, quantity, quantity, quantity,
      input.actor.id ?? null, now);
    }
  });
  const item = getStockItem(db, id);
  if (!item) return fail(INVENTORY_ERRORS.NOT_FOUND, 'Ligne créée mais relue vide : vérifier la base.');
  auditInventory(db, {
    actor: input.actor, action: 'CREATE', resourceType: 'stock_item', resourceId: id,
    before: null, after: { product_id: product.id, location, quantity, reorder_point: reorderPoint },
    context: input.context ?? null,
  });
  return { ok: true, value: item };
}

export interface UpdateItemInput {
  reorderPoint?: unknown;
  status?: unknown;
  actor: InventoryActor;
  context?: InventoryAuditInput['context'];
}

/**
 * Ce qu'une ligne accepte d'être édité à la main : le point de commande et l'archivage.
 * La quantité n'est PAS éditable ici (elle se meut), l'emplacement non plus (il fait
 * l'identité de la ligne — le changer serait créer une autre ligne).
 */
export function updateStockItem(db: QatafoDatabase, id: string, input: UpdateItemInput): Result<Record<string, any>> {
  const before = db.get<Record<string, any>>(
    'SELECT id, product_id, variant_id, location, quantity, reorder_point, status FROM inventory_stock_items WHERE id=?', id);
  if (!before) return fail(INVENTORY_ERRORS.ITEM_NOT_FOUND, 'Ligne de stock introuvable.');
  const patch: Record<string, unknown> = {};
  if (input.reorderPoint !== undefined) {
    const value = Number(input.reorderPoint);
    if (!Number.isInteger(value) || value < 0 || value > MAX_MOVEMENT_QUANTITY) {
      return fail(INVENTORY_ERRORS.VALIDATION, '« point_de_commande » doit être un entier positif ou nul.');
    }
    patch.reorder_point = value;
  }
  if (input.status !== undefined) {
    const status = String(input.status).trim().toUpperCase();
    if (status !== 'ACTIVE' && status !== 'ARCHIVED') return fail(INVENTORY_ERRORS.VALIDATION, '« statut » doit valoir ACTIVE ou ARCHIVED.');
    if (status === 'ARCHIVED' && Number(before.quantity) > 0) {
      return fail(INVENTORY_ERRORS.CONFLICT, 'Une ligne encore approvisionnée ne s’archive pas : soldez-la d’abord, l’historique reste intact.');
    }
    patch.status = status;
  }
  if (!Object.keys(patch).length) return { ok: true, value: before };
  const now = new Date().toISOString();
  db.run(`UPDATE inventory_stock_items SET ${Object.keys(patch).map((column) => `${column}=?`).join(', ')}, updated_at=?, updated_by=? WHERE id=?`,
    ...Object.values(patch), now, input.actor.id ?? null, id);
  auditInventory(db, {
    actor: input.actor, action: 'UPDATE', resourceType: 'stock_item', resourceId: id,
    before, after: { ...before, ...patch }, context: input.context ?? null,
  });
  const after = getStockItem(db, id);
  if (!after) return fail(INVENTORY_ERRORS.NOT_FOUND, 'Ligne introuvable après mise à jour.');
  return { ok: true, value: after };
}

/** Archive une ligne (jamais de suppression physique : les mouvements restent rattachés). */
export function archiveStockItem(db: QatafoDatabase, id: string, actor: InventoryActor, context?: InventoryAuditInput['context']): Result<{ id: string }> {
  const result = updateStockItem(db, id, { status: 'ARCHIVED', actor, context });
  if (!result.ok) return fail(result.code, result.message);
  return { ok: true, value: { id: String(result.value.id) } };
}

export interface MovementWriteInput {
  itemId?: string;
  productId?: string;
  productCode?: string;
  variantId?: string | null;
  location: string;
  direction: 'IN' | 'OUT' | 'ADJUST';
  /** Signé pour un ajustement, positif pour une entrée/sortie. */
  quantity: number;
  reason: string;
  note: string;
  referenceType: string | null;
  referenceId: string | null;
  idempotencyKey: string | null;
  stocktakeId?: string | null;
  actor: InventoryActor;
  employeeId?: string | null;
  context?: InventoryAuditInput['context'];
}

function resolveItem(db: QatafoDatabase, input: MovementWriteInput): Record<string, any> | null {
  if (input.itemId) {
    return db.get<Record<string, any>>(
      'SELECT id, product_id, variant_id, location, quantity, status FROM inventory_stock_items WHERE id=?', String(input.itemId)) ?? null;
  }
  const product = input.productId
    ? db.get<{ id: string }>('SELECT id FROM products WHERE id=?', input.productId)
    : db.get<{ id: string }>('SELECT id FROM products WHERE product_code=? COLLATE NOCASE', String(input.productCode));
  if (!product) return null;
  return db.get<Record<string, any>>(
    `SELECT id, product_id, variant_id, location, quantity, status FROM inventory_stock_items
     WHERE product_id=? AND COALESCE(variant_id,'')=? AND location=?`,
    product.id, input.variantId ?? '', input.location,
  ) ?? null;
}

/**
 * Écrit un mouvement et applique la quantité dans le même point de sauvegarde.
 *
 * Un `idempotency_key` déjà vu ne produit jamais un second mouvement : la route renvoie
 * le mouvement existant avec `duplicated: true`, ce qui rend un réessai réseau inoffensif.
 */
export function recordMovement(db: QatafoDatabase, input: MovementWriteInput): Result<Record<string, any> & { duplicated?: boolean }> {
  if (input.idempotencyKey) {
    const seen = db.get<Record<string, any>>(
      'SELECT * FROM inventory_stock_movements WHERE idempotency_key=?', String(input.idempotencyKey));
    if (seen) return { ok: true, value: { ...seen, duplicated: true } };
  }
  const item = resolveItem(db, input);
  if (!item) return fail(INVENTORY_ERRORS.ITEM_NOT_FOUND, 'Aucune ligne de stock ne correspond : ouvrez la ligne avant d’enregistrer un mouvement.');
  if (item.status === 'ARCHIVED') return fail(INVENTORY_ERRORS.CONFLICT, 'Cette ligne de stock est archivée ; réactivez-la avant tout mouvement.');

  const signed = input.direction === 'IN' ? Math.abs(input.quantity)
    : input.direction === 'OUT' ? -Math.abs(input.quantity)
      : input.quantity;
  const before = Number(item.quantity);
  const after = before + signed;
  if (after < 0) {
    return fail(INVENTORY_ERRORS.NEGATIVE_STOCK,
      `Stock insuffisant : ${before} en stock, ${Math.abs(signed)} retirés. La quantité ne devient jamais négative — enregistrez un écart lors de l’inventaire si le solde réel est plus bas.`);
  }
  const now = new Date().toISOString();
  const id = `stkm_${randomUUID()}`;
  withSavepoint(db, 'stock_move', () => {
    db.run(`UPDATE inventory_stock_items SET quantity=?, last_movement_at=?, updated_at=?, updated_by=? WHERE id=?`,
      after, now, now, input.actor.id ?? null, item.id);
    db.run(`INSERT INTO inventory_stock_movements
      (id,item_id,product_id,variant_id,location,direction,quantity,signed_quantity,balance_before,balance_after,
       reason,note,reference_type,reference_id,stocktake_id,idempotency_key,performed_by,performed_by_employee_id,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, item.id, item.product_id, item.variant_id ?? null, item.location, input.direction,
    Math.abs(signed), signed, before, after, input.reason, input.note,
    input.referenceType, input.referenceId, input.stocktakeId ?? null, input.idempotencyKey,
    input.actor.id ?? null, input.employeeId ?? null, now);
  });
  auditInventory(db, {
    actor: input.actor, action: 'CREATE', resourceType: 'stock_movement', resourceId: id,
    before: null,
    after: { item_id: item.id, direction: input.direction, quantity: Math.abs(signed), reason: input.reason, note: input.note },
    note: { balance_before: before, balance_after: after },
    context: input.context ?? null,
  });
  const movement = db.get<Record<string, any>>('SELECT * FROM inventory_stock_movements WHERE id=?', id);
  return { ok: true, value: { ...(movement ?? {}), item: { id: item.id, quantity: after } } };
}

const MOVEMENT_SORTS = ['created_at', 'quantity', 'location', 'product_name'] as const;

export function listMovements(db: QatafoDatabase, query: Record<string, any> = {}) {
  const { page, pageSize } = paginationOf(query);
  const { key: sortKey, direction } = sortOf(query, MOVEMENT_SORTS, 'movement.created_at');
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (isIdentifier(String(query.itemId ?? query.item_id ?? ''))) { where.push('movement.item_id=?'); params.push(String(query.itemId ?? query.item_id)); }
  if (isIdentifier(String(query.productId ?? query.product_id ?? ''))) { where.push('movement.product_id=?'); params.push(String(query.productId ?? query.product_id)); }
  if (isIdentifier(String(query.stocktakeId ?? query.stocktake_id ?? ''))) { where.push('movement.stocktake_id=?'); params.push(String(query.stocktakeId ?? query.stocktake_id)); }
  const location = String(query.location ?? '').trim().toUpperCase();
  if (location) { where.push('movement.location=?'); params.push(location); }
  const directionValue = String(query.direction ?? '').trim().toUpperCase();
  if (['IN', 'OUT', 'ADJUST'].includes(directionValue)) { where.push('movement.direction=?'); params.push(directionValue); }
  const reason = String(query.reason ?? '').trim().toUpperCase();
  if (reason) { where.push('movement.reason=?'); params.push(reason); }
  const from = String(query.from ?? '').trim();
  if (from) { where.push('movement.created_at>=?'); params.push(from); }
  const to = String(query.to ?? '').trim();
  if (to) { where.push('movement.created_at<=?'); params.push(to); }
  const search = String(query.search ?? '').trim().slice(0, 200);
  if (search) {
    where.push('(product.name LIKE ? OR product.product_code LIKE ? OR movement.note LIKE ? OR movement.reference_id LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const select = `
  SELECT movement.*, product.name AS product_name, product.product_code AS product_code
  FROM inventory_stock_movements movement
  LEFT JOIN products product ON product.id = movement.product_id ${clause}`;
  const total = Number(db.get<{ count: number }>(
    `SELECT COUNT(*) AS count FROM inventory_stock_movements movement
     LEFT JOIN products product ON product.id = movement.product_id ${clause}`, ...params)?.count ?? 0);
  const orderBy = sortKey
    ? (sortKey === 'product_name' ? `product.name ${direction}` : `movement.${sortKey} ${direction}`)
    : 'movement.created_at DESC';
  const rows = db.all<Record<string, any>>(`${select} ORDER BY ${orderBy} LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  return { data: rows, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

/** Rejet explicite de toute tentative d'écriture dans le journal (l'API n'a pas ces verbes). */
export const MOVEMENTS_ARE_APPEND_ONLY =
  'Le journal des mouvements est append-only : une erreur se corrige par un mouvement ADJUST, jamais par une modification.';

