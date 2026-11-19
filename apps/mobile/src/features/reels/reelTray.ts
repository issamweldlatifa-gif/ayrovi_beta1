/** Inline feed geometry; fullscreen uses reelViewerStyle instead. */
export const REEL_TRAY = { cardBottom: 16, padding: 12, cardGap: 7, pillHeight: 51, pillMinWidth: 176 } as const;

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
 * Le carrousel inline reste ouvert quand il y a des articles. Le plein écran démarre fermé.
 */
export function reelTrayDefaultOpen<T extends TrayProductRef>(reel: TraySource<T>): boolean {
  return reelTrayProducts(reel).length > 0;
}

/** Étiquette du bouton unique (clé i18n, traduite par l'écran). */
export function reelTrayLabelKey(open: boolean): 'reel.hideItems' | 'reel.viewItems' {
  return open ? 'reel.hideItems' : 'reel.viewItems';
}

/**
 * Compteur du rail au format de la référence 10/11 (« 1.8K », « 9 ») : compact
 * au-delà de 999, brut en dessous. 1 800 → « 1.8K », 1 000 → « 1K » (une
 * décimale max), 950 → « 950 ».
 */
export function formatRailCount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  if (value < 1000) return String(Math.round(value));
  const compact = value / 1000;
  const label = compact >= 100 ? Math.round(compact) : Math.round(compact * 10) / 10;
  return `${label}K`;
}
