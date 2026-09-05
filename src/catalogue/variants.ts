/**
 * AYROVI Catalogue (P2.1) — product variants (the sellable unit).
 *
 * A product is a *thing*; a variant is what is ordered, priced, stocked and shipped.
 * Before this file the app had no variant entity at all: `order_items` carried free-text
 * `variant`, `requested_size`, `requested_color`, and `crm_extracted_products` carried a
 * `sku` string produced by an AI extraction. Those columns stay exactly as they are
 * (Rule Zero) — but from now on a SKU has ONE owner, ONE uniqueness rule (database
 * level, case-insensitive) and ONE audit trail.
 *
 * Stock quantities are deliberately absent: they belong to the Inventory module (P2.2),
 * which will reference `catalogue_variants.id`. A quantity column here would become the
 * second source of truth the whole point of P2.1 is to prevent.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import {
  asObject, barcodeOf, fail, isIdentifier, malformedId, optionalText, propagate, skuOf, statusOf, wholeNumber, type Check,
} from './validation';
import { CATALOGUE_ERRORS, VARIANT_STATUSES, type CatalogueVariantInput } from './types';
import { auditCatalogue, type CatalogueActor } from './audit';
import { getProduct } from './products';
import { applyAttributes, validateAttributes } from './attributes';

export interface CatalogueVariantRow {
  id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  size: string | null;
  color: string | null;
  status: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by: string | null;
  updated_by: string | null;
}

export type VariantResult<T> = Check<T>;

const VARIANT_SELECT = `SELECT id, product_id, sku, barcode, size, color, status, sort_order, created_at, updated_at, created_by, updated_by FROM catalogue_variants`;

function mapVariant(row: Record<string, unknown> | undefined): CatalogueVariantRow | null {
  if (!row) return null;
  return {
    id: String(row.id), product_id: String(row.product_id), sku: String(row.sku),
    barcode: row.barcode ? String(row.barcode) : null,
    size: row.size ? String(row.size) : null,
    color: row.color ? String(row.color) : null,
    status: String(row.status ?? 'ACTIVE'),
    sort_order: Number(row.sort_order ?? 100),
    created_at: String(row.created_at ?? ''), updated_at: String(row.updated_at ?? ''),
    created_by: row.created_by ? String(row.created_by) : null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
  };
}

export function listVariants(db: QatafoDatabase, productId: string): CatalogueVariantRow[] {
  if (!isIdentifier(productId)) return [];
  return db.all<Record<string, unknown>>(`${VARIANT_SELECT} WHERE product_id=? ORDER BY sort_order, sku`, productId).map((row) => mapVariant(row)!);
}

export function getVariant(db: QatafoDatabase, id: string): CatalogueVariantRow | null {
  if (!isIdentifier(id)) return null;
  return mapVariant(db.get<Record<string, unknown>>(`${VARIANT_SELECT} WHERE id=?`, id));
}

/** Case-insensitive pre-check, so the API answers 409 instead of leaking a constraint error. */
function skuTaken(db: QatafoDatabase, sku: string, excludeId: string | null): boolean {
  const row = excludeId
    ? db.get<{ id: string }>('SELECT id FROM catalogue_variants WHERE sku=? COLLATE NOCASE AND id<>?', sku, excludeId)
    : db.get<{ id: string }>('SELECT id FROM catalogue_variants WHERE sku=? COLLATE NOCASE', sku);
  return Boolean(row);
}

function buildVariantPayload(db: QatafoDatabase, input: CatalogueVariantInput, existing: CatalogueVariantRow | null): VariantResult<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};
  if (existing === null || input.sku !== undefined) {
    const sku = skuOf(input.sku);
    if (!sku.ok) return propagate(sku);
    if (!existing || sku.value !== existing.sku) {
      if (skuTaken(db, sku.value, existing?.id ?? null)) {
        return fail(CATALOGUE_ERRORS.SKU_TAKEN, `Le SKU ${sku.value} existe déjà.`, [{ field: 'sku', reason: 'TAKEN' }]);
      }
    }
    payload.sku = sku.value;
  }
  if (input.barcode !== undefined) {
    const barcode = barcodeOf(input.barcode);
    if (!barcode.ok) return propagate(barcode);
    payload.barcode = barcode.value;
  }
  for (const key of ['size', 'color'] as const) {
    if (input[key] === undefined) continue;
    const value = optionalText(input[key], key, 40);
    if (!value.ok) return propagate(value);
    payload[key] = value.value;
  }
  if (input.status !== undefined) {
    const status = statusOf(input.status, 'status', VARIANT_STATUSES, existing?.status ?? 'ACTIVE');
    if (!status.ok) return propagate(status);
    payload.status = status.value;
  } else if (existing === null) {
    payload.status = 'ACTIVE';
  }
  if (existing === null || input.position !== undefined) {
    const position = wholeNumber(input.position, 'position', 0, 9999, existing?.sort_order ?? 100);
    if (!position.ok) return propagate(position);
    payload.sort_order = position.value;
  }
  return { ok: true, value: payload };
}

export interface VariantMutationOptions {
  actor: CatalogueActor;
  context?: Parameters<typeof auditCatalogue>[1]['context'];
}

