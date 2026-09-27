import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { enrichProduct, readImages, readSizes } from '../src/ayrovix/services/productEnrichment';

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prod-enrich-'));
  process.env.AYROVI_PRODUCT_ENRICH_CACHE_DIR = dir;
  process.env.SERPAPI_KEY = 'test-key';
  delete process.env.AYROVI_PRODUCT_ENRICH;
  delete process.env.AYROVI_PRODUCT_ENRICH_DEADLINE_MS;
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const TITLE = 'Tommy Hilfiger ADAN Belt black';
const found = { title: 'Tommy Hilfiger ADAN Belt black homme', productId: 'pid-1', sourceUrl: 'https://shop.test/item' };
const product = {
  title: TITLE,
  description: 'Ceinture en cuir avec boucle métal',
  media: [
    { type: 'image', link: 'https://m.tn/1.jpg' },
    { type: 'image', link: 'https://m.tn/2.jpg' },
    { type: 'video', link: 'https://m.tn/clip.mp4' },
    { type: 'image', link: 'https://m.tn/1.jpg' },
  ],
  variations: { Taille: [
    { name: '85', available: true },
    { name: '90', available: false },
    { name: '95' },
  ] },
};

describe('source product data readers', () => {
  it('collects images from multiple source fields, filters video and deduplicates', () => {
    expect(readImages({ ...product, images: ['https://m.tn/3.jpg', { url: 'https://m.tn/4.jpg' }] })).toEqual([
      'https://m.tn/1.jpg', 'https://m.tn/2.jpg', 'https://m.tn/3.jpg', 'https://m.tn/4.jpg',
    ]);
  });

  it('reads belt/clothing numeric options and preserves unknown availability', () => {
    expect(readSizes(product)).toEqual([
      { value: '85', label: null, availability: 'available' },
      { value: '90', label: null, availability: 'unavailable' },
      { value: '95', label: null, availability: 'unknown' },
    ]);
  });

  it('reads clothing sizes from grouped variant responses', () => {
    expect(readSizes({ title: 'Pull laine', variants: [{ title: 'Size', items: [{ name: 'M', available: true }] }] })).toEqual([
      { value: 'M', label: null, availability: 'available' },
    ]);
  });

  it('reads electronics storage as the primary option, not as garment sizing', () => {
    expect(readSizes({ title: 'Smartphone X', variations: { Storage: [{ name: '128 GB' }, { name: '256 GB', available: true }] } })).toEqual([
      { value: '128 GB', label: null, availability: 'unknown' },
      { value: '256 GB', label: null, availability: 'available' },
    ]);
  });

  it('reads fragrance capacities and ignores unrelated colour groups', () => {
    expect(readSizes({ title: 'Eau de parfum', variations: {
      Volume: [{ name: '30 ml' }, { name: '50 ml', available: true }],
      Couleur: [{ name: 'noir', available: true }],
    } })).toEqual([
      { value: '30 ml', label: null, availability: 'unknown' },
      { value: '50 ml', label: null, availability: 'available' },
    ]);
  });

  it('rejects explicit contradictions instead of declaring the option available', () => {
    expect(readSizes({ title: 'Pantalon', variations: {
      Taille: [{ name: 'M', available: true }, { name: 'M', available: false }],
    } })).toEqual([{ value: 'M', label: null, availability: 'unknown' }]);
  });
});

