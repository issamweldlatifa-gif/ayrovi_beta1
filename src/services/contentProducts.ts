/**
 * PLUSIEURS ARTICLES PAR CONTENU (lot F1, 24/10/2026).
 *
 * ── Pourquoi ────────────────────────────────────────────────────────────────
 * Un Reel montre plusieurs pièces ; la maquette de référence en affiche 3 à 4
 * dans le même tiroir. Or le contenu ne portait qu'un `product_id`. Cette table
 * de liaison est **additive** : `product_id` reste la vérité pour l'existant
 * (aucune donnée réécrite, aucun contenu cassé), et `content_products` porte la
 * liste ordonnée des articles.
 *
 * ── Règles ──────────────────────────────────────────────────────────────────
 *  • Aucune copie : la table ne stocke QUE `product_id`. Nom, image, prix et
 *    stock sont lus dans le catalogue au moment de la requête (comme
 *    `shoppableContent.ts`).
 *  • Un contenu sans ligne de liaison retombe sur son `product_id` : les
 *    contenus déjà en ligne n'ont rien à migrer.
 *  • Le contenu doit rester **shoppable** pour publier une liste ; sinon aucune
 *    carte n'est renvoyée (règle inchangée).
 *  • Un produit devenu non vendable disparaît de la liste publique, sans jamais
 *    casser le contenu (`publicLinkedProduct` renvoie déjà `null`).
 */
import type { QatafoDatabase } from '../db/database';
import {
  linkedProductFromJoin,
  LINKED_PRODUCT_JOIN_SELECT,
  normalizeContentMode,
  publicLinkedProduct,
  type PublicLinkedProduct,
} from './shoppableContent';

export const CONTENT_KINDS = ['reel', 'publication', 'story'] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

/** Bornes : un tiroir lisible, pas une boutique dans un tiroir. */
export const MAX_CONTENT_PRODUCTS = 8;

export function isContentKind(value: unknown): value is ContentKind {
  return typeof value === 'string' && (CONTENT_KINDS as readonly string[]).includes(value);
}

/**
 * Nettoie une liste d'identifiants venue d'un formulaire : chaînes non vides,
 * dédoublonnées, ordre conservé, bornée. Aucune validation « métier » ici (le
 * produit doit exister et être vendable — c'est le rôle de `setContentProducts`).
 */
