/**
 * AYROVI Catalogue (P2.1) — the minimal, extensible attribute foundation.
 *
 * Not an attribute engine: two tables.
 *   • `catalogue_attributes` declares what exists (key, label, data type, whether it
 *     applies to a product or to a variant, and the allowed options for a SELECT);
 *   • `catalogue_attribute_values` stores one text value per (key, product, variant).
 *
 * Why text storage + declared types: a JSON blob per row would make "find every shoe of
 * size 42" a scan, and a column per attribute is how this app already leaks — `size`,
 * `color`, `variant` are hard-coded in `order_items` and `crm_extracted_products`, which
 * is exactly why those tables cannot be joined to a catalogue today. Declaring the type
 * here keeps validation server-side and lets a later phase add indexing/typed columns
 * without touching call sites. `size` and `color` still live on the variant, because the
 * existing checkout and CRM flows already require them as first-class fields.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { propagate, type Check,asObject, boolFlag, isIdentifier, requiredText } from './validation';
import { ATTRIBUTE_DATA_TYPES, CATALOGUE_ERRORS, type CatalogueAttributeInput } from './types';
import { auditCatalogue, type CatalogueActor } from './audit';

export interface CatalogueAttributeRow {
  id: string;
  attribute_key: string;
  label: string;
  data_type: string;
  applies_to: string;
  options: string[];
  status: string;
  sort_order: number;
}

type AttrResult<T> = Check<T>;

const MAX_ATTRIBUTES_PER_OWNER = 24;

const BOOLEAN_TRUE = ['1', 'true', 'yes', 'on'];
const BOOLEAN_FALSE = ['0', 'false', 'no', 'off'];

function isBooleanish(value: unknown): boolean {
  if (typeof value === 'boolean') return true;
  const text = String(value ?? '').trim().toLowerCase();
  return BOOLEAN_TRUE.includes(text) || BOOLEAN_FALSE.includes(text);
}

function mapAttribute(row: Record<string, unknown>): CatalogueAttributeRow {
  let options: string[] = [];
  try {
    const parsed = JSON.parse(String(row.options ?? '[]'));
    if (Array.isArray(parsed)) options = parsed.map((entry) => String(entry)).slice(0, 100);
  } catch { options = []; }
  return {
    id: String(row.id), attribute_key: String(row.attribute_key), label: String(row.label),
    data_type: String(row.data_type ?? 'TEXT'), applies_to: String(row.applies_to ?? 'variant'),
    options, status: String(row.status ?? 'ACTIVE'), sort_order: Number(row.sort_order ?? 100),
  };
}

export function listAttributes(db: QatafoDatabase, appliesTo?: string): CatalogueAttributeRow[] {
  const rows = appliesTo === 'product' || appliesTo === 'variant'
    ? db.all<Record<string, unknown>>('SELECT * FROM catalogue_attributes WHERE applies_to=? AND status<>? ORDER BY sort_order, attribute_key', appliesTo, 'ARCHIVED')
    : db.all<Record<string, unknown>>('SELECT * FROM catalogue_attributes WHERE status<>? ORDER BY applies_to, sort_order, attribute_key', 'ARCHIVED');
  return rows.map(mapAttribute);
}

/** Reads the declared catalogue of attributes (used by GET /attributes and validation). */
function attributeMap(db: QatafoDatabase): Record<string, CatalogueAttributeRow> {
  const map: Record<string, CatalogueAttributeRow> = {};
  for (const row of listAttributes(db)) map[row.attribute_key] = row;
  return map;
}

/**
 * Validates `{ key: value }` against the declared attributes. An unknown key is refused
 * rather than ignored: a typo in a product sheet must not become invisible data.
 */
