/**
 * AYROVI Catalogue (P2.1) — the canonical product service.
 *
 * `products` stays the product identity: it is the table the storefront (`GET
 * /api/public/products`), the cart, `order_items.product_id`, `promotion_products`,
 * `product_arrivals`, the magazine context and the AIyrovix search already read. This
 * service does not create a second product table; it writes the same rows through
 * validated, audited, permission-checked code paths and owns the fields that were
 * missing (code, slug, category link, attribution).
 *
 * Two legacy columns are deliberately kept in sync — `category` (free text) and
 * `brand_name` (denormalised) — because consumers still filter/display on them. The
 * canonical link is `category_id`/`brand_id`; the text columns are mirrors, never the
 * other way round. That is a transitional bridge, and it is named as such in the report.
 *
 * Prices are NOT computed here: `original_price`/`currency` are stored as entered and the
 * pricing engine keeps producing `converted_price`/`customs_fee`/`final_price`, so the
 * checkout total cannot drift by having two authorities.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { nextSequenceNumber } from '../erp-core/sequences';
import {
  propagate, type Check,allowedStatuses, asObject, boolFlag, explicitSlug, isIdentifier, malformedId, mediaUrlOf,
  moneyOf, optionalText, requiredText, resolveSlug, slugify, statusOf, wholeNumber, fail,
} from './validation';
import { CATALOGUE_ERRORS, PRODUCT_STATUSES, type CatalogueProductInput, type CatalogueProductRow } from './types';
import { auditCatalogue, type CatalogueActor } from './audit';
import { applyAttributes, validateAttributes } from './attributes';

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.slug, p.product_code, p.description, p.image, p.additional_images,
         p.brand_id, p.brand_name, p.category, p.category_id, p.status, p.product_type,
         p.source_url, p.source_platform, p.original_price, p.currency, p.final_price,
         p.stock_status, p.express_available, p.created_at, p.updated_at, p.created_by, p.updated_by
    FROM products p`;

const LEGACY_ENUMS = {
  source_platform: ['SHEIN', 'AMAZON', 'TEMU', 'ALIEXPRESS', 'OTHER'],
  currency: ['TND', 'EUR', 'USD', 'GBP', 'JPY'],
  stock_status: ['AVAILABLE', 'LIMITED', 'OUT_OF_STOCK'],
};

type Result<T> = Check<T>;

function parseRow(row: Record<string, unknown> | undefined): CatalogueProductRow | null {
  if (!row) return null;
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    slug: row.slug ? String(row.slug) : null,
    product_code: row.product_code ? String(row.product_code) : null,
    description: row.description ? String(row.description) : null,
    image: row.image ? String(row.image) : null,
    brand_id: row.brand_id ? String(row.brand_id) : null,
    brand_name: row.brand_name ? String(row.brand_name) : null,
    category: row.category ? String(row.category) : null,
    category_id: row.category_id ? String(row.category_id) : null,
    status: String(row.status ?? 'DRAFT'),
    product_type: row.product_type ? String(row.product_type) : 'STANDARD',
    source_platform: String(row.source_platform ?? 'OTHER'),
    final_price: row.final_price === null || row.final_price === undefined ? null : Number(row.final_price),
    original_price: row.original_price === null || row.original_price === undefined ? null : Number(row.original_price),
    currency: row.currency ? String(row.currency) : null,
    stock_status: row.stock_status ? String(row.stock_status) : null,
    express_available: row.express_available === null || row.express_available === undefined ? null : Number(row.express_available),
    created_at: String(row.created_at ?? ''),
    updated_at: String(row.updated_at ?? ''),
    created_by: row.created_by ? String(row.created_by) : null,
    updated_by: row.updated_by ? String(row.updated_by) : null,
  };
}

export function getProduct(db: QatafoDatabase, id: string): CatalogueProductRow | null {
  if (!isIdentifier(id)) return null;
  return parseRow(db.get<Record<string, unknown>>(`${PRODUCT_SELECT} WHERE p.id=?`, id));
}

export interface CatalogueProductListQuery {
  search?: unknown;
  status?: unknown;
  brandId?: unknown;
  categoryId?: unknown;
  includeArchived?: unknown;
  page?: unknown;
  pageSize?: unknown;
}

/** `{ data, pagination }`, the shape every ERP Core list already returns. */
export function listProducts(db: QatafoDatabase, query: CatalogueProductListQuery = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
  const search = String(query.search ?? '').trim().slice(0, 200);
  const status = String(query.status ?? '').trim().toUpperCase();
  const where: string[] = [];
  const params: Array<string | number> = [];
  if (search) {
    // A SKU typed in the box must find its product: the variant is searched too.
    where.push('(p.name LIKE ? OR p.description LIKE ? OR p.brand_name LIKE ? OR p.category LIKE ? OR p.product_code LIKE ?'
      + ' OR EXISTS (SELECT 1 FROM catalogue_variants v WHERE v.product_id=p.id AND v.sku LIKE ?))');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (status && (allowedStatuses.product as readonly string[]).includes(status)) { where.push('p.status=?'); params.push(status); }
  else if (!boolFlag(query.includeArchived, 0)) { where.push("p.status<>'ARCHIVED'"); }
  if (isIdentifier(String(query.brandId ?? ''))) { where.push('p.brand_id=?'); params.push(String(query.brandId)); }
  if (isIdentifier(String(query.categoryId ?? ''))) { where.push('p.category_id=?'); params.push(String(query.categoryId)); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM products p ${clause}`, ...params)?.count ?? 0);
  const rows = db.all<Record<string, unknown>>(
    `${PRODUCT_SELECT} ${clause} ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize);
  const variantCounts = db.all<{ product_id: string; n: number }>(
    `SELECT product_id, COUNT(*) AS n FROM catalogue_variants WHERE product_id IN (${rows.map(() => '?').join(',') || "''"}) GROUP BY product_id`,
    ...rows.map((row) => String(row.id)));
  return {
    data: rows.map((row) => {
      const product = parseRow(row)!;
      return {
        ...product,
        additional_images: safeJsonArray(row.additional_images),
        variant_count: Number(variantCounts.find((entry) => entry.product_id === product.id)?.n ?? 0),
      };
    }),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

function safeJsonArray(value: unknown): string[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)).slice(0, 24) : [];
  } catch { return []; }
}