export function normalizeContentProductIds(value: unknown, max = MAX_CONTENT_PRODUCTS): string[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    const id = typeof entry === 'string' ? entry.trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Liste effective d'un contenu : `content_products` s'il y a des lignes, sinon
 * le `product_id` historique. C'est la règle de compatibilité, en un seul endroit.
 */
export function effectiveProductIds(linked: string[], legacyProductId: string | null | undefined): string[] {
  if (linked.length > 0) return linked;
  const legacy = typeof legacyProductId === 'string' ? legacyProductId.trim() : '';
  return legacy ? [legacy] : [];
}

/** Identifiants liés, dans l'ordre décidé par l'admin. */
export function readContentProductIds(db: QatafoDatabase, kind: ContentKind, contentId: string): string[] {
  return db
    .all<{ product_id: string }>(
      'SELECT product_id FROM content_products WHERE content_kind=? AND content_id=? ORDER BY sort_order, rowid',
      kind,
      contentId,
    )
    .map((row) => row.product_id);
}

/**
 * Écrit la liste liée. Remplace l'ancienne : l'ordre du formulaire est l'ordre
 * du tiroir. `[]` efface toutes les lignes (le contenu retombe alors sur son
 * `product_id`, ou sur aucune carte s'il n'en a pas).
 */
export function setContentProducts(
  db: QatafoDatabase,
  kind: ContentKind,
  contentId: string,
  productIds: unknown,
  now = new Date().toISOString(),
): string[] {
  const ids = normalizeContentProductIds(productIds);
  db.run('DELETE FROM content_products WHERE content_kind=? AND content_id=?', kind, contentId);
  ids.forEach((productId, index) => {
    db.run(
      `INSERT INTO content_products (content_kind, content_id, product_id, sort_order, created_at)
       VALUES (?,?,?,?,?)`,
      kind,
      contentId,
      productId,
      index,
      now,
    );
  });
  return ids;
}

/**
 * Aligne la table sur le produit unique décidé par `decideShoppable` quand le
 * formulaire n'envoie pas de liste : un contenu déjà publié continue de vendre
 * exactement le même produit, sans migration de données.
 */
export function syncContentProductsFromLegacy(
  db: QatafoDatabase,
  kind: ContentKind,
  contentId: string,
  contentMode: unknown,
  productId: string | null | undefined,
): void {
  const linked = readContentProductIds(db, kind, contentId);
  if (linked.length > 0) return; // une liste explicite fait foi
  if (normalizeContentMode(contentMode) !== 'shoppable' || !productId) return;
  setContentProducts(db, kind, contentId, [productId]);
}

/**
 * Cartes publiques pour un lot de contenus, en **une** requête (pas de N+1).
 * Le résultat respecte l'ordre de `content_products`, puis retombe sur le
 * `product_id` du contenu quand aucune ligne n'existe.
 */
export interface ContentForProducts {
  id: string;
  product_id?: string | null;
  content_mode?: string | null;
}

/**
 * Fusion PURE (aucune base) : lignes liées + repli sur le produit historique.
 * Elle porte les trois règles qui comptent, et c'est elle que les tests lisent :
 * ordre de `content_products`, jamais de doublon, produit non vendable écarté.
 */
export function mergePublicProducts(
  contents: ContentForProducts[],
  linkedRows: Array<Record<string, any>>,
  legacyRows: Array<Record<string, any>>,
): Map<string, PublicLinkedProduct[]> {
  const byContent = new Map<string, PublicLinkedProduct[]>();
  for (const content of contents) byContent.set(content.id, []);

  const modeById = new Map(contents.map((content) => [content.id, content.content_mode]));
  for (const row of linkedRows) {
    const contentId = String(row.content_id);
    const card = linkedProductFromJoin({ ...row, content_mode: modeById.get(contentId) });
    if (!card) continue; // produit devenu non vendable : il disparaît, le contenu reste
    const list = byContent.get(contentId);
    if (!list) continue; // ligne orpheline (contenu hors du lot)
    if (list.some((entry) => entry.id === card.id)) continue;
    list.push(card);
  }

  for (const legacy of legacyRows) {
    const contentId = String(legacy.content_id);
    const list = byContent.get(contentId);
    if (!list || list.length > 0) continue;
    const card = linkedProductFromJoin({ ...legacy, content_mode: modeById.get(contentId) });
    if (card) list.push(card);
  }

  return byContent;
}

export function publicProductsByContent(
  db: QatafoDatabase,
  kind: ContentKind,
  contents: ContentForProducts[],
): Map<string, PublicLinkedProduct[]> {
  if (contents.length === 0) return new Map<string, PublicLinkedProduct[]>();

  const ids = contents.map((content) => content.id);
  const placeholders = ids.map(() => '?').join(',');
  const linkedRows = db.all<any>(
    `SELECT cp.content_id AS content_id, ${LINKED_PRODUCT_JOIN_SELECT}
       FROM content_products cp
       JOIN products p ON p.id = cp.product_id
      WHERE cp.content_kind = ? AND cp.content_id IN (${placeholders})
      ORDER BY cp.sort_order, cp.rowid`,
    kind,
    ...ids,
  );

  // Compatibilité : contenu sans ligne de liaison ⇒ son produit historique.
  const legacyRows = db.all<any>(
    `SELECT cp.id AS content_id, ${LINKED_PRODUCT_JOIN_SELECT}
       FROM reels cp
       JOIN products p ON p.id = cp.product_id
      WHERE ? = 'reel' AND cp.id IN (${placeholders}) AND cp.product_id IS NOT NULL
     UNION ALL
     SELECT cp.id AS content_id, ${LINKED_PRODUCT_JOIN_SELECT}
       FROM publications cp
       JOIN products p ON p.id = cp.product_id
      WHERE ? = 'publication' AND cp.id IN (${placeholders}) AND cp.product_id IS NOT NULL
     UNION ALL
     SELECT cp.id AS content_id, ${LINKED_PRODUCT_JOIN_SELECT}
       FROM stories cp
       JOIN products p ON p.id = cp.product_id
      WHERE ? = 'story' AND cp.id IN (${placeholders}) AND cp.product_id IS NOT NULL`,
    kind, ...ids,
    kind, ...ids,
    kind, ...ids,
  );

  return mergePublicProducts(contents, linkedRows, legacyRows);
}

/** Version « un contenu » — utilisée par les routes qui n'en renvoient qu'un. */
export function publicProductsForContent(
  db: QatafoDatabase,
  kind: ContentKind,
  content: { id: string; product_id?: string | null; content_mode?: string | null },
): PublicLinkedProduct[] {
  return publicProductsByContent(db, kind, [content]).get(content.id) ?? [];
}

/**
 * Vérifie qu'un identifiant est bien un produit vendable, avec la même règle que
 * `decideShoppable` (actif + prix final > 0). Sert aux listes : on refuse la
 * liste entière plutôt que d'en publier une moitié silencieuse.
 */
export function invalidLinkedProducts(
  db: QatafoDatabase,
  productIds: string[],
): string[] {
  return productIds.filter((id) => {
    const row = db.get<any>('SELECT id, name, image, status, final_price, stock_status FROM products WHERE id=?', id);
    return !publicLinkedProduct('shoppable', row ? {
      id: row.id,
      name: row.name,
      image: row.image,
      status: row.status,
      final_price: row.final_price,
      stock_status: row.stock_status,
    } : null);
  });
}
