/**
 * AYWEBs — logique pure de la barre d'outils du navigateur marchand.
 *
 *  • Panier : trois vues. « Ce magasin » (le groupe AYWEBs du magasin courant),
 *    « Tous les magasins » (tous les groupes AYWEBs), « Lens & Shop » (le panier
 *    le même panier). Le panier mélange Lens et Shop : l'API ne les distingue pas
 *    encore, donc on ne prétend pas les séparer.
 *  • Favori : une page est « déjà enregistrée » si son adresse (sans fragment ni
 *    barre finale) correspond à une favorite existante.
 *
 * Aucun appel réseau ici : ce fichier ne fait que classer ce que l'API a déjà dit.
 */
import type { AyWebsCart, AyWebsCartItem } from '@/api/aywebs';
import type { AyroviCart, AyroviCartLine } from '@/api/cart';
import type { Favorite } from '@/api/account';

export type StoreCartSegment = 'thisStore' | 'allStores' | 'ayrovi';

export const STORE_CART_SEGMENTS: StoreCartSegment[] = ['thisStore', 'allStores', 'ayrovi'];

export interface CartRow {
  id: string;
  title: string;
  quantity: number;
  /** Option choisie (taille, couleur…) telle qu'elle a été envoyée. Peut être vide. */
  variant: string;
  /** Prix affiché tel quel : la ligne TND si elle existe, sinon le prix source. */
  priceText: string;
}

export interface CartSection {
  storeKey: string;
  storeName: string;
  rows: CartRow[];
}

function sourcePriceText(amount: number | null | undefined, currency: string): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '';
  return `${amount} ${currency}`.trim();
}

function awRow(item: AyWebsCartItem): CartRow {
  return {
    id: item.id,
    title: item.title,
    quantity: item.quantity,
    variant: item.variantLabel,
    priceText: item.lineTotalTnd !== null && item.lineTotalTnd !== undefined
      ? `${item.lineTotalTnd.toFixed(2)} TND`
      : sourcePriceText(item.unitPrice, item.currency),
  };
}

function ayroviRow(line: AyroviCartLine): CartRow {
  return {
    id: line.id,
    title: line.title,
    quantity: line.quantity,
    variant: line.variant,
    priceText: line.lineTotalTND !== null && line.lineTotalTND !== undefined
      ? `${line.lineTotalTND.toFixed(2)} TND`
      : sourcePriceText(line.sourcePrice, line.sourceCurrency),
  };
}

/** Regroupe les lignes AYWEBs par magasin, dans l'ordre d'arrivée. */
function awSections(items: AyWebsCartItem[]): CartSection[] {
  const byStore = new Map<string, CartSection>();
  for (const item of items) {
    const key = item.storeId || item.storeName || '—';
    const section = byStore.get(key) ?? { storeKey: key, storeName: item.storeName || key, rows: [] };
    section.rows.push(awRow(item));
    byStore.set(key, section);
  }
  return [...byStore.values()];
}

/** Sections à afficher pour une vue donnée. */
export function storeCartSections(
  segment: StoreCartSegment,
  input: { aywebs: AyWebsCart | null; ayrovi: AyroviCart | null; storeId: string },
): CartSection[] {
  if (segment === 'ayrovi') {
    const lines = input.ayrovi?.items ?? [];
    const byStore = new Map<string, CartSection>();
    for (const line of lines) {
      const key = line.store || '—';
      const section = byStore.get(key) ?? { storeKey: key, storeName: key, rows: [] };
      section.rows.push(ayroviRow(line));
      byStore.set(key, section);
    }
    return [...byStore.values()];
  }

  const items = input.aywebs?.items ?? [];
  if (segment === 'thisStore') {
    return awSections(items.filter((item) => item.storeId === input.storeId));
  }
  return awSections(items);
}

/** Forme canonique d'une adresse pour comparer deux pages (sans fragment, sans « / » final). */
export function canonicalSourceUrl(raw: string): string {
  const trimmed = raw.trim();
  try {
    const url = new URL(trimmed);
    url.hash = '';
    const path = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.host.toLowerCase()}${path}${url.search}`;
  } catch {
    return trimmed.replace(/#.*$/, '').replace(/\/+$/, '');
  }
}

/** La page courante est-elle déjà dans les favoris du client ? */
export function isPageSaved(favorites: Favorite[], pageUrl: string): boolean {
  if (!pageUrl) return false;
  const wanted = canonicalSourceUrl(pageUrl);
  return favorites.some((favorite) => favorite.sourceUrl && canonicalSourceUrl(favorite.sourceUrl) === wanted);
}
