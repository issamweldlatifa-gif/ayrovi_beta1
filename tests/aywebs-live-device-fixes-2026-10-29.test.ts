/**
 * AYWEBs — Corrections Terrain Appareil Réel (29/10/2026) :
 *   1. AliExpress Mobile Choice / Bundle Deals (`أضف إلى مختاراتي`, `bundle-deals`, `productIds=`, `/item/<id>` sans `.html`, `لون : A`) ;
 *   2. AliExpress MTOP JSONP (`mtopjsonp(...)`) + parité `AYWEBS_NETWORK_OBSERVER_SCRIPT` serveur/mobile (`650 Ko`) ;
 *   3. SHEIN Mobile (`m.shein.com`) : exclusion stricte des badges `images3_acp/` / `images3_ccc/` (`dar`, camion QuickShip),
 *      zéro étampage de `salePrice` sur les tailles non choisies, et corroboration du prix unique sans `<meta product:price:amount>` ;
 *   4. Zalando Mobile : exclusion de l'invite `Taille` / `Votre taille` hors de `selectedVariantTexts` et `variantGroups[].selected`.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-live-fixes-')), 'cache');

import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { addAyWebsCartItem } from '../src/aywebs/cart';
import { AliExpressAdapter, aliexpressItemId } from '../src/aywebs/adapters/aliexpress';
import { AYWEBS_NETWORK_OBSERVER_SCRIPT, buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { clearAyWebsResolveCache, clearAyWebsResolveFailureCache } from '../src/aywebs/resolveCache';
import { resetAyWebsReadGate } from '../src/aywebs/readGate';
import { resetProbeState } from '../src/scraper/hostCircuit';
import { captureIsProductCard } from '../apps/mobile/src/features/aywebs/pageKind';

const SESSION_ID = 'live-device-fixes-20261029';

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
    updatedAt: '2026-10-29T00:00:00.000Z',
  };
}

function createHarness() {
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const scraper = {
    cleanPastedUrl: (value: string) => String(value).trim(),
    scrapeProduct: vi.fn(async () => {
      throw new Error('NO_SERVER_SCRAPE_EXPECTED');
    }),
  };
  const ctx = createAyWebsContext(db, scraper as any);
  return { db, ctx, resolver: ctx.resolver, scraper };
}

function runCapture(html: string, url: string, storeId: string, beforeEval?: (win: any) => void): Record<string, any> {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  try {
    if (beforeEval) beforeEval(dom.window);
    const script = buildAyWebsCaptureScript(storeId);
    return JSON.parse(dom.window.eval(script) as string);
  } finally {
    dom.window.close();
  }
}

describe('AYWEBs — Corrections Terrain Appareil Réel (29/10/2026)', () => {
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

  it('1. AliExpress Mobile Choice / Bundle Deals (`أضف إلى مختاراتي`, `bundle-deal`, `productIds=`, `لون : A`) est reconnu comme vraie fiche produit et converti en TND', async () => {
    const h = createHarness();
    const adapter = new AliExpressAdapter(h.scraper as any);
    for (const rawUrl of [
      'https://www.aliexpress.com/ssr/300000512/BundleDeals2?productIds=1005007654321098:12000041234567890&pha_manifest=ssr',
      'https://ar.aliexpress.com/item/1005007654321098?spm=a2g0n.bundle',
      'https://m.aliexpress.com/p/tesla-landing/index.html?productIds=1005007654321098',
    ]) {
      expect(aliexpressItemId(new URL(rawUrl))).toBe('1005007654321098');
      expect(adapter.classifyPage(rawUrl).isProductPage).toBe(true);
    }

    const bundleUrl = 'https://ar.aliexpress.com/ssr/300000512/BundleDeals2?productIds=1005007654321098:12000041234567890';
    const html = `<!doctype html><html lang="ar" dir="rtl"><head><title>AliExpress</title></head><body>
      <div class="bundle-deal-detail-container">
        <div class="pdp-mobile-gallery">
          <img src="https://ae01.alicdn.com/kf/S998877665544_800x800.jpg" alt="ornament">
        </div>
        <div class="pdp-price-box">
          <span class="pdp-comp-price-current"><span>1</span><span>,</span><span>72</span><span>€</span></span>
          <del class="price-original">9,48€</del>
        </div>
        <div class="pdp-title-wrap">مجموعة زينة معلقة للسيارة على شكل زهرة وهلال</div>
        <div class="msku-prop">
          <div class="prop-title">لون : A</div>
          <div class="msku-item selected"><img src="https://ae01.alicdn.com/kf/S1111_80x80.jpg"></div>
          <div class="msku-item"><img src="https://ae01.alicdn.com/kf/S2222_80x80.jpg"></div>
        </div>
        <div class="bundle-footer-bar">
          <button type="button" class="choice-pick-btn">أضف إلى مختاراتي</button>
        </div>
      </div>
    </body></html>`;

    const captured = runCapture(html, bundleUrl, 'aliexpress');
    expect(captured.title).toContain('مجموعة زينة معلقة للسيارة');
    expect(captured.addToCartText).toBe('أضف إلى مختاراتي');
    expect(captured.images[0]).toContain('ae01.alicdn.com/kf/S998877665544');
    expect(captured.selectedVariantTexts).toContain('لون : A');
    expect(captureIsProductCard(captured)).toBe(true);

    const validated = validateAyWebsCapturedPage(captured, bundleUrl);
    expect(validated.ok).toBe(true);
    if (!validated.ok) throw new Error(validated.rejection);
    expect(validated.outcome.corroborated).toBe(true);
    expect(validated.price).toBeCloseTo(1.72, 2);
    expect(validated.currency).toBe('EUR');
    expect(validated.availability).toBe('AVAILABLE');

    const resolved = await resolveAyWebsProduct(h.resolver, {
      url: bundleUrl,
      sessionId: SESSION_ID,
      storeId: 'aliexpress',
      capture: captured,
      refresh: true,
    });
    expect(resolved.capture?.used).toBe(true);
    expect(resolved.product.price).toBeCloseTo(1.72, 2);
    expect(resolved.product.currency).toBe('EUR');
    expect(resolved.product.ayroviPricing?.totalTnd).toBeGreaterThan(0);
    expect(resolved.quoteToken).toBeTruthy();
  });

  it('2. Observateur réseau : synchronisé à 650 Ko entre serveur et mobile, et décode le JSONP MTOP AliExpress (`mtopjsonp3({...})`)', async () => {
    const mobileObserverFile = readFileSync(
      join(__dirname, '..', 'apps/mobile/src/features/aywebs/networkObserverScript.ts'),
      'utf8',
    );
    expect(mobileObserverFile).toContain('MAX_TEXT_LEN = 650000');
    expect(mobileObserverFile).toContain('mtop|bundle');
    expect(mobileObserverFile).toContain('parseJsonOrJsonp');
    expect(AYWEBS_NETWORK_OBSERVER_SCRIPT).toContain('MAX_TEXT_LEN = 650000');
    expect(AYWEBS_NETWORK_OBSERVER_SCRIPT).toContain('parseJsonOrJsonp');

    const mtopUrl = 'https://m.aliexpress.com/item/1005009988776655';
    const mtopBody = {
      data: {
        result: {
          productInfoComponent: { id: '1005009988776655', subject: 'Support téléphone magnétique voiture' },
          priceComponent: { currencyCode: 'EUR', discountPrice: { minActivityAmount: { value: '4.50', currency: 'EUR' } } },
          imageComponent: { imagePathList: ['https://ae01.alicdn.com/kf/Smag9988.jpg'] },
          inventoryComponent: { totalAvailQuantity: 40 },
        },
      },
    };
    const html = `<!doctype html><html><head><title>AliExpress</title></head><body>
      <div class="pdp-comp-price-current">4,50 €</div>
      <button type="button">Ajouter à ma sélection</button>
    </body></html>`;

    const dom = new JSDOM(html, { url: mtopUrl, runScripts: 'outside-only' });
    try {
      (dom.window as any).fetch = vi.fn(async () => ({
        headers: { get: () => 'application/javascript; charset=utf-8' },
        clone: () => ({
          text: async () => `mtopjsonp3(${JSON.stringify(mtopBody)});`,
        }),
      }));
      dom.window.eval(AYWEBS_NETWORK_OBSERVER_SCRIPT);
      await (dom.window as any).fetch('https://acs.m.aliexpress.com/h5/mtop.aliexpress.pdp.pc.query/1.0/?api=mtop');
      await new Promise((r) => setTimeout(r, 20));
      const captured = JSON.parse(dom.window.eval(buildAyWebsCaptureScript('aliexpress')) as string);
      expect(captured.title).toBe('Support téléphone magnétique voiture');
      expect(captured.images[0]).toContain('ae01.alicdn.com/kf/Smag9988.jpg');
      expect(captured.addToCartText).toBe('Ajouter à ma sélection');
    } finally {
      dom.window.close();
    }
  });

  it('3. SHEIN Mobile (`m.shein.com`) : ignore les badges `images3_acp/` & `images3_ccc/`, n’étampe pas `salePrice` sur les tailles non choisies, et corrobore le prix unique sans `<meta>`', async () => {
    const sheinUrl = 'https://m.shein.com/fr/Boy-Loose-Jeans-p-44556677.html';
    const ssrState = {
      currency: 'USD',
      detail: {
        goods_id: '44556677',
        goods_name: 'Jean ample décontracté garçon',
        is_on_sale: 1,
        mainSaleAttribute: [{ attr_value_name: 'Jean clair' }],
        salePrice: { amount: '18.71', currency: 'USD', amountWithSymbol: 'US$18.71' },
      },
      /* SSR mobile sans prix par taille ni min_price/max_price */
      attrSizeList: [
        { attr_value_name: '4Y (98-104 cm)', stock: 12, is_sold_out: false },
        { attr_value_name: '5Y (104-110 cm)', stock: 8, is_sold_out: false },
        { attr_value_name: '6Y (110-116 cm)', stock: 5, is_sold_out: false },
      ],
    };
    /* Pas de <meta property="product:price:amount">, et des badges `dar` / camion QuickShip avant la vraie photo ! */
    const html = `<!doctype html><html lang="fr"><head>
      <title>Jean ample décontracté garçon | SHEIN</title>
      <meta property="og:image" content="https://img.ltwebstatic.com/images3_acp/2026/10/dar_brand_badge.png">
      <script>window.gbRawData = ${JSON.stringify(ssrState)};</script>
    </head><body>
      <main class="goods-detail">
        <div class="goods-title">
          <img src="https://img.ltwebstatic.com/images3_acp/2026/10/dar_brand_badge.png" alt="dar">
          <h1 class="goods-name">Jean ample décontracté garçon</h1>
        </div>
        <div class="shipping-promise">
          <img src="https://img.ltwebstatic.com/images3_ccc/2026/10/quick_ship_truck_icon.png" alt="QuickShip">
        </div>
        <div class="goods-banner">
          <img data-src="https://img.ltwebstatic.com/images3_pi/2026/10/29/garcon_jean_clair_main.jpg" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="Jean">
        </div>
        <div class="goods-price">
          <span class="goods-price__main">US$19.40</span>
        </div>
        <div class="goods-size">
          <div class="goods-size__title">Taille</div>
          <div class="goods-size__item" role="radio" aria-checked="false">4Y (98-104 cm)</div>
          <div class="goods-size__item active" role="radio" aria-checked="true">5Y (104-110 cm)</div>
          <div class="goods-size__item" role="radio" aria-checked="false">6Y (110-116 cm)</div>
        </div>
        <button type="button" class="goods-btn__add">Ajouter au panier</button>
      </main>
    </body></html>`;

    const captured = runCapture(html, sheinUrl, 'shein');

    /* 1. Vraie photo galerie (`images3_pi/`), aucun badge `images3_acp/` ni `images3_ccc/` */
    expect(captured.images).toEqual([
      'https://img.ltwebstatic.com/images3_pi/2026/10/29/garcon_jean_clair_main.jpg',
    ]);

    /* 2. Aucun étampage de 18.71 USD sur les tailles non choisies ; seule la taille active (5Y) porte son prix DOM live */
    const sizeGroup = captured.variantGroups.find((g: any) => g.name === 'Taille');
    expect(sizeGroup).toBeDefined();
    expect(sizeGroup.selected).toEqual(['5Y (104-110 cm)']);
    for (const opt of sizeGroup.options) {
      if (opt.value === '5Y (104-110 cm)') {
        expect(opt.price).toBe('US$19.40');
      } else {
        expect(opt.price).toBeNull();
      }
    }

    /* 3. Le prix live du DOM (`US$19.40` pour 5Y) est lu sans `aeNormalizeSplitPrice(HTMLElement)` cassé -> pas de CAPTURE_INCOMPLETE */
    const h = createHarness();
    const resolved = await resolveAyWebsProduct(h.resolver, {
      url: sheinUrl,
      sessionId: SESSION_ID,
      storeId: 'shein',
      capture: captured,
      selectedVariant: { taille: '5Y (104-110 cm)' },
      refresh: true,
    });
    expect(resolved.capture?.used).toBe(true);
    expect(resolved.product.price).toBeCloseTo(19.4, 2);
    expect(resolved.product.currency).toBe('USD');
    expect(resolved.product.ayroviPricing?.totalTnd).toBeGreaterThan(0);
    expect(resolved.quoteToken).toBeTruthy();

    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      accountId: null,
      productId: resolved.product.productId,
      sourceUrl: sheinUrl,
      storeId: 'shein',
      variantAttributes: { taille: '5Y (104-110 cm)' },
      quantity: 1,
      capture: captured,
      quoteToken: resolved.quoteToken,
    });
    expect(added.item.unitPrice).toBeCloseTo(19.4, 2);
  });

  it('4. Zalando Mobile : l’invite « Taille » / « Votre taille » n’entre jamais dans `selectedVariantTexts` ni `selected`', () => {
    const zalandoUrl = 'https://m.zalando.fr/nike-pantalon-ni122e0a1.html';
    const html = `<!doctype html><html lang="fr"><head>
      <title>Nike Pantalon | Zalando</title>
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'ProductGroup',
        name: 'Nike Pantalon Cargo',
        hasVariant: [
          { '@type': 'Product', sku: 'NI1-S', size: 'S', color: 'Noir', offers: { '@type': 'Offer', price: '69.95', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } },
          { '@type': 'Product', sku: 'NI1-M', size: 'M', color: 'Noir', offers: { '@type': 'Offer', price: '69.95', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' } },
        ],
      })}</script>
    </head><body>
      <h1>Nike Pantalon Cargo</h1>
      <select aria-label="size-picker">
        <option value="" selected disabled>Taille</option>
        <option value="votre">Votre taille</option>
        <option value="S">S</option>
        <option value="M">M</option>
      </select>
      <div role="option" aria-selected="true">Taille</div>
      <button type="button">Ajouter au panier</button>
    </body></html>`;

    const captured = runCapture(html, zalandoUrl, 'zalando');
    expect(captured.selectedVariantTexts).not.toContain('Taille');
    expect(captured.selectedVariantTexts).not.toContain('Votre taille');
    for (const grp of captured.variantGroups) {
      expect(grp.selected).not.toContain('Taille');
      expect(grp.selected).not.toContain('Votre taille');
    }
  });
});
