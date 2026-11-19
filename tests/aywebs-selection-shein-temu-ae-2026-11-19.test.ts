/**
 * AYWEBs — mode SÉLECTION sur SHEIN, TEMU et AliExpress (19/11/2026, lot 2).
 *
 * « الحريف يختار ← AYWEBs يلتقط ← ZAYROVI تسعّر ← الحريف يؤكد »
 *
 * Pour chaque boutique, le script SERVI (enveloppe « sélection ») lit la page
 * deux fois, puis le serveur résout :
 *   • choix complet  ⇒ 201, `captured_selection` = le choix de la page, UNE
 *     seule combinaison, prix de la page, identifiant d'option lié, devis signé ;
 *   • choix incomplet ⇒ 422 VARIANT_REQUIRED (jamais de valeur par défaut) ;
 *   • option épuisée ⇒ 409 VARIANT_UNAVAILABLE ;
 *   • aucune lecture marchande serveur, aucune matrice dans la capture.
 */
import express from 'express';
import request from 'supertest';
import { JSDOM } from 'jsdom';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { ensureAyWebsSchema } from '../src/aywebs/schema';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
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
    scrapeProduct: vi.fn(async () => { throw new Error('mode sélection : aucune lecture marchande attendue'); }),
  };
  const db = new QatafoDatabase(':memory:');
  ensureAyWebsSchema(db);
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const server = express();
  server.use(express.json({ limit: '2mb' }));
  server.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as never));
  return { server, scraper };
}

/** Deux lectures dans la même fenêtre, comme l'application (~400 ms d'écart). */
function readTwice(storeId: string, html: string, url: string): Record<string, any> {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  try {
    const script = buildAyWebsCaptureScript(storeId, { mode: 'selection' });
    dom.window.eval(script);
    return JSON.parse(String(dom.window.eval(script)));
  } finally {
    dom.window.close();
  }
}

async function resolve(server: express.Express, url: string, storeId: string, capture: unknown, session: string) {
  return request(server)
    .post('/api/v1/aywebs/product/resolve')
    .set({ 'x-session-id': session })
    .send({ url, store_id: storeId, capture });
}

const SHEIN_URL = 'https://m.shein.com/fr/Robe-fleurie-p-382460229.html';
const TEMU_URL = 'https://www.temu.com/fr/sweat-capuche-homme-g-601099512345678.html';
const AE_URL = 'https://www.aliexpress.com/item/1005008811223344.html';

const previous = process.env.AYWEBS_SELECTION_CAPTURE;
beforeAll(() => {
  process.env.AYWEBS_SELECTION_CAPTURE = 'all';
  process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE = '0';
  process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE = '0';
});
afterAll(() => {
  process.env.AYWEBS_SELECTION_CAPTURE = previous;
  delete process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE;
  delete process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE;
});
afterEach(() => {
  clearAyWebsResolveCache();
  clearAyWebsResolveFailureCache();
  resetAyWebsReadGate();
  resetProbeState();
  vi.restoreAllMocks();
});

describe('capture servie en mode sélection : le choix affiché, pas la matrice', () => {
  it.each([
    ['shein', buildSheinSpaPage({ selectedSize: 'XL', displayedPrice: '24,90 €' }), SHEIN_URL],
    ['temu', buildTemuSelectionPage({ color: 'Noir', size: 'L' }), TEMU_URL],
    ['aliexpress', buildAliExpressCometPage({ selectedColor: 'Black', selectedPlug: 'EU Plug' }), AE_URL],
  ])('%s : deux lectures stables, aucune matrice, identifiant de l’option choisie', (storeId, html, url) => {
    const capture = readTwice(storeId, html, url);
    expect(capture.captureMode).toBe('selection');
    expect(capture.selection).toMatchObject({ reads: 2, stable: true });
    expect(capture.selection.variantId).toBeTruthy();
    expect(capture.variantMatrix).toEqual([]);
    if (capture.aliexpress) expect(capture.aliexpress.skus).toEqual([]);
    // Les options NON choisies ne portent plus ni prix ni stock.
    for (const group of capture.variantGroups) {
      const chosen = String(group.selected?.[0] || '').toLowerCase();
      for (const option of group.options || []) {
        if (String(option.value).toLowerCase() === chosen) continue;
        expect(option.price ?? null).toBeNull();
        expect(option.stock ?? null).toBeNull();
      }
    }
  });

  it('TEMU : le SKU de la combinaison cochée est lu dans l’état de la page', () => {
    expect(readTwice('temu', buildTemuSelectionPage({ color: 'Noir', size: 'L' }), TEMU_URL).temu.selectedSkuId).toBe('sku_noir_l');
    expect(readTwice('temu', buildTemuSelectionPage({ color: 'Noir', size: null }), TEMU_URL).temu.selectedSkuId).toBeNull();
  });
});

