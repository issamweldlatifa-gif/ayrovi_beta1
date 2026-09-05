/**
 * AYROVI Catalogue (P2.1) — brands, on the entity that already exists.
 *
 * `brands` was already the canonical brand table: 10 rows, `name UNIQUE COLLATE NOCASE`,
 * a CHECKed `category`, `active`, `display_order`, read by the storefront, the CRM arrivals
 * screen and `products.brand_id`. It was NOT replaced or copied — the catalogue only adds
 * the one thing it never had: a stable `slug` for URLs (additive column + partial unique
 * index), plus this validated/audited service layer.
 *
 * `active` (0/1) is the existing, widely-read flag, so it stays the storage of truth and
 * is exposed here as a status word: `ACTIVE` / `ARCHIVED`. `products.brand_name` remains
 * a denormalised display mirror, refreshed by `updateProduct`.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { propagate, type Check,asObject, explicitSlug, fail, isIdentifier, malformedId, mediaUrlOf, optionalText, requiredText, resolveSlug, slugify, wholeNumber } from './validation';
import { CATALOGUE_ERRORS, type CatalogueBrandInput } from './types';
import { auditCatalogue, type CatalogueActor } from './audit';

export const BRAND_CATEGORIES = ['FASHION', 'SPORT_LIFESTYLE', 'BEAUTY', 'TECH', 'HOME', 'OTHER'] as const;

export type BrandResult<T> = Check<T>;

export interface CatalogueBrandRow {
  id: string;
  name: string;
  slug: string | null;
  category: string;
  status: string;
  logo: string | null;
  image: string | null;
  url: string;
  description: string;
  display_order: number;
  product_count: number;
  created_at: string;
  updated_at: string;
}

const BRAND_SELECT = `SELECT id, name, slug, category, active, logo, image, url, description, display_order, created_at, updated_at FROM brands`;

function mapBrand(row: Record<string, unknown> | undefined): CatalogueBrandRow | null {
  if (!row) return null;
  return {
    id: String(row.id), name: String(row.name ?? ''),
    slug: row.slug ? String(row.slug) : null,
    category: String(row.category ?? 'OTHER'),
    status: Number(row.active ?? 0) === 1 ? 'ACTIVE' : 'ARCHIVED',
    logo: row.logo ? String(row.logo) : null,
    image: row.image ? String(row.image) : null,
    url: String(row.url ?? ''), description: String(row.description ?? ''),
    display_order: Number(row.display_order ?? 0),
    product_count: Number(row.product_count ?? 0),
    created_at: String(row.created_at ?? ''), updated_at: String(row.updated_at ?? ''),
  };
}

export function getBrand(db: QatafoDatabase, id: string): CatalogueBrandRow | null {
  if (!isIdentifier(id)) return null;
  const row = db.get<Record<string, unknown>>(`${BRAND_SELECT} WHERE id=?`, id);
  if (!row) return null;
  const count = Number(db.get<{ n: number }>('SELECT COUNT(*) AS n FROM products WHERE brand_id=?', id)?.n ?? 0);
  return mapBrand({ ...row, product_count: count });
}

export function listBrands(db: QatafoDatabase, query: { search?: unknown; status?: unknown; page?: unknown; pageSize?: unknown } = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 50));
  const search = String(query.search ?? '').trim().slice(0, 120);
  const status = String(query.status ?? '').trim().toUpperCase();
  const where: string[] = [];
  const params: Array<string> = [];
  if (search) { where.push('(b.name LIKE ? OR b.description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (status === 'ACTIVE') where.push('b.active=1');
  else if (status === 'ARCHIVED') where.push('b.active=0');
  else if (!status) where.push('b.active=1');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(db.get<{ count: number }>(`SELECT COUNT(*) AS count FROM brands b ${clause}`, ...params)?.count ?? 0);
  const rows = db.all<Record<string, unknown>>(
    `SELECT b.*, (SELECT COUNT(*) FROM products p WHERE p.brand_id=b.id) AS product_count
       FROM brands b ${clause} ORDER BY b.display_order, b.name LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize);
  return {
    data: rows.map((row) => mapBrand(row)!),
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

function buildBrandPayload(db: QatafoDatabase, input: CatalogueBrandInput, existing: CatalogueBrandRow | null): BrandResult<Record<string, unknown>> {
  const payload: Record<string, unknown> = {};
  if (existing === null || input.name !== undefined) {
    const name = requiredText(input.name, 'name', 2, 60);
    if (!name.ok) return propagate(name);
    const clash = db.get<{ id: string }>('SELECT id FROM brands WHERE name=? COLLATE NOCASE AND id IS NOT ?', name.value, existing?.id ?? null);
    if (clash) return fail(CATALOGUE_ERRORS.CONFLICT, `La marque « ${name.value} » existe déjà.`, [{ field: 'name', reason: 'TAKEN' }]);
    payload.name = name.value;
  }
  if (existing === null || input.category !== undefined) {
    const category = String(input.category ?? existing?.category ?? 'OTHER').trim().toUpperCase();
    if (!(BRAND_CATEGORIES as readonly string[]).includes(category)) {
      return fail(CATALOGUE_ERRORS.VALIDATION, `category doit être l'un de: ${BRAND_CATEGORIES.join(', ')}.`, [{ field: 'category', reason: 'ENUM' }]);
    }
    payload.category = category;
  }
  if (input.status !== undefined) {
    const status = String(input.status).trim().toUpperCase();
    if (!['ACTIVE', 'ARCHIVED'].includes(status)) {
      return fail(CATALOGUE_ERRORS.STATUS_INVALID, 'status doit être ACTIVE ou ARCHIVED.', [{ field: 'status', reason: 'ENUM' }]);
    }
    payload.active = status === 'ACTIVE' ? 1 : 0;
  } else if (existing === null) {
    payload.active = 1;
  }
  if (input.display_order !== undefined || existing === null) {
    const order = wholeNumber(input.display_order, 'display_order', 0, 9999, existing?.display_order ?? 0);
    if (!order.ok) return propagate(order);
    payload.display_order = order.value;
  }
  for (const key of ['url', 'description'] as const) {
    if (input[key] === undefined) continue;
    const text = optionalText(input[key], key, key === 'url' ? 400 : 2000);
    if (!text.ok) return propagate(text);
    payload[key] = text.value ?? '';
  }
  for (const key of ['logo', 'image'] as const) {
    if (input[key] === undefined) continue;
    const raw = String(input[key] ?? '').trim();
    if (!raw) { payload[key] = ''; continue; }
    const url = mediaUrlOf(raw, key);
    if (!url.ok) return propagate(url);
    payload[key] = url.value;
  }
  if (input.slug !== undefined) {
    const slug = explicitSlug(input.slug);
    if (!slug.ok) return propagate(slug);
    const wanted = slug.value ?? slugify(String(payload.name ?? existing?.name ?? 'marque'));
    const resolved = resolveSlug(db, 'brands', wanted, existing?.id ?? null, slug.value ? 'explicit' : 'generated');
    if (!resolved.ok) return propagate(resolved);
    payload.slug = resolved.value;
  } else if (existing === null) {
    const resolved = resolveSlug(db, 'brands', slugify(String(payload.name ?? 'marque')), null, 'generated');
    if (!resolved.ok) return propagate(resolved);
    payload.slug = resolved.value;
  }
  return { ok: true, value: payload };
}

export interface BrandMutationOptions {
  actor: CatalogueActor;
  context?: Parameters<typeof auditCatalogue>[1]['context'];
}

export function createBrand(db: QatafoDatabase, rawInput: unknown, options: BrandMutationOptions): BrandResult<CatalogueBrandRow> {
  const input = asObject(rawInput) as CatalogueBrandInput;
  const built = buildBrandPayload(db, input, null);
  if (!built.ok) return propagate(built);
  const id = `brand_${randomUUID()}`;
  const now = new Date().toISOString();
  const payload = { ...built.value, id, created_at: now, updated_at: now };
  const columns = Object.keys(payload);
  try {
    db.run(`INSERT INTO brands (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`, ...Object.values(payload) as any[]);
  } catch (error: any) {
    return translate(error);
  }
  const created = getBrand(db, id)!;
  auditCatalogue(db, {
    actor: options.actor, action: 'CREATE', resourceType: 'brand', resourceId: id,
    before: null, after: created as unknown as Record<string, unknown>, context: options.context ?? null,
  });
  return { ok: true, value: created };
}

export function updateBrand(db: QatafoDatabase, id: string, rawInput: unknown, options: BrandMutationOptions): BrandResult<CatalogueBrandRow> {
  if (!isIdentifier(id)) return malformedId('id');
  const existing = getBrand(db, id);
  if (!existing) return fail(CATALOGUE_ERRORS.NOT_FOUND, 'Marque introuvable.', [{ field: 'id', reason: 'NOT_FOUND' }]);
  const input = asObject(rawInput) as CatalogueBrandInput;
  const built = buildBrandPayload(db, input, existing);
  if (!built.ok) return propagate(built);
  const payload = built.value;
  payload.updated_at = new Date().toISOString();
  const assignments = Object.keys(payload).map((column) => `${column}=?`);
  try {
    db.transaction(() => {
      db.run(`UPDATE brands SET ${assignments.join(',')} WHERE id=?`, ...Object.values(payload) as any[], id);
      // `products.brand_name` is a display mirror kept by the legacy admin screen; when a
      // brand is renamed here the mirror follows, otherwise the storefront and the order
      // lines would keep showing the old spelling.
      if (payload.name && payload.name !== existing.name) {
        db.run('UPDATE products SET brand_name=? WHERE brand_id=?', String(payload.name), id);
      }
    });
  } catch (error: any) {
    return translate(error);
  }
  const updated = getBrand(db, id)!;
  const statusChanged = payload.active !== undefined && (payload.active ? 'ACTIVE' : 'ARCHIVED') !== existing.status;
  auditCatalogue(db, {
    actor: options.actor, action: statusChanged ? 'STATUS_CHANGE' : 'UPDATE', resourceType: 'brand', resourceId: id,
    before: existing as unknown as Record<string, unknown>, after: updated as unknown as Record<string, unknown>,
    context: options.context ?? null,
  });
  return { ok: true, value: updated };
}

function translate(error: any): BrandResult<never> {
  const text = String(error?.message || error || '');
  if (/UNIQUE.*brands\.name|brands\.name/i.test(text)) {
    return fail(CATALOGUE_ERRORS.CONFLICT, 'Ce nom de marque existe déjà.', [{ field: 'name', reason: 'TAKEN' }]);
  }
  if (/UNIQUE.*brands\.slug|idx_brands_slug_unique/i.test(text)) {
    return fail(CATALOGUE_ERRORS.SLUG_TAKEN, 'Ce slug de marque est déjà utilisé.', [{ field: 'slug', reason: 'TAKEN' }]);
  }
  if (/CHECK/i.test(text)) {
    return fail(CATALOGUE_ERRORS.VALIDATION, 'Valeur refusée par une contrainte de la base (category).', [{ field: 'category', reason: 'CHECK' }]);
  }
  return fail(CATALOGUE_ERRORS.CONFLICT, text.slice(0, 300) || 'Conflit d’enregistrement.');
}
