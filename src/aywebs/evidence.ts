import { createHash, randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import { ensureAyWebsSchema } from './schema';
import type { AyWebsAvailabilityState, AyWebsVariantSelection } from '../../shared/aywebsTypes';

/**
 * AYWEBs — Evidence system (§28).
 *
 * Chaque produit externe qui entre dans AYWEBs laisse une preuve : ce qui a été
 * lu, où, quand, à quel prix, pour quelle variante exacte, avec quelle
 * disponibilité. Cette preuve sert ensuite à trancher un changement de prix
 * (§29) ou une variante disparue (§30) — sans elle, aucune revue d'achat n'est
 * possible et aucun litige ne peut être instruit.
 */

export interface AyWebsEvidenceInput {
  sourceUrl: string;
  sourceDomain: string;
  sourceProductId: string | null;
  title: string;
  image: string | null;
  price: number;
  currency: string;
  selectedVariant: AyWebsVariantSelection | null;
  availability: AyWebsAvailabilityState;
  adapter: string;
  retrievedAt: string;
  /** Champs additionnels inclus dans l'empreinte (description, marque, variantes…). */
  fingerprintParts?: Record<string, unknown>;
}

export interface AyWebsEvidence extends AyWebsEvidenceInput {
  id: string;
  evidenceHash: string;
  /** Rattachement (§28, §45) : la preuve est retrouvable depuis l'objet qu'elle protège. */
  productId: string | null;
  cartItemId: string | null;
  orderItemId: string | null;
}

/**
 * Empreinte stable de la lecture source. Le prix et la variante en font partie :
 * deux lectures différentes produisent deux empreintes différentes, ce qui est
 * exactement ce qui déclenche `PRICE_CHANGED`.
 */
export function ayWebsEvidenceHash(input: AyWebsEvidenceInput): string {
  const canonical = JSON.stringify({
    url: input.sourceUrl,
    domain: input.sourceDomain,
    productId: input.sourceProductId || '',
    title: input.title.trim().toLowerCase(),
    price: Number(input.price) || 0,
    currency: String(input.currency || '').toUpperCase(),
    variant: input.selectedVariant ? canonicalVariant(input.selectedVariant) : null,
    availability: input.availability,
    extra: canonicalExtra(input.fingerprintParts),
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Ordre des attributs imposé : {color,size} et {size,color} sont la même variante. */
export function canonicalVariant(variant: AyWebsVariantSelection): Record<string, unknown> {
  const attributes: Record<string, string> = {};
  for (const key of Object.keys(variant.attributes || {}).sort()) {
    attributes[key] = String(variant.attributes[key] ?? '').trim();
  }
  return { variantId: variant.variantId, attributes, quantity: Number(variant.quantity) || 1 };
}

function canonicalExtra(parts: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(parts).sort()) {
    const value = parts[key];
    if (value === null || value === undefined || value === '') continue;
    out[key] = Array.isArray(value) ? [...value].map((item) => String(item)) : String(value);
  }
  return out;
}

/** Libellé humain d'une variante, dans un ordre d'attributs stable. */
export function ayWebsVariantLabel(variant: AyWebsVariantSelection | null): string {
  if (!variant) return '';
  return Object.keys(variant.attributes || {})
    .sort()
    .map((key) => String(variant.attributes[key] ?? '').trim())
    .filter(Boolean)
    .join(' · ');
}

/**
 * Écrit une preuve de lecture (§28).
 *
 * `evidenceHash` peut être fourni par l'appelant : c'est l'empreinte déjà
 * stockée sur le produit, la ligne de panier ou la ligne de commande. Sans
 * cette option, un appelant qui enrichit l'empreinte (marque, nombre de
 * variantes…) produirait une ligne de preuve introuvable par son propre hash —
 * la preuve doit être vérifiable par l'empreinte qu'Ayrovi affiche (§45).
 */
export function recordAyWebsEvidence(
  db: QatafoDatabase,
  input: AyWebsEvidenceInput & {
    productId?: string | null;
    cartItemId?: string | null;
    orderItemId?: string | null;
    evidenceHash?: string | null;
  },
): AyWebsEvidence {
  ensureAyWebsSchema(db);
  const id = `aywev_${randomUUID()}`;
  const evidenceHash = /^[a-f0-9]{64}$/.test(String(input.evidenceHash || ''))
    ? String(input.evidenceHash)
    : ayWebsEvidenceHash(input);
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO ayweb_evidence (id,product_id,cart_item_id,order_item_id,source_url,source_domain,source_product_id,
      title,image,price,currency,selected_variant,availability,evidence_hash,adapter,retrieved_at,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id,
    input.productId || null,
    input.cartItemId || null,
    input.orderItemId || null,
    String(input.sourceUrl).slice(0, 4096),
    String(input.sourceDomain || '').slice(0, 255),
    String(input.sourceProductId || '').slice(0, 300),
    String(input.title || '').slice(0, 500),
    String(input.image || '').slice(0, 4096),
    Number(input.price) || 0,
    String(input.currency || '').toUpperCase().slice(0, 3),
    JSON.stringify(input.selectedVariant ? canonicalVariant(input.selectedVariant) : null),
    input.availability,
    evidenceHash,
    String(input.adapter || '').slice(0, 40),
    input.retrievedAt || now,
    now,
  );
  return {
    ...input,
    id,
    evidenceHash,
    productId: input.productId || null,
    cartItemId: input.cartItemId || null,
    orderItemId: input.orderItemId || null,
  };
}

export function latestAyWebsEvidence(db: QatafoDatabase, productId: string): AyWebsEvidence | null {
  ensureAyWebsSchema(db);
  const row = db.get<any>(
    `SELECT * FROM ayweb_evidence WHERE product_id=? ORDER BY retrieved_at DESC, created_at DESC LIMIT 1`,
    productId,
  );
  return row ? hydrateEvidence(row) : null;
}

export function ayWebsEvidenceByHash(db: QatafoDatabase, evidenceHash: string): AyWebsEvidence | null {
  ensureAyWebsSchema(db);
  const row = db.get<any>(`SELECT * FROM ayweb_evidence WHERE evidence_hash=? ORDER BY created_at DESC LIMIT 1`, evidenceHash);
  return row ? hydrateEvidence(row) : null;
}

function hydrateEvidence(row: any): AyWebsEvidence {
  let selectedVariant: AyWebsVariantSelection | null = null;
  try {
    const parsed = JSON.parse(row.selected_variant || 'null');
    if (parsed && typeof parsed === 'object') selectedVariant = parsed as AyWebsVariantSelection;
  } catch { selectedVariant = null; }
  return {
    id: String(row.id),
    productId: row.product_id ? String(row.product_id) : null,
    cartItemId: row.cart_item_id ? String(row.cart_item_id) : null,
    orderItemId: row.order_item_id ? String(row.order_item_id) : null,
    sourceUrl: String(row.source_url || ''),
    sourceDomain: String(row.source_domain || ''),
    sourceProductId: String(row.source_product_id || '') || null,
    title: String(row.title || ''),
    image: String(row.image || '') || null,
    price: Number(row.price) || 0,
    currency: String(row.currency || ''),
    selectedVariant,
    availability: String(row.availability || 'UNKNOWN') as AyWebsAvailabilityState,
    adapter: String(row.adapter || ''),
    retrievedAt: String(row.retrieved_at || ''),
    evidenceHash: String(row.evidence_hash || ''),
  };
}
