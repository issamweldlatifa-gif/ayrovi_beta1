import { describe, expect, it } from 'vitest';
import type { AyWebsCategory, AyWebsStore } from '@/api/aywebs';
import {
  categoryEntries, categoryLabel, chunkRows, filterStoresByQuery, normalizeSearchText,
  parseSavedStoreIds, savedStoresInOrder, storeDomain, storeSubtitle, storesInCategory,
  toggleSavedStoreId,
} from '@/features/aywebs/storesCatalog';

const cat = (id: string, labelFr: string, labelAr = labelFr): AyWebsCategory => ({ id, labelFr, labelAr });

const CATEGORIES: AyWebsCategory[] = [
  cat('fashion', 'Mode', 'موضة'),
  cat('electronics', 'High-tech', 'إلكترونيات'),
  cat('beauty', 'Beauté', 'جمال'),
];

const store = (over: Partial<AyWebsStore> & Pick<AyWebsStore, 'id'>): AyWebsStore => ({
  name: over.id,
  displayName: over.id,
  description: '',
  logo: '',
  homeUrl: `https://www.${over.id}.example/`,
  categories: [],
  enabled: true,
  capabilities: ['browse'],
  ...over,
} as AyWebsStore);

const STORES: AyWebsStore[] = [
  store({ id: 'amazon', displayName: 'Amazon', categories: ['electronics', 'fashion'] }),
  store({ id: 'shein', displayName: 'SHEIN', categories: ['fashion', 'beauty'], description: 'Mode rapide' }),
  store({ id: 'creema', displayName: 'Créma', categories: ['fashion'] }),
  store({ id: 'orphan', displayName: 'Orphan', categories: [] }),
];

describe('normalizeSearchText', () => {
  it('ignores case, accents and repeated spaces', () => {
    expect(normalizeSearchText('  CRÉMA   Shop ')).toBe('crema shop');
  });
});

describe('filterStoresByQuery', () => {
  it('returns every store for an empty or blank query, in server order', () => {
    expect(filterStoresByQuery(STORES, '').map((s) => s.id)).toEqual(['amazon', 'shein', 'creema', 'orphan']);
    expect(filterStoresByQuery(STORES, '   ').length).toBe(4);
  });

  it('matches a partial name, case-insensitively', () => {
    expect(filterStoresByQuery(STORES, 'SHE').map((s) => s.id)).toEqual(['shein']);
    expect(filterStoresByQuery(STORES, 'ama').map((s) => s.id)).toEqual(['amazon']);
  });

  it('matches accented names without accents', () => {
    expect(filterStoresByQuery(STORES, 'crem').map((s) => s.id)).toEqual(['creema']);
  });

  it('returns nothing when no store matches', () => {
    expect(filterStoresByQuery(STORES, 'zzz')).toEqual([]);
  });

  it('also matches the technical name', () => {
    expect(filterStoresByQuery([store({ id: 'x1', name: 'peach-shop', displayName: 'Peach' })], 'peach-')
      .map((s) => s.id)).toEqual(['x1']);
  });
});

describe('categories', () => {
  it('lists stores in several categories under each of them', () => {
    expect(storesInCategory(STORES, 'fashion').map((s) => s.id)).toEqual(['amazon', 'shein', 'creema']);
    expect(storesInCategory(STORES, 'beauty').map((s) => s.id)).toEqual(['shein']);
  });

  it('counts stores per category, in catalog order', () => {
    expect(categoryEntries(STORES, CATEGORIES).map((e) => [e.category.id, e.count])).toEqual([
      ['fashion', 3], ['electronics', 1], ['beauty', 1],
    ]);
  });

  it('shows the label of the requested locale and falls back to the id', () => {
    expect(categoryLabel(CATEGORIES[1], 'fr')).toBe('High-tech');
    expect(categoryLabel(CATEGORIES[1], 'ar')).toBe('إلكترونيات');
    expect(categoryLabel({ id: 'toys', labelFr: '', labelAr: '' }, 'fr')).toBe('toys');
  });
});

describe('storeSubtitle', () => {
  it('uses the server description when there is one', () => {
    expect(storeSubtitle(STORES[1], CATEGORIES, 'fr')).toBe('Mode rapide');
  });

  it('falls back to the category labels, never to invented text', () => {
    expect(storeSubtitle(STORES[0], CATEGORIES, 'fr')).toBe('High-tech · Mode');
    expect(storeSubtitle(STORES[3], CATEGORIES, 'fr')).toBe('');
  });
});

describe('storeDomain', () => {
  it('returns the host without www., or empty for a bad url', () => {
    expect(storeDomain(STORES[0])).toBe('amazon.example');
    expect(storeDomain(store({ id: 'bad', homeUrl: 'not a url' }))).toBe('');
  });
});

describe('saved stores', () => {
  it('keeps catalog order and ignores ids that no longer exist', () => {
    expect(savedStoresInOrder(STORES, ['creema', 'gone', 'amazon']).map((s) => s.id)).toEqual(['amazon', 'creema']);
  });

  it('toggles an id on and off without duplicates', () => {
    const once = toggleSavedStoreId([], 'amazon');
    expect(once).toEqual(['amazon']);
    expect(toggleSavedStoreId(once, 'amazon')).toEqual([]);
    expect(toggleSavedStoreId(['a'], 'b')).toEqual(['a', 'b']);
  });

  it('parses stored data tolerantly', () => {
    expect(parseSavedStoreIds(null)).toEqual([]);
    expect(parseSavedStoreIds('not json')).toEqual([]);
    expect(parseSavedStoreIds('{"a":1}')).toEqual([]);
    expect(parseSavedStoreIds('["a","a","", 3, "b"]')).toEqual(['a', 'b']);
  });
});

describe('chunkRows', () => {
  it('splits into rows of the given width, keeping the last partial row', () => {
    expect(chunkRows([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkRows([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('returns no rows for an empty list and never loops on a bad width', () => {
    expect(chunkRows([], 2)).toEqual([]);
    expect(chunkRows([1, 2], 0)).toEqual([[1], [2]]);
  });
});
