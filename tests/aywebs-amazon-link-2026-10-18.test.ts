/**
 * AYWEBs — fiche Amazon « Android 16 Tablet with Keyboard » (B0H4Z118GH), lien
 * collé le 18/10/2026. Trois verrous :
 *
 *   1. L'ADAPTATEUR reconnaît la fiche par son ASIN (et non par le slug du titre),
 *      et la capture part de la forme canonique `/dp/<ASIN>` ;
 *   2. LE LECTEUR (script servi au WebView) lit le prix VENDU de la zone d'achat
 *      et ignore les offres annexes « Add a protection plan » ($39.99, $16.99/mois),
 *      qui sont dans la même colonne. Sans ce filtre, deux montants distincts
 *      font abstenir le lecteur ;
 *   3. LE SERVEUR accepte la charge utile du lecteur (prix + devise prouvés).
 *
 * Limite honnête : le bac à sable n'atteint pas amazon.com en direct. Le texte de
 * la fiche a été relu via un rendu (pas le DOM) : le DOM ci-dessous est une
 * RECONSTRUCTION des motifs observés (prix, « In Stock », offres annexes), pas une
 * capture brute. Il ne prouve pas le comportement exact d'Amazon ce jour-là.
 */
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { JSDOM } from 'jsdom';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { AmazonAdapter, amazonAsinFromUrl, amazonCanonicalProductUrl } from '../src/aywebs/adapters/amazon';
import { QatafoDatabase } from '../src/db/database';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { ensureAyWebsSchema } from '../src/aywebs/schema';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';

/** Lien tel que collé par l'utilisateur (entités HTML `&amp;` comprises). */
const PASTED_URL =
  'https://www.amazon.com/Android-16-Tablet-Keyboard-1920x1200/dp/B0H4Z118GH/?_encoding=UTF8&amp;pd_rd_w=OrRqS&amp;content-id=amzn1.sym.aa1335cb-e9ea-4ad7-8400-b1b2ed30e365&amp;pf_rd_p=aa1335cb-e9ea-4ad7-8400-b1b2ed30e365&amp;pf_rd_r=M5FBCY4JEYEEZ31STP59&amp;pd_rd_wg=LLiTm&amp;pd_rd_r=90b70cca-e0de-4c65-8b73-050643a6776b&amp;ref_=pd_hp_mw_btf_dealz_dotdaamazon';
const CANONICAL = 'https://www.amazon.com/dp/B0H4Z118GH';

const adapter = new AmazonAdapter({} as any);

describe('adaptateur Amazon — reconnaissance par ASIN', () => {
  it('reconnaît la fiche collée (avec entités &amp;) comme PRODUIT', () => {
    expect(amazonAsinFromUrl(PASTED_URL)).toBe('B0H4Z118GH');
    expect(adapter.classifyPage(PASTED_URL)).toMatchObject({
      pageType: 'PRODUCT',
      storeId: 'amazon',
      isProductPage: true,
    });
  });

  it('forme canonique : /dp/<ASIN> sur le même hôte, sans slug ni suivi', () => {
    expect(amazonCanonicalProductUrl(PASTED_URL)).toBe(CANONICAL);
    expect(amazonCanonicalProductUrl('https://www.amazon.fr/Tablette-Clavier/dp/B0H4Z118GH?ref=x')).toBe(
      'https://www.amazon.fr/dp/B0H4Z118GH',
    );
    expect(amazonCanonicalProductUrl('https://www.amazon.com/s?k=tablet')).toBeNull();
  });

  it('un slug qui contient un mot-clé de page (auth, cart) ne fait pas basculer en LOGIN/CHECKOUT', () => {
    const url = 'https://www.amazon.com/Authentic-Cart-Keyboard-Tablet/dp/B0H4Z118GH/';
    expect(adapter.classifyPage(url)).toMatchObject({ pageType: 'PRODUCT', isProductPage: true });
  });

  it('une recherche reste une RECHERCHE, et un domaine étranger reste refusé', () => {
    expect(adapter.classifyPage('https://www.amazon.com/s?k=tablet')).toMatchObject({ pageType: 'SEARCH' });
    expect(adapter.classifyPage('https://amazon.com.evil.com/dp/B0H4Z118GH')).toMatchObject({ storeId: null });
  });
});

/**
 * Reconstruction des motifs observés sur la fiche (texte rendu du 18/10/2026) :
 * prix vendu $153.89 dans la colonne d'achat, disponibilité « In Stock », et
 * deux offres annexes au prix différent dans la MÊME colonne.
 */
