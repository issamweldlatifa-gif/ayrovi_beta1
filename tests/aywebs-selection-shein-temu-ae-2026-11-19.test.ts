/** Unified production capture flow: public reader -> scoped SKU evidence -> quote. */
import express from 'express';
import request from 'supertest';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { ensureAyWebsSchema } from '../src/aywebs/schema';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { clearAyWebsResolveCache, clearAyWebsResolveFailureCache } from '../src/aywebs/resolveCache';
import { resetAyWebsReadGate } from '../src/aywebs/readGate';
import { resetProbeState } from '../src/scraper/hostCircuit';
import { buildAliExpressCometPage, buildSheinSpaPage, buildTemuSelectionPage } from './fixtures/aywebs/selectionPages';

function pricingRules(): PricingRules {
  return {
    id: 'default', version: 3,
    rateEUR: 3.4, rateUSD: 3.1, rateGBP: 4, rateJPY: 0.02,
    exchangeBufferPercent: 3, freightPerKgTND: 13, localDeliveryTND: 8,
    commissionPercent: 10, minimumCommissionTND: 0, rpdPercent: 3, rpdMinimumTND: 10,
    defaultTvaRate: 0.19, expressFeeTND: 15,
    categories: DEFAULT_CUSTOMS_CATEGORIES,
    updatedAt: new Date().toISOString(),
  };
}

function app() {
  const scraper = {
    cleanPastedUrl: (value: string) => value.trim(),
    scrapeProduct: vi.fn(async () => { throw new Error('fixture: no merchant network'); }),
  };
  const db = new QatafoDatabase(':memory:');
  ensureAyWebsSchema(db);
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const server = express();
  server.use(express.json({ limit: '2mb' }));
  server.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as never));
  return { server, db };
}

async function read(server: express.Express, storeId: string, html: string, url: string) {
  const response = await request(server).get('/api/v1/aywebs/capture/script.js').query({ store_id: storeId, mode: 'selection' });
  expect(response.status).toBe(200);
  expect(response.headers['x-aywebs-capture-principle']).toBe('matrix');
  expect(response.headers['x-aywebs-capture-bundle']).not.toContain('selection');
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  try { return JSON.parse(String(dom.window.eval(response.text))); }
  finally { dom.window.close(); }
}

async function resolve(server: express.Express, url: string, storeId: string, capture: unknown, variant?: Record<string, string>) {
  return request(server).post('/api/v1/aywebs/product/resolve')
    .set({ 'x-session-id': `matrix-${storeId}-test` })
    .send({ url, store_id: storeId, capture, variant });
}

const SHEIN_URL = 'https://m.shein.com/fr/Robe-fleurie-p-382460229.html';
const TEMU_URL = 'https://www.temu.com/fr/sweat-capuche-homme-g-601099512345678.html';
const AE_URL = 'https://www.aliexpress.com/item/1005008811223344.html';

afterEach(() => {
  clearAyWebsResolveCache();
  clearAyWebsResolveFailureCache();
  resetAyWebsReadGate();
  resetProbeState();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('merchant-specific readers, one capture/quote flow', () => {
  it.each([
    ['shein', buildSheinSpaPage({ selectedSize: 'XL', displayedPrice: '24,90 €' }), SHEIN_URL, { Couleur: 'Noir', Taille: 'XL' }, 24.9, 'EUR'],
    ['temu', buildTemuSelectionPage({ color: 'Noir', size: 'L' }), TEMU_URL, { Couleur: 'Noir', Taille: 'L' }, 14.49, 'EUR'],
    ['aliexpress', buildAliExpressCometPage({ selectedColor: 'Black', selectedPlug: 'EU Plug' }), AE_URL, { Color: 'Black', 'Plug Type': 'EU Plug' }, 19.99, 'USD'],
  ] as const)('%s preserves published options and prices the requested combination', async (storeId, html, url, variant, price, currency) => {
    const { server } = app();
    const capture = await read(server, storeId, html, url);
    expect(capture.captureMode).toBeUndefined();
    expect(capture.variantGroups.some((group: { values: string[] }) => group.values.length > 1)).toBe(true);
    const response = await resolve(server, url, storeId, capture, variant);
    expect(response.status, JSON.stringify(response.body).slice(0, 600)).toBe(201);
    expect(response.body.captured_selection).toBeNull();
    expect(response.body.capture?.used).toBe(true);
    expect(response.body.data.price).toBeCloseTo(price, 2);
    expect(response.body.data.currency).toBe(currency);
    expect(response.body.data.zayrovi_pricing?.total_tnd).toBeGreaterThan(0);
    expect(response.body.quote_token).toBeTruthy();
  });

  it('recalculates a changed size and refuses adding an out-of-stock size', async () => {
    const { server } = app();
    const capture = await read(server, 'shein', buildSheinSpaPage({ selectedSize: 'XL', displayedPrice: '24,90 €' }), SHEIN_URL);
    const variant = { Couleur: 'Noir', Taille: 'M' };
    const response = await resolve(server, SHEIN_URL, 'shein', capture, variant);
    expect(response.status, JSON.stringify(response.body).slice(0, 400)).toBe(201);
    expect(response.body.data).toMatchObject({ price: 21.4, currency: 'EUR' });
    expect(response.body.quote_token).toBeTruthy();
    const add = (choice: typeof variant) => request(server).post('/api/v1/aywebs/cart/items')
      .set({ 'x-session-id': 'matrix-shein-test' })
      .send({ source_url: SHEIN_URL, store_id: 'shein', product_id: response.body.data.product_id,
        variant: choice, quantity: 1, capture, quote_token: response.body.quote_token });
    const soldOut = await add({ ...variant, Taille: 'L' });
    expect(soldOut.status, JSON.stringify(soldOut.body).slice(0, 400)).toBe(409);
    expect(soldOut.body.code).toMatch(/VARIANT_UNAVAILABLE|OUT_OF_STOCK/);
    const added = await add(variant);
    expect(added.status, JSON.stringify(added.body).slice(0, 400)).toBe(201);
    expect(added.body.data.item).toMatchObject({ unit_price: 21.4, currency: 'EUR', variant_snapshot: { attributes: variant } });
  });

  it('never revives the old mode from a saved administrator choice, environment flag or stale snapshot', async () => {
    vi.stubEnv('AYWEBS_SELECTION_CAPTURE', 'all');
    const { server, db } = app();
    db.run('CREATE TABLE ayweb_capture_principles (store_id TEXT PRIMARY KEY, principle TEXT NOT NULL)');
    db.run("INSERT INTO ayweb_capture_principles VALUES ('shein', 'selection')");
    const capture = await read(server, 'shein', buildSheinSpaPage({ selectedSize: 'XL' }), SHEIN_URL);
    const response = await resolve(server, SHEIN_URL, 'shein', { ...capture, captureMode: 'selection' });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe('CAPTURE_INCOMPLETE');
    expect(response.body.quote_token).toBeUndefined();
    expect(db.get('SELECT principle FROM ayweb_capture_principles WHERE store_id = ?', 'shein')).toEqual({ principle: 'selection' });
  });
});