describe('de bout en bout : choix complet ⇒ devis du choix de la page', () => {
  it.each([
    ['shein', buildSheinSpaPage({ selectedSize: 'XL', displayedPrice: '24,90 €' }), SHEIN_URL, { Couleur: 'Noir', Taille: 'XL' }, '382460229', 24.9, 'EUR'],
    ['temu', buildTemuSelectionPage({ color: 'Noir', size: 'L' }), TEMU_URL, { Couleur: 'Noir', Taille: 'L' }, 'sku_noir_l', 14.49, 'EUR'],
    ['aliexpress', buildAliExpressCometPage({ selectedColor: 'Black', selectedPlug: 'EU Plug' }), AE_URL, { Color: 'Black', 'Plug Type': 'EU Plug' }, '12000039001', 19.99, 'USD'],
  ])('%s', async (storeId, html, url, attributes, variantId, price, currency) => {
    const { server, scraper } = app();
    const capture = readTwice(storeId, html, url);
    const response = await resolve(server, url, storeId, capture, `sel-${storeId}-ok`);
    expect(response.status, JSON.stringify(response.body).slice(0, 600)).toBe(201);
    expect(scraper.scrapeProduct).not.toHaveBeenCalled();
    expect(response.body.captured_selection).toMatchObject({ mode: 'selection', attributes, variant_id: variantId, availability: 'AVAILABLE' });
    expect(response.body.data.price).toBeCloseTo(price, 2);
    expect(response.body.data.currency).toBe(currency);
    for (const group of response.body.data.variant_groups || []) expect(group.values.length).toBe(1);
    expect(response.body.data.variant_quotes).toEqual([]);
    expect(response.body.quote_token).toBeTruthy();
  });
});

describe('de bout en bout : choix incomplet ou épuisé ⇒ refus clair, jamais de choix par défaut', () => {
  it.each([
    ['shein', buildSheinSpaPage({ selectedSize: null }), SHEIN_URL],
    ['temu', buildTemuSelectionPage({ color: 'Noir', size: null }), TEMU_URL],
    ['aliexpress', buildAliExpressCometPage({ selectedColor: 'Black', selectedPlug: null }), AE_URL],
  ])('%s : dimension non choisie ⇒ 422 VARIANT_REQUIRED', async (storeId, html, url) => {
    const { server } = app();
    const response = await resolve(server, url, storeId, readTwice(storeId, html, url), `sel-${storeId}-missing`);
    expect(response.status, JSON.stringify(response.body).slice(0, 600)).toBe(422);
    expect(response.body.code).toBe('VARIANT_REQUIRED');
  });

  it.each([
    ['shein', buildSheinSpaPage({ selectedSize: 'L' }), SHEIN_URL],
    ['temu', buildTemuSelectionPage({ color: 'Gris foncé', size: 'L', soldOutSize: 'L' }), TEMU_URL],
    ['aliexpress', buildAliExpressCometPage({ selectedColor: 'Red', selectedPlug: 'US Plug' }), AE_URL],
  ])('%s : option choisie épuisée ⇒ 409 VARIANT_UNAVAILABLE', async (storeId, html, url) => {
    const { server } = app();
    const response = await resolve(server, url, storeId, readTwice(storeId, html, url), `sel-${storeId}-soldout`);
    expect(response.status, JSON.stringify(response.body).slice(0, 600)).toBe(409);
    expect(response.body.code).toBe('VARIANT_UNAVAILABLE');
  });
});

