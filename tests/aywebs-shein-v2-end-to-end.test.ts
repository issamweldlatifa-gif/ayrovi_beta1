/**
 * AYWEBs — SHEIN v2 End-to-End : Capture, Variantes (page & feuille), Devise, Conversion TND & Panier (28/10/2026).
 *
 * Vérifie de bout en bout :
 *   1. Sélection Couleur + Taille DIRECTEMENT sur la page SHEIN (DOM SPA + gbRawData),
 *      y compris prix SKU différent par taille (XL à 24,90 € vs S à 21,40 €), pastille -40%,
 *      prix barré et prix annexe SHEIN Club ignorés ;
 *   2. Sélection Couleur + Taille DANS LA FEUILLE AYWEBs : devis TND par taille,
 *      taille épuisée bloquée (VARIANT_UNAVAILABLE), stock restant borné, et
 *      bascule vers une couleur sœur (-p-<goodsId>.html) ;
 *   3. Devises mondiales SHEIN (EUR, GBP, US$ -> USD ; $ nu sur ca.shein.com refusé sans ISO)
 *      et boutons multilingues (FR, EN, AR, DE, ES, IT) ;
 *   4. Persistance panier AYWEBs (`variant_snapshot`, `unit_price_tnd`, `total_tnd`) et
 *      statut opérationnel (`operational: true`) sur `/api/v1/aywebs/stores`.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-shein-v2-')), 'cache');

import { detectAyWebsStore } from '../shared/aywebsStores';
import { QatafoDatabase } from '../src/db/database';
import { calculatePrice, DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { addAyWebsCartItem } from '../src/aywebs/cart';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { SheinAdapter, sheinVariantPageUrl } from '../src/aywebs/adapters/shein';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { clearAyWebsResolveCache, clearAyWebsResolveFailureCache } from '../src/aywebs/resolveCache';
import { resetAyWebsReadGate } from '../src/aywebs/readGate';
import { resetProbeState } from '../src/scraper/hostCircuit';

const SESSION_ID = 'shein-v2-session-00000001';

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
  return { db, ctx, resolver: ctx.resolver, scraper };
}

function runSheinCapture(html: string, url: string): Record<string, any> {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  try {
    const script = buildAyWebsCaptureScript('shein');
    const raw = dom.window.eval(script) as string;
    return JSON.parse(raw);
  } finally {
    dom.window.close();
  }
}

function buildSheinSpaPage(opts: {
  goodsId?: string;
  selectedSize?: string | null;
  displayedPrice?: string;
  currency?: string;
  activeColor?: string;
  addButtonLabel?: string;
  soldOutBanner?: string;
  canonicalHref?: string;
}): string {
  const goodsId = opts.goodsId ?? '382460229';
  const currency = opts.currency ?? 'EUR';
  const activeColor = opts.activeColor ?? 'Noir';
  const selectedSize = opts.selectedSize ?? null;
  const displayedPrice = opts.displayedPrice ?? (selectedSize === 'XL' ? '24,90 €' : '21,40 €');
  const addButtonLabel = opts.addButtonLabel ?? 'Ajouter au panier';

  const gbRawData = {
    currency,
    detail: {
      goods_id: goodsId,
      goods_sn: `sw261028${goodsId}`,
      goods_name: `Robe fleurie plissée ${activeColor}`,
      brand: { brand_name: 'DAZY' },
      is_on_sale: opts.soldOutBanner ? 0 : 1,
      original_img: `//img.ltwebstatic.com/images3_pi/2026/10/28/${goodsId}_main.jpg`,
      color_image: `//img.ltwebstatic.com/images3_pi/2026/10/28/${goodsId}_swatch.jpg`,
      mainSaleAttribute: [{ attr_value_name: activeColor }],
      salePrice: goodsId === '382460229'
        ? { amount: '21.40', currency, amountWithSymbol: '21,40 €' }
        : { amount: '23.90', currency, amountWithSymbol: '23,90 €' },
      retailPrice: { amount: '35.70', currency, amountWithSymbol: '35,70 €' },
    },
    goods_imgs: {
      main_image: { origin_image: `//img.ltwebstatic.com/images3_pi/2026/10/28/${goodsId}_main.jpg` },
      detail_image: [
        { origin_image: `//img.ltwebstatic.com/images3_pi/2026/10/28/${goodsId}_2.jpg` },
      ],
    },
    relation_color: goodsId === '382460229'
      ? [
          {
            goods_id: '400991122',
            mainSaleAttribute: [{ attr_value_name: 'Rouge' }],
            goods_color_image: '//img.ltwebstatic.com/images3_pi/2026/10/28/400991122_swatch.jpg',
            is_on_sale: 1,
            salePrice: { amount: '23.90', currency, amountWithSymbol: '23,90 €' },
          },
          {
            goods_id: '400991199',
            mainSaleAttribute: [{ attr_value_name: 'Vert Émeraude' }],
            goods_color_image: '//img.ltwebstatic.com/images3_pi/2026/10/28/400991199_swatch.jpg',
            is_on_sale: 0,
            salePrice: { amount: '21.40', currency, amountWithSymbol: '21,40 €' },
          },
        ]
      : [
          {
            goods_id: '382460229',
            mainSaleAttribute: [{ attr_value_name: 'Noir' }],
            goods_color_image: '//img.ltwebstatic.com/images3_pi/2026/10/28/382460229_swatch.jpg',
            is_on_sale: 1,
            salePrice: { amount: '21.40', currency, amountWithSymbol: '21,40 €' },
          },
        ],
    attrSizeList: goodsId === '382460229'
      ? [
          { attr_value_name: 'S', stock: 18, is_sold_out: false, price: { salePrice: { amount: '21.40', currency } } },
          { attr_value_name: 'M', stock: 3, is_sold_out: false, price: { salePrice: { amount: '21.40', currency } } },
          { attr_value_name: 'L', stock: 0, is_sold_out: true, price: { salePrice: { amount: '21.40', currency } } },
          { attr_value_name: 'XL', stock: 9, is_sold_out: false, price: { salePrice: { amount: '24.90', currency } } },
        ]
      : [
          { attr_value_name: 'S', stock: 12, is_sold_out: false, price: { salePrice: { amount: '23.90', currency } } },
          { attr_value_name: 'M', stock: 7, is_sold_out: false, price: { salePrice: { amount: '23.90', currency } } },
        ],
  };

  return `<!doctype html><html lang="fr"><head>
    <title>Robe fleurie plissée ${activeColor} | SHEIN</title>
    ${opts.canonicalHref ? `<link rel="canonical" href="${opts.canonicalHref}">` : ''}
    <meta property="product:price:amount" content="${goodsId === '382460229' ? '21.40' : '23.90'}">
    <meta property="product:price:currency" content="${currency}">
    <script>window.gbRawData = ${JSON.stringify(gbRawData)};</script>
  </head><body>
    <main class="goods-detailv2">
      <div class="product-intro">
        <h1 class="product-intro__head-name">Robe fleurie plissée ${activeColor}</h1>
        <div class="product-intro__brand-name">DAZY</div>
        <div class="product-intro__head-price">
          <span class="product-intro__head-mainprice">${displayedPrice}</span>
          <span class="product-intro__price-discount">-40%</span>
          <del class="product-intro__head-delprice">35,70 €</del>
          <div class="product-intro__club-price">SHEIN Club 19,99 €</div>
        </div>
        <div class="product-intro__color">
          <div class="product-intro__color-title">Couleur: ${activeColor}</div>
          <div class="product-intro__color-radio ${activeColor === 'Noir' ? 'product-intro__color-radio_active' : ''}" data-color-name="Noir" data-goods-id="382460229">
            <img src="//img.ltwebstatic.com/images3_pi/2026/10/28/382460229_swatch.jpg" alt="Noir">
          </div>
          <a class="product-intro__color-radio ${activeColor === 'Rouge' ? 'product-intro__color-radio_active' : ''}" href="/Robe-fleurie-Rouge-p-400991122.html" data-color-name="Rouge">
            <img src="//img.ltwebstatic.com/images3_pi/2026/10/28/400991122_swatch.jpg" alt="Rouge">
          </a>
          <a class="product-intro__color-radio product-intro__color-radio_disabled" href="/Robe-fleurie-Vert-p-400991199.html" data-color-name="Vert Émeraude" aria-disabled="true">
            <img src="//img.ltwebstatic.com/images3_pi/2026/10/28/400991199_swatch.jpg" alt="Vert Émeraude">
          </a>
        </div>
        <div class="product-intro__size">
          <div class="product-intro__size-title">Taille <a href="#guide">Guide des tailles</a> <span>CM</span> <span>INCH</span></div>
          ${goodsId === '382460229' ? `
            <div class="product-intro__size-radio ${selectedSize === 'S' ? 'product-intro__size-radio_active' : ''}" role="radio" aria-checked="${selectedSize === 'S' ? 'true' : 'false'}">
              <span class="product-intro__size-radio-inner">S</span>
            </div>
            <div class="product-intro__size-radio ${selectedSize === 'M' ? 'product-intro__size-radio_active' : ''}" role="radio" aria-checked="${selectedSize === 'M' ? 'true' : 'false'}">
              <span class="product-intro__size-radio-inner">M</span>
              <span class="size-stock-tip">Plus que 3</span>
            </div>
            <div class="product-intro__size-radio product-intro__size-radio_soldout ${selectedSize === 'L' ? 'product-intro__size-radio_active' : ''}" role="radio" aria-disabled="true">
              <span class="product-intro__size-radio-inner">L</span>
            </div>
            <div class="product-intro__size-radio ${selectedSize === 'XL' ? 'product-intro__size-radio_active' : ''}" role="radio" aria-checked="${selectedSize === 'XL' ? 'true' : 'false'}">
              <span class="product-intro__size-radio-inner">XL</span>
            </div>
          ` : `
            <div class="product-intro__size-radio ${selectedSize === 'S' ? 'product-intro__size-radio_active' : ''}" role="radio">
              <span class="product-intro__size-radio-inner">S</span>
            </div>
            <div class="product-intro__size-radio ${selectedSize === 'M' ? 'product-intro__size-radio_active' : ''}" role="radio">
              <span class="product-intro__size-radio-inner">M</span>
            </div>
          `}
        </div>
        ${opts.soldOutBanner
          ? `<div class="product-intro__soldout">${opts.soldOutBanner}</div>`
          : `<div class="product-intro__add-btn"><button type="button">${addButtonLabel}</button></div>`}
      </div>
      <section class="recommend-carousel">
        <div class="product-intro__head-price">7,99 €</div>
        <div class="sale-price">9,49 €</div>
      </section>
    </main>
  </body></html>`;
}

describe('AYWEBs — SHEIN v2 : activation, capture avancée, options et conversion TND', () => {
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
    clearAyWebsResolveCache();
    clearAyWebsResolveFailureCache();
    resetAyWebsReadGate();
    resetProbeState();
  });

  it('active SHEIN comme boutique opérationnelle avec lecteur v2 et domaines régionaux', async () => {
    const h = createHarness();
    const app = express();
    app.use(express.json());
    app.use('/api/v1/aywebs', createAyWebsRouter(h.db, h.scraper as any));

    for (const url of [
      'https://fr.shein.com/Robe-p-382460229.html',
      'https://m.shein.com/us/Dress-p-382460229.html',
      'https://www.shein.co.uk/Dress-p-382460229.html',
      'https://www.shein.fr/Robe-p-382460229.html',
      'https://www.shein.de/Kleid-p-382460229.html',
      'https://www.shein.es/Vestido-p-382460229.html',
      'https://www.shein.it/Vestito-p-382460229.html',
    ]) {
      expect(detectAyWebsStore(url)?.id).toBe('shein');
    }

    const adapter = new SheinAdapter();
    expect(adapter.canonicalUrl('https://fr.shein.com/Robe-fleurie-p-382460229-cat-2030.html'))
      .toBe('https://www.shein.com/-p-382460229.html');
    expect(adapter.canonicalUrl('https://www.shein.fr/Robe-fleurie-p-382460229.html'))
      .toBe('https://www.shein.fr/-p-382460229.html');
    expect(sheinVariantPageUrl('https://fr.shein.com/Robe-fleurie-p-382460229.html', '400991122'))
      .toBe('https://fr.shein.com/-p-400991122.html');

    const storesRes = await request(app)
      .get('/api/v1/aywebs/stores')
      .set('X-AyWebs-Session', SESSION_ID);
    expect(storesRes.status).toBe(200);
    const sheinStore = storesRes.body.data.find((s: any) => s.id === 'shein');
    expect(sheinStore).toBeDefined();
    expect(sheinStore.operational).toBe(true);
    expect(sheinStore.capabilities).toEqual(expect.arrayContaining(['browse', 'search', 'product', 'variants', 'availability']));

    const capRes = await request(app).get('/api/v1/aywebs/stores/shein/capabilities');
    expect(capRes.status).toBe(200);
    expect(capRes.body.data.capture_enabled).toBe(true);

    const scriptRes = await request(app).get('/api/v1/aywebs/capture/script.js?store_id=shein');
    expect(scriptRes.status).toBe(200);
    expect(scriptRes.headers['x-aywebs-capture-reader']).toBe('shein');
    expect(scriptRes.headers['x-aywebs-capture-reader-version']).toBe('2');
  });

  it('Cas 1 (choix SUR LA PAGE SHEIN) : taille XL à 24,90 € choisie dans la WebView ⇒ prix SKU exact converti en TND et persisté au panier', async () => {
    const h = createHarness();
    const url = 'https://m.shein.com/fr/Robe-fleurie-p-382460229.html';
    const html = buildSheinSpaPage({
      goodsId: '382460229',
      selectedSize: 'XL',
      displayedPrice: '24,90 €',
      /* Canonical mobile SHEIN qui pointe vers fr.shein.com : ne doit pas faire échouer l'hôte */
      canonicalHref: 'https://fr.shein.com/Robe-fleurie-p-382460229.html',
    });

    const captured = runSheinCapture(html, url);
    expect(captured.canonicalUrl).toBeNull();
    expect(captured.shein).toEqual({
      readerVersion: 2,
      pageGoodsId: '382460229',
      selectedColor: 'Noir',
      selectedSize: 'XL',
      skuId: 'sw261028382460229',
    });
    expect(captured.images[0]).toBe('https://img.ltwebstatic.com/images3_pi/2026/10/28/382460229_main.jpg');

    const resolved = await resolveAyWebsProduct(h.resolver, {
      url,
      storeId: 'shein',
      sessionId: SESSION_ID,
      capture: captured,
      selectedVariant: { couleur: 'Noir', taille: 'XL' },
    });

    expect(h.scraper.scrapeProduct).not.toHaveBeenCalled();
    expect(resolved.capture?.used).toBe(true);
    expect(resolved.product.sourceProductId).toBe('SHEIN-382460229');
    expect(resolved.product.price).toBe(24.9);
    expect(resolved.product.currency).toBe('EUR');
    expect(resolved.product.availability.state).toBe('AVAILABLE');
    expect(resolved.product.selectedVariant?.attributes).toEqual({
      Couleur: 'Noir',
      Taille: 'XL',
    });

    const expectedPricing = calculatePrice(pricingRules(), 24.9, 'EUR', {
      title: resolved.product.title,
      quantity: 1,
    });
    expect(resolved.product.ayroviPricing?.totalTnd).toBe(expectedPricing.totalTND);
    expect(resolved.product.ayroviPricing!.totalTnd).toBeGreaterThan(80);

    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      sourceUrl: url,
      storeId: 'shein',
      variantAttributes: { couleur: 'Noir', taille: 'XL' },
      quantity: 2,
      capture: captured,
      quoteToken: resolved.quoteToken,
      idempotencyKey: 'req-shein-onpage-xl-1',
    });

    expect(added.item.quantity).toBe(2);
    expect(added.item.pricingTnd).toBe(expectedPricing.totalTND);
    expect(added.item.lineTotalTnd).toBeGreaterThan(expectedPricing.totalTND);
    expect(added.item.variantSnapshot?.attributes).toEqual({
      Couleur: 'Noir',
      Taille: 'XL',
    });
  });

  it('Cas 2 (choix DANS LA FEUILLE AYWEBs) : ouverture sans taille choisie, sélection de M ou XL, blocage de L épuisé, et bascule vers la couleur sœur Rouge', async () => {
    const h = createHarness();
    const noirUrl = 'https://fr.shein.com/Robe-fleurie-Noir-p-382460229.html';
    const noirCapture = runSheinCapture(buildSheinSpaPage({ goodsId: '382460229', selectedSize: null }), noirUrl);

    const colorGroup = noirCapture.variantGroups.find((g: any) => g.name === 'Couleur');
    const sizeGroup = noirCapture.variantGroups.find((g: any) => g.name === 'Taille');
    expect(noirCapture.variantGroups.map((g: any) => g.name)).toEqual(['Couleur', 'Taille']);
    expect(colorGroup.values).toEqual(['Noir', 'Rouge', 'Vert Émeraude']);
    expect(colorGroup.selected).toEqual(['Noir']);
    expect(sizeGroup.values).toEqual(['S', 'M', 'L', 'XL']);
    expect(sizeGroup.selected).toEqual([]);

    const rougeOpt = colorGroup.options.find((o: any) => o.value === 'Rouge');
    expect(rougeOpt).toMatchObject({
      value: 'Rouge',
      goodsId: '400991122',
      priceFrom: true,
      image: 'https://img.ltwebstatic.com/images3_pi/2026/10/28/400991122_swatch.jpg',
    });

    /* Sans taille choisie, un ajout direct est refusé avec VARIANT_REQUIRED */
    await expect(addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      sourceUrl: noirUrl,
      storeId: 'shein',
      variantAttributes: { couleur: 'Noir' },
      quantity: 1,
      capture: noirCapture,
      idempotencyKey: 'req-shein-missing-size',
    })).rejects.toMatchObject({ code: 'VARIANT_REQUIRED' });

    /* Sélection de la taille épuisée L dans la feuille ⇒ refusée avec VARIANT_UNAVAILABLE */
    await expect(addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      sourceUrl: noirUrl,
      storeId: 'shein',
      variantAttributes: { couleur: 'Noir', taille: 'L' },
      quantity: 1,
      capture: noirCapture,
      idempotencyKey: 'req-shein-soldout-l',
    })).rejects.toMatchObject({ code: 'VARIANT_UNAVAILABLE' });

    /* Sélection de Noir + M (stock restant = 3, 21,40 €) dans la feuille ⇒ devis TND exact */
    const resolvedM = await resolveAyWebsProduct(h.resolver, {
      url: noirUrl,
      storeId: 'shein',
      sessionId: SESSION_ID,
      capture: noirCapture,
      selectedVariant: { couleur: 'Noir', taille: 'M' },
    });
    const expectedM = calculatePrice(pricingRules(), 21.4, 'EUR', {
      title: resolvedM.product.title,
      quantity: 1,
    });
    expect(['AVAILABLE', 'LOW_STOCK']).toContain(resolvedM.product.availability.state);
    expect(resolvedM.product.availability.quantityHint).toBe(3);
    expect(resolvedM.product.ayroviPricing?.totalTnd).toBe(expectedM.totalTND);

    /* Sélection de Noir + XL (24,90 €) depuis la MÊME capture initiale ⇒ devis TND de 24,90 € */
    const resolvedXL = await resolveAyWebsProduct(h.resolver, {
      url: noirUrl,
      storeId: 'shein',
      sessionId: SESSION_ID,
      capture: noirCapture,
      selectedVariant: { couleur: 'Noir', taille: 'XL' },
    });
    const expectedXL = calculatePrice(pricingRules(), 24.9, 'EUR', {
      title: resolvedXL.product.title,
      quantity: 1,
    });
    expect(resolvedXL.product.ayroviPricing?.totalTnd).toBe(expectedXL.totalTND);
    expect(resolvedXL.product.ayroviPricing!.totalTnd).toBeGreaterThan(expectedM.totalTND);

    /* Bascule vers la couleur sœur Rouge (-p-400991122.html, 23,90 €) via VariantReader */
    const rougeUrl = sheinVariantPageUrl(noirUrl, rougeOpt.goodsId)!;
    expect(rougeUrl).toBe('https://fr.shein.com/-p-400991122.html');
    const rougeCapture = runSheinCapture(
      buildSheinSpaPage({ goodsId: '400991122', activeColor: 'Rouge', displayedPrice: '23,90 €', selectedSize: null }),
      rougeUrl,
    );
    const resolvedRougeM = await resolveAyWebsProduct(h.resolver, {
      url: rougeUrl,
      storeId: 'shein',
      sessionId: SESSION_ID,
      capture: rougeCapture,
      selectedVariant: { couleur: 'Rouge', taille: 'M' },
    });
    const expectedRouge = calculatePrice(pricingRules(), 23.9, 'EUR', {
      title: resolvedRougeM.product.title,
      quantity: 1,
    });
    expect(resolvedRougeM.product.availability.state).toBe('AVAILABLE');
    expect(resolvedRougeM.product.ayroviPricing?.totalTnd).toBe(expectedRouge.totalTND);

    const addedRouge = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      sourceUrl: rougeUrl,
      storeId: 'shein',
      variantAttributes: { couleur: 'Rouge', taille: 'M' },
      quantity: 1,
      capture: rougeCapture,
      quoteToken: resolvedRougeM.quoteToken,
      idempotencyKey: 'req-shein-rouge-m-1',
    });
    expect(addedRouge.item.pricingTnd).toBe(expectedRouge.totalTND);
    expect(addedRouge.item.variantSnapshot?.attributes).toEqual({
      Couleur: 'Rouge',
      Taille: 'M',
    });
  });

  it('Cas 3 (devises & langues mondiales) : US$14.99 / EUR21.40 / arabe acceptés, mais $ nu sur ca.shein.com n’est jamais pris pour USD', () => {
    /* Page arabe avec US$14.99 et bouton « أضف إلى الحقيبة » */
    const arUrl = 'https://ar.shein.com/Dress-p-55112233.html';
    const arHtml = `<!doctype html><html lang="ar"><head>
      <title>فستان سهرة أنيق</title>
      <meta property="product:price:amount" content="14.99">
      <meta property="product:price:currency" content="USD">
    </head><body>
      <div class="product-intro">
        <h1 class="product-intro__head-name">فستان سهرة أنيق</h1>
        <div class="product-intro__head-price"><span class="product-intro__head-mainprice">US$14.99</span></div>
        <div class="product-intro__add-btn"><div role="button">أضف إلى الحقيبة</div></div>
      </div>
    </body></html>`;
    const arCaptured = runSheinCapture(arHtml, arUrl);
    const arVerdict = validateAyWebsCapturedPage(arCaptured, arUrl);
    expect(arVerdict.ok).toBe(true);
    if (arVerdict.ok) {
      expect(arVerdict.price).toBe(14.99);
      expect(arVerdict.currency).toBe('USD');
      expect(arVerdict.currencyVerified).toBe(true);
      expect(arVerdict.availability).toBe('AVAILABLE');
    }

    /* Code ISO collé au montant (« EUR21.40 ») sans espace */
    const attachedIsoUrl = 'https://de.shein.com/Kleid-p-66223344.html';
    const attachedIsoHtml = `<!doctype html><html lang="de"><head><title>Kleid</title></head><body>
      <script>window.gbRawData = {"currency":"EUR","detail":{"goods_id":"66223344","goods_name":"Kleid","is_on_sale":1,"salePrice":{"amount":"21.40","currency":"EUR"}}};</script>
      <div class="product-intro">
        <h1 class="product-intro__head-name">Kleid</h1>
        <div class="product-intro__head-price"><span class="product-intro__head-mainprice">EUR21.40</span></div>
        <div class="product-intro__add-btn"><button>In die Einkaufstasche</button></div>
      </div>
    </body></html>`;
    const attachedCaptured = runSheinCapture(attachedIsoHtml, attachedIsoUrl);
    const attachedVerdict = validateAyWebsCapturedPage(attachedCaptured, attachedIsoUrl);
    expect(attachedVerdict.ok).toBe(true);
    if (attachedVerdict.ok) {
      expect(attachedVerdict.price).toBe(21.4);
      expect(attachedVerdict.currency).toBe('EUR');
      expect(attachedVerdict.priceVerified).toBe(true);
      expect(attachedVerdict.currencyVerified).toBe(true);
    }

    /* $ nu sur ca.shein.com (CAD) sans code ISO : ne doit JAMAIS inventer USD */
    const caUrl = 'https://ca.shein.com/Dress-p-77334455.html';
    const caHtml = `<!doctype html><html lang="en"><head>
      <title>Dress</title>
      <meta property="product:price:amount" content="19.99">
    </head><body>
      <div class="product-intro">
        <h1 class="product-intro__head-name">Dress</h1>
        <div class="product-intro__head-price"><span class="product-intro__head-mainprice">$19.99</span></div>
        <div class="product-intro__add-btn"><button>Add to Bag</button></div>
      </div>
    </body></html>`;
    const caCaptured = runSheinCapture(caHtml, caUrl);
    const caVerdict = validateAyWebsCapturedPage(caCaptured, caUrl);
    expect(caVerdict.ok).toBe(true);
    if (caVerdict.ok) {
      expect(caVerdict.currencyVerified).toBe(false);
      expect(caVerdict.currency).toBe('');
    }
  });
});
