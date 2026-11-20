/** AYWEBs: merchant identity, FX, and Amazon.it capture through the unified catalogue flow. */
import { JSDOM } from 'jsdom';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { ayWebsMarketOf, ayWebsResolveMarketCacheKey } from '../src/aywebs/resolveCache';
import { ayWebsMarketReadUrl } from '../src/aywebs/adapters/marketUrl';
import { QatafoDatabase } from '../src/db/database';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { ensureAyWebsSchema } from '../src/aywebs/schema';
import { DEFAULT_CUSTOMS_CATEGORIES, getExchangeRate, type PricingRules } from '../src/services/pricing';
import { parseFxSnapshot } from '../src/services/fxRates';

const capturedAt = () => new Date().toISOString();

function page(url: string, extra: Record<string, unknown> = {}) {
  return {
    v: 1,
    url,
    canonicalUrl: null,
    capturedAt: capturedAt(),
    title: 'Robe midi plissée',
    brand: '',
    images: ['https://img.example.com/robe.jpg'],
    priceCandidates: [{ text: '€24.90', source: 'dom' }],
    currencyText: null,
    availabilityText: null,
    addToCartText: 'Ajouter au panier',
    conditionText: null,
    selectedVariantTexts: [],
    variantTexts: [],
    ...extra,
  };
}

describe('prix Zalando', () => {
  const url = 'https://www.zalando.fr/robe-midi-zz111a00b-q11.html';
  it('Zalando : « 24,90 € » lu hors JSON-LD est prouvé EUR (P1-1)', () => {
    const result = validateAyWebsCapturedPage(page(url, { priceCandidates: [{ text: '24,90 €', source: 'dom' }] }), url);
    expect(result.currency).toBe('EUR');
    expect(result.currencyVerified).toBe(true);
  });
});

describe('P1-1 — un « $ » qui n’est pas américain', () => {
  const cases: Array<[string, string]> = [
    ['https://www.temu.com/au/robe-g-601099512345678.html', '$12.99'],
    ['https://www.temu.com/ca/robe-g-601099512345678.html', '$12.99'],
    ['https://www.temu.com/mx/robe-g-601099512345678.html', '$129.00'],
    ['https://fr.aliexpress.com/item/1005006123456789.html', 'C$ 24.90'],
    ['https://fr.aliexpress.com/item/1005006123456789.html', 'AU $24.90'],
    ['https://fr.aliexpress.com/item/1005006123456789.html', 'MX$249.00'],
  ];
  for (const [url, price] of cases) {
    it(`${new URL(url).pathname.split('/')[1] || new URL(url).hostname} « ${price} » ⇒ jamais USD prouvé`, () => {
      const result = validateAyWebsCapturedPage(page(url, { priceCandidates: [{ text: price, source: 'dom' }] }), url);
      expect(result.currency === 'USD' && result.currencyVerified).toBe(false);
    });
  }

  it('TEMU marché US et « US $ » AliExpress restent USD', () => {
    const temu = 'https://www.temu.com/robe-g-601099512345678.html';
    expect(validateAyWebsCapturedPage(page(temu, { priceCandidates: [{ text: '$12.99', source: 'dom' }] }), temu).currency).toBe('USD');
    const ae = 'https://www.aliexpress.com/item/1005006123456789.html';
    expect(validateAyWebsCapturedPage(page(ae, { priceCandidates: [{ text: 'US $24.90', source: 'dom' }] }), ae).currency).toBe('USD');
  });
});

describe('P2-5 — devises nationales des domaines Amazon', () => {
  const cases: Array<[string, string, string]> = [
    ['https://www.amazon.pl/dp/B0TESTPL01', '129,99 zł', 'PLN'],
    ['https://www.amazon.se/dp/B0TESTSE01', '1 299 kr', 'SEK'],
    ['https://www.amazon.com.tr/dp/B0TESTTR01', '1.299,00 TL', 'TRY'],
    ['https://www.amazon.in/dp/B0TESTIN01', '₹1,299.00', 'INR'],
    ['https://www.amazon.eg/dp/B0TESTEG01', 'EGP 1,299.00', 'EGP'],
    ['https://www.amazon.sa/dp/B0TESTSA01', '129.00 ريال', 'SAR'],
    ['https://www.amazon.ca/dp/B0TESTCA09', '$49.99', 'CAD'],
  ];
  for (const [url, price, iso] of cases) {
    it(`${new URL(url).hostname} « ${price} » ⇒ ${iso}`, () => {
      const result = validateAyWebsCapturedPage(page(url, { priceCandidates: [{ text: price, source: 'dom' }] }), url);
      expect(result.ok, result.notes.join(' ')).toBe(true);
      expect(result.currency).toBe(iso);
      expect(result.currencyVerified).toBe(true);
    });
  }
});