describe('enriching the opened merchant page', () => {
  const fetchers = () => ({
    findProduct: vi.fn(async () => found),
    loadProduct: vi.fn(async () => product),
  });

  it('returns the gallery, primary options, option label and description', async () => {
    const out = await enrichProduct(TITLE, { fetchers: fetchers() });
    expect(out.images).toHaveLength(2);
    expect(out.sizes).toHaveLength(3);
    expect(out.optionLabel).toBe('Taille');
    expect(out.description).toContain('cuir');
  });

  it('refuses a different product before loading its images', async () => {
    const f = { findProduct: vi.fn(async () => ({ title: 'Cafetière inox 6 tasses', productId: 'x' })), loadProduct: vi.fn(async () => product) };
    const out = await enrichProduct(TITLE, { fetchers: f });
    expect(out.images).toEqual([]);
    expect(f.loadProduct).not.toHaveBeenCalled();
  });

  it('uses the closest verified shopping result, not the first generic result', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ shopping_results: [
        { title: 'Tommy belt', product_id: 'weak-match', link: 'https://shop.test/weak' },
        { title: found.title, product_id: found.productId, link: found.sourceUrl },
      ] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ product_results: product }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await enrichProduct(TITLE);
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('product_id=pid-1');
  });

  it('rejects a title match from a different merchant host', async () => {
    const f = { findProduct: vi.fn(async () => found), loadProduct: vi.fn(async () => product) };
    const out = await enrichProduct(TITLE, { fetchers: f, cacheScope: 'https://other-shop.test/item' });
    expect(out.images).toEqual([]);
    expect(f.loadProduct).not.toHaveBeenCalled();
  });

  it('separates same-name products by merchant URL in cache', async () => {
    const f = fetchers();
    await enrichProduct(TITLE, { fetchers: f, cacheScope: 'https://shop-a.test/item' });
    await enrichProduct(TITLE, { fetchers: f, cacheScope: 'https://shop-b.test/item' });
    expect(f.findProduct).toHaveBeenCalledTimes(2);
  });

  it('reuses the cache for the same URL without repeating the provider request', async () => {
    const f = fetchers();
    await enrichProduct(TITLE, { fetchers: f, cacheScope: 'https://shop.test/item' });
    await enrichProduct(TITLE, { fetchers: f, cacheScope: 'https://shop.test/item?campaign=two' });
    expect(f.findProduct).toHaveBeenCalledTimes(1);
  });

  it('does not cache empty results and retries on the next open', async () => {
    const f = { findProduct: vi.fn(async () => null), loadProduct: vi.fn(async () => null) };
    await enrichProduct(TITLE, { fetchers: f });
    await enrichProduct(TITLE, { fetchers: f });
    expect(f.findProduct).toHaveBeenCalledTimes(2);
  });

  it('never delays the initial product page beyond its configured deadline', async () => {
    process.env.AYROVI_PRODUCT_ENRICH_DEADLINE_MS = '500';
    const f = { findProduct: vi.fn(() => new Promise<never>(() => {})), loadProduct: vi.fn() };
    const started = Date.now();
    const out = await enrichProduct(TITLE, { fetchers: f as any });
    expect(Date.now() - started).toBeLessThan(2500);
    expect(out.images).toEqual([]);
  });

  it('can be disabled without a deploy and network errors do not break the page', async () => {
    process.env.AYROVI_PRODUCT_ENRICH = 'false';
    const f = fetchers();
    await enrichProduct(TITLE, { fetchers: f });
    expect(f.findProduct).not.toHaveBeenCalled();
    delete process.env.AYROVI_PRODUCT_ENRICH;
    const broken = { findProduct: vi.fn(async () => { throw new Error('HTTP_500'); }), loadProduct: vi.fn() };
    await expect(enrichProduct(TITLE, { fetchers: broken as any })).resolves.toMatchObject({ images: [], sizes: [], optionLabel: null });
  });
});

describe('opened-page enrichment wiring', () => {
  const source = readFileSync('src/ayrovix/services/product.ts', 'utf8');
  it('enriches only a sparse opened page and scopes cache by its merchant URL', () => {
    expect(source).toContain('if (product.images.length >= 4 && product.sizes.length > 0) return;');
    expect(source).toContain('enrichProduct(product.title, { cacheScope: url })');
    expect(source).toContain('await enrichSparseProduct(product, url);');
  });
  it('preserves direct merchant data and uses source-only prices for variants', () => {
    expect(source).toContain('[...new Set([...product.images, ...extra.images])]');
    expect(source).toContain('if (!product.sizes.length && extra.sizes.length)');
    expect(source).toContain('price: null');
    expect(source).toContain('priceTnd: null');
    expect(source).toContain('availability: size.availability');
  });
});