const PAGE = `<!doctype html><html lang="en"><head><title>Amazon.com: Android 16 Tablet</title></head><body>
<div id="dp-container"><div id="ppd">
  <div id="desktop_buybox">
    <div id="corePriceDisplay_desktop_feature_div">
      <span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> $153.89 </span>
      <span class="a-price priceToPay apex-pricetopay-value">
        <span class="a-offscreen"> </span>
        <span aria-hidden="true">
          <span class="a-price-symbol">$</span>
          <span class="a-price-whole">153<span class="a-price-decimal">.</span></span>
          <span class="a-price-fraction">89</span>
        </span>
      </span>
    </div>
    <div id="availability"><span class="a-size-medium a-color-success">In Stock</span></div>
    <div id="attachDisplayAddBasket" class="a-section">
      <div class="a-box-inner">
        <div class="a-popover-wrapper">
          <span class="a-price priceToPay"><span class="a-offscreen">$39.99</span></span>
          <span class="a-price"><span class="a-offscreen">$16.99</span></span>
        </div>
      </div>
    </div>
  </div>
</div></div>
</body></html>`;

function captureFrom(pageHtml: string, url: string) {
  const dom = new JSDOM(pageHtml, { url: CANONICAL });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  const payload = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL)));
  return { payload, validation: validateAyWebsCapturedPage(payload, url) };
}

describe('lecteur client — zone d’achat seulement', () => {
  it('lit le prix vendu et ignore les offres annexes (protection) de la colonne d’achat', () => {
    const { payload } = captureFrom(PAGE, CANONICAL);
    const texts = (payload.priceCandidates as Array<{ text: string }>).map((c) => c.text);
    expect(texts.some((t) => /153\.89/.test(t))).toBe(true);
    expect(texts.some((t) => /39\.99|16\.99/.test(t))).toBe(false);
  });

  it('le serveur accepte la capture : prix 153.89 USD, disponibilité en stock', () => {
    const { validation } = captureFrom(PAGE, CANONICAL);
    expect(validation.ok).toBe(true);
    expect(validation.price).toBe(153.89);
    expect(validation.currency).toBe('USD');
    expect(validation.currencyVerified).toBe(true);
    expect(validation.availability).toBe('AVAILABLE');
  });
});

/* ── Le lien collé, sur les vraies routes HTTP AYWEBs ─────────────────────── */

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

const LINK_SESSION = { 'x-session-id': 'amazon-link-session-2026-10-18' };

describe('lien collé — routes HTTP AYWEBs', () => {
  function app() {
    const scrapeProduct = vi.fn(async (url: string) => ({
      id: 'scraped_amazon_link', store: 'amazon', storeName: 'AMAZON', url,
      externalId: 'B0H4Z118GH', title: 'Android 16 Tablet with Keyboard', description: 'Tablet',
      images: ['https://m.media-amazon.com/images/I/41w598SdZZL.jpg'],
      mainImage: 'https://m.media-amazon.com/images/I/41w598SdZZL.jpg',
      sourcePrice: 153.89, sourceCurrency: 'USD', convertedPriceTND: 0,
      estimatedShippingTND: 0, serviceFeeTND: 0, totalPriceTND: 0,
      variants: { colors: [], sizes: [], details: [] },
      availability: 'in_stock' as const, brand: null, priceVerified: true, currencyVerified: true,
      verificationProvider: 'direct', verificationMethod: 'json_ld', verificationFailureCode: null,
      scrapedAt: '2026-10-18T07:00:00.000Z',
    }));
    const scraper = { cleanPastedUrl: (value: string) => value.trim(), scrapeProduct };
    const db = new QatafoDatabase(':memory:');
    ensureAyWebsSchema(db);
    vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
    const server = express();
    server.use(express.json());
    server.use((req, _res, next) => { (req as any).requestId = 'link-test'; next(); });
    server.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as any));
    return { server, scrapeProduct };
  }

  it('/page/analyze : le lien collé est une fiche produit Amazon', async () => {
    const { server } = app();
    const response = await request(server).post('/api/v1/aywebs/page/analyze').set(LINK_SESSION).send({ url: PASTED_URL });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.data).toMatchObject({ store_id: 'amazon', page_type: 'PRODUCT', is_product_page: true });
  });

  it('deux liens vers la même fiche partagent UNE entrée de cache (une seule lecture payée)', async () => {
    const { server, scrapeProduct } = app();
    const other = 'https://www.amazon.com/dp/B0H4Z118GH?ref=sr_1_1&tag=anything';
    await request(server).post('/api/v1/aywebs/product/resolve').set(LINK_SESSION).send({ url: PASTED_URL });
    await request(server).post('/api/v1/aywebs/product/resolve').set(LINK_SESSION).send({ url: other });
    expect(scrapeProduct).toHaveBeenCalledTimes(1);
  });

  it('/product/resolve : la capture part de la forme canonique /dp/<ASIN>', async () => {
    const { server, scrapeProduct } = app();
    await request(server).post('/api/v1/aywebs/product/resolve').set(LINK_SESSION).send({ url: PASTED_URL });
    expect(scrapeProduct).toHaveBeenCalled();
    for (const call of scrapeProduct.mock.calls) expect(call[0]).toBe(CANONICAL);
  });
});