describe('P1-2 — identité SHEIN / TEMU', () => {
  it('SHEIN : goods_id de la page ≠ URL ⇒ PRODUCT_IDENTITY_MISMATCH', () => {
    const url = 'https://fr.shein.com/robe-p-382460229.html';
    const result = validateAyWebsCapturedPage(page(url, { shein: { pageGoodsId: '111111111' } }), url);
    expect(result.rejection).toBe('PRODUCT_IDENTITY_MISMATCH');
  });

  it('SHEIN : changement de COULEUR (pastilles sœurs) accepté sous l’identité de la couleur affichée', () => {
    const url = 'https://fr.shein.com/robe-p-382460229.html';
    const result = validateAyWebsCapturedPage(page(url, {
      shein: { pageGoodsId: '382460300' },
      variantGroups: [{ name: 'Couleur', values: ['Noir', 'Rouge'], selected: ['Rouge'], options: [{ value: 'Noir', goodsId: '382460229' }, { value: 'Rouge', goodsId: '382460300' }] }],
    }), url);
    expect(result.ok, result.notes.join(' ')).toBe(true);
    expect(result.scraped?.externalId).toBe('SHEIN-382460300');
    expect(result.notes.join(' ')).toContain('shein_color_switch');
  });

  it('TEMU : goods_id de la page ≠ URL ⇒ PRODUCT_IDENTITY_MISMATCH', () => {
    const url = 'https://www.temu.com/robe-g-601099512345678.html';
    const result = validateAyWebsCapturedPage(page(url, { temu: { pageGoodsId: '601099599999999' } }), url);
    expect(result.rejection).toBe('PRODUCT_IDENTITY_MISMATCH');
  });
});

describe('P1-3 — le marché du client', () => {
  it('le marché entre dans la clé de cache ; `/dp/` n’est pas un marché', () => {
    expect(ayWebsMarketOf('https://www.temu.com/uk/robe-g-601099512345678.html')).toBe('temu.com/uk');
    expect(ayWebsMarketOf('https://fr.shein.com/robe-p-382460229.html')).toBe('fr.shein.com');
    expect(ayWebsMarketOf('https://www.amazon.com/dp/B0H4Z118GH')).toBe('amazon.com');
    const canonical = 'https://www.temu.com/-g-601099512345678.html';
    expect(ayWebsResolveMarketCacheKey('temu', canonical, 'https://www.temu.com/uk/robe-g-601099512345678.html'))
      .not.toBe(ayWebsResolveMarketCacheKey('temu', canonical, 'https://www.temu.com/robe-g-601099512345678.html'));
  });

  it('la lecture serveur garde l’hôte et le chemin du marché, sans suivi', () => {
    expect(ayWebsMarketReadUrl('https://www.temu.com/uk/robe-g-601099512345678.html?utm_source=x&_x_ads=1#top'))
      .toBe('https://www.temu.com/uk/robe-g-601099512345678.html');
  });
});

describe('taux de change secondaires (live, jamais codés en dur)', () => {
  it('parseFxSnapshot publie CAD/PLN/SEK… ; getExchangeRate les lit', () => {
    const snapshot = parseFxSnapshot({ rates: { TND: 3.4, USD: 1.08, GBP: 0.85, JPY: 160, CAD: 1.5, PLN: 4.3, SEK: 11.5, XXX: 0 } });
    expect(snapshot?.extraRates?.CAD).toBeCloseTo(3.4 / 1.5, 5);
    expect(snapshot?.extraRates?.PLN).toBeCloseTo(3.4 / 4.3, 5);
    expect(snapshot?.extraRates?.XXX).toBeUndefined();
    const rules = { ...pricingRules(), extraRates: { CAD: 2.26 } };
    expect(getExchangeRate(rules, 'CAD')).toBe(2.26);
    expect(getExchangeRate(rules, 'SEK')).toBeNull();
  });
});

