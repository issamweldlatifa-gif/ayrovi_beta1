import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  entryFromPage,
  refreshLiveStock,
  toContractAvailability,
  type LiveStockFetcher,
} from '../src/ayrovix/services/lensLiveStock';
import { inspectVariantOrder } from '../src/ayrovix/services/variantAvailability';
import {
  hostAllowsProbe,
  recordProbeFailure,
  recordProbeSuccess,
  resetProbeState,
} from '../src/scraper/hostCircuit';
import type { ParsedProductPage } from '../src/scraper/productPageParser';

const TITLE = 'Champion Sportswear Open Hem Pants';
const page = (overrides: Partial<ParsedProductPage> = {}): ParsedProductPage => ({
  title: TITLE,
  price: 35.95,
  currency: 'EUR',
  images: [],
  externalId: 'X1',
  variants: { sizes: [], colors: [], details: [] },
  availability: 'unknown',
  priceSource: 'json_ld',
  ...overrides,
} as ParsedProductPage);

let dir = '';
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-live-stock-'));
  process.env.AYROVI_VARIANT_CACHE_DIR = path.join(dir, 'contracts');
  delete process.env.AYROVI_LENS_LIVE_STOCK;
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
  resetProbeState();
});

describe('entryFromPage — faits publiés, jamais de disponibilité devinée', () => {
  it('relie taille/couleur au bon état et laisse le silence UNKNOWN', () => {
    const entry = entryFromPage(page({
      availability: 'in_stock',
      originalPrice: 45,
      images: ['https://cdn.tn/a.jpg'],
      variants: {
        sizes: ['8 (XS)', '10 (S)'],
        colors: ['Blue'],
        details: [
          { id: 'v8', label: '8 (XS)', size: '8 (XS)', color: 'Blue', available: true, stock: true, price: null },
          { id: 'v16', label: '16 (XL)', size: '16 (XL)', color: 'Blue', available: false, stock: false, price: null },
        ],
      },
    }), 1000);

    expect(entry.price).toBe(35.95);
    expect(entry.currency).toBe('EUR');
    expect(entry.originalPrice).toBe(45);
    expect(entry.variants).toEqual([
      { value: '8 (XS)', color: 'Blue', availability: 'available' },
      { value: '10 (S)', color: null, availability: 'unknown' },
    ]);
    expect(entry.sizes).toEqual(['8 (XS)', '10 (S)']);
  });

  it('refuse un prix barré inférieur et une devise invalide', () => {
    const entry = entryFromPage(page({ originalPrice: 20, currency: '??' }), 1000);
    expect(entry.price).toBe(0);
    expect(entry.currency).toBeUndefined();
    expect(entry.originalPrice).toBeNull();
  });
});

describe('refreshLiveStock — relecture explicite seulement', () => {
  it('retourne les faits frais et passe les deux prix au calculateur existant', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({
      availability: 'in_stock', originalPrice: 45, images: ['https://cdn.tn/a.jpg'],
    }));
    const reprice = vi.fn((price: number) => ({ priceTnd: price * 3 }));
    const { results } = await refreshLiveStock(['https://shop.tn/pants'], { fetcher, reprice, now: 1000 });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(reprice).toHaveBeenCalledWith(35.95, 'EUR');
    expect(reprice).toHaveBeenCalledWith(45, 'EUR');
    expect(results[0]).toMatchObject({
      availability: 'in_stock', price: 35.95, currency: 'EUR', originalPrice: 45,
      originalPriceTnd: 135, images: ['https://cdn.tn/a.jpg'],
    });
    expect(results[0].priceTnd).toBeCloseTo(107.85);
    expect(results[0].reason).toContain('marchande');
  });

  it('enregistre le contrat de la variante réellement choisie', async () => {
    const url = 'https://shop.tn/hoody';
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({
      availability: 'in_stock',
      variants: {
        sizes: [], colors: [], details: [
          { id: 'v8', label: '8 (XS)', size: '8 (XS)', color: null, available: true, stock: true, price: null },
          { id: 'v16', label: '16 (XL)', size: '16 (XL)', color: null, available: true, stock: false, price: null },
        ],
      },
    }));
    expect(inspectVariantOrder(url, '8 (XS)').code).toBe('NO_CONTRACT');
    await refreshLiveStock([url], { fetcher });
    expect(inspectVariantOrder(url, '8 (XS)').allowed).toBe(true);
    expect(inspectVariantOrder(url, '16 (XL)').code).toBe('VARIANT_UNAVAILABLE');
  });

  it('un silence de stock reste UNKNOWN et le gardien refuse de deviner', async () => {
    const url = 'https://shop.tn/silent';
    const { results } = await refreshLiveStock([url], {
      fetcher: async () => page({ availability: 'unknown', variants: { sizes: ['10 (S)'], colors: [], details: [] } }),
    });
    expect(results[0].availability).toBe('unknown');
    expect(inspectVariantOrder(url, '10 (S)').code).toBe('VARIANT_AVAILABILITY_UNKNOWN');
  });

  it('une page illisible ne produit aucune donnée de remplacement', async () => {
    const url = 'https://shop.tn/broken';
    const { results } = await refreshLiveStock([url], { fetcher: async () => null });
    expect(results[0]).toMatchObject({ availability: 'unknown', price: null, sizes: [], variants: [] });
    expect(inspectVariantOrder(url, '10 (S)').allowed).toBe(false);
  });

  it('borne la relecture à huit liens et ignore les entrées non URL', async () => {
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'in_stock' }));
    const urls = [...Array.from({ length: 12 }, (_, index) => `https://shop.tn/p${index}`), 'pas-un-lien'];
    const { results } = await refreshLiveStock(urls, { fetcher });
    expect(fetcher).toHaveBeenCalledTimes(8);
    expect(results).toHaveLength(8);
  });

  it('respecte le coupe-circuit et le réglage off sans appeler le marchand', async () => {
    const url = 'https://blocked.tn/p';
    const fetcher = vi.fn<LiveStockFetcher>(async () => page({ availability: 'in_stock' }));
    recordProbeFailure(url); recordProbeFailure(url); recordProbeFailure(url);
    expect(hostAllowsProbe(url)).toBe(false);
    await refreshLiveStock([url], { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
    recordProbeSuccess(url);

    process.env.AYROVI_LENS_LIVE_STOCK = 'false';
    await refreshLiveStock(['https://shop.tn/pants'], { fetcher });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe('périmètre conservé', () => {
  it('limited reste positif, out_of_stock négatif, silence UNKNOWN', () => {
    expect(toContractAvailability('in_stock')).toBe('available');
    expect(toContractAvailability('limited')).toBe('available');
    expect(toContractAvailability('out_of_stock')).toBe('unavailable');
    expect(toContractAvailability('unknown')).toBe('unknown');
  });

  it('la grille Lens ne contient plus le scraping groupé ; la relecture explicite reste', () => {
    const route = readFileSync('src/ayrovix/routes.ts', 'utf8');
    const analyze = route.split("router.post('/analyze-image'")[1].split("router.post('/detect'")[0];
    expect(analyze).toContain('admitLensProductCandidates(rawCandidates, scraper, 24)');
    expect(analyze).not.toContain('enrichCandidatesLiveStock');
    expect(analyze).not.toContain('scrapeParsedPage');
    expect(analyze).not.toContain('filterPurchasable');
    expect(route).toContain("router.post('/live-stock'");
    expect(route).toContain('await refreshLiveStock(urls');
  });
});
