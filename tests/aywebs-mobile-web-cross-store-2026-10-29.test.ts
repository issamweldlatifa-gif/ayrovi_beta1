/**
 * AYWEBs — Suite de non-régression Mobile Web multi-boutiques (`m.<store>.com` + H5)
 * et correctifs appareil réel `m.shein.com` (29/10/2026).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-mobile-web-')), 'cache');

import { QatafoDatabase } from '../src/db/database';
import { calculatePrice, DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { AYWEBS_NETWORK_OBSERVER_SCRIPT, buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { analyzeAyWebsUrl } from '../src/aywebs/browser';
import { AmazonAdapter } from '../src/aywebs/adapters/amazon';
import { sheinVariantPageUrl } from '../src/aywebs/adapters/shein';
import { ayWebsComparableHost, detectAyWebsStore } from '../shared/aywebsStores';

const SESSION_ID = 'mobile-web-cross-store-20261029';

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
    cleanPastedUrl: (v: string) => String(v).trim(),
    scrapeProduct: vi.fn(async () => {
      throw new Error('UNEXPECTED_SERVER_SCRAPE_FALLBACK');
    }),
  };
  const ctx = createAyWebsContext(db, scraper as any);
  return { db, scraper, ctx };
}

function runCapture(html: string, url: string, storeId: string, beforeCapture?: (win: any) => void): Record<string, any> {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  try {
    if (beforeCapture) beforeCapture(dom.window);
    const raw = dom.window.eval(buildAyWebsCaptureScript(storeId)) as string;
    return JSON.parse(raw);
  } finally {
    dom.window.close();
  }
}

describe('AYWEBs Mobile Web (`m.<store>.com` + H5) — Cross-Store & Appareil Réel `m.shein.com`', () => {
  it('1. Normalisation d’hôtes mobiles et détection de fiches mobiles/locales (Amazon, SHEIN, Zalando, ASOS, Etsy, TEMU, AliExpress)', () => {
    expect(ayWebsComparableHost('m.shein.com')).toBe('shein.com');
    expect(ayWebsComparableHost('m2.hm.com')).toBe('hm.com');
    expect(ayWebsComparableHost('mobile.walmart.com')).toBe('walmart.com');
    expect(ayWebsComparableHost('smile.amazon.com')).toBe('amazon.com');
    /* Ne confond jamais les sous-domaines de pays/devise distincts */
    expect(ayWebsComparableHost('ca.shein.com')).toBe('ca.shein.com');
    expect(ayWebsComparableHost('fr.shein.com')).toBe('fr.shein.com');

    const mobileProductUrls: Array<[string, string]> = [
      ['https://m.amazon.fr/gp/aw/d/B09V3KXJPB?psc=1', 'amazon'],
      ['https://m.amazon.com/d/Echo-Dot-5th-Gen/B09B8V1LZ3', 'amazon'],
      ['https://m.shein.com/fr/2pcs-Ensemble-jupe-en-jean-fille-p-41204567.html', 'shein'],
      ['https://m.temu.com/fr/ensemble-ete-g-601099512345678.html', 'temu'],
      ['https://m.aliexpress.com/item/1005007788990011.html', 'aliexpress'],
      ['https://m.zalando.fr/fr/nike-sportswear-air-max-ni112o0bt-q11.html', 'zalando'],
      ['https://m.asos.com/fr/asos-design/robe-midi/prd/205112233', 'asos'],
      ['https://m.etsy.com/fr/listing/1599887766/bague-argent-artisanale', 'etsy'],
    ];

    const h = createHarness();
    for (const [url, expectedStore] of mobileProductUrls) {
      const store = detectAyWebsStore(url);
      expect(store?.id).toBe(expectedStore);
      const analysis = analyzeAyWebsUrl(url, h.scraper as any);
      expect(analysis.storeId).toBe(expectedStore);
      expect(analysis.isProductPage).toBe(true);
      expect(analysis.captureInjection).toBe('product_page');
    }

    const amazonAdapter = new AmazonAdapter({} as any);
    expect(amazonAdapter.canonicalUrl('https://m.amazon.fr/gp/aw/d/B09V3KXJPB?th=1')).toBe('https://www.amazon.fr/dp/B09V3KXJPB');
    expect(amazonAdapter.canonicalUrl('https://m.amazon.com/d/Echo-Dot/B09B8V1LZ3')).toBe('https://www.amazon.com/dp/B09B8V1LZ3');

    expect(sheinVariantPageUrl('https://m.shein.com/fr/Jupe-fille-p-41204567.html', '41206543'))
      .toBe('https://m.shein.com/fr/-p-41206543.html');
    expect(sheinVariantPageUrl('https://fr.shein.com/Robe-fleurie-p-382460229.html', '400991122'))
      .toBe('https://fr.shein.com/-p-400991122.html');
  });

  it('2. m.shein.com (DOM pur sans global JS — reproduction exacte des 15 captures appareil réel) : vrai titre/image contre og:* générique, 4 couleurs dont double « Jean Bleu », rejet du déclencheur groupé « 6-9M- 2-3Y ▼ », prix $28.60 en TND sur 4Y uniquement (0 héritage sur les autres tailles)', async () => {
    const h = createHarness();
    const url = 'https://m.shein.com/fr/2pcs-Ensemble-jupe-en-jean-fille-p-41204567.html';
    const html = `<!doctype html><html lang="fr"><head>
      <title>Vêtements homme &amp; femme, shoppez la mode en ligne | SHEIN</title>
      <meta property="og:title" content="Vêtements homme &amp; femme, shoppez la mode en ligne | SHEIN">
      <meta property="og:image" content="https://img.ltwebstatic.com/images3_acp/default_shein_logo_share.png">
      <meta property="product:price:amount" content="28.10">
      <meta property="product:price:currency" content="USD">
      <link rel="canonical" href="https://fr.shein.com/2pcs-Ensemble-jupe-en-jean-fille-p-41204567.html">
    </head><body>
      <div class="goods-detail">
        <div class="goods-img-swiper">
          <img data-src="//img.ltwebstatic.com/images3_pi/2026/10/29/41204567_real_outfit.jpg" alt="Ensemble jupe en jean">
        </div>
        <h1 class="goods-name__text">Ensemble 2 pièces veste et jupe en jean pour petite fille</h1>
        <div class="goods-price">
          <div class="goods-price__main"><span>$</span><span>28</span><span>.60</span></div>
        </div>
        <div class="goods-color">
          <div class="goods-color__title">Couleur: Jean Bleu</div>
          <div class="goods-color__item active" role="radio" aria-checked="true" data-goods-id="41204567" data-color-name="Jean Bleu">
            <img data-src="//img.ltwebstatic.com/images3_pi/2026/10/29/41204567_swatch_bleu1.jpg" alt="Jean Bleu">
          </div>
          <div class="goods-color__item" role="radio" aria-checked="false" data-goods-id="41206543" data-color-name="Jean Bleu" style="background-image: url('//img.ltwebstatic.com/images3_pi/2026/10/29/41206543_swatch_bleu2.jpg')">
          </div>
          <div class="goods-color__item" role="radio" aria-checked="false" data-goods-id="41207890" data-color-name="Noir">
            <img data-lazy="//img.ltwebstatic.com/images3_pi/2026/10/29/41207890_swatch_noir.jpg" alt="Noir">
          </div>
          <div class="goods-color__item" role="radio" aria-checked="false" data-goods-id="41208901" data-color-name="Jean Clair">
            <img srcset="//img.ltwebstatic.com/images3_pi/2026/10/29/41208901_swatch_clair.jpg 1x" alt="Jean Clair">
          </div>
        </div>
        <div class="goods-size">
          <div class="goods-size__title">Taille: 4Y (98-104 cm) <a class="size-guide">Guide des tailles</a></div>
          <button type="button" class="size-dropdown-trigger" aria-haspopup="listbox">6-9M- 2-3Y ▼</button>
          <div class="goods-size__item" role="radio" aria-checked="false"><span class="goods-size__item-text">3Y</span></div>
          <div class="goods-size__item active" role="radio" aria-checked="true"><span class="goods-size__item-text">4Y</span></div>
          <div class="goods-size__item" role="radio" aria-checked="false"><span class="goods-size__item-text">5Y</span></div>
          <div class="goods-size__item" role="radio" aria-checked="false"><span class="goods-size__item-text">6Y</span></div>
          <div class="goods-size__item" role="radio" aria-checked="false"><span class="goods-size__item-text">7Y</span></div>
        </div>
        <div class="goods-bottom">
          <button class="product-intro__add-btn">Ajouter au panier</button>
        </div>
      </div>
    </body></html>`;

    const captured = runCapture(html, url, 'shein');

    /* 1) Vrai titre et vraie photo produit (pas le titre générique ni le logo « S ») */
    expect(captured.title).toBe('Ensemble 2 pièces veste et jupe en jean pour petite fille');
    expect(captured.images[0]).toBe('https://img.ltwebstatic.com/images3_pi/2026/10/29/41204567_real_outfit.jpg');
    expect(captured.images.some((img: string) => /logo/i.test(img))).toBe(false);

    /* 2) Les 4 couleurs distinctes sont présentes avec leurs vraies vignettes (data-src, background-image, data-lazy, srcset) */
    const colorGroup = captured.variantGroups.find((g: any) => g.name === 'Couleur');
    expect(colorGroup.values).toEqual([
      'Jean Bleu · 4567',
      'Jean Bleu · 6543',
      'Noir',
      'Jean Clair',
    ]);
    expect(colorGroup.selected).toEqual(['Jean Bleu · 4567']);
    for (const opt of colorGroup.options) {
      expect(opt.image).toMatch(/^https:\/\/img\.ltwebstatic\.com\//);
    }

    /* 3) Le déclencheur groupé « 6-9M- 2-3Y ▼ » est filtré ; « 4Y (98-104 cm) » est enrichi ;
          SEULE la taille active « 4Y (98-104 cm) » porte le prix $28.60 ! */
    const sizeGroup = captured.variantGroups.find((g: any) => g.name === 'Taille');
    expect(sizeGroup.values).toEqual(['3Y', '4Y (98-104 cm)', '5Y', '6Y', '7Y']);
    expect(sizeGroup.selected).toEqual(['4Y (98-104 cm)']);
    const opt4Y = sizeGroup.options.find((o: any) => o.value === '4Y (98-104 cm)');
    const opt6Y = sizeGroup.options.find((o: any) => o.value === '6Y');
    expect(opt4Y.price).toBe('$28.60');
    expect(opt6Y.price).toBeNull();

    /* 4) Résolution serveur : 28.60 USD vérifié + conversion immédiate en TND, ZÉRO fallback serveur ! */
    const resolved4Y = await resolveAyWebsProduct(h.ctx.resolver, {
      url,
      storeId: 'shein',
      sessionId: SESSION_ID,
      capture: captured,
      selectedVariant: { Couleur: 'Jean Bleu · 4567', Taille: '4Y (98-104 cm)' },
    });
    expect(resolved4Y.capture?.used).toBe(true);
    expect(resolved4Y.capture?.rejection).toBeFalsy();
    expect(resolved4Y.product.price).toBe(28.6);
    expect(resolved4Y.product.currency).toBe('USD');
    const expectedTnd = calculatePrice(pricingRules(), 28.6, 'USD', {
      title: resolved4Y.product.title,
      quantity: 1,
    });
    expect(resolved4Y.product.ayroviPricing?.totalTnd).toBe(expectedTnd.totalTND);
    expect(resolved4Y.product.ayroviPricing!.totalTnd).toBeGreaterThan(90);

    /* 5) Sélection d'une taille non prouvée (6Y) sur cette page DOM-only : refus honnête PRICE_UNAVAILABLE (jamais $28.60 emprunté) */
    await expect(resolveAyWebsProduct(h.ctx.resolver, {
      url,
      storeId: 'shein',
      sessionId: SESSION_ID,
      capture: captured,
      selectedVariant: { Couleur: 'Jean Bleu · 4567', Taille: '6Y' },
    })).rejects.toMatchObject({ code: 'PRICE_UNAVAILABLE' });
  });

  it('3. m.shein.com H5 (`goodsDetailv2SsrData` + BFF `sku_price_list` > 220 Ko via `AYWEBS_NETWORK_OBSERVER_SCRIPT`) : matrice complète par âge et URL sœur `/fr/-p-<id>.html`', async () => {
    const h = createHarness();
    const url = 'https://m.shein.com/fr/2pcs-Ensemble-jupe-en-jean-fille-p-41204567.html';
    const html = `<!doctype html><html lang="fr"><head>
      <meta property="og:title" content="Vêtements homme &amp; femme | SHEIN">
    </head><body>
      <div class="goods-detail">
        <h1 class="goods-name__text">Ensemble jupe en jean fille</h1>
        <div class="goods-price__main"><span>$</span><span>28</span><span>.60</span></div>
        <div class="goods-size">
          <div class="goods-size__title">Taille: 4Y (98-104 cm)</div>
          <div class="goods-size__item" role="radio" aria-checked="false"><span class="goods-size__item-text">3Y</span></div>
          <div class="goods-size__item active" role="radio" aria-checked="true"><span class="goods-size__item-text">4Y</span></div>
          <div class="goods-size__item" role="radio" aria-checked="false"><span class="goods-size__item-text">6Y</span></div>
        </div>
        <button class="product-intro__add-btn">Ajouter au panier</button>
      </div>
    </body></html>`;

    /* Réponse BFF temps réel > 220 Ko (auparavant tronquée par le plafond 180 Ko) */
    const largePadding = 'x'.repeat(230_000);
    const bffRealtimePayload = JSON.stringify({
      info: {
        goods_id: '41204567',
        currency: 'USD',
        padding: largePadding,
        sku_price_list: [
          { sku_code: 'SKU_3Y', attr_value_name: '3Y (92-98 cm)', stock: 9, sale_price: { amount: '28.10', currency: 'USD' } },
          { sku_code: 'SKU_4Y', attr_value_name: '4Y (98-104 cm)', stock: 5, sale_price: { amount: '28.60', currency: 'USD' } },
          { sku_code: 'SKU_6Y', attr_value_name: '6Y (110-116 cm)', stock: 4, sale_price: { amount: '30.40', currency: 'USD' } },
        ],
      },
    });

    const captured = runCapture(html, url, 'shein', (win) => {
      win.goodsDetailv2SsrData = {
        productIntroData: {
          currency: 'USD',
          detail: {
            goods_id: '41204567',
            goods_sn: 'sn41204567',
            goods_name: 'Ensemble 2pcs jupe en jean fille',
            is_on_sale: 1,
            sale_price: { amount: '28.10', currency: 'USD' },
            mainSaleAttribute: [{ attr_value_name: 'Jean Bleu' }],
            original_img: '//img.ltwebstatic.com/images3_pi/2026/10/29/41204567_main.jpg',
          },
          relation_color: [
            {
              goods_id: '41206543',
              mainSaleAttribute: [{ attr_value_name: 'Jean Bleu' }],
              goods_color_image: '//img.ltwebstatic.com/images3_pi/2026/10/29/41206543_sw.jpg',
              is_on_sale: 1,
            },
          ],
          attrSizeList: [
            { sku_code: 'SKU_3Y', attr_value_name: '3Y (92-98 cm)', stock: 9 },
            { sku_code: 'SKU_4Y', attr_value_name: '4Y (98-104 cm)', stock: 5 },
            { sku_code: 'SKU_6Y', attr_value_name: '6Y (110-116 cm)', stock: 4 },
          ],
        },
      };
      win.fetch = () => Promise.resolve({
        headers: { get: () => 'application/json' },
        clone: () => ({ text: () => Promise.resolve(bffRealtimePayload) }),
      });
      win.eval(AYWEBS_NETWORK_OBSERVER_SCRIPT);
    });

    /* En JSDOM synchrone, simulons aussi la résolution de la promesse fetch de l'observateur */
    const domAsync = new JSDOM(html, { url, runScripts: 'outside-only' });
    let capturedWithNet: Record<string, any>;
    try {
      domAsync.window.goodsDetailv2SsrData = {
        productIntroData: {
          currency: 'USD',
          detail: {
            goods_id: '41204567',
            goods_sn: 'sn41204567',
            goods_name: 'Ensemble 2pcs jupe en jean fille',
            is_on_sale: 1,
            sale_price: { amount: '28.10', currency: 'USD' },
            mainSaleAttribute: [{ attr_value_name: 'Jean Bleu' }],
            original_img: '//img.ltwebstatic.com/images3_pi/2026/10/29/41204567_main.jpg',
          },
          relation_color: [
            {
              goods_id: '41206543',
              mainSaleAttribute: [{ attr_value_name: 'Jean Bleu' }],
              goods_color_image: '//img.ltwebstatic.com/images3_pi/2026/10/29/41206543_sw.jpg',
              is_on_sale: 1,
            },
          ],
          attrSizeList: [
            { sku_code: 'SKU_3Y', attr_value_name: '3Y (92-98 cm)', stock: 9 },
            { sku_code: 'SKU_4Y', attr_value_name: '4Y (98-104 cm)', stock: 5 },
            { sku_code: 'SKU_6Y', attr_value_name: '6Y (110-116 cm)', stock: 4 },
          ],
        },
      };
      const siblingBffPayload = JSON.stringify({
        info: {
          detail: { goods_id: '41206543' },
          attrSizeList: [
            { sku_code: 'SKU_SIB_4Y', attr_value_name: '4Y (98-104 cm)', stock: 6, sale_price: { amount: '29.20', currency: 'USD' } },
          ],
        },
      });
      (domAsync.window as any).fetch = (reqUrl: string) => Promise.resolve({
        headers: { get: () => 'application/json' },
        clone: () => ({
          text: () => Promise.resolve(reqUrl.includes('41206543') ? siblingBffPayload : bffRealtimePayload),
        }),
      });
      domAsync.window.eval(AYWEBS_NETWORK_OBSERVER_SCRIPT);
      await (domAsync.window as any).fetch('https://m.shein.com/bff-api/product/realtime_data?goods_id=41204567');
      await (domAsync.window as any).fetch('https://m.shein.com/bff-api/product/detail?goods_id=41206543');
      await new Promise((r) => setTimeout(r, 15));
      capturedWithNet = JSON.parse(domAsync.window.eval(buildAyWebsCaptureScript('shein')) as string);
    } finally {
      domAsync.window.close();
    }

    expect(captured).toBeDefined();
    const currentEntry = capturedWithNet.variantMatrix.find((m: any) => m.variantId === 'SKU_3Y');
    const siblingEntry = capturedWithNet.variantMatrix.find((m: any) => m.variantId === 'SKU_SIB_4Y');
    expect(currentEntry?.variantUrl).toBe('https://m.shein.com/fr/-p-41204567.html');
    expect(siblingEntry?.variantUrl).toBe('https://m.shein.com/fr/-p-41206543.html');

    const res3Y = await resolveAyWebsProduct(h.ctx.resolver, {
      url,
      storeId: 'shein',
      sessionId: SESSION_ID,
      capture: capturedWithNet,
      selectedVariant: { Couleur: 'Jean Bleu · 4567', Taille: '3Y (92-98 cm)' },
    });
    const res6Y = await resolveAyWebsProduct(h.ctx.resolver, {
      url,
      storeId: 'shein',
      sessionId: SESSION_ID,
      capture: capturedWithNet,
      selectedVariant: { Couleur: 'Jean Bleu · 4567', Taille: '6Y (110-116 cm)' },
    });
    expect(res3Y.product.price).toBe(28.1);
    expect(res6Y.product.price).toBe(30.4);
    expect(res6Y.product.ayroviPricing!.totalTnd).toBeGreaterThan(res3Y.product.ayroviPricing!.totalTnd);

    /* Sécurité devise sur m.shein.com/ca/... : $ nu ne doit jamais inventer USD */
    const caMobileUrl = 'https://m.shein.com/ca/Dress-p-77334455.html';
    const caMobileHtml = `<!doctype html><html lang="en"><head>
      <meta property="product:price:amount" content="19.99">
    </head><body>
      <div class="goods-detail">
        <h1 class="goods-name__text">Dress</h1>
        <div class="goods-price__main">$19.99</div>
        <button class="product-intro__add-btn">Add to Bag</button>
      </div>
    </body></html>`;
    const caVerdict = validateAyWebsCapturedPage(runCapture(caMobileHtml, caMobileUrl, 'shein'), caMobileUrl);
    expect(caVerdict.ok).toBe(true);
    if (caVerdict.ok) {
      expect(caVerdict.currencyVerified).toBe(false);
      expect(caVerdict.currency).toBe('');
    }
  });

  it('4. Amazon Mobile Web (`m.amazon.fr/gp/aw/d/<ASIN>`) + TEMU Mobile (`m.temu.com`) + Zalando Mobile (`m.zalando.fr`)', async () => {
    const h = createHarness();

    /* A. Amazon Mobile Web (/gp/aw/d/<ASIN> sur m.amazon.fr avec canonical www.amazon.fr) */
    const amzMobileUrl = 'https://m.amazon.fr/gp/aw/d/B09V3KXJPB?psc=1';
    const amzMobileHtml = `<!doctype html><html lang="fr"><head>
      <link rel="canonical" href="https://www.amazon.fr/dp/B09V3KXJPB">
    </head><body>
      <div id="dp">
        <h1 id="title">Écouteurs Bluetooth Sans Fil Noir</h1>
        <div id="mobile-image-block"><img src="https://m.media-amazon.com/images/I/61earbuds._AC_SL1500_.jpg" alt="Écouteurs"></div>
        <div id="apex_mobile">
          <span id="apex-pricetopay-accessibility-label">49,99 €</span>
          <span class="a-price priceToPay" data-a-color="base">
            <span class="a-offscreen"></span>
            <span class="a-price-whole">49,</span><span class="a-price-fraction">99</span><span class="a-price-symbol">€</span>
          </span>
        </div>
        <div id="mobile_buybox">
          <div id="availability"><span>En stock</span></div>
          <input id="add-to-cart-button" type="submit" value="Ajouter au panier">
        </div>
        <div id="twister-plus-mobile-inline-twister">
          <script>
            var dataToReturn = {
              "asinVariationValues": {
                "B09V3KXJPB": { "color_name": "0" },
                "B09V3KXJPC": { "color_name": "1" }
              },
              "variationValues": { "color_name": ["Noir", "Blanc"] },
              "dimensions": ["color_name"],
              "currentAsin": "B09V3KXJPB"
            };
          </script>
        </div>
      </div>
    </body></html>`;

    const amzCaptured = runCapture(amzMobileHtml, amzMobileUrl, 'amazon');
    expect(amzCaptured.reader).toEqual({ id: 'amazon', version: 4 });
    expect(amzCaptured.amazon?.readerVersion).toBe(2);
    expect(amzCaptured.canonicalUrl).toBe('https://www.amazon.fr/dp/B09V3KXJPB');
    expect(amzCaptured.amazon?.pageAsin).toBe('B09V3KXJPB');

    const amzResolved = await resolveAyWebsProduct(h.ctx.resolver, {
      url: amzMobileUrl,
      storeId: 'amazon',
      sessionId: SESSION_ID,
      capture: amzCaptured,
      selectedVariant: { color: 'Noir' },
    });
    expect(amzResolved.capture?.used).toBe(true);
    expect(amzResolved.missing).toEqual([]);
    expect(amzResolved.product.title).toBe('Écouteurs Bluetooth Sans Fil Noir');
    expect(amzResolved.product.price).toBe(49.99);
    expect(amzResolved.product.currency).toBe('EUR');
    expect(amzResolved.product.ayroviPricing!.totalTnd).toBeGreaterThan(150);

    /* Usurpation d'hôte croisé toujours rejetée */
    const spoofedVerdict = validateAyWebsCapturedPage(
      { ...amzCaptured, canonicalUrl: 'https://www.amazon.de/dp/B09V3KXJPB' },
      amzMobileUrl,
    );
    expect(spoofedVerdict.ok).toBe(false);
    if (!spoofedVerdict.ok) expect(spoofedVerdict.rejection).toBe('CANONICAL_HOST_MISMATCH');

    /* B. TEMU Mobile Web (m.temu.com avec prix éclaté en spans et état embarqué) */
    const temuUrl = 'https://m.temu.com/fr/lampe-bureau-led-g-601099512345678.html';
    const temuHtml = `<!doctype html><html lang="fr"><head>
      <title>Lampe de bureau LED pliable</title>
      <meta property="product:price:currency" content="EUR">
    </head><body>
      <h1 data-testid="product-title">Lampe de bureau LED pliable</h1>
      <img data-src="https://img.kwcdn.com/product/fancy/lampe-led-main.jpg" alt="Lampe">
      <div data-testid="pdp-price"><span>14</span><span>,99</span><span>€</span></div>
      <button>Ajouter au panier</button>
    </body></html>`;
    const temuCaptured = runCapture(temuHtml, temuUrl, 'temu', (win) => {
      win.rawData = {
        store: {
          currency: 'EUR',
          goods: { goodsId: '601099512345678', minOnSalePriceStr: '14,99 €' },
        },
      };
    });
    const temuVerdict = validateAyWebsCapturedPage(temuCaptured, temuUrl);
    expect(temuVerdict.ok).toBe(true);
    if (temuVerdict.ok) {
      expect(temuVerdict.price).toBe(14.99);
      expect(temuVerdict.currency).toBe('EUR');
      expect(temuVerdict.priceVerified).toBe(true);
      expect(temuVerdict.scraped?.externalId).toBe('TEMU-601099512345678');
    }

    /* C. Zalando Mobile Web (m.zalando.fr avec vignettes couleur en lazy data-src) */
    const zalUrl = 'https://m.zalando.fr/nike-sportswear-air-max-ni112o0bt-q11.html';
    const zalHtml = `<!doctype html><html lang="fr"><head>
      <script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'Product',
        name: 'Nike Air Max 90',
        image: 'https://img01.ztat.net/article/ni112o0bt-q11/main.jpg',
        offers: { '@type': 'Offer', price: '139.95', priceCurrency: 'EUR', availability: 'https://schema.org/InStock' },
      })}</script>
    </head><body>
      <h1>Nike Air Max 90</h1>
      <div data-testid="pdp-color-picker">
        <a href="/nike-sportswear-air-max-ni112o0bt-q11.html" aria-current="true" aria-label="Couleur : Noir">
          <img data-src="https://img01.ztat.net/article/ni112o0bt-q11/thumb_noir.jpg" alt="Noir">
        </a>
        <a href="/nike-sportswear-air-max-ni112o0bt-a11.html" aria-label="Couleur : Blanc">
          <img data-src="https://img01.ztat.net/article/ni112o0bt-a11/thumb_blanc.jpg" alt="Blanc">
        </a>
      </div>
    </body></html>`;
    const zalCaptured = runCapture(zalHtml, zalUrl, 'zalando');
    const zalColors = zalCaptured.variantGroups.find((g: any) => g.name === 'Couleur');
    expect(zalColors?.values).toEqual(['Noir', 'Blanc']);
    expect(zalColors?.options[0]?.image).toBe('https://img01.ztat.net/article/ni112o0bt-q11/thumb_noir.jpg');
    expect(zalColors?.options[1]?.image).toBe('https://img01.ztat.net/article/ni112o0bt-a11/thumb_blanc.jpg');
  });
});