/** Validates a payload once, for both create and update (partial on update). */
function validateProductPayload(
  db: QatafoDatabase,
  input: CatalogueProductInput,
  existing: CatalogueProductRow | null,
): Result<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};
  if (existing === null || input.name !== undefined) {
    const name = requiredText(input.name, 'name', 2, 160);
    if (!name.ok) return propagate(name);
    payload.name = name.value;
  }
  if (input.status !== undefined) {
    const status = statusOf(input.status, 'status', allowedStatuses.product, existing?.status ?? 'DRAFT');
    if (!status.ok) return propagate(status);
    payload.status = status.value;
  } else if (existing === null) {
    payload.status = 'DRAFT';
  }
  if (input.description !== undefined) {
    const description = optionalText(input.description, 'description', 4000);
    if (!description.ok) return propagate(description);
    payload.description = description.value ?? '';
  }
  if (input.brand_id !== undefined) {
    const brandId = String(input.brand_id ?? '').trim();
    if (!brandId) { payload.brand_id = null; payload.brand_name = ''; }
    else if (!isIdentifier(brandId)) return fail(CATALOGUE_ERRORS.VALIDATION, 'Identifiant de marque invalide.', [{ field: 'brand_id', reason: 'FORMAT' }]);
    else {
      const brand = db.get<{ id: string; name: string }>('SELECT id,name FROM brands WHERE id=?', brandId);
      if (!brand) return fail(CATALOGUE_ERRORS.VALIDATION, `Marque « ${brandId} » inconnue.`, [{ field: 'brand_id', reason: 'NOT_FOUND' }]);
      payload.brand_id = brand.id;
      payload.brand_name = brand.name;
    }
  }
  if (input.category_id !== undefined) {
    const categoryId = String(input.category_id ?? '').trim();
    if (!categoryId) { payload.category_id = null; payload.category = ''; }
    else if (!isIdentifier(categoryId)) return fail(CATALOGUE_ERRORS.VALIDATION, 'Identifiant de catégorie invalide.', [{ field: 'category_id', reason: 'FORMAT' }]);
    else {
      const category = db.get<{ id: string; name: string; status: string }>('SELECT id,name,status FROM catalogue_categories WHERE id=?', categoryId);
      if (!category) return fail(CATALOGUE_ERRORS.CATEGORY_NOT_FOUND, `Catégorie « ${categoryId} » inconnue.`, [{ field: 'category_id', reason: 'NOT_FOUND' }]);
      if (category.status === 'ARCHIVED') return fail(CATALOGUE_ERRORS.CATEGORY_NOT_FOUND, `Catégorie « ${category.name} » est archivée.`, [{ field: 'category_id', reason: 'ARCHIVED' }]);
      payload.category_id = category.id;
      // Mirror for the consumers that still filter on the legacy free-text column.
      payload.category = category.name;
    }
  }
  for (const key of ['source_platform', 'currency', 'stock_status'] as const) {
    if (input[key] === undefined) continue;
    const raw = String(input[key]).trim().toUpperCase();
    if (!LEGACY_ENUMS[key].includes(raw)) {
      return fail(CATALOGUE_ERRORS.VALIDATION, `« ${key} » doit être l'un de: ${LEGACY_ENUMS[key].join(', ')}.`, [{ field: key, reason: 'ENUM' }]);
    }
    payload[key] = raw;
  }
  if (existing === null || input.original_price !== undefined) {
    const price = moneyOf(input.original_price, 'original_price');
    if (!price.ok) return propagate(price);
    payload.original_price = price.value ?? 0;
  }
  if (input.product_type !== undefined) {
    const type = requiredText(input.product_type, 'product_type', 2, 40);
    if (!type.ok) return propagate(type);
    payload.product_type = String(type.value).toUpperCase();
  }
  if (input.image !== undefined) {
    const image = mediaUrlOf(input.image, 'image');
    if (!image.ok) return propagate(image);
    payload.image = image.value;
  }
  if (input.additional_images !== undefined) {
    const raw = Array.isArray(input.additional_images) ? input.additional_images : [];
    const urls: string[] = [];
    for (const entry of raw.slice(0, 24)) {
      const url = mediaUrlOf(entry, 'additional_images');
      if (!url.ok) return propagate(url);
      urls.push(url.value);
    }
    payload.additional_images = JSON.stringify(urls);
  }
  if (input.source_url !== undefined) {
    const url = optionalText(input.source_url, 'source_url', 600);
    if (!url.ok) return propagate(url);
    payload.source_url = url.value ?? '';
  }
  if (input.express_available !== undefined) payload.express_available = boolFlag(input.express_available, 0);
  if (input.slug !== undefined) {
    const slug = explicitSlug(input.slug);
    if (!slug.ok) return propagate(slug);
    const resolved = resolveSlug(db, 'products', String(slug.value || (payload.name ? slugify(String(payload.name)) : existing?.slug || 'produit')), existing?.id ?? null, slug.value ? 'explicit' : 'generated');
    if (!resolved.ok) return propagate(resolved);
    payload.slug = resolved.value;
  } else if (existing === null) {
    const resolved = resolveSlug(db, 'products', slugify(String(payload.name ?? 'produit')), null, 'generated');
    if (!resolved.ok) return propagate(resolved);
    payload.slug = resolved.value;
  }
  return { ok: true, value: payload };
}

