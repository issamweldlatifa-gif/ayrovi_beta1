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

/**
 * Cotes du tiroir (refonte du 24/10/2026 — planche `mockup-v4-24-10.png`).
 *
 * Le tiroir n'est plus une feuille blanche qui monte du bas : **les cartes
 * flottent** sur la vidéo, avec une marge de 13 de chaque côté et 17 sous elles,
 * donc le Reel reste visible tout autour. Fermé, il ne reste que la pastille.
 */
export const REEL_TRAY = {
  /** Course du tiroir fermé : la hauteur d'une carte + le vide sous elle. */
  height: 153,
  /** Vide entre le bas de la carte et le bas de l'écran (zone sûre en plus). */
  cardBottom: 16,
  /** Marge latérale d'une carte (la suivante affleure après `cardGap`). */
  padding: 12,
  /** Écart entre deux cartes. */
  cardGap: 12,
  /** Hauteur de la pastille (cible tactile confortable, modèle : 51). */
  pillHeight: 51,
  pillMinWidth: 176,
  /** Écart entre le haut d'une carte et le bas de la pastille. */
  pillGap: 16,
  /** Pastille fermée : distance au bas de l'écran. */
  pillClosedBottom: 24,
  /** Rail d'actions : écart vertical entre deux icônes. */
  railGap: 56,
  /** Centre du rail depuis le bord droit. */
  railInset: 30,
  /** Côté de la cible tactile d'une icône du rail. */
  railHit: 44,
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

/** Bas de la pastille : au-dessus des cartes ouvertes, près du bord fermée. */
export function reelTrayPillBottom(open: boolean, insetBottom = 0): number {
  return open
    ? insetBottom + REEL_TRAY.cardBottom + (REEL_TRAY.height - REEL_TRAY.cardBottom) + REEL_TRAY.pillGap
    : insetBottom + REEL_TRAY.pillClosedBottom;
}

/**
 * Bas du rail d'actions. Il est **accroché à la pastille** : quand on escamote
 * les cartes, la pastille descend et les icônes descendent avec elle (demande
 * explicite du propriétaire : « الأزرار تهبط مع الزرّ »).
 */
export function reelTrayRailBottom(
  open: boolean,
  index: number,
  insetBottom = 0,
): number {
  const pill = reelTrayPillBottom(open, insetBottom);
  const centre = pill + REEL_TRAY.pillHeight / 2;
  return centre - REEL_TRAY.railHit / 2 + index * REEL_TRAY.railGap;
}

/**
 * Décalage des éléments posés AU-DESSUS du tiroir (bouton, auteur, légende).
 * Ils montent quand le tiroir sort, redescendent quand il rentre — aucun saut.
 */
export function reelTrayContentBottom(
  open: boolean,
  kind: 'pill' | 'caption',
  _height = REEL_TRAY.height,
  insetBottom = 0,
): number {
  if (kind === 'pill') return reelTrayPillBottom(open, insetBottom);
  // La légende se pose juste au-dessus de la pastille, sans jamais la toucher.
  return reelTrayPillBottom(open, insetBottom) + REEL_TRAY.pillHeight + 14;
}