const AMAZON_PAGE = (checked: 'Graphite Black' | 'none', qty = '2') => `<!doctype html><html lang="en"><head><title>Casque Bluetooth</title></head><body><div id="dp">
  <span id="productTitle">Casque Bluetooth</span>
  <div id="corePriceDisplay_desktop_feature_div">
    <span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> $89.99 </span>
    <span class="a-price priceToPay"><span class="a-offscreen"> </span><span aria-hidden="true"><span class="a-price-symbol">$</span><span class="a-price-whole">89<span class="a-price-decimal">.</span></span><span class="a-price-fraction">99</span></span></span>
  </div>
  <div id="availability"><span class="a-color-success">In Stock</span></div>
  <select id="quantity" name="quantity"><option value="1">1</option><option value="2" ${qty === '2' ? 'selected' : ''}>2</option></select>
  <div id="inline-twister-row-color_name"><ul>
    <li id="color_name_0" data-csa-c-item-id="asin.B0GRAPHITE" ${checked === 'Graphite Black' ? 'aria-checked="true"' : ''}><img alt="Graphite Black"><span class="a-price"><span class="a-offscreen">$89.99</span></span></li>
    <li id="color_name_1" data-csa-c-item-id="asin.B0RED00001"><img alt="Ruby Red"><span class="a-price"><span class="a-offscreen">$94.50</span></span></li>
  </ul></div>
</div></body></html>`;

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

function app() {
  const scraper = {
    cleanPastedUrl: (value: string) => value.trim(),
    scrapeProduct: vi.fn(async () => { throw new Error('fixture: no merchant network'); }),
  };
  const db = new QatafoDatabase(':memory:');
  ensureAyWebsSchema(db);
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const server = express();
  server.use(express.json());
  server.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as never));
  return { server, scraper };
}

it('Amazon.it : le lecteur servi par défaut lie XS au prix en euros et produit un devis signé', async () => {
  // An old production flag cannot revive the deleted flow.
  vi.stubEnv('AYWEBS_SELECTION_CAPTURE', 'all');
  try {
    const url = 'https://www.amazon.it/dp/B0GRAPHITE';
    const html = AMAZON_PAGE('Graphite Black')
      .replace('lang="en"', 'lang="it"').replace('Casque Bluetooth', 'Giacca di prova')
      .replaceAll('color_name', 'size_name').replaceAll('Graphite Black', 'XS').replaceAll('Ruby Red', 'S')
      .replaceAll('$89.99', '89,99 €').replaceAll('$94.50', '94,50 €').replace('>$</span>', '>€</span>')
      .replace('>89<span class="a-price-decimal">.</span>', '>89<span class="a-price-decimal">,</span>')
      .replace('In Stock', 'Disponibilità immediata');
    const { server } = app();
    const script = await request(server).get('/api/v1/aywebs/capture/script.js?store_id=amazon');
    expect(script.headers['x-aywebs-capture-principle']).toBe('matrix');
    const dom = new JSDOM(html, { url });
    const evaluate = new Function('window', 'document', 'location', 'URL', `return ${script.text}`);
    const capture = JSON.parse(String(evaluate(dom.window, dom.window.document, dom.window.location, URL)));
    expect(capture.selectedVariantTexts).toContain('XS');
    expect(capture.pageQuantity).toBe(2);
    expect(capture.captureMode).toBeUndefined();
    const group = capture.amazon.options.find((option: { value: string }) => option.value === 'XS').name;
    const response = await request(server).post('/api/v1/aywebs/product/resolve')
      .set({ 'x-session-id': 'aywebs-amazon-it-matrix' })
      .send({ url, store_id: 'amazon', capture, variant: { [group]: 'XS' } });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.data).toMatchObject({ price: 89.99, currency: 'EUR' });
    expect(response.body.quote_token).toBeTruthy();
    expect(response.body.capture).toMatchObject({ used: true, corroborated: true });
    expect(response.body.data.zayrovi_pricing?.total_tnd).toBeGreaterThan(0);
  } finally { vi.unstubAllEnvs(); }
});

describe('quantité affichée par la page = quantité par défaut (resolve + ajout panier)', () => {
  it('capturedPageQuantity : entier 1…99 seulement', async () => {
    const { capturedPageQuantity } = await import('../src/aywebs/routes');
    expect(capturedPageQuantity({ pageQuantity: 3 })).toBe(3);
    expect(capturedPageQuantity({ pageQuantity: 0 })).toBeNull();
    expect(capturedPageQuantity({ pageQuantity: 2.5 })).toBeNull();
    expect(capturedPageQuantity({ pageQuantity: '4' })).toBeNull();
    expect(capturedPageQuantity(null)).toBeNull();
  });
});