export interface CatalogueMutationOptions {
  actor: CatalogueActor;
  context?: Parameters<typeof auditCatalogue>[1]['context'];
  /** True when the caller holds `catalog:approve` (checked by the route). */
  mayPublish?: boolean;
  attributes?: unknown;
}

export function createProduct(db: QatafoDatabase, rawInput: unknown, options: CatalogueMutationOptions): Result<CatalogueProductRow> {
  const input = asObject(rawInput) as CatalogueProductInput;
  const validated = validateProductPayload(db, input, null);
  if (!validated.ok) return propagate(validated);
  const payload = validated.value;
  if (payload.status === 'ACTIVE' && !options.mayPublish) {
    return fail(CATALOGUE_ERRORS.PERMISSION_DENIED, 'Publier un produit demande la permission « approve ».', [{ field: 'status', reason: 'APPROVE_REQUIRED' }]);
  }
  // Attributs validés AVANT la transaction: une colonne mal typée doit répondre 400,
  // jamais laisser un produit à moitié écrit.
  const attributes = validateAttributes(db, input.attributes, 'product');
  if (!attributes.ok) return propagate(attributes);
  const id = `prod_${randomUUID()}`;
  const now = new Date().toISOString();
  const productCode = nextSequenceNumber(db, 'product_code');
  const existingCode = db.get<{ id: string }>('SELECT id FROM products WHERE product_code=?', productCode);
  if (existingCode) return fail(CATALOGUE_ERRORS.CODE_TAKEN, `Le code ${productCode} est déjà pris.`, [{ field: 'product_code', reason: 'TAKEN' }]);
  const columns = ['id', 'product_code', 'created_at', 'updated_at', 'created_by', ...Object.keys(payload)];
  const values: Array<string | number | null> = [id, productCode, now, now, options.actor.id, ...Object.values(payload) as Array<string | number | null>];
  try {
    db.transaction(() => {
      db.run(`INSERT INTO products (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...values);
      applyAttributes(db, { productId: id, variantId: null, values: attributes.value });
    });
  } catch (error: any) {
    return translateSqlError(error, payload);
  }
  const created = getProduct(db, id)!;
  auditCatalogue(db, {
    actor: options.actor, action: 'CREATE', resourceType: 'product', resourceId: id,
    before: null, after: created as unknown as Record<string, unknown>, context: options.context ?? null,
  });
  return { ok: true, value: created };
}

export function updateProduct(db: QatafoDatabase, id: string, rawInput: unknown, options: CatalogueMutationOptions): Result<CatalogueProductRow> {
  if (!isIdentifier(id)) return malformedId('id');
  const existing = getProduct(db, id);
  if (!existing) return fail(CATALOGUE_ERRORS.PRODUCT_NOT_FOUND, 'Produit introuvable.', [{ field: 'id', reason: 'NOT_FOUND' }]);
  const input = asObject(rawInput) as CatalogueProductInput;
  const validated = validateProductPayload(db, input, existing);
  if (!validated.ok) return propagate(validated);
  const payload = validated.value;
  const attributes = validateAttributes(db, input.attributes, 'product');
  if (!attributes.ok) return propagate(attributes);
  delete payload.product_code; // identity fields are not editable through this surface
  if (payload.status && payload.status !== existing.status && !options.mayPublish) {
    return fail(CATALOGUE_ERRORS.PERMISSION_DENIED, 'Changer le statut d’un produit demande la permission « approve ».', [{ field: 'status', reason: 'APPROVE_REQUIRED' }]);
  }
  const now = new Date().toISOString();
  payload.updated_at = now;
  payload.updated_by = options.actor.id;
  const assignments = Object.keys(payload).map((column) => `${column}=?`);
  try {
    db.transaction(() => {
      db.run(`UPDATE products SET ${assignments.join(',')} WHERE id=?`, ...Object.values(payload) as any[], id);
      if (input.attributes !== undefined) applyAttributes(db, { productId: id, variantId: null, values: attributes.value });
    });
  } catch (error: any) {
    return translateSqlError(error, payload);
  }
  const updated = getProduct(db, id)!;
  const before = existing as unknown as Record<string, unknown>;
  const after = updated as unknown as Record<string, unknown>;
  // STATUS_CHANGE produces the derived `product.status-changed` event; UPDATE the
  // `product.updated` one. Same writer, two honest verbs.
  const statusChanged = payload.status !== undefined && payload.status !== existing.status;
  auditCatalogue(db, {
    actor: options.actor, action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE',
    resourceType: 'product', resourceId: id, before, after, context: options.context ?? null,
  });
  return { ok: true, value: updated };
}

/**
 * Archiving, never deleting (Rule Zero): the row keeps its id, its audit history and its
 * links; the storefront stops showing it. The derived event is `product.archived`.
 */
export function archiveProduct(db: QatafoDatabase, id: string, options: CatalogueMutationOptions & { reason?: string }): Result<{ id: string; status: string }> {
  if (!isIdentifier(id)) return malformedId('id');
  const existing = getProduct(db, id);
  if (!existing) return fail(CATALOGUE_ERRORS.PRODUCT_NOT_FOUND, 'Produit introuvable.', [{ field: 'id', reason: 'NOT_FOUND' }]);
  if (existing.status === 'ARCHIVED') return { ok: true, value: { id, status: 'ARCHIVED' } };
  const now = new Date().toISOString();
  db.run("UPDATE products SET status='ARCHIVED', updated_at=?, updated_by=? WHERE id=?", now, options.actor.id, id);
  auditCatalogue(db, {
    actor: options.actor, action: 'ARCHIVE', resourceType: 'product', resourceId: id,
    before: { status: existing.status }, after: { status: 'ARCHIVED' },
    note: options.reason ? { reason: String(options.reason).slice(0, 300) } : null,
    context: options.context ?? null,
  });
  return { ok: true, value: { id, status: 'ARCHIVED' } };
}

/** Only the two errors a well-formed payload can still hit: unique constraints. */
function translateSqlError(error: any, payload: Record<string, unknown>): Check<never> {
  const text = String(error?.message || error || '');
  if (/UNIQUE.*products\.slug|idx_products_slug_unique/i.test(text)) {
    return fail(CATALOGUE_ERRORS.SLUG_TAKEN, 'Ce slug est déjà utilisé.', [{ field: 'slug', reason: 'TAKEN' }]);
  }
  if (/UNIQUE.*product_code/i.test(text)) {
    return fail(CATALOGUE_ERRORS.CODE_TAKEN, 'Ce code produit est déjà utilisé.', [{ field: 'product_code', reason: 'TAKEN' }]);
  }
  if (/FOREIGN KEY/i.test(text)) {
    const field = String(payload.category_id ?? '') ? 'category_id' : 'brand_id';
    return fail(CATALOGUE_ERRORS.VALIDATION, 'Référence inconnue: la marque ou la catégorie n’existe pas.', [{ field, reason: 'FOREIGN_KEY' }]);
  }
  if (/CHECK/i.test(text)) {
    return fail(CATALOGUE_ERRORS.VALIDATION, 'Valeur refusée par une contrainte de la base.', [{ field: 'status', reason: 'CHECK' }]);
  }
  return fail(CATALOGUE_ERRORS.CONFLICT, text.slice(0, 300) || 'Conflit d’enregistrement.');
}

export const productStatusList = PRODUCT_STATUSES;
