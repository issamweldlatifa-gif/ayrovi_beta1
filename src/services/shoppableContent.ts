/**
 * Contenu « Shoppable » — règles pures (Reels, Publications, Stories).
 *
 * Source de vérité : la table `products` (le catalogue existant). Le contenu ne
 * stocke QUE l'identifiant du produit lié et son mode ; le nom, l'image, le prix
 * et le stock sont lus au moment de la requête, jamais copiés.
 *
 * Règles :
 *  • `normal`    : aucun produit, aucune carte. Un produit éventuellement stocké
 *                  est effacé à l'enregistrement (donnée propre, pas de fantôme).
 *  • `shoppable` : un produit est OBLIGATOIRE à l'enregistrement (brouillon compris),
 *                  et il doit être vendable : statut ACTIVE et prix final > 0.
 *  • Côté public, un produit devenu inactif, archivé, supprimé ou sans prix ne
 *    produit AUCUNE carte (`product: null`) : le contenu reste, sans bouton mort.
 */

export const CONTENT_MODES = ['normal', 'shoppable'] as const;
export type ContentMode = (typeof CONTENT_MODES)[number];

/** Devise d'affichage de la boutique : celle qu'affiche déjà la page produit. */
export const STOREFRONT_CURRENCY = 'TND';

/** Champs du produit utiles à une carte (lus dans `products`). */
export interface ProductSnapshot {
  id: string;
  name: string;
  image: string | null;
  status: string;
  final_price: number | null;
  stock_status: string | null;
}

export function normalizeContentMode(value: unknown): ContentMode {
  return value === 'shoppable' ? 'shoppable' : 'normal';
}

/** Un produit est vendable seulement s'il est actif et a un prix final positif. */
export function isSellableProduct(product: ProductSnapshot | null | undefined): product is ProductSnapshot {
  return Boolean(product) && product!.status === 'ACTIVE' && Number(product!.final_price) > 0;
}

export type ShoppableDecision =
  | { ok: true; mode: ContentMode; productId: string | null }
  | { ok: false; code: 'PRODUCT_REQUIRED' | 'PRODUCT_INVALID'; error: string };

/**
 * Décide ce qui sera enregistré. `lookup` lit le produit dans le catalogue ;
 * il est injecté pour que la règle reste testable sans base de données.
 */
export function decideShoppable(
  modeInput: unknown,
  productIdInput: unknown,
  lookup: (productId: string) => ProductSnapshot | null | undefined,
): ShoppableDecision {
  const mode = normalizeContentMode(modeInput);
  if (mode === 'normal') return { ok: true, mode, productId: null };

  const productId = String(productIdInput ?? '').trim();
  if (!productId) {
    return { ok: false, code: 'PRODUCT_REQUIRED', error: 'Un contenu Shoppable doit être lié à un produit.' };
  }
  const product = lookup(productId);
  if (!isSellableProduct(product)) {
    return {
      ok: false,
      code: 'PRODUCT_INVALID',
      error: 'Le produit choisi n’est pas vendable (inactif, archivé, sans prix ou introuvable).',
    };
  }
  return { ok: true, mode, productId };
}

/** Forme publique de la carte produit (aucun statut interne, aucune note). */
export interface PublicLinkedProduct {
  id: string;
  name: string;
  image: string;
  price: number;
  currency: string;
  stockStatus: string;
  available: boolean;
}

/**
 * Carte publique d'un contenu, ou `null` si le contenu n'est pas shoppable ou si son
 * produit n'est plus vendable. Le prix vient du catalogue au moment de la lecture.
 */
export function publicLinkedProduct(
  contentMode: unknown,
  product: ProductSnapshot | null | undefined,
): PublicLinkedProduct | null {
  if (normalizeContentMode(contentMode) !== 'shoppable') return null;
  if (!isSellableProduct(product)) return null;
  const stock = product.stock_status || 'AVAILABLE';
  return {
    id: product.id,
    name: product.name,
    image: product.image || '',
    price: Number(product.final_price),
    currency: STOREFRONT_CURRENCY,
    stockStatus: stock,
    available: stock !== 'OUT_OF_STOCK',
  };
}

/**
 * Colonnes ajoutées à la lecture publique : le produit est joint à la requête
 * (alias `lp_*`), puis sérialisé par `linkedProductFromJoin`.
 */
export const LINKED_PRODUCT_JOIN_SELECT = `
  p.id AS lp_id, p.name AS lp_name, p.image AS lp_image, p.status AS lp_status,
  p.final_price AS lp_final_price, p.stock_status AS lp_stock_status`;

export function linkedProductFromJoin(row: Record<string, any>): PublicLinkedProduct | null {
  if (!row.lp_id) return null;
  return publicLinkedProduct(row.content_mode, {
    id: row.lp_id,
    name: row.lp_name,
    image: row.lp_image,
    status: row.lp_status,
    final_price: row.lp_final_price,
    stock_status: row.lp_stock_status,
  });
}
