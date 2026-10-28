/**
 * AYWEBs — AliExpress v2 End-to-End : Capture Comet/runParams, Matrice SKU multi-axes,
 * Sélection sur la page & dans la feuille, Conversion TND & Panier (28/10/2026).
 *
 * Vérifie de bout en bout :
 *   1. Statut opérationnel (`operational: true`), lecteur dédié v2 (`named_containers`),
 *      reconnaissance des domaines (`aliexpress.com`, `fr.aliexpress.com`, `m.aliexpress.com`,
 *      `www.aliexpress.us`, `/item/<id>.html`, `/i/<id>.html`, `/ssr/...`, `productId=`) et `AE-<id>` ;
 *   2. Sélection Couleur × Prise DIRECTEMENT sur `fr.aliexpress.com` (spans décimaux Comet éclatés
 *      `24 , 90 € / pièce`, canonical cross-host `www.aliexpress.com` neutralisé, carrousel
 *      « More to love » à `1,99 €` ignoré, `<meta>` statique périmé purgé) ⇒ conversion TND exacte + panier ;
 *   3. Sélection Couleur × Prise DANS LA FEUILLE AYWEBs sur une matrice cartésienne complète
 *      (attribut fixe à 1 valeur `Ships From: China` filtré, `variant_details` chiffré en TND,
 *      combinaison `Red + EU Plug` à `$23.99` en stock bas `LOW_STOCK:3`, combinaison `Red + US Plug`
 *      épuisée bloquée même si `Red` et `US Plug` existent séparément en stock) ;
 *   4. Garde anti-état SPA périmé (`PRODUCT_IDENTITY_MISMATCH` / `ae:state_itemid_mismatch`) et
 *      blocage honnête des fiches non livrables (`Can't ship to your address` -> `OUT_OF_STOCK`).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-ae-v2-')), 'cache');

import { detectAyWebsStore } from '../shared/aywebsStores';
import { QatafoDatabase } from '../src/db/database';
import { calculatePrice, DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { ayWebsCaptureReader } from '../src/aywebs/captureReaders/registry';
import { AliExpressAdapter, aliexpressItemId, aliexpressSkuUrl } from '../src/aywebs/adapters/aliexpress';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { clearAyWebsResolveCache, clearAyWebsResolveFailureCache } from '../src/aywebs/resolveCache';
import { resetAyWebsReadGate } from '../src/aywebs/readGate';
import { resetProbeState } from '../src/scraper/hostCircuit';

const SESSION_ID = 'aliexpress-v2-session-0001';

function pricingRules(): PricingRules {
  return {
    id: 'default',
    version: 3,
    rateEUR: 3.45,
    rateUSD: 3.15,
    rateGBP: 4.05,
    rateJPY: 0.021,
    exchangeBufferPercent: 3,
    freightPerKgTND: 13,
    localDeliveryTND: 8,
    commissionPercent: 10,
    minimumCommissionTND: 0,
    rpdPercent: 3,
    rpdMinimumTND: 10,
    defaultTvaRate: 0.19,
    expressFeeTND: 15,
    categories: DEFAULT_CUSTOMS_CATEGORIES,
    updatedAt: '2026-10-28T00:00:00.000Z',
  };
}

function createHarness() {
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const scraper = {
    cleanPastedUrl: (value: string) => String(value).trim(),
    scrapeProduct: vi.fn(async () => {
      throw new Error('NO_SERVER_SCRAPE_EXPECTED_WHEN_CAPTURE_VALID');
    }),
  };
  const ctx = createAyWebsContext(db, scraper as any);
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as any));
  return { db, ctx, app, scraper };
}

function runAliExpressCapture(html: string, url: string): Record<string, any> {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  try {
    const script = buildAyWebsCaptureScript('aliexpress');
    const raw = dom.window.eval(script) as string;
    return JSON.parse(raw);
  } finally {
    dom.window.close();
  }
}

function buildAliExpressCometPage(opts: {
  itemId?: string;
  stateItemId?: string;
  currency?: string;
  selectedColor?: string | null;
  selectedPlug?: string | null;
  domSplitPriceHtml?: string;
  addButtonLabel?: string;
  quantityTip?: string;
  canonicalHref?: string;
  includeSingleShipFrom?: boolean;
}): string {
  const itemId = opts.itemId ?? '1005008811223344';
  const stateItemId = opts.stateItemId ?? itemId;
  const currency = opts.currency ?? 'USD';
  const isEur = currency === 'EUR';
  const colorTitle = isEur ? 'Couleur' : 'Color';
  const plugTitle = isEur ? 'Prise' : 'Plug Type';
  const blackLabel = isEur ? 'Noir' : 'Black';
  const redLabel = isEur ? 'Rouge' : 'Red';

  const properties: any[] = [
    {
      skuPropertyId: 14,
      skuPropertyName: colorTitle,
      skuPropertyValues: [
        {
          propertyValueIdLong: 193,
          propertyValueDisplayName: blackLabel,
          skuPropertyImagePath: '//ae01.alicdn.com/kf/S111111black.jpg_80x80q90.jpg_.webp',
        },
        {
          propertyValueIdLong: 175,
          propertyValueDisplayName: redLabel,
          skuPropertyImagePath: '//ae01.alicdn.com/kf/S222222red.jpg_80x80q90.jpg_.webp',
        },
      ],
    },
    {
      skuPropertyId: 200007763,
      skuPropertyName: plugTitle,
      skuPropertyValues: [
        { propertyValueIdLong: 201336100, propertyValueDisplayName: 'EU Plug' },
        { propertyValueIdLong: 201336106, propertyValueDisplayName: 'US Plug' },
      ],
    },
  ];
  if (opts.includeSingleShipFrom) {
    properties.push({
      skuPropertyId: 200007764,
      skuPropertyName: 'Ships From',
      skuPropertyValues: [
        { propertyValueIdLong: 201336199, propertyValueDisplayName: 'China' },
      ],
    });
  }

  const shipSuffix = opts.includeSingleShipFrom ? ';200007764:201336199#China' : '';
  const runParamsData = {
    productInfoComponent: {
      id: stateItemId,
      subject: isEur ? 'Chargeur GaN 65W Rapide USB-C' : 'Baseus 65W GaN Fast Charger USB-C',
    },
    productPropComponent: {
      props: [
        { attrName: 'Brand Name', attrValue: 'BASEUS' },
      ],
    },
    imageComponent: {
      imagePathList: [
        '//ae01.alicdn.com/kf/Smain01charger.jpg',
        '//ae01.alicdn.com/kf/Smain02charger.jpg',
      ],
    },
    inventoryComponent: {
      totalAvailQuantity: opts.quantityTip && /can't ship|sold out/i.test(opts.quantityTip) ? 0 : 28,
    },
    priceComponent: {
      currencyCode: currency,
      discountPrice: {
        minActivityAmount: { value: isEur ? 18.9 : 18.5, currency },
        maxActivityAmount: { value: isEur ? 24.9 : 23.99, currency },
      },
    },
    skuComponent: {
      productSKUPropertyList: properties,
      skuPriceList: [
        {
          skuIdStr: '12000039001',
          skuAttr: `14:193#${blackLabel};200007763:201336100#EU Plug${shipSuffix}`,
          skuVal: {
            availQuantity: 15,
            actSkuMultiCurrencyCalPrice: isEur ? '24.90' : '19.99',
            skuMultiCurrencyCalPrice: isEur ? '39.90' : '32.99',
          },
        },
        {
          skuIdStr: '12000039002',
          skuAttr: `14:193#${blackLabel};200007763:201336106#US Plug${shipSuffix}`,
          skuVal: {
            availQuantity: 10,
            actSkuMultiCurrencyCalPrice: isEur ? '18.90' : '18.50',
            skuMultiCurrencyCalPrice: isEur ? '29.90' : '29.99',
          },
        },
        {
          skuIdStr: '12000039003',
          skuAttr: `14:175#${redLabel};200007763:201336100#EU Plug${shipSuffix}`,
          skuVal: {
            availQuantity: 3,
            actSkuMultiCurrencyCalPrice: isEur ? '26.50' : '23.99',
            skuMultiCurrencyCalPrice: isEur ? '41.90' : '36.99',
          },
        },
        {
          skuIdStr: '12000039004',
          skuAttr: `14:175#${redLabel};200007763:201336106#US Plug${shipSuffix}`,
          skuVal: {
            availQuantity: 0,
            actSkuMultiCurrencyCalPrice: isEur ? '22.90' : '21.99',
            skuMultiCurrencyCalPrice: isEur ? '35.90' : '34.99',
          },
        },
      ],
    },
  };

  const defaultDomPrice = isEur
    ? '<span>24</span> <span>,</span> <span>90</span> <span>€</span> <span>/ pièce</span>'
    : '<span>US $</span> <span>19</span> <span>.</span> <span>99</span> <span>/ piece</span>';

  return `<!doctype html>
<html lang="${isEur ? 'fr' : 'en'}">
<head>
  <title>${runParamsData.productInfoComponent.subject} - AliExpress</title>
  ${opts.canonicalHref ? `<link rel="canonical" href="${opts.canonicalHref}" />` : ''}
  <meta property="product:price:amount" content="${isEur ? '18.90' : '18.50'}" />
  <meta property="product:price:currency" content="${currency}" />
  <script>window.runParams = { data: ${JSON.stringify(runParamsData)} };</script>
</head>
<body>
  <main class="pdp-body">
    <h1 data-pl="product-title">${runParamsData.productInfoComponent.subject}</h1>
    <div data-pl="product-price">
      <div class="price--currentPriceText--V8_y_b5">${opts.domSplitPriceHtml ?? defaultDomPrice}</div>
      <del class="price--originalText--gxVO5_d">${isEur ? '39,90 €' : 'US $32.99'}</del>
      <span class="price--discount--Y9uG2">-38%</span>
    </div>

    <div data-pl="product-sku">
      <div class="sku-item--property--HuasaIz">
        <div class="sku-item--title--Z0HLO87">${colorTitle}: ${opts.selectedColor || ''}</div>
        <div class="sku-item--skus--StEhULs">
          <div data-sku-col="14-193" title="${blackLabel}" class="sku-item--image--jMUnnGA ${opts.selectedColor === blackLabel ? 'sku-item--selected--ITGY_EO' : ''}">
            <img src="https://ae01.alicdn.com/kf/S111111black.jpg_80x80q90.jpg_.webp" alt="${blackLabel}" />
          </div>
          <div data-sku-col="14-175" title="${redLabel}" class="sku-item--image--jMUnnGA ${opts.selectedColor === redLabel ? 'sku-item--selected--ITGY_EO' : ''}">
            <img src="https://ae01.alicdn.com/kf/S222222red.jpg_80x80q90.jpg_.webp" alt="${redLabel}" />
          </div>
        </div>
      </div>

      <div class="sku-item--property--HuasaIz">
        <div class="sku-item--title--Z0HLO87">${plugTitle}: ${opts.selectedPlug || ''}</div>
        <div class="sku-item--skus--StEhULs">
          <div data-sku-col="200007763-201336100" title="EU Plug" class="sku-item--text--hRIJ181 ${opts.selectedPlug === 'EU Plug' ? 'sku-item--selected--ITGY_EO' : ''}">
            <span>EU Plug</span>
          </div>
          <div data-sku-col="200007763-201336106" title="US Plug" class="sku-item--text--hRIJ181 ${opts.selectedPlug === 'US Plug' ? 'sku-item--selected--ITGY_EO' : ''}">
            <span>US Plug</span>
          </div>
        </div>
      </div>
    </div>

    ${opts.quantityTip ? `<div data-pl="product-quantity">${opts.quantityTip}</div>` : '<div data-pl="product-quantity">15 pieces available</div>'}
    <div data-pl="product-action">
      ${opts.addButtonLabel === '' ? '' : `<button type="button" class="comet-v2-btn">${opts.addButtonLabel ?? (isEur ? 'Ajouter au panier' : 'Add to Cart')}</button>`}
    </div>

    <section class="more-to-love recommend-container">
      <div class="price--currentPriceText--V8_y_b5">${isEur ? '1,99 €' : 'US $1.99'}</div>
      <button type="button">Add to Cart</button>
    </section>
  </main>
</body>
</html>`;
}

describe('AYWEBs — AliExpress v2 : activation, capture avancée, matrice SKU et conversion TND', () => {
  beforeEach(() => {
    process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE = '0';
    process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE = '0';
    process.env.AYWEBS_QUOTE_REVERIFY_TND = '0';
    clearAyWebsResolveCache();
    clearAyWebsResolveFailureCache();
    resetAyWebsReadGate();
    resetProbeState();
  });

  afterEach(() => {
    delete process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE;
    delete process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE;
    delete process.env.AYWEBS_QUOTE_REVERIFY_TND;
    vi.restoreAllMocks();
  });

  it('Statut opérationnel, lecteur v2 dédié et reconnaissance complète des domaines/URLs AliExpress', async () => {
    const { app } = createHarness();

    const reader = ayWebsCaptureReader('aliexpress');
    expect(reader).toMatchObject({ storeId: 'aliexpress', version: 2, priceMode: 'named_containers' });

    const storesRes = await request(app).get('/api/v1/aywebs/stores').expect(200);
    const aeStore = storesRes.body.data.find((s: any) => s.id === 'aliexpress');
    expect(aeStore).toBeDefined();
    expect(aeStore.operational).toBe(true);
    expect(aeStore.operational_reason).toBeNull();
    expect(aeStore.domains).toEqual(expect.arrayContaining(['aliexpress.com', 'aliexpress.us', 'aliexpress.ru']));

    const scriptRes = await request(app)
      .get('/api/v1/aywebs/capture/script.js?store_id=aliexpress')
      .expect(200);
    expect(scriptRes.headers['x-aywebs-capture-reader']).toBe('aliexpress');
    expect(scriptRes.headers['x-aywebs-capture-reader-version']).toBe('2');

    const adapter = new AliExpressAdapter({} as any);
    const productUrls = [
      'https://www.aliexpress.com/item/1005008811223344.html',
      'https://fr.aliexpress.com/item/1005008811223344.html?spm=a2g0o.cart.0.0&login=1',
      'https://m.aliexpress.com/item/1005008811223344.html',
      'https://www.aliexpress.us/item/3256806900000000.html',
      'https://www.aliexpress.com/i/1005008811223344.html',
      'https://www.aliexpress.com/ssr/300000512/item/1005008811223344.html',
      'https://www.aliexpress.com/store/product/Baseus-GaN/1101234_1005008811223344.html',
      'https://www.aliexpress.com/p/tesla-landing/index.html?productId=1005008811223344',
    ];
    for (const rawUrl of productUrls) {
      expect(detectAyWebsStore(rawUrl)?.id).toBe('aliexpress');
      const cls = adapter.classifyPage(rawUrl);
      expect(cls.isProductPage).toBe(true);
      expect(cls.pageType).toBe('PRODUCT');
      expect(aliexpressItemId(new URL(rawUrl))).toMatch(/^\d{6,20}$/);
    }
    expect(adapter.sourceProductId('https://fr.aliexpress.com/item/1005008811223344.html')).toBe('AE-1005008811223344');
    expect(adapter.canonicalUrl('https://www.aliexpress.us/item/3256806900000000.html?spm=123')).toBe(
      'https://www.aliexpress.us/item/3256806900000000.html',
    );
    expect(aliexpressSkuUrl('https://fr.aliexpress.com/item/1005008811223344.html?spm=abc', '12000039003')).toBe(
      'https://fr.aliexpress.com/item/1005008811223344.html?sku_id=12000039003',
    );
    expect(adapter.classifyPage('https://www.aliexpress.com/wholesale?SearchText=charger').isProductPage).toBe(false);
  });

  it('Cas 1 (choix SUR LA PAGE fr.aliexpress.com) : spans Comet éclatés 24,90 €, canonical cross-host neutralisé, conversion TND exacte et panier', async () => {
    const { app, scraper } = createHarness();
    const url = 'https://fr.aliexpress.com/item/1005008811223344.html?spm=a2g0o.detail.0.0';
    const html = buildAliExpressCometPage({
      itemId: '1005008811223344',
      currency: 'EUR',
      selectedColor: 'Noir',
      selectedPlug: 'EU Plug',
      canonicalHref: 'https://www.aliexpress.com/item/1005008811223344.html',
    });

    const captured = runAliExpressCapture(html, url);
    expect(captured.canonicalUrl).toBeNull();
    expect(captured.aliexpress).toMatchObject({
      readerVersion: 2,
      pageItemId: '1005008811223344',
      selectedSkuId: '12000039001',
    });
    expect(captured.brand).toBe('BASEUS');
    expect(captured.images[0]).toBe('https://ae01.alicdn.com/kf/Smain01charger.jpg');

    const validation = validateAyWebsCapturedPage(captured, url);
    expect(validation.ok).toBe(true);
    expect(validation.corroborated).toBe(true);
    expect(validation.price).toBe(24.9);
    expect(validation.currency).toBe('EUR');
    expect(validation.currencyVerified).toBe(true);
    expect(validation.scraped?.externalId).toBe('AE-1005008811223344');
    expect(validation.skuCombinations).toHaveLength(4);

    const resolveRes = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('X-Session-Id', SESSION_ID)
      .send({
        url,
        store_id: 'aliexpress',
        capture: captured,
      })
      .expect(201);

    expect(scraper.scrapeProduct).not.toHaveBeenCalled();
    const expectedQuote = calculatePrice(pricingRules(), 24.9, 'EUR', {
      title: 'Chargeur GaN 65W Rapide USB-C',
      quantity: 1,
    });
    expect(resolveRes.body.status).toBe('READY');
    expect(resolveRes.body.data.price).toBe(24.9);
    expect(resolveRes.body.data.currency).toBe('EUR');
    expect(resolveRes.body.data.source_product_id).toBe('AE-1005008811223344');
    expect(resolveRes.body.data.selected_variant.attributes).toEqual({ Couleur: 'Noir', Prise: 'EU Plug' });
    expect(resolveRes.body.data.ayrovi_pricing.total_tnd).toBe(expectedQuote.totalTND);
    expect(resolveRes.body.data.variant_details).toHaveLength(4);

    const cartRes = await request(app)
      .post('/api/v1/aywebs/cart/items')
      .set('X-Session-Id', SESSION_ID)
      .send({
        product_id: resolveRes.body.data.product_id,
        quote_token: resolveRes.body.quote_token,
        variant: { Couleur: 'Noir', Prise: 'EU Plug' },
        quantity: 2,
      })
      .expect(201);

    const addedItem = cartRes.body.data.item || cartRes.body.cart.items[0];
    expect(addedItem.store_id).toBe('aliexpress');
    expect(addedItem.variant_snapshot.attributes).toEqual({ Couleur: 'Noir', Prise: 'EU Plug' });
    expect(addedItem.pricing_tnd).toBe(expectedQuote.totalTND);
    expect(addedItem.quantity).toBe(2);
    expect(addedItem.line_total_tnd).toBeGreaterThan(expectedQuote.totalTND);
  });

  it('Cas 2 (choix DANS LA FEUILLE AYWEBs) : matrice Color × Plug Type + Ships From unique filtré, devis TND par combinaison et blocage cartésien Red + US Plug épuisé', async () => {
    const { app } = createHarness();
    const url = 'https://www.aliexpress.com/item/1005008811223344.html';
    const html = buildAliExpressCometPage({
      itemId: '1005008811223344',
      currency: 'USD',
      selectedColor: null,
      selectedPlug: null,
      domSplitPriceHtml: '<span>US $</span><span>18</span><span>.</span><span>50</span>',
      includeSingleShipFrom: true,
    });

    const captured = runAliExpressCapture(html, url);
    /* Ships From n'a qu'UNE valeur ("China") : jamais imposé comme groupe de choix */
    expect(captured.variantGroups.map((g: any) => g.name)).toEqual(['Color', 'Plug Type']);
    expect(captured.aliexpress.skus).toHaveLength(4);

    /* 1. Ouverture initiale de la fiche : variant_details porte déjà les 4 combinaisons chiffrées en TND */
    const initialRes = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('X-Session-Id', SESSION_ID)
      .send({
        url,
        store_id: 'aliexpress',
        capture: captured,
      })
      .expect(201);

    const redEuDetail = initialRes.body.data.variant_details.find(
      (d: any) => d.attributes.Color === 'Red' && d.attributes['Plug Type'] === 'EU Plug',
    );
    const redUsDetail = initialRes.body.data.variant_details.find(
      (d: any) => d.attributes.Color === 'Red' && d.attributes['Plug Type'] === 'US Plug',
    );
    const expectedRedEuQuote = calculatePrice(pricingRules(), 23.99, 'USD', {
      title: 'Baseus 65W GaN Fast Charger USB-C',
      quantity: 1,
    });
    expect(redEuDetail).toMatchObject({
      source_variant_id: 'ae:12000039003',
      quoted_price: 23.99,
      quoted_currency: 'USD',
      availability: 'LOW_STOCK',
      ayrovi_pricing: { total_tnd: expectedRedEuQuote.totalTND },
    });
    expect(redUsDetail).toMatchObject({
      source_variant_id: 'ae:12000039004',
      quoted_price: null,
      availability: 'OUT_OF_STOCK',
      ayrovi_pricing: null,
    });

    /* 2. Sélection dans la feuille de Red + EU Plug ($23.99, stock bas = 3) -> devis signé + photo Red + ajout panier */
    const redEuRes = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('X-Session-Id', SESSION_ID)
      .send({
        url,
        store_id: 'aliexpress',
        capture: captured,
        variant: { Color: 'Red', 'Plug Type': 'EU Plug' },
      })
      .expect(201);

    expect(redEuRes.body.data.price).toBe(23.99);
    expect(redEuRes.body.data.currency).toBe('USD');
    expect(redEuRes.body.data.availability.state).toBe('LOW_STOCK');
    expect(redEuRes.body.data.availability.quantity_hint).toBe(3);
    expect(redEuRes.body.data.images[0]).toBe('https://ae01.alicdn.com/kf/S222222red.jpg');
    expect(redEuRes.body.data.ayrovi_pricing.total_tnd).toBe(expectedRedEuQuote.totalTND);

    const cartAddRes = await request(app)
      .post('/api/v1/aywebs/cart/items')
      .set('X-Session-Id', SESSION_ID)
      .send({
        product_id: redEuRes.body.data.product_id,
        quote_token: redEuRes.body.quote_token,
        variant: { Color: 'Red', 'Plug Type': 'EU Plug' },
        quantity: 1,
      })
      .expect(201);
    const redEuCartItem = cartAddRes.body.data.item || cartAddRes.body.cart.items[0];
    expect(redEuCartItem.pricing_tnd).toBe(expectedRedEuQuote.totalTND);

    /* 3. Sélection de Red + US Plug (availQuantity = 0) -> OUT_OF_STOCK et refus honnête d'ajout au panier */
    const redUsRes = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('X-Session-Id', SESSION_ID)
      .send({
        url,
        store_id: 'aliexpress',
        capture: captured,
        variant: { Color: 'Red', 'Plug Type': 'US Plug' },
      })
      .expect(201);

    expect(redUsRes.body.data.availability.state).toBe('OUT_OF_STOCK');

    const blockedCartRes = await request(app)
      .post('/api/v1/aywebs/cart/items')
      .set('X-Session-Id', SESSION_ID)
      .send({
        product_id: redUsRes.body.data.product_id,
        source_url: url,
        store_id: 'aliexpress',
        quote_token: redUsRes.body.quote_token,
        capture: captured,
        variant: { Color: 'Red', 'Plug Type': 'US Plug' },
        quantity: 1,
      });
    expect(blockedCartRes.status).toBe(409);
    expect(['OUT_OF_STOCK', 'VARIANT_UNAVAILABLE', 'PRODUCT_UNAVAILABLE']).toContain(
      blockedCartRes.body.code || blockedCartRes.body.error_code,
    );
  });

  it('Garde anti-état SPA périmé (PRODUCT_IDENTITY_MISMATCH) et refus des fiches non livrables ("Can\'t ship to")', async () => {
    const { app } = createHarness();
    const url = 'https://www.aliexpress.com/item/1005009999999999.html';

    /* 1. runParams d'un ancien produit SPA (1005001111111111 != 1005009999999999) */
    const staleHtml = buildAliExpressCometPage({
      itemId: '1005009999999999',
      stateItemId: '1005001111111111',
      currency: 'USD',
    });
    const staleCaptured = runAliExpressCapture(staleHtml, url);
    expect(staleCaptured.diagnostics).toContain('ae:state_itemid_mismatch');
    expect(staleCaptured.aliexpress.skus).toEqual([]);

    /* Et si un payload falsifié tente d'injecter un autre pageItemId au serveur : refus strict */
    const forgedValidation = validateAyWebsCapturedPage(
      { ...staleCaptured, aliexpress: { readerVersion: 2, pageItemId: '1005001111111111', skus: [] } },
      url,
    );
    expect(forgedValidation.ok).toBe(false);
    expect(forgedValidation.rejection).toBe('PRODUCT_IDENTITY_MISMATCH');

    /* 2. Fiche affichant "This product can't be shipped to your address" -> OUT_OF_STOCK */
    const unshippableHtml = buildAliExpressCometPage({
      itemId: '1005009999999999',
      currency: 'USD',
      selectedColor: 'Black',
      selectedPlug: 'EU Plug',
      addButtonLabel: "Can't ship to your address",
      quantityTip: "This product can't be shipped to your address",
    });
    const unshippableCap = runAliExpressCapture(unshippableHtml, url);
    const unshippableRes = await request(app)
      .post('/api/v1/aywebs/product/resolve')
      .set('X-Session-Id', SESSION_ID)
      .send({
        url,
        store_id: 'aliexpress',
        capture: unshippableCap,
      })
      .expect(201);
    expect(unshippableRes.body.data.availability.state).toBe('OUT_OF_STOCK');
  });
});
