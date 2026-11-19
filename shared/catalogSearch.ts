/** Same search folding for the SQLite reader and local recent-search deduplication. */
export function foldCatalogSearch(value: unknown): string {
  return typeof value === 'string'
    ? value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
    : '';
}

export interface CatalogSearchFilters {
  categoryId?: string;
  brandId?: string;
  size?: string;
  min?: number;
  max?: number;
  available?: boolean;
}

export interface CatalogSearchFacets {
  categories: Array<{ id: string; label: string }>;
  brands: Array<{ id: string; label: string }>;
  sizes: string[];
}
