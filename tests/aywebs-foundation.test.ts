/**
 * AyWebs — contrat V1 du socle (registre, adaptateurs, garde de domaine,
 * partage Android/PWA, drapeaux runtime).
 *
 * Depuis le Master Order AYWEBs, `/capture` délègue au Product Engine : il
 * persiste le produit, sa preuve et son contrat de variantes. Le fixture
 * utilise donc une VRAIE base `:memory:` (comme les autres suites) au lieu
 * d'un objet partiel — les assertions de contrat, elles, restent identiques.
 */
import { isKnownPagePath } from '../shared/publicSeo';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { beforeAll, describe, expect, test, vi } from 'vitest';

// Le contrat de variantes est un cache disque : isolé par suite, jamais dans data/.
process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-variant-')), 'cache');

import { QatafoDatabase } from '../src/db/database';
import { AYWEBS_STORES, detectAyWebsStore } from '../shared/aywebsStores';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { ensureAyWebsSchema } from '../src/aywebs/schema';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';

function pricingRules(): PricingRules {
  return {
    id: 'default', version: 3,
    rateEUR: 4, rateUSD: 4, rateGBP: 4.8, rateJPY: 0.0265,
    exchangeBufferPercent: 3, freightPerKgTND: 13, localDeliveryTND: 8,
    commissionPercent: 10, minimumCommissionTND: 0, rpdPercent: 3, rpdMinimumTND: 10,
    defaultTvaRate: 0.19, expressFeeTND: 15,
    categories: DEFAULT_CUSTOMS_CATEGORIES,
    updatedAt: new Date().toISOString(),
  };
}

function fixture() {
  const scrapeProduct = vi.fn(async (url: string) => {
    const store = detectAyWebsStore(url)?.id || 'generic';
    const ids: Record<string, string> = { amazon: 'B0ABCDEFGH', shein: '382460229', temu: '601099999999999', aliexpress: '1005007777777777' };
    return {
      id: 'scraped_1', store, storeName: store.toUpperCase(), url,
      externalId: ids[store] || 'unknown', title: 'Nike Air Max shoes', description: 'Running shoes',
      images: ['https://images.example.test/shoe.jpg'], mainImage: 'https://images.example.test/shoe.jpg',
      sourcePrice: 39.99, sourceCurrency: 'USD', convertedPriceTND: 0,
      estimatedShippingTND: 0, serviceFeeTND: 0, totalPriceTND: 0,
      variants: { colors: ['Black'], sizes: ['42'], details: [] },
      availability: 'in_stock' as const, brand: 'Nike', priceVerified: true, currencyVerified: true,
      verificationProvider: 'direct', verificationMethod: 'json_ld', verificationFailureCode: null,
      scrapedAt: '2026-10-02T12:00:00.000Z',
    };
  });
  const scraper = {
    cleanPastedUrl: (value: string) => value.trim(),
    scrapeProduct,
  };
  const db = new QatafoDatabase(':memory:');
  // Le moteur tarifaire de test : mêmes règles que la production de référence.
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).requestId = 'test-request'; next(); });
  app.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as any));
  return { app, scrapeProduct, db };
}

const SESSION = { 'x-session-id': 'aywebs-foundation-session-0001' };

