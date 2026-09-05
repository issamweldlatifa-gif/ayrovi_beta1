/**
 * AYROVI Catalogue (P2.1) — server-side validation.
 *
 * The back office is not the authority: every rule that protects the integrity of the
 * catalogue (unique SKU, unique slug per namespace, known brand/category, controlled
 * status, sane ids, no private path behind a public media reference) is evaluated here,
 * before any SQL, and returns a coded failure the route answers with directly.
 *
 * Slugs are never silently rewritten over an existing row: an auto-generated slug gets
 * a numeric suffix, and a slug the caller explicitly asked for is a 409 on collision.
 */
import path from 'node:path';
import type { QatafoDatabase } from '../db/database';
import { isPrivateDocumentPath, isPublicUploadPath } from '../erp-core/storage';
import {
  CATALOGUE_ERRORS, CATALOGUE_STATUSES, MEDIA_TYPES, MAX_CATEGORY_DEPTH,
  PRODUCT_STATUSES, VARIANT_STATUSES,
} from './types';

/**
 * One flat result shape for the whole catalogue.
 *
 * `strict: false` in this repo disables discriminated-union narrowing, so the usual
 * `{ ok: true, value } | { ok: false, code }` would force a `!` on every field access.
 * A flat `Check<T>` keeps the same information and survives the compiler: check `ok`,
 * then read `value` (valid) or hand the whole object to `propagate()` (invalid).
 */
export interface FieldIssue { field: string; reason: string }

export interface Check<T> {
  ok: boolean;
  value?: T;
  code?: string;
  message?: string;
  details?: FieldIssue[];
}

/** Wraps a failed check into the shape a service returns. */
export function propagate<T>(check: Check<any>): Check<T> {
  return { ok: false, code: check.code ?? CATALOGUE_ERRORS.VALIDATION, message: check.message ?? 'Payload catalogue invalide.', details: check.details };
}

const ID_RE = /^[A-Za-z0-9_-]{1,80}$/;
const SKU_RE = /^[A-Z0-9][A-Z0-9._-]{1,63}$/;
const BARCODE_RE = /^[A-Za-z0-9]{6,18}$/;
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const COMBINING_MARKS = /[\u0300-\u036f]/g;

export function fail(code: string, message: string, details?: FieldIssue[]): Check<never> {
  return { ok: false, code, message, ...(details && details.length ? { details } : {}) };
}

export function isIdentifier(value: unknown): boolean {
  return typeof value === 'string' && ID_RE.test(value.trim());
}

/** Trims and bounds a required text field. */
export function requiredText(value: unknown, field: string, min: number, max: number): Check<string > {
  const text = String(value ?? '').trim();
  if (text.length < min) return fail(CATALOGUE_ERRORS.VALIDATION, `« ${field} » est requis (${min} caractères minimum).`, [{ field, reason: 'REQUIRED' }]);
  if (text.length > max) return fail(CATALOGUE_ERRORS.VALIDATION, `« ${field} » dépasse ${max} caractères.`, [{ field, reason: 'TOO_LONG' }]);
  return { ok: true, value: text };
}

export function optionalText(value: unknown, field: string, max: number): Check<string | null > {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const text = String(value).trim();
  if (text.length > max) return fail(CATALOGUE_ERRORS.VALIDATION, `« ${field} » dépasse ${max} caractères.`, [{ field, reason: 'TOO_LONG' }]);
  return { ok: true, value: text };
}

export function statusOf(value: unknown, field: string, allowed: readonly string[], fallback: string): Check<string > {
  const raw = value === undefined || value === null || value === '' ? fallback : String(value).trim().toUpperCase();
  if (!allowed.includes(raw)) {
    return fail(CATALOGUE_ERRORS.STATUS_INVALID, `« ${field} » doit être l'un de: ${allowed.join(', ')}.`, [{ field, reason: 'STATUS_NOT_ALLOWED' }]);
  }
  return { ok: true, value: raw };
}

export function wholeNumber(value: unknown, field: string, min: number, max: number, fallback: number): Check<number > {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
  const num = Number(value);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < min || num > max) {
    return fail(CATALOGUE_ERRORS.VALIDATION, `« ${field} » doit être un entier entre ${min} et ${max}.`, [{ field, reason: 'OUT_OF_RANGE' }]);
  }
  return { ok: true, value: num };
}

export function moneyOf(value: unknown, field: string): Check<number | null > {
  if (value === undefined || value === null || value === '') return { ok: true, value: null };
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0 || num > 1_000_000_000) {
    return fail(CATALOGUE_ERRORS.VALIDATION, `« ${field} » doit être un montant positif.`, [{ field, reason: 'INVALID_MONEY' }]);
  }
  return { ok: true, value: Math.round(num * 1000) / 1000 };
}

/** Normalize + validate a SKU. Uniqueness is case-insensitive on purpose. */
export function skuOf(value: unknown): Check<string > {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return fail(CATALOGUE_ERRORS.SKU_REQUIRED, 'Le SKU est requis.', [{ field: 'sku', reason: 'REQUIRED' }]);
  if (!SKU_RE.test(raw)) {
    return fail(CATALOGUE_ERRORS.VALIDATION, 'SKU invalide: 2 à 64 caractères A-Z, 0-9, « . », « _ », « - », en majuscules.', [{ field: 'sku', reason: 'FORMAT' }]);
  }
  return { ok: true, value: raw };
}

export function barcodeOf(value: unknown): Check<string | null > {
  const raw = String(value ?? '').trim();
  if (!raw) return { ok: true, value: null };
  if (!BARCODE_RE.test(raw)) return fail(CATALOGUE_ERRORS.VALIDATION, 'Code-barres invalide: 6 à 18 caractères alphanumériques.', [{ field: 'barcode', reason: 'FORMAT' }]);
  return { ok: true, value: raw };
}

