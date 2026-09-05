/**
 * AYROVI Catalogue (P2.1) — product media, with the P0/P1 file policy inherited.
 *
 * A media row is a *reference* (an https URL, or a path inside the public uploads tree),
 * never a file write: P2.1 opens no new public surface, so `PUBLIC_UPLOAD_DIRS` stays
 * exactly `['hero']` and the upload-policy test keeps passing untouched. The reason is
 * the P0 finding — anything under a served directory is downloadable by URL — so the
 * catalogue must not become a second way to leak: `mediaUrlOf()` refuses `file:`/`data:`,
 * traversal, and any path the private-document policy owns (invoices, payment proofs,
 * employee documents). A product sheet can never point at a customer's transfer proof.
 *
 * `products.image` / `products.additional_images` keep working: the primary image of a
 * product is mirrored into `products.image` because the storefront and the cart read that
 * column today. Mirror only on write, never as a second source of truth.
 */
import { randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { propagate, type Check,asObject, boolFlag, fail, isIdentifier, malformedId, mediaUrlOf, optionalText, wholeNumber } from './validation';
import { CATALOGUE_ERRORS, MEDIA_TYPES, type CatalogueMediaInput } from './types';
import { auditCatalogue, type CatalogueActor } from './audit';
import { getProduct } from './products';
import { getVariant } from './variants';

export type MediaResult<T> = Check<T>;

export interface CatalogueMediaRow {
  id: string;
  product_id: string;
  variant_id: string | null;
  media_type: string;
  url: string;
  alt_text: string;
  sort_order: number;
  is_primary: number;
  created_at: string;
  updated_at: string;
}

const MEDIA_SELECT = `SELECT id, product_id, variant_id, media_type, url, alt_text, sort_order, is_primary, created_at, updated_at FROM catalogue_media`;

function mapMedia(row: Record<string, unknown>): CatalogueMediaRow {
  return {
    id: String(row.id), product_id: String(row.product_id),
    variant_id: row.variant_id ? String(row.variant_id) : null,
    media_type: String(row.media_type ?? 'IMAGE'), url: String(row.url ?? ''),
    alt_text: String(row.alt_text ?? ''), sort_order: Number(row.sort_order ?? 100),
    is_primary: Number(row.is_primary ?? 0),
    created_at: String(row.created_at ?? ''), updated_at: String(row.updated_at ?? ''),
  };
}

export function listMedia(db: QatafoDatabase, productId: string): CatalogueMediaRow[] {
  if (!isIdentifier(productId)) return [];
  return db.all<Record<string, unknown>>(`${MEDIA_SELECT} WHERE product_id=? ORDER BY is_primary DESC, media_type, sort_order`, productId).map(mapMedia);
}

export function getMedia(db: QatafoDatabase, id: string): CatalogueMediaRow | null {
  if (!isIdentifier(id)) return null;
  const row = db.get<Record<string, unknown>>(`${MEDIA_SELECT} WHERE id=?`, id);
  return row ? mapMedia(row) : null;
}

export interface MediaMutationOptions {
  actor: CatalogueActor;
  context?: Parameters<typeof auditCatalogue>[1]['context'];
}

export function addMedia(db: QatafoDatabase, productId: string, rawInput: unknown, options: MediaMutationOptions): MediaResult<CatalogueMediaRow> {
  if (!isIdentifier(productId)) return malformedId('product_id');
  const product = getProduct(db, productId);
  if (!product) return fail(CATALOGUE_ERRORS.PRODUCT_NOT_FOUND, `Produit « ${productId} » inconnu.`, [{ field: 'product_id', reason: 'NOT_FOUND' }]);
  const input = asObject(rawInput) as CatalogueMediaInput;
  const url = mediaUrlOf(input.url, 'url');
  if (!url.ok) return propagate(url);
  const mediaType = String(input.media_type ?? 'IMAGE').trim().toUpperCase();
  if (!(MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return fail(CATALOGUE_ERRORS.VALIDATION, `media_type doit être l'un de: ${MEDIA_TYPES.join(', ')}.`, [{ field: 'media_type', reason: 'ENUM' }]);
  }
  let variantId: string | null = null;
  const rawVariant = String(input.variant_id ?? '').trim();
  if (rawVariant) {
    if (!isIdentifier(rawVariant)) return fail(CATALOGUE_ERRORS.VALIDATION, 'Identifiant de variante invalide.', [{ field: 'variant_id', reason: 'FORMAT' }]);
    const variant = getVariant(db, rawVariant);
    if (!variant) return fail(CATALOGUE_ERRORS.NOT_FOUND, `Variante « ${rawVariant} » inconnue.`, [{ field: 'variant_id', reason: 'NOT_FOUND' }]);
    if (variant.product_id !== productId) {
      return fail(CATALOGUE_ERRORS.VARIANT_MISMATCH, 'Cette variante appartient à un autre produit.', [{ field: 'variant_id', reason: 'MISMATCH' }]);
    }
    variantId = variant.id;
  }
  const alt = optionalText(input.alt_text, 'alt_text', 200);
  if (!alt.ok) return propagate(alt);
  const sort = wholeNumber(input.sort_order, 'sort_order', 0, 9999, 100);
  if (!sort.ok) return propagate(sort);
  const isPrimary = boolFlag(input.is_primary, 0);
  const id = `media_${randomUUID()}`;
  const now = new Date().toISOString();
  try {
    db.transaction(() => {
      if (isPrimary && mediaType === 'IMAGE') {
        db.run("UPDATE catalogue_media SET is_primary=0, updated_at=? WHERE product_id=? AND media_type='IMAGE'", now, productId);
      }
      db.run(`INSERT INTO catalogue_media (id,product_id,variant_id,media_type,url,alt_text,sort_order,is_primary,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, id, productId, variantId, mediaType, url.value, alt.value ?? '', sort.value, isPrimary, now, now);
      // Mirror for the columns the storefront reads today (never the other way round).
      if (mediaType === 'IMAGE' && (isPrimary || !product.image)) {
        db.run('UPDATE products SET image=?, updated_at=? WHERE id=?', url.value, now, productId);
      }
    });
  } catch (error: any) {
    return fail(CATALOGUE_ERRORS.CONFLICT, String(error?.message || 'Échec denregistrement du média.').slice(0, 300));
  }
  const created = getMedia(db, id)!;
  auditCatalogue(db, {
    actor: options.actor, action: 'CREATE', resourceType: 'product_media', resourceId: id,
    before: null, after: created as unknown as Record<string, unknown>,
    note: { product_id: productId, media_type: mediaType }, context: options.context ?? null,
  });
  return { ok: true, value: created };
}

export function makeMediaPrimary(db: QatafoDatabase, id: string, options: MediaMutationOptions): MediaResult<CatalogueMediaRow> {
  const media = getMedia(db, id);
  if (!media) return fail(CATALOGUE_ERRORS.NOT_FOUND, 'Média introuvable.', [{ field: 'id', reason: 'NOT_FOUND' }]);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.run("UPDATE catalogue_media SET is_primary=0, updated_at=? WHERE product_id=? AND media_type='IMAGE'", now, media.product_id);
    db.run('UPDATE catalogue_media SET is_primary=1, updated_at=? WHERE id=?', now, id);
    if (media.media_type === 'IMAGE') db.run('UPDATE products SET image=?, updated_at=? WHERE id=?', media.url, now, media.product_id);
  });
  const updated = getMedia(db, id)!;
  auditCatalogue(db, {
    actor: options.actor, action: 'UPDATE', resourceType: 'product_media', resourceId: id,
    before: { is_primary: media.is_primary, url: media.url }, after: { is_primary: 1, url: updated.url },
    note: { product_id: media.product_id, primary: true }, context: options.context ?? null,
  });
  return { ok: true, value: updated };
}

/**
 * Removes the *reference*, not the file: the bytes stay wherever they are (and the legacy
 * `products.image` mirror is left alone if it still points at them, so nothing that is
 * displayed today can disappear silently). The audit row is the record that it went away.
 */
export function removeMedia(db: QatafoDatabase, id: string, options: MediaMutationOptions): MediaResult<{ id: string; removed: true }> {
  const media = getMedia(db, id);
  if (!media) return fail(CATALOGUE_ERRORS.NOT_FOUND, 'Média introuvable.', [{ field: 'id', reason: 'NOT_FOUND' }]);
  db.run('DELETE FROM catalogue_media WHERE id=?', id);
  auditCatalogue(db, {
    actor: options.actor, action: 'DELETE', resourceType: 'product_media', resourceId: id,
    before: media as unknown as Record<string, unknown>, after: null,
    note: { product_id: media.product_id, removed: true }, context: options.context ?? null,
  });
  return { ok: true, value: { id, removed: true } };
}
