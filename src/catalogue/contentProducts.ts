/**
 * Produits temporaires (« Produits temporaires » de l'admin).
 *
 * Un produit temporaire est une ligne de `products` avec `visibility='CONTENT'`. Il n'a
 * pas de copie dans les tables de contenu : Reels, Publications et Stories gardent
 * seulement `product_id`. Ce module porte les deux règles qui le protègent :
 *
 *  - `availableProductSql` : quand un produit est joignable par le public. Un produit du
 *    catalogue suit la règle historique (`status='ACTIVE'`). Un produit temporaire doit
 *    en plus être lié à au moins un contenu **publié et daté** (Reel, Publication ou
 *    Story). Brouillon, archivé ou sans contenu publié : introuvable.
 *  - `contentUsageOf` : la liste des contenus qui pointent vers un produit, pour l'écran
 *    admin (« voir l'usage »).
 */
import type { QatafoDatabase } from '../db/database';
import { calculatePrice } from '../services/pricing';

/**
 * Calcule le prix d'un produit temporaire avec le moteur de tarification existant (la même
 * fonction que le recalcul admin). La création catalogue ne calcule pas `final_price` ; un
 * produit temporaire doit avoir un prix pour être vendable, donc on le calcule ici, à la
 * création et à chaque modification, et seulement pour les produits CONTENT.
 */
export function priceContentProduct(db: QatafoDatabase, productId: string): boolean {
  const row = db.get<any>('SELECT id, name, original_price, currency FROM products WHERE id=? AND visibility=?', productId, 'CONTENT');
  if (!row || row.original_price === null || row.original_price === undefined) return false;
  const price = calculatePrice(db.getPricingRules(), Number(row.original_price), String(row.currency || 'TND'), { title: String(row.name || '') });
  if (!price) return false;
  db.run(
    'UPDATE products SET converted_price=?, customs_fee=?, shipping_fee=?, service_fee=?, final_price=? WHERE id=?',
    price.convertedPriceTND, price.customsFeeTND, price.shippingFeeTND, price.serviceFeeTND, price.totalTND, productId,
  );
  return true;
}

/**
 * Clause SQL à coller après `WHERE`, avec un alias de `products`. Elle contient quatre
 * placeholders, à remplir avec `availableProductParams(now)`, dans cet ordre.
 */
export function availableProductSql(alias = 'p'): string {
  return `(${alias}.status='ACTIVE' AND (${alias}.visibility='CATALOG' OR (${alias}.visibility='CONTENT' AND (
    EXISTS (SELECT 1 FROM reels cr WHERE cr.product_id=${alias}.id AND cr.status='publie' AND cr.publish_at<=?)
    OR EXISTS (SELECT 1 FROM publications cp WHERE cp.product_id=${alias}.id AND cp.status='publie' AND cp.publish_at<=?)
    OR EXISTS (SELECT 1 FROM stories cs WHERE cs.product_id=${alias}.id AND cs.status='PUBLISHED'
               AND cs.publish_at<=? AND (cs.expires_at IS NULL OR cs.expires_at>?))
  ))))`;
}

export function availableProductParams(now: string): string[] {
  return [now, now, now, now];
}

export type ContentUsageKind = 'reel' | 'publication' | 'story';

export interface ContentUsage {
  kind: ContentUsageKind;
  id: string;
  title: string;
  status: string;
  publish_at: string | null;
}

/** Contenus qui pointent vers ce produit (tous statuts), du plus récent au plus ancien. */
export function contentUsageOf(db: QatafoDatabase, productId: string): ContentUsage[] {
  const reels = db.all<any>('SELECT id, title, status, publish_at FROM reels WHERE product_id=?', productId)
    .map((row) => ({ kind: 'reel' as const, id: row.id, title: row.title ?? '', status: row.status, publish_at: row.publish_at ?? null }));
  const publications = db.all<any>('SELECT id, title, status, publish_at FROM publications WHERE product_id=?', productId)
    .map((row) => ({ kind: 'publication' as const, id: row.id, title: row.title ?? '', status: row.status, publish_at: row.publish_at ?? null }));
  const stories = db.all<any>('SELECT id, title, status, publish_at FROM stories WHERE product_id=?', productId)
    .map((row) => ({ kind: 'story' as const, id: row.id, title: row.title ?? '', status: row.status, publish_at: row.publish_at ?? null }));
  return [...reels, ...publications, ...stories]
    .sort((a, b) => String(b.publish_at ?? '').localeCompare(String(a.publish_at ?? '')));
}

/** Vrai si le public peut ouvrir ce produit aujourd'hui (même règle que la fiche publique). */
export function isProductAvailable(db: QatafoDatabase, productId: string, now: string): boolean {
  return Boolean(db.get<{ ok: number }>(
    `SELECT 1 AS ok FROM products p WHERE p.id=? AND ${availableProductSql('p')}`,
    productId, ...availableProductParams(now),
  ));
}

/** Nombre de contenus qui pointent vers le produit, par type (pour les badges de liste). */
export function contentUsageCounts(db: QatafoDatabase, productId: string): Record<ContentUsageKind, number> {
  const count = (table: string) => Number(db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE product_id=?`, productId)?.n ?? 0);
  return { reel: count('reels'), publication: count('publications'), story: count('stories') };
}