/** Accent-free, lower-case slug from a display name. A display convenience, not a rule. */
export function slugify(input: string): string {
  const latin = String(input || '')
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[€£$&+/]/g, '-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
  return latin || 'element';
}

export function explicitSlug(value: unknown): Check<string | null > {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return { ok: true, value: null };
  if (!SLUG_RE.test(raw)) {
    return fail(CATALOGUE_ERRORS.SLUG_INVALID, 'Slug invalide: minuscules, chiffres et tirets, 1 à 80 caractères.', [{ field: 'slug', reason: 'FORMAT' }]);
  }
  return { ok: true, value: raw };
}

type SlugTable = 'products' | 'catalogue_categories' | 'brands';

function slugTaken(db: QatafoDatabase, table: SlugTable, candidate: string, excludeId: string | null): boolean {
  const row = excludeId
    ? db.get<{ id: string }>(`SELECT id FROM ${table} WHERE slug=? AND id<>?`, candidate, excludeId)
    : db.get<{ id: string }>(`SELECT id FROM ${table} WHERE slug=?`, candidate);
  return Boolean(row);
}

/**
 * Pick a free slug inside one namespace. A generated candidate is suffixed until free
 * (`chaussures-homme`, `chaussures-homme-2`, …); an explicit slug already owned by
 * another row is a conflict — silently replacing that row's public URL is worse.
 */
export function resolveSlug(
  db: QatafoDatabase,
  table: SlugTable,
  wanted: string,
  excludeId: string | null,
  mode: 'generated' | 'explicit' = 'generated',
): Check<string > {
  if (!slugTaken(db, table, wanted, excludeId)) return { ok: true, value: wanted };
  if (mode === 'explicit') {
    return fail(CATALOGUE_ERRORS.SLUG_TAKEN, `Le slug « ${wanted} » appartient déjà à un autre enregistrement.`, [{ field: 'slug', reason: 'TAKEN' }]);
  }
  // The wanted slug is never rewritten or shortened to make room: a name ending in
  // digits ("Air Max 90", a timestamped import) must still collide predictably, so the
  // counter is appended to the full slug. Nothing is overwritten — the first free one wins.
  for (let suffix = 2; suffix <= 200; suffix += 1) {
    const candidate = `${wanted}-${suffix}`.slice(0, 80);
    if (!slugTaken(db, table, candidate, excludeId)) return { ok: true, value: candidate };
  }
  return fail(CATALOGUE_ERRORS.SLUG_TAKEN, 'Trop de variantes de slug pour ce nom.', [{ field: 'slug', reason: 'EXHAUSTED' }]);
}

/** Media policy (P0/P1 rule carried into the catalogue). */
export function mediaUrlOf(value: unknown, field = 'url'): Check<string > {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 600) return fail(CATALOGUE_ERRORS.MEDIA_URL_INVALID, 'URL de média requise (600 caractères maximum).', [{ field, reason: raw ? 'TOO_LONG' : 'REQUIRED' }]);
  if (/^(file|data|blob|javascript|vbscript):/i.test(raw)) return fail(CATALOGUE_ERRORS.MEDIA_URL_INVALID, 'Schéma d’URL non autorisé pour un média catalogue.', [{ field, reason: 'SCHEME' }]);
  if (raw.startsWith('/uploads/')) {
    const relative = raw.slice('/uploads/'.length).split('?')[0].split('#')[0];
    if (!relative || relative.includes('..') || relative.includes('\\')) {
      return fail(CATALOGUE_ERRORS.MEDIA_URL_INVALID, 'Chemin de média non autorisé.', [{ field, reason: 'TRAVERSAL' }]);
    }
    // Same helper the /uploads guard uses: only the public tree may be referenced,
    // so a private invoice/proof/employee document can never become a product picture.
    const absolute = path.resolve(process.cwd(), 'data', 'uploads', relative);
    if (!isPublicUploadPath(absolute)) {
      // Deny by default, exactly like the static guard in src/server.ts: a reference the
      // server would refuse to serve publicly cannot be stored as catalogue media either,
      // so no private document (invoice, payment proof, employee file) can leak through a
      // product picture URL. Unknown folders are refused too, not silently public.
      return fail(CATALOGUE_ERRORS.MEDIA_PRIVATE_PATH, 'Ce chemin n’est pas servi publiquement: il ne peut pas devenir un média catalogue.', [{ field, reason: isPrivateDocumentPath(absolute) ? 'PRIVATE_PATH' : 'NOT_PUBLIC' }]);
    }
    return { ok: true, value: raw };
  }
  if (/^https?:\/\//i.test(raw)) return { ok: true, value: raw };
  return fail(CATALOGUE_ERRORS.MEDIA_URL_INVALID, 'Le média doit être une URL http(s) ou un chemin /uploads/….', [{ field, reason: 'FORMAT' }]);
}

/** Payload sanity before destructuring — `null`, arrays and strings are handled cleanly. */
export function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export function boolFlag(value: unknown, fallback: 0 | 1): 0 | 1 {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const text = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(text)) return 1;
  if (['0', 'false', 'no', 'off'].includes(text)) return 0;
  return fallback;
}

export function malformedId(field = 'id'): Check<never> {
  return fail(CATALOGUE_ERRORS.ID_MALFORMED, `Identifiant « ${field} » malformé.`, [{ field, reason: 'FORMAT' }]);
}

export const allowedStatuses = {
  product: PRODUCT_STATUSES,
  catalogue: CATALOGUE_STATUSES,
  variant: VARIANT_STATUSES,
  media: MEDIA_TYPES,
};

export const categoryDepthLimit = MAX_CATEGORY_DEPTH;