export function validateAttributes(db: QatafoDatabase, raw: unknown, appliesTo: 'product' | 'variant'): AttrResult<Record<string, string>> {
  if (raw === undefined || raw === null || raw === '') return { ok: true, value: {} };
  if (Array.isArray(raw)) {
    return { ok: false, code: CATALOGUE_ERRORS.ATTRIBUTE_UNKNOWN, message: '« attributes » doit être un objet clé/valeur.', details: [{ field: 'attributes', reason: 'TYPE' }] };
  }
  const source = asObject(raw);
  const keys = Object.keys(source);
  if (!keys.length) return { ok: true, value: {} };
  if (keys.length > MAX_ATTRIBUTES_PER_OWNER) {
    return { ok: false, code: CATALOGUE_ERRORS.VALIDATION, message: `Trop d’attributs (${MAX_ATTRIBUTES_PER_OWNER} maximum).`, details: [{ field: 'attributes', reason: 'TOO_MANY' }] };
  }
  const declared = attributeMap(db);
  const values: Record<string, string> = {};
  const details: Array<{ field: string; reason: string }> = [];
  for (const key of keys) {
    const attribute = declared[key];
    if (!attribute || attribute.status === 'ARCHIVED') {
      details.push({ field: `attributes.${key}`, reason: CATALOGUE_ERRORS.ATTRIBUTE_UNKNOWN });
      continue;
    }
    if (attribute.applies_to !== appliesTo) {
      details.push({ field: `attributes.${key}`, reason: `APPLIES_TO_${attribute.applies_to.toUpperCase()}` });
      continue;
    }
    const supplied = source[key];
    if (supplied === null || supplied === undefined || supplied === '') continue;
    if (attribute.data_type === 'NUMBER' && !Number.isFinite(Number(supplied))) {
      details.push({ field: `attributes.${key}`, reason: 'NOT_A_NUMBER' });
      continue;
    }
    if (attribute.data_type === 'BOOLEAN' && !isBooleanish(supplied)) {
      details.push({ field: `attributes.${key}`, reason: 'NOT_A_BOOLEAN' });
      continue;
    }
    if (attribute.data_type === 'SELECT' && !attribute.options.includes(String(supplied).trim())) {
      details.push({ field: `attributes.${key}`, reason: 'NOT_IN_OPTIONS' });
      continue;
    }
    const text = String(supplied).trim().slice(0, 400);
    if (!text) continue;
    values[key] = text;
  }
  if (details.length) {
    return { ok: false, code: CATALOGUE_ERRORS.ATTRIBUTE_TYPE_MISMATCH, message: 'Certains attributs ne sont pas conformes à la déclaration du catalogue.', details };
  }
  return { ok: true, value: values };
}

/**
 * Replaces the attribute values of one owner. Runs inside the caller's transaction, so a
 * product update and its attributes are never half-applied. Product-level rows keep
 * `variant_id` NULL; SQLite treats NULLs as distinct in a UNIQUE index, hence the
 * explicit update-then-insert instead of an upsert clause.
 */
export function applyAttributes(db: QatafoDatabase, input: { productId: string; variantId?: string | null; values: Record<string, string> }): { applied: number } {
  const variantId = input.variantId ?? null;
  const keys = Object.keys(input.values);
  if (!isIdentifier(input.productId)) return { applied: 0 };
  for (const key of keys) {
    const existing = variantId
      ? db.get<{ id: string }>('SELECT id FROM catalogue_attribute_values WHERE attribute_key=? AND product_id=? AND variant_id=?', key, input.productId, variantId)
      : db.get<{ id: string }>('SELECT id FROM catalogue_attribute_values WHERE attribute_key=? AND product_id=? AND variant_id IS NULL', key, input.productId);
    const now = new Date().toISOString();
    if (existing) {
      db.run('UPDATE catalogue_attribute_values SET value_text=?, updated_at=? WHERE id=?', input.values[key], now, existing.id);
      continue;
    }
    db.run(`INSERT INTO catalogue_attribute_values (id,attribute_key,product_id,variant_id,value_text,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?)`, `attrv_${randomUUID()}`, key, input.productId, variantId, input.values[key], now, now);
  }
  // A key removed from the payload is removed from the row set (a replace, not an append).
  const placeholders = keys.length ? keys.map(() => '?').join(',') : null;
  if (placeholders) {
    if (variantId) {
      db.run(`DELETE FROM catalogue_attribute_values WHERE product_id=? AND variant_id=? AND attribute_key NOT IN (${placeholders})`,
        input.productId, variantId, ...keys);
    } else {
      db.run(`DELETE FROM catalogue_attribute_values WHERE product_id=? AND variant_id IS NULL AND attribute_key NOT IN (${placeholders})`,
        input.productId, ...keys);
    }
  }
  return { applied: keys.length };
}

