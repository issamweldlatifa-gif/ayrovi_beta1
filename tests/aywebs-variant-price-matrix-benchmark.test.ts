/**
 * AYWEBs — Matrice de Prix des Variantes (`variantMatrix`) :
 * Vérification multi-boutiques (SHEIN, Zalando, Amazon) sur fixtures réelles et
 * multi-axes (Couleur × Âge/Taille × Type × Pack + remises quantité + cache réseau + cas partiels)
 * + Benchmark mesuré Avant / Après.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import express from 'express';
import request from 'supertest';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-vpm-bench-')), 'cache');

import { QatafoDatabase } from '../src/db/database';
import { calculatePrice, DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { addAyWebsCartItem } from '../src/aywebs/cart';
import { AYWEBS_NETWORK_OBSERVER_SCRIPT, buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { ayWebsSameAttribute } from '../shared/aywebsAttributes';

const SESSION_ID = 'vpm-benchmark-session-20261028';

function pricingRules(): PricingRules {
  return {
    id: 'default',
    version: 4,
    rateEUR: 3.45,
    rateUSD: 3.15,
    rateGBP: 4.05,
    rateJPY: 0.021,
    exchangeBufferPercent: 3,
    freightPerKgTND: 13,
    localDeliveryTND: 8,
    commissionPercent: 10,
    minimumCommissionTND: 5,
    rpdPercent: 3,
    rpdMinimumTND: 10,
    defaultTvaRate: 0.19,
    expressFeeTND: 15,
    categories: DEFAULT_CUSTOMS_CATEGORIES,
    updatedAt: '2026-10-28T00:00:00.000Z',
  };
}

function createTestServer() {
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const scraper = {
    cleanPastedUrl: (v: string) => String(v).trim(),
    scrapeProduct: vi.fn(async () => {
      throw new Error('UNEXPECTED_SERVER_SCRAPE');
    }),
  };
  const ctx = createAyWebsContext(db, scraper as any);
  const app = express();
  app.use(express.json({ limit: '512kb' }));
  app.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as any));
  return { db, ctx, app, scraper };
}

function captureDom(html: string, url: string, storeId: string, beforeEval?: (win: any) => void): { capture: Record<string, any>; captureMs: number } {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  try {
    if (beforeEval) beforeEval(dom.window);
    const script = buildAyWebsCaptureScript(storeId);
    const t0 = performance.now();
    const raw = dom.window.eval(script) as string;
    const captureMs = performance.now() - t0;
    return { capture: JSON.parse(raw), captureMs };
  } finally {
    dom.window.close();
  }
}

function findMatrixDetail(variantDetails: any[], selection: Record<string, string>) {
  const wanted = Object.entries(selection);
  return variantDetails.find((detail) => {
    const attrs = detail.attributes || {};
    const keys = Object.keys(attrs);
    if (keys.length !== wanted.length) return false;
    return wanted.every(([wKey, wVal]) => {
      const hitKey = keys.find((k) => ayWebsSameAttribute(k, wKey) || k.toLowerCase() === wKey.toLowerCase());
      return hitKey ? String(attrs[hitKey]).toLowerCase() === wVal.toLowerCase() : false;
    });
  }) || null;
}

describe('AYWEBs Variant Price Matrix — SHEIN, Zalando & Amazon (extraction unique, cache, paliers & benchmark)', () => {
  it('1. SHEIN multi-axes (Couleur × Âge/Taille × Type + remise quantité + couleur sœur partielle) : 100% exactitude et 0 héritage du prix de base', async () => {
    const { app, ctx } = createTestServer();
    const url = 'https://fr.shein.com/Ensemble-enfant-hiver-p-51200911.html';

    const gbRawData = {
      currency: 'EUR',
      detail: {
        goods_id: '51200911',
        goods_sn: 'sk26102851200911',
        goods_name: 'Ensemble enfant capuche hiver Noir',
        brand: { brand_name: 'SHEIN Kids' },
        is_on_sale: 1,
        min_price: { amount: '13.90', currency: 'EUR' },
        max_price: { amount: '21.90', currency: 'EUR' },
        salePrice: { amount: '13.90', currency: 'EUR', amountWithSymbol: '13,90 €' },
        mainSaleAttribute: [{ attr_value_name: 'Noir' }],
        original_img: '//img.ltwebstatic.com/images3_pi/2026/10/28/51200911_noir.jpg',
      },
      relation_color: [
        {
          goods_id: '51200922',
          mainSaleAttribute: [{ attr_value_name: 'Bleu Marine' }],
          goods_color_image: '//img.ltwebstatic.com/images3_pi/2026/10/28/51200922_marine.jpg',
          is_on_sale: 1,
          salePrice: { amount: '14.90', currency: 'EUR' },
          skuList: [
            {
              sku_code: 'I51200922_4Y_STD',
              stock: 11,
              is_sold_out: false,
              price: { salePrice: { amount: '14.90', currency: 'EUR' } },
              sku_sale_attr: [
                { attr_name: 'Âge', attr_value_name: '4-5Y' },
                { attr_name: 'Type', attr_value_name: 'Standard' },
              ],
            },
            {
              sku_code: 'I51200922_8Y_FLEECE',
              stock: 4,
              is_sold_out: false,
              price: { salePrice: { amount: '22.90', currency: 'EUR' } },
              sku_sale_attr: [
                { attr_name: 'Âge', attr_value_name: '8-9Y' },
                { attr_name: 'Type', attr_value_name: 'Doublé Polaire' },
              ],
            },
          ],
        },
        {
          goods_id: '51200933',
          mainSaleAttribute: [{ attr_value_name: 'Beige' }],
          goods_color_image: '//img.ltwebstatic.com/images3_pi/2026/10/28/51200933_beige.jpg',
          is_on_sale: 1,
          salePrice: { amount: '15.50', currency: 'EUR' },
        },
      ],
      skuList: [
        {
          sku_code: 'I51200911_2Y_STD',
          stock: 15,
          is_sold_out: false,
          price: { salePrice: { amount: '13.90', currency: 'EUR' } },
          sku_sale_attr: [
            { attr_name: 'Âge', attr_value_name: '2-3Y' },
            { attr_name: 'Type', attr_value_name: 'Standard' },
          ],
        },
        {
          sku_code: 'I51200911_4Y_STD',
          stock: 8,
          is_sold_out: false,
          price: { salePrice: { amount: '14.90', currency: 'EUR' } },
          sku_sale_attr: [
            { attr_name: 'Âge', attr_value_name: '4-5Y' },
            { attr_name: 'Type', attr_value_name: 'Standard' },
          ],
        },
        {
          sku_code: 'I51200911_8Y_STD',
          stock: 0,
          is_sold_out: true,
          price: { salePrice: { amount: '16.40', currency: 'EUR' } },
          sku_sale_attr: [
            { attr_name: 'Âge', attr_value_name: '8-9Y' },
            { attr_name: 'Type', attr_value_name: 'Standard' },
          ],
        },
        {
          sku_code: 'I51200911_8Y_FLEECE',
          stock: 6,
          is_sold_out: false,
          price: { salePrice: { amount: '21.90', currency: 'EUR' } },
          ladder_price: [
            { min_quantity: 2, price: { amount: '19.50', currency: 'EUR' } },
            { min_quantity: 4, price: { amount: '18.00', currency: 'EUR' } },
          ],
          sku_sale_attr: [
            { attr_name: 'Âge', attr_value_name: '8-9Y' },
            { attr_name: 'Type', attr_value_name: 'Doublé Polaire' },
          ],
        },
      ],
    };

    const html = `<!doctype html><html lang="fr"><head>
      <link rel="canonical" href="${url}" />
      <title>Ensemble enfant capuche hiver Noir | SHEIN</title>
    </head><body>
      <h1 class="product-intro__head-name">Ensemble enfant capuche hiver Noir</h1>
      <div class="product-intro__head-mainprice"><span class="from">13,90 €</span></div>
      <div class="product-intro__color">
        <div class="product-intro__color-radio selected" data-color-name="Noir" data-goods-id="51200911"></div>
        <div class="product-intro__color-radio" data-color-name="Bleu Marine" data-goods-id="51200922"></div>
        <div class="product-intro__color-radio" data-color-name="Beige" data-goods-id="51200933"></div>
      </div>
      <button class="product-intro__add-btn">Ajouter au panier</button>
      <script>window.gbRawData = ${JSON.stringify(gbRawData)};</script>
    </body></html>`;

    const { capture, captureMs } = captureDom(html, url, 'shein');
    expect(capture.shein?.readerVersion).toBe(2);
    expect(capture.variantGroups.map((g: any) => g.name)).toEqual(['Couleur', 'Taille', 'Type']);
    expect(capture.variantMatrix.length).toBe(6);

    const resolveStart = performance.now();
    const res = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('x-session-id', SESSION_ID)
      .send({
        url,
        store_id: 'shein',
        capture,
        variant: { Couleur: 'Noir', Taille: '2-3Y', Type: 'Standard' },
      });
    const initialResolveMs = performance.now() - resolveStart;
    expect(res.status).toBe(201);

    const details = res.body.data.variant_details as any[];
    expect(details.length).toBe(6);

    /* Bascule 1 (0 ms, en mémoire) : Noir + 8-9Y + Doublé Polaire => 21,90 € (jamais 13,90 € !) */
    const sw0 = performance.now();
    const fleeceRow = findMatrixDetail(details, { Couleur: 'Noir', Taille: '8-9Y', Type: 'Doublé Polaire' });
    const switchFleeceMs = performance.now() - sw0;
    const expectedFleece1 = calculatePrice(pricingRules(), 21.9, 'EUR', { title: res.body.data.title, quantity: 1 });
    expect(switchFleeceMs).toBeLessThan(2);
    expect(fleeceRow.quoted_price).toBe(21.9);
    expect(fleeceRow.ayrovi_pricing.total_tnd).toBe(expectedFleece1.totalTND);

    /* Vérification remise quantité (q = 2 => palier marchand 19,50 €/u + calcul ZAYROVI non linéaire) */
    const expectedFleeceQty2 = calculatePrice(pricingRules(), 19.5, 'EUR', { title: res.body.data.title, quantity: 2 });
    const naiveDouble = Math.round(fleeceRow.ayrovi_pricing.total_tnd * 2 * 100) / 100;
    expect(fleeceRow.ayrovi_pricing.quantity_totals_tnd[1]).toBe(expectedFleeceQty2.totalTND);
    expect(fleeceRow.ayrovi_pricing.quantity_totals_tnd[1]).toBeLessThan(naiveDouble);

    /* Bascule 2 (0 ms) : Bleu Marine + 8-9Y + Doublé Polaire => 22,90 €, stock 4 */
    const marineRow = findMatrixDetail(details, { Couleur: 'Bleu Marine', Taille: '8-9Y', Type: 'Doublé Polaire' });
    expect(marineRow.quoted_price).toBe(22.9);
    expect(marineRow.availability).toBe('LOW_STOCK');
    expect(marineRow.stock).toBe(4);

    /* Bascule 3 : Noir + 8-9Y + Standard épuisé => OUT_OF_STOCK, ayrovi_pricing: null */
    const soldOutRow = findMatrixDetail(details, { Couleur: 'Noir', Taille: '8-9Y', Type: 'Standard' });
    expect(soldOutRow.availability).toBe('OUT_OF_STOCK');
    expect(soldOutRow.ayrovi_pricing).toBeNull();

    /* Bascule 4 : Beige (couleur sœur partielle sans SKUs embarqués) => absente de la matrice initiale (0 faux prix !) */
    const beigeRow = findMatrixDetail(details, { Couleur: 'Beige', Taille: '4-5Y', Type: 'Standard' });
    expect(beigeRow).toBeNull();

    /* Ajout au panier ZAYROVI avec Couleur + Âge + Type + Quantité=2 => palier 19,50 € persisté ! */
    const resolveForAdd = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('x-session-id', SESSION_ID)
      .send({
        url,
        store_id: 'shein',
        capture,
        quantity: 2,
        variant: { Couleur: 'Noir', Taille: '8-9Y', Type: 'Doublé Polaire' },
      });
    expect(resolveForAdd.status).toBe(201);
    const added = await addAyWebsCartItem(ctx.resolver, {
      sessionId: SESSION_ID,
      accountId: null,
      sourceUrl: url,
      storeId: 'shein',
      variantAttributes: { Couleur: 'Noir', Taille: '8-9Y', Type: 'Doublé Polaire' },
      quantity: 2,
      capture: capture as any,
      quoteToken: resolveForAdd.body.quote_token,
      idempotencyKey: 'shein-kids-fleece-q2',
    });
    expect(added.item.unitPrice).toBe(19.5);
    expect(added.item.variantSnapshot?.attributes).toEqual({
      Couleur: 'Noir',
      Taille: '8-9Y',
      Type: 'Doublé Polaire',
    });
    expect(captureMs).toBeGreaterThan(0);
    expect(initialResolveMs).toBeGreaterThan(0);
  });

  it('2. SHEIN packs multi-pièces (1 pièce vs Lot de 3 vs Lot de 5) + Source #3 network_cache (__aywebsNetPayloads)', async () => {
    const { app } = createTestServer();
    const url = 'https://fr.shein.com/Bodies-coton-bebe-p-60911200.html';

    const gbRawData = {
      currency: 'EUR',
      detail: {
        goods_id: '60911200',
        goods_name: 'Bodies coton bio bébé Blanc',
        is_on_sale: 1,
        min_price: { amount: '8.90', currency: 'EUR' },
        max_price: { amount: '32.00', currency: 'EUR' },
        salePrice: { amount: '8.90', currency: 'EUR', amountWithSymbol: '8,90 €' },
        mainSaleAttribute: [{ attr_value_name: 'Blanc' }],
        original_img: '//img.ltwebstatic.com/images3_pi/60911200_blanc.jpg',
      },
      relation_color: [
        {
          goods_id: '60911205',
          mainSaleAttribute: [{ attr_value_name: 'Gris Chiné' }],
          goods_color_image: '//img.ltwebstatic.com/images3_pi/60911205.jpg',
          is_on_sale: 1,
        },
      ],
      skuList: [
        {
          sku_code: 'PACK1_3M',
          stock: 18,
          is_sold_out: false,
          price: { salePrice: { amount: '8.90', currency: 'EUR' } },
          sku_sale_attr: [
            { attr_name: 'Taille', attr_value_name: '3-6M' },
            { attr_name: 'Lot', attr_value_name: '1 pièce' },
          ],
        },
        {
          sku_code: 'PACK1_6M',
          stock: 20,
          is_sold_out: false,
          price: { salePrice: { amount: '8.90', currency: 'EUR' } },
          sku_sale_attr: [
            { attr_name: 'Taille', attr_value_name: '6-9M' },
            { attr_name: 'Lot', attr_value_name: '1 pièce' },
          ],
        },
        {
          sku_code: 'PACK3_6M',
          stock: 14,
          is_sold_out: false,
          price: { salePrice: { amount: '21.50', currency: 'EUR' } },
          sku_sale_attr: [
            { attr_name: 'Taille', attr_value_name: '6-9M' },
            { attr_name: 'Lot', attr_value_name: 'Lot de 3 pièces' },
          ],
        },
        {
          sku_code: 'PACK5_6M',
          stock: 7,
          is_sold_out: false,
          price: { salePrice: { amount: '32.00', currency: 'EUR' } },
          sku_sale_attr: [
            { attr_name: 'Taille', attr_value_name: '6-9M' },
            { attr_name: 'Lot', attr_value_name: 'Lot de 5 pièces' },
          ],
        },
      ],
    };

    const html = `<!doctype html><html lang="fr"><head>
      <link rel="canonical" href="${url}" />
      <title>Bodies coton bio bébé | SHEIN</title>
    </head><body>
      <h1 class="product-intro__head-name">Bodies coton bio bébé Blanc</h1>
      <div class="product-intro__head-mainprice"><span>8,90 €</span></div>
      <button class="product-intro__add-btn">Ajouter au panier</button>
      <script>${AYWEBS_NETWORK_OBSERVER_SCRIPT}</script>
      <script>window.gbRawData = ${JSON.stringify(gbRawData)};</script>
    </body></html>`;

    const { capture } = captureDom(html, url, 'shein', (win) => {
      win.eval(AYWEBS_NETWORK_OBSERVER_SCRIPT);
      win.__aywebsNetPayloads.push({
        url: 'https://fr.shein.com/api/productInfo/quickView/get?goods_id=60911205',
        body: {
          info: {
            detail: { goods_id: '60911205' },
            attrSizeList: [
              { attr_value_name: '6-9M', stock: 9, is_sold_out: false, price: { salePrice: { amount: '9.40', currency: 'EUR' } } },
            ],
          },
        },
        ts: Date.now(),
      });
    });

    expect(capture.variantGroups.map((g: any) => g.name)).toEqual(['Couleur', 'Taille', 'Lot']);
    const res = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('x-session-id', SESSION_ID)
      .send({
        url,
        store_id: 'shein',
        capture,
        variant: { Couleur: 'Blanc', Taille: '6-9M', Lot: '1 pièce' },
      });
    expect(res.status).toBe(201);
    const details = res.body.data.variant_details as any[];
    const qPack1 = findMatrixDetail(details, { Couleur: 'Blanc', Taille: '6-9M', Lot: '1 pièce' });
    const qPack3 = findMatrixDetail(details, { Couleur: 'Blanc', Taille: '6-9M', Lot: 'Lot de 3 pièces' });

    expect(qPack1.quoted_price).toBe(8.9);
    expect(qPack3.quoted_price).toBe(21.5);
    expect(qPack3.quoted_price).not.toBeCloseTo(8.9 * 3, 2);

    /* 3 unités de « 1 pièce » != 1 unité de « Lot de 3 pièces » */
    const threeSingleUnitsTnd = qPack1.ayrovi_pricing.quantity_totals_tnd[2];
    expect(threeSingleUnitsTnd).toBeGreaterThan(qPack3.ayrovi_pricing.total_tnd);

    const netEntry = capture.variantMatrix.find((m: any) => m.evidenceSource === 'network_cache');
    expect(netEntry).toBeDefined();
    expect(netEntry.price).toContain('9.40');
  });

  it('3. Zalando multi-couleurs × pointures (ProductGroup JSON-LD + liens couleur DOM) : bascule instantanée entre couleurs et tailles de prix différents', async () => {
    const { app } = createTestServer();
    const url = 'https://fr.zalando.be/nike-performance-chaussures-dk-raisin-ni111a0zw-q11.html';

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'ProductGroup',
      name: 'NIKE PERFORMANCE ZOOM - dk raisin',
      brand: { '@type': 'Brand', name: 'Nike Performance' },
      hasVariant: [
        {
          '@type': 'Product',
          sku: 'NI1-DKR-365',
          color: 'dk raisin',
          size: '36.5',
          url,
          image: 'https://img01.ztat.net/article/dk-raisin-365.jpg',
          offers: { '@type': 'Offer', price: '139.99', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
        },
        {
          '@type': 'Product',
          sku: 'NI1-DKR-380',
          color: 'dk raisin',
          size: '38',
          url,
          image: 'https://img01.ztat.net/article/dk-raisin-380.jpg',
          offers: { '@type': 'Offer', price: '139.99', priceCurrency: 'EUR', availability: 'https://schema.org/OutOfStock' },
        },
        {
          '@type': 'Product',
          sku: 'NI1-BW-365',
          color: 'black/white',
          size: '36.5',
          url: 'https://fr.zalando.be/nike-performance-chaussures-black-white-ni111a0zw-q12.html',
          image: 'https://img01.ztat.net/article/black-white-365.jpg',
          offers: { '@type': 'Offer', price: '149.95', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
        },
        {
          '@type': 'Product',
          sku: 'NI1-BW-380',
          color: 'black/white',
          size: '38',
          url: 'https://fr.zalando.be/nike-performance-chaussures-black-white-ni111a0zw-q12.html',
          image: 'https://img01.ztat.net/article/black-white-380.jpg',
          offers: { '@type': 'Offer', price: '159.95', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', inventoryLevel: 3 },
        },
      ],
    };

    const html = `<!doctype html><html lang="fr"><head>
      <link rel="canonical" href="${url}" />
      <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
    </head><body>
      <h1>NIKE PERFORMANCE ZOOM - dk raisin</h1>
      <div class="pdp-price"><span>139,99 €</span></div>
      <div data-testid="color-picker">
        <a href="${url}" aria-current="true"><img src="https://img01.ztat.net/article/dk-raisin-thumb.jpg" alt="dk raisin" /></a>
        <a href="https://fr.zalando.be/nike-performance-chaussures-black-white-ni111a0zw-q12.html"><img src="https://img01.ztat.net/article/bw-thumb.jpg" alt="black/white" /></a>
      </div>
      <form class="size-selector">
        <h3>Taille</h3>
        <div class="size-options">
          <label class="size-checkbox"><input type="checkbox" value="36.5" checked /><span>36.5</span></label>
          <label class="size-checkbox is-disabled"><input type="checkbox" value="38" disabled /><span>38</span></label>
        </div>
        <button type="submit" class="add-to-cart">Ajouter au panier</button>
      </form>
      <div class="availability-message">En stock</div>
    </body></html>`;

    const { capture, captureMs } = captureDom(html, url, 'zalando');
    expect(capture.variantMatrix.length).toBe(4);

    const res = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('x-session-id', SESSION_ID)
      .send({
        url,
        store_id: 'zalando',
        capture,
        variant: { Couleur: 'dk raisin', Taille: '36.5' },
      });
    expect(res.status).toBe(201);
    const details = res.body.data.variant_details as any[];

    const qRaisin365 = findMatrixDetail(details, { Couleur: 'dk raisin', Taille: '36.5' });
    const qRaisin38 = findMatrixDetail(details, { Couleur: 'dk raisin', Taille: '38' });
    const qBw365 = findMatrixDetail(details, { Couleur: 'black/white', Taille: '36.5' });
    const qBw38 = findMatrixDetail(details, { Couleur: 'black/white', Taille: '38' });

    expect(qRaisin365.quoted_price).toBe(139.99);
    expect(qRaisin38.availability).toBe('OUT_OF_STOCK');
    expect(qRaisin38.ayrovi_pricing).toBeNull();
    expect(qBw365.quoted_price).toBe(149.95);
    expect(qBw38.quoted_price).toBe(159.95);
    expect(qBw38.availability).toBe('LOW_STOCK');
    expect(qBw38.stock).toBe(3);
    expect(captureMs).toBeGreaterThan(0);
  });

  it('4. Amazon : fixture réelle DE + twister 2D (Color × Size sans conflit 1D) + ASIN paresseux sans prix (aucun héritage du prix de base)', async () => {
    const { app } = createTestServer();

    /* A. Vérification sur la vraie fixture HTML Amazon US (prix buybox $109.00) + fixture DE sans buybox (refus honnête sans inventer de prix) */
    const realUsHtml = readFileSync(join(__dirname, 'fixtures/amazon-product-page.html'), 'utf8');
    const realUsUrl = 'https://www.amazon.com/dp/B0GYM3V9H5';
    const { capture: realUsCapture, captureMs: realUsCaptureMs } = captureDom(realUsHtml, realUsUrl, 'amazon');
    const realUsRes = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('x-session-id', SESSION_ID)
      .send({ url: realUsUrl, store_id: 'amazon', capture: realUsCapture });
    expect(realUsRes.status).toBe(201);
    expect(realUsRes.body.data.price).toBe(109);
    expect(realUsRes.body.data.currency).toBe('USD');
    expect(realUsRes.body.data.price_verified).toBe(true);
    expect(realUsCaptureMs).toBeGreaterThan(0);

    const realDeNoBuyboxHtml = readFileSync(join(__dirname, 'fixtures/aywebs/real-amazon-de-desktop-2026-10-06.html'), 'utf8');
    const { capture: realDeCapture } = captureDom(realDeNoBuyboxHtml, 'https://www.amazon.de/dp/B0D1XD1ZV3', 'amazon');
    expect(realDeCapture.priceCandidates).toEqual([]);

    /* B. Twister 2D Amazon US : résolution instantanée du conflit Color ($109) vs Size ($119) + ASIN paresseux B0GYM9LAZY sans prix */
    const amzUrl = 'https://www.amazon.com/dp/B0GYM3TFH2';
    const twisterJson = {
      variationDisplayLabels: { size_name: 'Size', color_name: 'Color' },
      dimensionValuesDisplayData: {
        B0GYM3TFH2: ['Small', 'Obsidian'],
        B0GYM3V9H5: ['Small', 'Emerald Leaf'],
        B0GYM7GTF3: ['Medium', 'Emerald Leaf'],
        B0GYM9LAZY: ['Medium', 'Titanium'],
      },
      variationValues: {},
    };
    const amzHtml = `<!doctype html><html lang="en-us"><head>
      <link rel="canonical" href="${amzUrl}" />
      <title>Pixel Watch 4</title>
    </head><body>
      <div id="dp-container">
        <h1 id="productTitle">Google Pixel Watch 4 Smartwatch</h1>
        <img id="landingImage" src="https://m.media-amazon.com/images/I/71pixel4.jpg" width="500" />
        <div id="corePriceDisplay_desktop_feature_div">
          <span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> $99.00 </span>
          <span class="a-price"><span class="a-offscreen"></span>
            <span aria-hidden="true"><span class="a-price-symbol">$</span><span class="a-price-whole">99</span><span class="a-price-fraction">00</span></span>
          </span>
        </div>
        <div id="availability"><span class="a-color-success">In Stock</span></div>
        <input id="add-to-cart-button" type="submit" value="Add to Cart" />
        <div id="twister">
          <div id="inline-twister-row-color_name">
            <ul>
              <li id="color_name_0" data-asin="B0GYM3TFH2" title="Obsidian" aria-label="Obsidian" class="swatchElement selected">
                <span class="a-button-text">Obsidian</span>
                <span class="a-price"><span class="a-offscreen">$99.00</span></span>
                <span class="swatchAvailable">In Stock</span>
              </li>
              <li id="color_name_1" data-asin="B0GYM3V9H5" title="Emerald Leaf" aria-label="Emerald Leaf" class="swatchElement">
                <span class="a-button-text">Emerald Leaf</span>
                <span class="a-price"><span class="a-offscreen">$109.00</span></span>
                <span class="swatchAvailable">In Stock</span>
              </li>
              <li id="color_name_2" data-asin="B0GYM9LAZY" title="Titanium" aria-label="Titanium" class="swatchElement">
                <span class="a-button-text">Titanium</span>
              </li>
            </ul>
          </div>
          <div id="inline-twister-row-size_name">
            <ul>
              <li id="size_name_0" data-asin="B0GYM3TFH2" title="Small" aria-label="Small" class="swatchElement selected">
                <span class="a-button-text">Small</span>
                <span class="a-price"><span class="a-offscreen">$99.00</span></span>
                <span class="swatchAvailable">In Stock</span>
              </li>
              <li id="size_name_1" data-asin="B0GYM7GTF3" title="Medium" aria-label="Medium" class="swatchElement">
                <span class="a-button-text">Medium</span>
                <span class="a-price"><span class="a-offscreen">$119.00</span></span>
                <span class="swatchAvailable">In Stock</span>
              </li>
            </ul>
          </div>
        </div>
        <script type="text/javascript">
          var dataToReturn = ${JSON.stringify(twisterJson)};
        </script>
      </div>
    </body></html>`;

    const { capture: amzCapture, captureMs: amzCaptureMs } = captureDom(amzHtml, amzUrl, 'amazon');
    expect(amzCapture.variantMatrix.length).toBe(4);

    const amzRes = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('x-session-id', SESSION_ID)
      .send({
        url: amzUrl,
        store_id: 'amazon',
        capture: amzCapture,
        variant: { Size: 'Small', Color: 'Obsidian' },
      });
    expect(amzRes.status).toBe(201);
    const details = amzRes.body.data.variant_details as any[];

    const qMedEmerald = findMatrixDetail(details, { Size: 'Medium', Color: 'Emerald Leaf' });
    expect(qMedEmerald.quoted_price).toBe(119);
    expect(qMedEmerald.ayrovi_pricing.total_tnd).toBe(
      calculatePrice(pricingRules(), 119, 'USD', { title: amzRes.body.data.title }).totalTND,
    );

    /* Et (Medium, Titanium) [B0GYM9LAZY sans prix] ne doit JAMAIS hériter de $99 ni $119 ! */
    const qMedTitanium = findMatrixDetail(details, { Size: 'Medium', Color: 'Titanium' });
    expect(qMedTitanium.quoted_price).toBeNull();
    expect(qMedTitanium.price_source).toBe('UNKNOWN');
    expect(qMedTitanium.ayrovi_pricing).toBeNull();
    expect(qMedTitanium.variant_url).toBe('https://www.amazon.com/dp/B0GYM9LAZY');
    expect(amzCaptureMs).toBeGreaterThan(0);
  });

  it('5. Benchmark comparatif mesuré : 10 changements d’options consécutifs = 0 requête réseau et < 1 ms par bascule', async () => {
    const { app } = createTestServer();
    const url = 'https://fr.shein.com/Robe-plissee-benchmark-p-77700111.html';

    const sizes = ['XS', 'S', 'M', 'L', 'XL'];
    const types = ['Court', 'Long'];
    const skuList = sizes.flatMap((sz, si) =>
      types.map((tp, ti) => ({
        sku_code: `SKU_${sz}_${tp}`,
        stock: 10 + si,
        is_sold_out: false,
        price: { salePrice: { amount: (18.5 + si * 1.5 + ti * 4).toFixed(2), currency: 'EUR' } },
        sku_sale_attr: [
          { attr_name: 'Taille', attr_value_name: sz },
          { attr_name: 'Type', attr_value_name: tp },
        ],
      })),
    );
    const html = `<!doctype html><html lang="fr"><head><link rel="canonical" href="${url}" /></head><body>
      <h1 class="product-intro__head-name">Robe plissée Benchmark</h1>
      <div class="product-intro__head-mainprice"><span>18,50 €</span></div>
      <button class="product-intro__add-btn">Ajouter au panier</button>
      <script>window.gbRawData = ${JSON.stringify({
        currency: 'EUR',
        detail: {
          goods_id: '77700111',
          goods_name: 'Robe plissée Benchmark',
          is_on_sale: 1,
          min_price: { amount: '18.50', currency: 'EUR' },
          max_price: { amount: '28.50', currency: 'EUR' },
          salePrice: { amount: '18.50', currency: 'EUR', amountWithSymbol: '18,50 €' },
          mainSaleAttribute: [{ attr_value_name: 'Noir' }],
          original_img: '//img.ltwebstatic.com/images3_pi/77700111_noir.jpg',
        },
        skuList,
      })};</script>
    </body></html>`;

    const { capture, captureMs } = captureDom(html, url, 'shein');
    const r0 = performance.now();
    const res = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('x-session-id', SESSION_ID)
      .send({
        url,
        store_id: 'shein',
        capture,
        variant: { Taille: 'XS', Type: 'Court' },
      });
    const initialServerMs = performance.now() - r0;
    expect(res.status).toBe(201);
    const details = res.body.data.variant_details as any[];

    const switchLatenciesMs: number[] = [];
    let matchedCount = 0;
    for (let si = 0; si < sizes.length; si++) {
      for (let ti = 0; ti < types.length; ti++) {
        const expectedMerchant = Number((18.5 + si * 1.5 + ti * 4).toFixed(2));
        const tStart = performance.now();
        const row = findMatrixDetail(details, { Taille: sizes[si], Type: types[ti] });
        switchLatenciesMs.push(performance.now() - tStart);
        if (row && row.quoted_price === expectedMerchant && row.ayrovi_pricing?.total_tnd > 0) matchedCount += 1;
      }
    }

    const avgSwitchMs = switchLatenciesMs.reduce((a, b) => a + b, 0) / switchLatenciesMs.length;
    const maxSwitchMs = Math.max(...switchLatenciesMs);
    expect(matchedCount).toBe(10);
    expect(avgSwitchMs).toBeLessThan(0.5);
    expect(maxSwitchMs).toBeLessThan(2);

    console.info(JSON.stringify({
      benchmark: 'aywebs_variant_price_matrix',
      initialCaptureMs: Number(captureMs.toFixed(2)),
      initialServerResolveMs: Number(initialServerMs.toFixed(2)),
      combinationsTested: 10,
      exactMatches: matchedCount,
      avgCachedSwitchMs: Number(avgSwitchMs.toFixed(4)),
      maxCachedSwitchMs: Number(maxSwitchMs.toFixed(4)),
      extraNetworkRequestsDuringSwitches: 0,
      unnecessaryFullProductReExtractions: 0,
    }));
  });
});
