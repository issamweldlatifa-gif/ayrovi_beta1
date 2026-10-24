/**
 * TIROIR « articles » d'un Reel — règles pures (24/10/2026).
 *
 * ── La décision ─────────────────────────────────────────────────────────────
 * Un seul bouton, deux états : « Voir les articles » ⇄ « Masquer les articles ».
 * Il ne change JAMAIS d'écran : le tiroir monte par-dessus la vidéo, qui continue
 * de tourner. Sortir du Reel pour voir un produit, c'est perdre le Reel.
 *
 * ── Ce que le tiroir accepte ────────────────────────────────────────────────
 * Le serveur public renvoie aujourd'hui `product` (0 ou 1 produit) et `products`
 * (la même liste, tableau). Le jour où un Reel portera plusieurs produits
 * (table de liaison — lot F1), `products` se remplira sans toucher à cet écran.
 * En attendant : une liste d'un élément reste une liste, pas un cas particulier.
 *
 * ── Rien d'inventé ──────────────────────────────────────────────────────────
 * Aucun produit ⇒ **aucun bouton** (pas de « Voir les articles » qui n'ouvre
 * rien). Un produit indisponible reste dans la liste : sa carte dira son état.
 */

/** Cotes du tiroir, partagées par la visionneuse plein écran et la liste. */
export const REEL_TRAY = {
  /** Hauteur du tiroir ouvert, hors zone sûre (maquette : 214 px sur 844). */
  height: 214,
  pillHeight: 44,
  pillMinWidth: 176,
  /** Poignée de préhension, en haut du tiroir. */
  grab: 26,
  cardGap: 10,
  padding: 16,
} as const;

export interface TrayProductRef {
  id: string;
}

export interface TraySource<T extends TrayProductRef> {
  product?: T | null;
  products?: T[] | null;
}

/**
 * Liste des produits du tiroir : `products` s'il est fourni (même vide), sinon
 * `product` seul. Dédupliqué par `id` — un produit lié deux fois ne s'affiche
 * pas deux fois (le serveur peut renvoyer les deux champs).
 */
export function reelTrayProducts<T extends TrayProductRef>(reel: TraySource<T>): T[] {
  const source = Array.isArray(reel.products)
    ? reel.products
    : (reel.product ? [reel.product] : []);
  const seen = new Set<string>();
  const list: T[] = [];
  for (const entry of source) {
    const id = entry && typeof entry.id === 'string' ? entry.id : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    list.push(entry);
  }
  return list;
}

/** Y a-t-il un bouton à afficher ? Non s'il n'y a rien à ouvrir. */
export function reelTrayIsAvailable<T extends TrayProductRef>(reel: TraySource<T>): boolean {
  return reelTrayProducts(reel).length > 0;
}

/**
 * État initial : ouvert quand il y a des articles. C'est la référence visuelle
 * (le Reel arrive avec le tiroir sorti) et cela ne retire rien à l'existant,
 * où la carte produit était déjà visible.
 */
export function reelTrayDefaultOpen<T extends TrayProductRef>(reel: TraySource<T>): boolean {
  return reelTrayProducts(reel).length > 0;
}

/** Étiquette du bouton unique (clé i18n, traduite par l'écran). */
export function reelTrayLabelKey(open: boolean): 'reel.hideItems' | 'reel.viewItems' {
  return open ? 'reel.hideItems' : 'reel.viewItems';
}

/** Position verticale du tiroir fermé/ouvert — une seule source pour les deux rendus. */
export function reelTrayOffset(open: boolean, height = REEL_TRAY.height, insetBottom = 0): number {
  return open ? 0 : height + insetBottom;
}

/**
 * Décalage des éléments posés AU-DESSUS du tiroir (bouton, auteur, légende).
 * Ils montent quand le tiroir sort, redescendent quand il rentre — aucun saut.
 */
export function reelTrayContentBottom(
  open: boolean,
  kind: 'pill' | 'caption',
  height = REEL_TRAY.height,
  insetBottom = 0,
): number {
  const lift = open ? height + (kind === 'pill' ? 10 : 64) : (kind === 'pill' ? 16 : 88);
  return insetBottom + lift;
}
