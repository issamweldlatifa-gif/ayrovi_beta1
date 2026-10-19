/**
 * AYWEBs — logique pure de la page Stores.
 *
 * Tout part des données du serveur (boutiques + catégories). Rien n'est codé ici en
 * dur : une boutique ajoutée au registre apparaît dans la recherche, sa catégorie et
 * la liste, sans changer cette page.
 *
 * Recherche de MAGASINS : elle est distincte de la recherche de PRODUITS. Elle ne
 * touche ni à la récupération des produits ni au panier.
 */
import type { AyWebsCategory, AyWebsStore } from '@/api/aywebs';

export type StoresLocale = 'fr' | 'ar';

/** Texte comparable : minuscules, sans accents, espaces réduits. */
export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nom affiché d'une boutique (le nom technique sert de repli). */
export function storeDisplayName(store: AyWebsStore): string {
  return store.displayName || store.name;
}

/**
 * Boutiques dont le nom contient la requête (partiel, sans casse, sans accents).
 * Requête vide ⇒ toutes les boutiques, dans l'ordre du serveur.
 */
export function filterStoresByQuery(stores: readonly AyWebsStore[], query: string): AyWebsStore[] {
  const needle = normalizeSearchText(query);
  if (!needle) return [...stores];
  return stores.filter((store) => {
    const haystack = normalizeSearchText(`${store.displayName} ${store.name}`);
    return haystack.includes(needle);
  });
}

/** Boutiques rattachées à une catégorie (une boutique multi-catégories y figure telle quelle). */
export function storesInCategory(stores: readonly AyWebsStore[], categoryId: string): AyWebsStore[] {
  return stores.filter((store) => store.categories.includes(categoryId));
}

export interface CategoryEntry {
  category: AyWebsCategory;
  count: number;
}

/** Catégories dans l'ordre du catalogue, avec le nombre de boutiques de chacune. */
export function categoryEntries(stores: readonly AyWebsStore[], categories: readonly AyWebsCategory[]): CategoryEntry[] {
  return categories.map((category) => ({
    category,
    count: storesInCategory(stores, category.id).length,
  }));
}

export function categoryLabel(category: AyWebsCategory, locale: StoresLocale): string {
  return (locale === 'ar' ? category.labelAr : category.labelFr) || category.id;
}

/**
 * Ligne sous le nom d'une carte : la description du serveur si elle existe, sinon
 * les libellés des catégories. Ainsi une carte n'affiche jamais de texte inventé.
 */
export function storeSubtitle(
  store: AyWebsStore,
  categories: readonly AyWebsCategory[],
  locale: StoresLocale,
): string {
  if (store.description) return store.description;
  const labels = store.categories
    .map((id) => categories.find((category) => category.id === id))
    .filter((category): category is AyWebsCategory => Boolean(category))
    .map((category) => categoryLabel(category, locale));
  return labels.join(' · ');
}

/** Domaine lisible d'une boutique (sans `www.`), ou `''` si l'adresse est invalide. */
export function storeDomain(store: AyWebsStore): string {
  try {
    return new URL(store.homeUrl).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Boutiques enregistrées, dans l'ordre du catalogue (un identifiant disparu est ignoré). */
export function savedStoresInOrder(stores: readonly AyWebsStore[], savedIds: readonly string[]): AyWebsStore[] {
  const saved = new Set(savedIds);
  return stores.filter((store) => saved.has(store.id));
}

/** Ajoute l'identifiant s'il manque, le retire sinon. Sans doublon. */
export function toggleSavedStoreId(savedIds: readonly string[], storeId: string): string[] {
  return savedIds.includes(storeId)
    ? savedIds.filter((id) => id !== storeId)
    : [...savedIds, storeId];
}

/** Lecture tolérante du stockage : tout ce qui n'est pas une liste de texte est ignoré. */
export function parseSavedStoreIds(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    for (const entry of parsed) {
      if (typeof entry === 'string' && entry.trim()) seen.add(entry);
    }
    return [...seen];
  } catch {
    return [];
  }
}

/** Découpe une liste en rangées de `columns` éléments (grille de cartes). */
export function chunkRows<T>(items: readonly T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(columns));
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size));
  }
  return rows;
}