export function createVariant(db: QatafoDatabase, productId: string, rawInput: unknown, options: VariantMutationOptions): VariantResult<CatalogueVariantRow> {
  if (!isIdentifier(productId)) return malformedId('product_id');
  const product = getProduct(db, productId);
  if (!product) return fail(CATALOGUE_ERRORS.PRODUCT_NOT_FOUND, `Produit « ${productId} » inconnu.`, [{ field: 'product_id', reason: 'NOT_FOUND' }]);
  const input = asObject(rawInput) as CatalogueVariantInput;
  const built = buildVariantPayload(db, input, null);
  if (!built.ok) return propagate(built);
  const attributes = validateAttributes(db, input.attributes, 'variant');
  if (!attributes.ok) return propagate(attributes);
  const id = `var_${randomUUID()}`;
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = { ...built.value, id, product_id: productId, created_at: now, updated_at: now, created_by: options.actor.id, updated_by: options.actor.id };
  const columns = Object.keys(payload);
  try {
    db.transaction(() => {
      db.run(`INSERT INTO catalogue_variants (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...Object.values(payload) as any[]);
      applyAttributes(db, { productId, variantId: id, values: attributes.value });
    });
  } catch (error: any) {
    return translate(error);
  }
  const created = getVariant(db, id)!;
  auditCatalogue(db, {
    actor: options.actor, action: 'CREATE', resourceType: 'variant', resourceId: id,
    before: null, after: created as unknown as Record<string, unknown>,
    note: { product_id: productId }, context: options.context ?? null,
  });
  return { ok: true, value: created };
}

export function updateVariant(db: QatafoDatabase, id: string, rawInput: unknown, options: VariantMutationOptions): VariantResult<CatalogueVariantRow> {
  if (!isIdentifier(id)) return malformedId('id');
  const existing = getVariant(db, id);
  if (!existing) return fail(CATALOGUE_ERRORS.NOT_FOUND, 'Variante introuvable.', [{ field: 'id', reason: 'NOT_FOUND' }]);
  const input = asObject(rawInput) as CatalogueVariantInput;
  const built = buildVariantPayload(db, input, existing);
  if (!built.ok) return propagate(built);
  const attributes = validateAttributes(db, input.attributes, 'variant');
  if (!attributes.ok) return propagate(attributes);
  const payload = built.value;
  payload.updated_at = new Date().toISOString();
  payload.updated_by = options.actor.id;
  const assignments = Object.keys(payload).map((column) => `${column}=?`);
  try {
    db.transaction(() => {
      db.run(`UPDATE catalogue_variants SET ${assignments.join(',')} WHERE id=?`, ...Object.values(payload) as any[], id);
      if (input.attributes !== undefined) applyAttributes(db, { productId: existing.product_id, variantId: id, values: attributes.value });
    });
  } catch (error: any) {
    return translate(error);
  }
  const updated = getVariant(db, id)!;
  const statusChanged = payload.status !== undefined && payload.status !== existing.status;
  auditCatalogue(db, {
    actor: options.actor, action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE', resourceType: 'variant', resourceId: id,
    before: existing as unknown as Record<string, unknown>, after: updated as unknown as Record<string, unknown>,
    context: options.context ?? null,
  });
  return { ok: true, value: updated };
}

/**
 * Retiring a variant = archiving it. The SKU stays reserved: an old order line, a stock
 * movement or a supplier reference may still point at it, and handing a retired SKU to a
 * new article would silently merge two histories into one.
 */
export function archiveVariant(db: QatafoDatabase, id: string, options: VariantMutationOptions): VariantResult<{ id: string; status: string }> {
  if (!isIdentifier(id)) return malformedId('id');
  const existing = getVariant(db, id);
  if (!existing) return fail(CATALOGUE_ERRORS.NOT_FOUND, 'Variante introuvable.', [{ field: 'id', reason: 'NOT_FOUND' }]);
  if (existing.status !== 'ARCHIVED') {
    db.run("UPDATE catalogue_variants SET status='ARCHIVED', updated_at=?, updated_by=? WHERE id=?", new Date().toISOString(), options.actor.id, id);
    auditCatalogue(db, {
      actor: options.actor, action: 'ARCHIVE', resourceType: 'variant', resourceId: id,
      before: { status: existing.status }, after: { status: 'ARCHIVED' }, context: options.context ?? null,
    });
  }
  return { ok: true, value: { id, status: 'ARCHIVED' } };
}

/** Cross-module guard used by the routes: a variant must belong to that product. */
export function variantBelongsToProduct(db: QatafoDatabase, variantId: string, productId: string): boolean {
  const variant = getVariant(db, variantId);
  return Boolean(variant && variant.product_id === productId);
}

export const variantProductMismatch = (variantId: string): VariantResult<never> => fail(
  CATALOGUE_ERRORS.VARIANT_MISMATCH, `La variante « ${variantId} » n’appartient pas à ce produit.`, [{ field: 'variant_id', reason: 'MISMATCH' }]);

function translate(error: any): VariantResult<never> {
  const text = String(error?.message || error || '');
  if (/catalogue_variants\.sku|idx_catalogue_variants_sku/i.test(text)) {
    return fail(CATALOGUE_ERRORS.SKU_TAKEN, 'Ce SKU existe déjà.', [{ field: 'sku', reason: 'TAKEN' }]);
  }
  if (/FOREIGN KEY/i.test(text)) {
    return fail(CATALOGUE_ERRORS.PRODUCT_NOT_FOUND, 'Le produit rattaché à cette variante n’existe pas.', [{ field: 'product_id', reason: 'FOREIGN_KEY' }]);
  }
  if (/CHECK/i.test(text)) {
    return fail(CATALOGUE_ERRORS.STATUS_INVALID, 'Valeur refusée par une contrainte de la base.', [{ field: 'status', reason: 'CHECK' }]);
  }
  return fail(CATALOGUE_ERRORS.CONFLICT, text.slice(0, 300) || 'Conflit d’enregistrement.');
}

export const variantStatusList = VARIANT_STATUSES;
