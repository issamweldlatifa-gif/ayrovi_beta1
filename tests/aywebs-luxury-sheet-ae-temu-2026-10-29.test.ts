/**
 * AYWEBs — Régression Capture Mobile AliExpress (modale SKU CSR & Bundle Deals),
 * Temu Mobile (`#goods_price`, `rawData`, `<div role="button">`, URL `_x_*`),
 * Amazon Fashion (exclusion bannière `/images/G/`) et SHEIN (exclusion logo PWA « S » + `data-before-crop-src`).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-ae-temu-')), 'cache');

import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { addAyWebsCartItem } from '../src/aywebs/cart';
import { AYWEBS_CAPTURE_SCRIPT, AYWEBS_NETWORK_OBSERVER_SCRIPT, buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { AYWEBS_NETWORK_OBSERVER_SCRIPT as MOBILE_NETWORK_OBSERVER_SCRIPT } from '../apps/mobile/src/features/aywebs/networkObserverScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { clearAyWebsResolveCache, clearAyWebsResolveFailureCache } from '../src/aywebs/resolveCache';
import { resetAyWebsReadGate } from '../src/aywebs/readGate';
import { resetProbeState } from '../src/scraper/hostCircuit';
import { captureMatchesPageUrl, isSpaInPageProductSwitch } from '../apps/mobile/src/features/aywebs/webNavigation';

const SESSION_ID = 'ae-temu-luxury-20261029';

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

function runCapture(html: string, url: string, storeId?: string) {
  const dom = new JSDOM(html, { url, runScripts: 'dangerously' });
  const script = storeId ? buildAyWebsCaptureScript(storeId) : AYWEBS_CAPTURE_SCRIPT;
  const raw = dom.window.eval(script);
  return JSON.parse(String(raw));
}

afterEach(() => {
  clearAyWebsResolveCache();
  clearAyWebsResolveFailureCache();
  resetAyWebsReadGate();
  resetProbeState();
  vi.restoreAllMocks();
});

describe('AYWEBs — AliExpress modale SKU mobile CSR & Bundle Deals', () => {
  it('lit la modale SKU ouverte à 2 axes (Couleur : 02 + Taille : 4XL, 22,19€) au-dessus du prix de fond 19,99€ et permet l’ajout direct', async () => {
    const url = 'https://fr.aliexpress.com/item/1005009123456789.html';
    const html = `<!doctype html>
      <html lang="fr">
        <head>
          <title>Veste Cargo Homme Hiver — AliExpress</title>
          <meta property="og:title" content="Veste Cargo Homme Hiver Imperméable" />
          <meta property="og:image" content="https://ae01.alicdn.com/kf/S111111111111111111111111A.jpg" />
        </head>
        <body>
          <main>
            <h1>Veste Cargo Homme Hiver Imperméable</h1>
            <div data-pl="product-price">19,99€</div>
          </main>
          <div role="dialog" aria-modal="true" class="comet-v2-modal-content sku-panel">
            <div class="sku-header">
              <img src="https://ae01.alicdn.com/kf/S222222222222222222222222B.jpg" alt="Couleur 02" />
              <div class="sku-price">22,19€</div>
            </div>
            <div class="prop-section">
              <div class="prop-header">Couleur : 02</div>
              <div class="prop-list">
                <div role="radio" aria-checked="false" title="01">01</div>
                <div role="radio" aria-checked="true" title="02">02</div>
              </div>
            </div>
            <div class="prop-section">
              <div class="prop-header">Taille : 4XL</div>
              <div class="prop-list">
                <div role="radio" aria-checked="false">XL</div>
                <div role="radio" aria-checked="false">3XL</div>
                <div role="radio" aria-checked="true">4XL</div>
              </div>
            </div>
            <button type="button">Ajouter au panier</button>
          </div>
        </body>
      </html>`;

    const capture = runCapture(html, url, 'aliexpress');
    expect(capture.images[0]).toContain('S222222222222222222222222B.jpg');
    expect(capture.variantGroups).toHaveLength(2);
    expect(capture.variantGroups?.[0]?.values).toEqual(['01', '02']);
    expect(capture.variantGroups?.[1]?.values).toEqual(['XL', '3XL', '4XL']);

    const { db, ctx, resolver } = createHarness();
    try {
      const resolved = await resolveAyWebsProduct(resolver, {
        sessionId: SESSION_ID,
        url,
        storeId: 'aliexpress',
        capture,
      });
      expect(resolved.capture?.used).toBe(true);
      expect(resolved.product.price).toBeCloseTo(22.19, 2);
      expect(resolved.product.currency).toBe('EUR');
      expect(resolved.product.availability.state).toBe('AVAILABLE');
      expect(resolved.product.ayroviPricing?.totalTnd).toBeGreaterThan(0);

      const added = await addAyWebsCartItem(resolver, {
        sessionId: SESSION_ID,
        accountId: null,
        productId: resolved.product.productId,
        sourceUrl: url,
        storeId: 'aliexpress',
        quantity: 1,
        variantAttributes: {
          [resolved.product.variantGroups[0]!.attribute]: '02',
          [resolved.product.variantGroups[1]!.attribute]: '4XL',
        },
        quoteToken: resolved.quoteToken ?? null,
        capture,
      });
      expect(added.item.quantity).toBe(1);
      expect(added.item.unitPrice).toBeCloseTo(22.19, 2);
    } finally {
      db.close();
    }
  });

  it('reconnaît le CTA pluriel Bundle Deals « Ajouter à mes sélections » et les navigations SPA ?productIds=', () => {
    const url = 'https://www.aliexpress.com/ssr/300000512/BundleDeals2?productIds=1005008888888888:1200001';
    const html = `<!doctype html>
      <html lang="fr">
        <head>
          <meta property="og:title" content="Câble USB-C Tressé Rapide" />
        </head>
        <body>
          <div role="dialog" aria-modal="true" class="bundle-sku-modal">
            <img src="https://ae01.alicdn.com/kf/S333333333333333333333333C.jpg" alt="Jaune" />
            <div class="sku-price">1,73€</div>
            <div class="prop-section">
              <div>Couleur : Jaune</div>
              <div>
                <div role="radio" aria-checked="true">Jaune</div>
                <div role="radio" aria-checked="false">Noir</div>
              </div>
            </div>
            <div role="button">Ajouter à mes sélections</div>
          </div>
        </body>
      </html>`;

    const capture = runCapture(html, url, 'aliexpress');
    const validated = validateAyWebsCapturedPage(capture, url);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.price).toBeCloseTo(1.73, 2);
      expect(validated.currency).toBe('EUR');
      expect(validated.availability).toBe('AVAILABLE');
    }

    expect(
      isSpaInPageProductSwitch(
        url,
        'https://www.aliexpress.com/ssr/300000512/BundleDeals2?disableNav=YES',
      ),
    ).toBe(true);
  });
});

describe('AYWEBs — Temu Mobile (`#goods_price`, `rawData`, `<div role="button">`, URL `_x_*`)', () => {
  it('capture le prix, le bouton Ajouter au panier et les variantes depuis rawData + DOM Temu sans timeout URL', () => {
    const rawPageUrl =
      'https://www.temu.com/fr/sweat-capuche-homme-g-601099512345678.html?_oak_mp_inf=abc&_x_sessn_id=xyz987654321&refer_page_name=home&refer_page_id=10005_1730000000';
    const html = `<!doctype html>
      <html lang="fr">
        <head>
          <title>Sweat à capuche zippé homme — Temu</title>
        </head>
        <body>
          <main>
            <h1>Sweat à capuche zippé homme</h1>
            <div id="goods_price">14,49 €</div>
            <div role="radiogroup" aria-label="Couleur">
              <div role="radio" aria-checked="true">Gris foncé</div>
              <div role="radio" aria-checked="false">Noir</div>
            </div>
            <div role="radiogroup" aria-label="Taille">
              <div role="radio" aria-checked="false">M</div>
              <div role="radio" aria-checked="true">L</div>
            </div>
            <div role="button">Ajouter au panier</div>
          </main>
          <script>
            window.rawData = {
              store: {
                goods: {
                  goodsId: "601099512345678",
                  goodsName: "Sweat à capuche zippé homme",
                  hdThumbUrl: "https://img.kwcdn.com/product/Fancyalgo/VirtualModelMatting/999888777.jpg",
                  minOnSalePrice: "14,49 €",
                  currency: "EUR"
                },
                sku: [
                  {
                    skuId: "sku_gris_l",
                    stockQuantity: 12,
                    normalPriceStr: "14,49 €",
                    specs: [
                      { specKey: "Couleur", specValue: "Gris foncé" },
                      { specKey: "Taille", specValue: "L" }
                    ]
                  },
                  {
                    skuId: "sku_noir_m",
                    stockQuantity: 5,
                    normalPriceStr: "14,49 €",
                    specs: [
                      { specKey: "Couleur", specValue: "Noir" },
                      { specKey: "Taille", specValue: "M" }
                    ]
                  }
                ]
              }
            };
          </script>
        </body>
      </html>`;

    const capture = runCapture(html, rawPageUrl, 'temu');
    const strippedCaptureUrl = 'https://www.temu.com/fr/sweat-capuche-homme-g-601099512345678.html';
    expect(captureMatchesPageUrl(strippedCaptureUrl, rawPageUrl)).toBe(true);

    const validated = validateAyWebsCapturedPage(capture, rawPageUrl);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.price).toBeCloseTo(14.49, 2);
      expect(validated.currency).toBe('EUR');
      expect(validated.availability).toBe('AVAILABLE');
    }
    expect(capture.images[0]).toContain('kwcdn.com/product/');
    expect(capture.temu?.pageGoodsId).toBe('601099512345678');
  });
});

describe('AYWEBs — Qualité image produit Amazon & SHEIN + parité observer', () => {
  it('rejette la bannière Amazon Fashion `/images/G/` au profit de `#landingImage` (`/images/I/`)', () => {
    const url = 'https://www.amazon.fr/dp/B09XYZ1234';
    const html = `<!doctype html>
      <html lang="fr">
        <head>
          <title>Robe fluide femme : Amazon.fr</title>
          <meta property="og:image" content="https://m.media-amazon.com/images/G/08/fashion/WOMENS_CLOTHING_BANNER.jpg" />
        </head>
        <body>
          <div id="ppd">
            <span id="productTitle">Robe fluide femme manches longues</span>
            <div id="corePriceDisplay_desktop_feature_div">
              <span class="a-offscreen">29,99 €</span>
            </div>
            <img id="landingImage" src="https://m.media-amazon.com/images/I/71RealDressPhoto._AC_SL1500_.jpg" alt="Robe fluide" />
            <input id="add-to-cart-button" type="submit" value="Ajouter au panier" />
          </div>
        </body>
      </html>`;

    const capture = runCapture(html, url, 'amazon');
    expect(capture.images[0]).toContain('/images/I/71RealDressPhoto');
    expect(capture.images.some((img: string) => img.includes('/images/G/'))).toBe(false);
  });

  it('rejette le logo PWA « S » de SHEIN et lit `data-before-crop-src` de la galerie produit', () => {
    const url = 'https://m.shein.com/fr/Textured-Knit-Top-p-34567890.html';
    const html = `<!doctype html>
      <html lang="fr">
        <head>
          <title>Top en maille texturée | SHEIN</title>
          <meta property="og:image" content="https://img.ltwebstatic.com/pwa-icon/shein-app-icon-512.png" />
        </head>
        <body>
          <main>
            <h1>Top en maille texturée</h1>
            <div class="product-intro__head-mainprice">11,50€</div>
            <div class="goods-detail-v2-media-gallery">
              <img
                src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                data-before-crop-src="//img.ltwebstatic.com/images3_pi/2026/10/01/aa/1727700000abcdef1234567890_thumbnail_900x.webp"
                alt="Top en maille texturée"
              />
            </div>
            <button type="button">Ajouter au panier</button>
          </main>
        </body>
      </html>`;

    const capture = runCapture(html, url, 'shein');
    expect(capture.images[0]).toContain('images3_pi/');
    expect(capture.images.some((img: string) => img.includes('pwa-icon') || img.includes('app-icon'))).toBe(false);
  });

  it('maintient la parité fonctionnelle de `AYWEBS_NETWORK_OBSERVER_SCRIPT` entre serveur et mobile', () => {
    expect(AYWEBS_NETWORK_OBSERVER_SCRIPT).toContain('oak|poppy');
    expect(MOBILE_NETWORK_OBSERVER_SCRIPT).toContain('oak|poppy');
    expect(MOBILE_NETWORK_OBSERVER_SCRIPT.endsWith('true;')).toBe(true);
  });
});