export function readAttributes(db: QatafoDatabase, productId: string, variantId: string | null): Record<string, string> {
  const rows = variantId
    ? db.all<{ attribute_key: string; value_text: string }>('SELECT attribute_key, value_text FROM catalogue_attribute_values WHERE product_id=? AND variant_id=?', productId, variantId)
    : db.all<{ attribute_key: string; value_text: string }>('SELECT attribute_key, value_text FROM catalogue_attribute_values WHERE product_id=? AND variant_id IS NULL', productId);
  const out: Record<string, string> = {};
  for (const row of rows) out[row.attribute_key] = row.value_text;
  return out;
}

export function createAttribute(db: QatafoDatabase, rawInput: unknown, actor: CatalogueActor): AttrResult<CatalogueAttributeRow> {
  const input = asObject(rawInput) as CatalogueAttributeInput;
  const key = requiredText(input.attribute_key, 'attribute_key', 2, 40);
  if (!key.ok) return propagate(key);
  const normalized = String(key.value).toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(normalized)) {
    return { ok: false, code: CATALOGUE_ERRORS.VALIDATION, message: 'Clé d’attribut invalide (minuscules, chiffres, « _ », commence par une lettre).', details: [{ field: 'attribute_key', reason: 'FORMAT' }] };
  }
  if (db.get<{ id: string }>('SELECT id FROM catalogue_attributes WHERE attribute_key=?', normalized)) {
    return { ok: false, code: CATALOGUE_ERRORS.CONFLICT, message: `L’attribut « ${normalized} » existe déjà.`, details: [{ field: 'attribute_key', reason: 'TAKEN' }] };
  }
  const label = requiredText(input.label ?? normalized, 'label', 2, 80);
  if (!label.ok) return propagate(label);
  const dataType = String(input.data_type ?? 'TEXT').trim().toUpperCase();
  if (!ATTRIBUTE_DATA_TYPES.includes(dataType as (typeof ATTRIBUTE_DATA_TYPES)[number])) {
    return { ok: false, code: CATALOGUE_ERRORS.VALIDATION, message: `data_type doit être l'un de: ${ATTRIBUTE_DATA_TYPES.join(', ')}.`, details: [{ field: 'data_type', reason: 'ENUM' }] };
  }
  const appliesTo = String(input.target ?? 'variant').trim().toLowerCase();
  if (appliesTo !== 'product' && appliesTo !== 'variant') {
    return { ok: false, code: CATALOGUE_ERRORS.VALIDATION, message: 'target doit être « product » ou « variant ».', details: [{ field: 'target', reason: 'ENUM' }] };
  }
  const options = Array.isArray(input.options) ? input.options.slice(0, 100).map((entry) => String(entry).trim()).filter(Boolean) : [];
  if (dataType === 'SELECT' && options.length < 1) {
    return { ok: false, code: CATALOGUE_ERRORS.VALIDATION, message: 'Un attribut SELECT doit déclarer au moins une option.', details: [{ field: 'options', reason: 'REQUIRED' }] };
  }
  const sort = Number.isFinite(Number(input.sort_order)) ? Math.min(9999, Math.max(0, Math.trunc(Number(input.sort_order)))) : 100;
  const now = new Date().toISOString();
  const id = `attr_${randomUUID()}`;
  db.run(`INSERT INTO catalogue_attributes (id,attribute_key,label,data_type,applies_to,options,status,sort_order,created_at,updated_at)
    VALUES (?,?,?,?,?,?,'ACTIVE',?,?,?)`, id, normalized, label.value, dataType, appliesTo, JSON.stringify(options), sort, now, now);
  const created = mapAttribute(db.get<Record<string, unknown>>('SELECT * FROM catalogue_attributes WHERE id=?', id)!);
  auditCatalogue(db, {
    actor, action: 'CREATE', resourceType: 'product_attribute', resourceId: id,
    before: null, after: created as unknown as Record<string, unknown>,
  });
  return { ok: true, value: created };
}