describe('la capture reste liée à la fiche et à ses véritables dimensions', () => {
  const first = { url: 'https://www.sephora.com/product/eau-intense-P456123', sku: '2518959', name: 'Eau Intense', price: '23.00' };
  const second = { url: 'https://www.sephora.com/product/eau-fraiche-P456124', sku: '2518960', name: 'Eau Fraîche', price: '41.50' };
  const imageFor = (sku: string) => `https://www.sephora.com/productimages/sku/s${sku}-main-zoom.jpg`;
  function capturePerfume(item: typeof first, groups: object[]) {
    const product = {
      '@context': 'https://schema.org', '@type': 'Product', name: item.name, sku: item.sku,
      image: imageFor(item.sku),
      offers: { '@type': 'Offer', price: item.price, priceCurrency: 'USD', availability: 'https://schema.org/InStock', sku: item.sku },
    };
    const snapshot = readTwice('sephora', `<!doctype html><html><head><title>${item.name}</title>
      <script type="application/ld+json">${JSON.stringify(product)}</script></head><body><main>
      <h1>${item.name}</h1><span>$${item.price}</span><button>Add to Basket</button>
      </main></body></html>`, item.url);
    return { ...snapshot, variantGroups: groups };
  }

  it('capture sans taille ni couleur, et garde deux produits distincts de la même boutique et session', async () => {
    const { server, scraper } = app();
    const cases = [
      { item: first, groups: [{ name: 'Taille', values: ['Taille', 'Votre taille', 'Choisir une taille'], selected: ['Taille'] }], attributes: {} },
      { item: second, groups: [{ name: 'Contenance', values: ['30 ml', '50 ml'], selected: ['50 ml'], options: [{ value: '50 ml', image: imageFor(second.sku) }] }], attributes: { Contenance: '50 ml' } },
    ];
    const ids: string[] = [];
    for (const { item, groups, attributes } of cases) {
      const capture = capturePerfume(item, groups);
      const response = await resolve(server, item.url, 'sephora', capture, 'sel-sephora-two-products');
      expect(response.status, JSON.stringify(response.body).slice(0, 600)).toBe(201);
      expect(response.body.captured_selection.attributes).toEqual(attributes);
      expect(response.body.data.title).toContain(item.name);
      expect(response.body.data.price).toBe(Number(item.price));
      expect(response.body.data.images[0]).toBe(imageFor(item.sku));
      expect(response.body.quote_token).toBeTruthy();
      ids.push(response.body.data.product_id);
      const added = await request(server).post('/api/v1/aywebs/cart/items')
        .set({ 'x-session-id': 'sel-sephora-two-products' })
        .send({ product_id: response.body.data.product_id, source_url: item.url, store_id: 'sephora',
          variant: attributes, quote_token: response.body.quote_token, quantity: 1, capture });
      expect(added.status, JSON.stringify(added.body).slice(0, 600)).toBe(201);
      expect(added.body.data.item).toMatchObject({ images: [imageFor(item.sku)], unit_price: Number(item.price),
        currency: 'USD', product_id: response.body.data.product_id });
      expect(added.body.data.item.variant_snapshot?.attributes ?? {}).toEqual(attributes);
    }
    expect(ids.every(Boolean)).toBe(true);
    expect(new Set(ids).size).toBe(2);
    expect(scraper.scrapeProduct).not.toHaveBeenCalled();
  });

  it('ne choisit pas une contenance non cochée, même lorsqu’il n’y a plus qu’une valeur proposée', async () => {
    const { server } = app();
    const response = await resolve(server, first.url, 'sephora', capturePerfume(first, [
      { name: 'Contenance', values: ['Choisir une contenance', '50 ml'], selected: ['Choisir une contenance'] },
    ]), 'sel-sephora-unselected');
    expect(response.status, JSON.stringify(response.body).slice(0, 600)).toBe(422);
    expect(response.body.code).toBe('VARIANT_REQUIRED');
  });
});