describe('AyWebs V1 foundation', () => {
  test('keeps all supported store names, domains and adapters in one registry', () => {
    expect(AYWEBS_STORES.find((store) => store.id === 'amazon')).toMatchObject({ captureSupported: true, adapter: 'amazon', phase: 1 });
    expect(AYWEBS_STORES.filter((store) => store.phase === 2).every((store) => store.captureSupported && store.status === 'beta')).toBe(true);
    expect(detectAyWebsStore('https://www.amazon.com/dp/B0ABCDEFGH')).toMatchObject({ id: 'amazon' });
    expect(detectAyWebsStore('https://amazon.com.evil.com/dp/B0ABCDEFGH')).toBeNull();
  });

  test('recreates the durable AYWEBs-to-AYROVI link table after an older initialized schema', () => {
    const db = new QatafoDatabase(':memory:');
    try {
      ensureAyWebsSchema(db);
      db.run('DROP TABLE ayweb_cart_ayrovi_links');
      ensureAyWebsSchema(db);
      expect(db.get<{ name: string }>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='ayweb_cart_ayrovi_links'`,
      )).toEqual({ name: 'ayweb_cart_ayrovi_links' });
    } finally {
      db.close();
    }
  });

  test('publishes the registry and runtime capture support', async () => {
    const { app } = fixture();
    const response = await request(app).get('/api/v1/aywebs/stores').set(SESSION);
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.find((store: any) => store.id === 'amazon').capture_supported).toBe(true);
    expect(response.body.data.find((store: any) => store.id === 'shein').capture_supported).toBe(true);

    const previous = process.env.AYWEBS_CAPTURE_ENABLED;
    process.env.AYWEBS_CAPTURE_ENABLED = 'false';
    try {
      const disabled = await request(app).get('/api/v1/aywebs/stores').set(SESSION);
      expect(disabled.body.features.capture_enabled).toBe(false);
      expect(disabled.body.data.every((store: any) => !store.capture_supported)).toBe(true);
    } finally {
      if (previous == null) delete process.env.AYWEBS_CAPTURE_ENABLED;
      else process.env.AYWEBS_CAPTURE_ENABLED = previous;
    }
  });

  test('rejects unregistered domains before any server-side fetch', async () => {
    const { app, scrapeProduct } = fixture();
    const response = await request(app).post('/api/v1/aywebs/capture').set(SESSION).send({
      store: 'amazon', url: 'https://amazon.com.evil.com/dp/B0ABCDEFGH',
    });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('DOMAIN_NOT_ALLOWED');
    expect(scrapeProduct).not.toHaveBeenCalled();
  });

  test('requires an exact Amazon product page and returns a normalized priced product', async () => {
    const { app, scrapeProduct } = fixture();
    const listing = await request(app).post('/api/v1/aywebs/capture').set(SESSION).send({
      store: 'amazon', url: 'https://www.amazon.com/s?k=nike',
    });
    expect(listing.status).toBe(422);
    expect(listing.body.code).toBe('PRODUCT_PAGE_REQUIRED');
    expect(scrapeProduct).not.toHaveBeenCalled();

    const captured = await request(app).post('/api/v1/aywebs/capture').set(SESSION).send({
      store: 'amazon', url: 'https://www.amazon.com/dp/B0ABCDEFGH',
    });
    expect(captured.status).toBe(201);
    expect(captured.body).toMatchObject({ success: true, status: 'READY' });
    expect(captured.body.product.totalPriceTND).toBeGreaterThan(0);
    expect(captured.body.normalized_product).toMatchObject({
      source: { store: 'amazon', product_id: 'B0ABCDEFGH' },
      product: { title: 'Nike Air Max shoes', brand: 'Nike' },
      pricing: { source_price: 39.99, currency: 'USD', pricing_version: 3 },
      variants: { colors: ['Black'], sizes: ['42'] },
      availability: { available: true, status: 'in_stock' },
    });
  });

  test('captures every registered store through its dedicated adapter', async () => {
    const { app, scrapeProduct } = fixture();
    const cases = [
      ['shein', 'https://www.shein.com/example-p-382460229.html'],
      ['temu', 'https://www.temu.com/goods.html?goods_id=601099999999999'],
      ['aliexpress', 'https://www.aliexpress.com/item/1005007777777777.html'],
    ] as const;
    for (const [store, url] of cases) {
      const response = await request(app).post('/api/v1/aywebs/capture').set(SESSION).send({ store, url });
      expect(response.status, `${store}: ${JSON.stringify(response.body)}`).toBe(201);
      expect(response.body).toMatchObject({ success: true, status: 'READY', product: { store } });
    }
    expect(scrapeProduct).toHaveBeenCalledTimes(3);
  });

  test('classifie les liens marchands réels, y compris les URL longues (§10)', async () => {
    const { app } = fixture();
    const cases = [
      ['https://www.shein.com/fr/Robe-fleurie-p-382460229-cat-2030.html', 'shein', 'PRODUCT', true],
      ['https://www.shein.com/example-p-382460229.html', 'shein', 'PRODUCT', true],
      ['https://www.amazon.fr/dp/B0CHX3QBCH', 'amazon', 'PRODUCT', true],
      ['https://www.temu.com/fr/product.html?goods_id=601099999999999', 'temu', 'PRODUCT', true],
      ['https://fr.shein.com/pdsearch/robe/', 'shein', 'SEARCH', false],
      ['https://shop.example.tn/p/9', null, 'UNKNOWN', false],
      // Jetons de suivi hostiles dans la requête : la fiche reste un produit (§10).
      ['https://www.amazon.fr/dp/B0CHX3QBCH?ref=sr_1_1&login=1&cart=abc&auth=xyz', 'amazon', 'PRODUCT', true],
      // Connexion marchande : chemin /ap/signin → LOGIN, action client requise (§27).
      ['https://www.amazon.com/ap/signin?ref=nav_signin', 'amazon', 'LOGIN', false],
    ] as const;
    for (const [url, storeId, pageType, isProduct] of cases) {
      const response = await request(app).post('/api/v1/aywebs/page/analyze').set(SESSION).send({ url });
      expect(response.status, `${url}: ${JSON.stringify(response.body)}`).toBe(200);
      expect(response.body.data, url).toMatchObject({
        store_id: storeId, page_type: pageType, is_product_page: isProduct, product_detected: isProduct,
      });
    }
  });

  test('les routes profondes AYWEBs sont des pages connues du serveur et du client (§25)', () => {
    // Serveur (repli SPA) et client (garde-fou 404) lisent LA MÊME liste :
    // shared/publicSeo.ts — un lien profond natif ne doit jamais finir en 404.
    for (const target of ['/aywebs', '/aywebs/product', '/aywebs/cart', '/aywebs/order/AYW-000456', '/aywebs/checkout', '/aywebs/request']) {
      expect(isKnownPagePath(target), target).toBe(true);
    }
    expect(isKnownPagePath('/aywebscart')).toBe(false);
    expect(isKnownPagePath('/page-totalement-inventee')).toBe(false);
  });

  test('registers AyWebs as the installed mobile share target', () => {
    const manifest = JSON.parse(readFileSync('client/public/manifest.webmanifest', 'utf8'));
    expect(manifest.share_target).toMatchObject({
      action: '/aywebs', method: 'GET',
      params: { text: 'text', url: 'url' },
    });
  });

  test('can stop one beta adapter at runtime without disabling the browser', async () => {
    const previous = process.env.AYWEBS_SHEIN_CAPTURE_ENABLED;
    process.env.AYWEBS_SHEIN_CAPTURE_ENABLED = 'false';
    try {
      const { app, scrapeProduct } = fixture();
      const stores = await request(app).get('/api/v1/aywebs/stores').set(SESSION);
      expect(stores.body.data.find((store: any) => store.id === 'shein')).toMatchObject({ enabled: true, capture_supported: false });
      const response = await request(app).post('/api/v1/aywebs/capture').set(SESSION).send({
        store: 'shein', url: 'https://www.shein.com/example-p-382460229.html',
      });
      expect(response.status).toBe(422);
      expect(response.body).toMatchObject({ status: 'UNSUPPORTED', code: 'STORE_CAPTURE_UNSUPPORTED' });
      expect(scrapeProduct).not.toHaveBeenCalled();
    } finally {
      if (previous == null) delete process.env.AYWEBS_SHEIN_CAPTURE_ENABLED;
      else process.env.AYWEBS_SHEIN_CAPTURE_ENABLED = previous;
    }
  });
});
