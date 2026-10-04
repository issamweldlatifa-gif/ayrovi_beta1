/**
 * AYWEBs — panier UNIFIÉ (04/10/2026) : une seule lecture des compteurs.
 *
 * Ce que le test verrouille, sur le vrai HTTP du routeur AYWEBs :
 *   1. l'ajout (POST /cart/items) synchronise immédiatement la ligne vers le
 *      panier AYROVI au prix du moteur tarifaire — `ayrovi.linked=true` dans
 *      la réponse, et la ligne AYROVI existe avec priceTND > 0 ;
 *   2. GET /cart annote chaque ligne de `linked_to_ayrovi` (items ET groupes)
 *      et les totaux de `unlinked_units` ;
 *   3. une ligne ajoutée SANS pont (écriture domaine directe) reste
 *      linked=false et compte dans unlinked_units — puis le pont HTTP la lie
 *      (linked=true, unlinked_units=0) sans doubler la ligne AYROVI ;
 *   4. badge unifié = unités AYROVI + unlinked_units : jamais de double compte.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-unified-')), 'cache');

import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { createAyWebsContext } from '../src/aywebs/context';
import { addAyWebsCartItem } from '../src/aywebs/cart';

const SESSION_ID = 'aywebs-unified-session-000001';
const AMAZON_URL = 'https://www.amazon.com/dp/B0UNIFIEDA';
const SHEIN_URL = 'https://www.shein.com/example-p-382460999.html';

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

function harness() {
  const scrapeProduct = vi.fn(async (url: string) => {
    const isAmazon = url.includes('amazon.');
    return {
      id: isAmazon ? 'scraped_amazon' : 'scraped_shein',
      store: isAmazon ? 'amazon' : 'shein',
      storeName: isAmazon ? 'Amazon' : 'SHEIN',
      url,
      externalId: isAmazon ? 'B0UNIFIEDA' : '9000001',
      title: isAmazon ? 'Tablette unification' : 'Robe unification',
      description: 'Produit de test',
      images: ['https://images.example.test/product.jpg'],
      mainImage: 'https://images.example.test/product.jpg',
      sourcePrice: isAmazon ? 107.98 : 18.5,
      sourceCurrency: 'USD',
      convertedPriceTND: 0, estimatedShippingTND: 0, serviceFeeTND: 0, totalPriceTND: 0,
      variants: { colors: [], sizes: [], details: [] },
      availability: 'in_stock' as any,
      condition: undefined,
      brand: isAmazon ? 'Test' : 'SHEIN',
      priceVerified: true, verificationProvider: 'direct', verificationMethod: 'json_ld',
      verificationFailureCode: null, scrapedAt: new Date().toISOString(),
    };
  });
  const scraper = { cleanPastedUrl: (value: string) => String(value).trim(), scrapeProduct };
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const ctx = createAyWebsContext(db, scraper as any);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).requestId = 'unified-request'; next(); });
  app.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as any));
  return { db, ctx, app };
}

const HEADERS = { 'x-session-id': SESSION_ID };

describe('panier unifié AYWEBs ↔ AYROVI (linked_to_ayrovi / unlinked_units)', () => {
  test("liaison à l'ajout, annotation au pont, compteur sans doublon", async () => {
    const { db, ctx, app } = harness();

    // 1. ajout HTTP : la ligne est aussitôt synchronisée vers le panier AYROVI.
    const added = await request(app)
      .post('/api/v1/aywebs/cart/items')
      .set(HEADERS)
      .send({ source_url: AMAZON_URL, quantity: 1 });
    expect(added.status).toBe(201);
    expect(added.body.data.ayrovi.linked).toBe(true);

    const ayroviLines = () => db.getItems(SESSION_ID, null);
    expect(ayroviLines()).toHaveLength(1);
    expect(Number(ayroviLines()[0].priceTND)).toBeGreaterThan(0);

    const afterAdd = await request(app).get('/api/v1/aywebs/cart').set(HEADERS);
    expect(afterAdd.status).toBe(200);
    expect(afterAdd.body.data.items[0].linked_to_ayrovi).toBe(true);
    expect(afterAdd.body.data.totals.unlinked_units).toBe(0);

    // 2. ligne ajoutée SANS pont (écriture domaine) : non liée, comptée une fois.
    await addAyWebsCartItem(ctx.resolver, {
      sessionId: SESSION_ID, accountId: null, sourceUrl: SHEIN_URL, quantity: 2,
    });

    const mixed = await request(app).get('/api/v1/aywebs/cart').set(HEADERS);
    expect(mixed.body.data.totals.units).toBe(3);
    expect(mixed.body.data.totals.unlinked_units).toBe(2);
    expect(mixed.body.data.items.map((item: any) => item.linked_to_ayrovi).sort()).toEqual([false, true]);
    // Les groupes portent la même annotation que les lignes.
    const groupFlags = mixed.body.data.groups.flatMap((group: any) => group.items.map((item: any) => item.linked_to_ayrovi)).sort();
    expect(groupFlags).toEqual([false, true]);

    // Badge unifié : unités AYROVI (1) + non liées (2) = 3, jamais plus.
    const ayroviUnits = ayroviLines().reduce((sum, line) => sum + Number(line.quantity), 0);
    expect(ayroviUnits + mixed.body.data.totals.unlinked_units).toBe(3);

    // 3. le pont HTTP lie la ligne restante sans doubler la ligne AYROVI.
    const bridged = await request(app)
      .post('/api/v1/aywebs/cart/bridge-to-ayrovi')
      .set(HEADERS)
      .send({});
    expect(bridged.status).toBe(200);

    const afterBridge = await request(app).get('/api/v1/aywebs/cart').set(HEADERS);
    expect(afterBridge.body.data.items.every((item: any) => item.linked_to_ayrovi === true)).toBe(true);
    expect(afterBridge.body.data.totals.unlinked_units).toBe(0);
    expect(ayroviLines()).toHaveLength(2);
    expect(ayroviLines().reduce((sum, line) => sum + Number(line.quantity), 0)).toBe(3);
  });
});
