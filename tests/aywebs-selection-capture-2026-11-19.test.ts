/**
 * AYWEBs — « الحريف يختار ← AYWEBs يلتقط ← ZAYROVI تسعّر ← الحريف يؤكد » (19/11/2026).
 *
 * Le client choisit taille / couleur / version / quantité SUR LA PAGE du
 * marchand ; AYWEBs capte CE choix (deux lectures concordantes), jamais la
 * matrice des combinaisons ; ZAYROVI calcule le prix ; le client confirme.
 *
 * Couvre aussi les correctifs de l'audit du 19/11 :
 *   P1-1 « $ » préfixé / marché TEMU ≠ USD · P1-2 identité SHEIN/TEMU ·
 *   P1-3 marché dans la clé de cache et lecture du lien d'origine ·
 *   P2-5 devises des domaines Amazon · taux de change secondaires live.
 */
import { JSDOM } from 'jsdom';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { evaluateAyWebsSelection } from '../src/aywebs/selectionCapture';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { ayWebsMarketOf, ayWebsResolveMarketCacheKey } from '../src/aywebs/resolveCache';
import { ayWebsMarketReadUrl } from '../src/aywebs/adapters/marketUrl';
import {
  ayWebsCapturePrinciple,
  ayWebsSelectionCaptureDefault,
  resetAyWebsCaptureControlCache,
  setAyWebsCapturePrinciple,
} from '../src/aywebs/captureControl';
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

const SIZE_GROUP = (selected: string[] = []) => ({ name: 'Taille', values: ['S', 'M', 'L'], selected });
const COLOUR_GROUP = { name: 'Couleur', values: ['Noir', 'Rouge'], selected: ['Noir'], options: [{ value: 'Noir', image: 'https://img.example.com/noir.jpg' }, { value: 'Rouge', price: '€29.90', stock: 3 }] };

describe('évaluation de la sélection (règles fermées)', () => {
  const base = { storeId: 'shein', selectedVariantTexts: [] as string[], availability: 'UNKNOWN' as const, availabilityReason: 'capture_stock_unspecified' };

  it('groupe à choix sans valeur choisie ⇒ SELECTION_INCOMPLETE, jamais une valeur par défaut', () => {
    const verdict = evaluateAyWebsSelection(page('https://fr.shein.com/x-p-12345678.html') as never, {
      ...base, variantGroups: [COLOUR_GROUP, SIZE_GROUP()],
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.rejection).toBe('SELECTION_INCOMPLETE');
    expect(verdict.missingGroups).toEqual(['Taille']);
    expect(verdict.attributes.Taille).toBeUndefined();
  });

  it('choix complet ⇒ valeurs, image de la pastille, disponibilité NON confirmée (UNKNOWN)', () => {
    const verdict = evaluateAyWebsSelection(page('https://fr.shein.com/x-p-12345678.html', { pageQuantity: 2 }) as never, {
      ...base, variantGroups: [COLOUR_GROUP, SIZE_GROUP(['M'])],
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.attributes).toEqual({ Couleur: 'Noir', Taille: 'M' });
    expect(verdict.image).toBe('https://img.example.com/noir.jpg');
    expect(verdict.availability).toBe('UNKNOWN');
    expect(verdict.availabilityReason).toBe('selection_availability_unconfirmed');
    expect(verdict.pageQuantity).toBe(2);
  });

  it('un libellé lu comme « choisi » complète le groupe non marqué', () => {
    const verdict = evaluateAyWebsSelection(page('https://fr.shein.com/x-p-12345678.html') as never, {
      ...base, selectedVariantTexts: ['L'], variantGroups: [SIZE_GROUP()],
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.attributes).toEqual({ Taille: 'L' });
  });

  it('bouton d’achat désactivé / rupture / valeur indisponible ⇒ SELECTION_UNAVAILABLE', () => {
    const disabled = evaluateAyWebsSelection(page('https://fr.shein.com/x-p-12345678.html') as never, {
      ...base, availabilityReason: 'capture_add_control_disabled', variantGroups: [SIZE_GROUP(['M'])],
    });
    expect(disabled.rejection).toBe('SELECTION_UNAVAILABLE');
    const oos = evaluateAyWebsSelection(page('https://fr.shein.com/x-p-12345678.html') as never, {
      ...base, availability: 'OUT_OF_STOCK', variantGroups: [SIZE_GROUP(['M'])],
    });
    expect(oos.rejection).toBe('SELECTION_UNAVAILABLE');
    const value = evaluateAyWebsSelection(page('https://fr.shein.com/x-p-12345678.html') as never, {
      ...base, variantGroups: [{ name: 'Taille', values: ['S', 'M'], selected: ['M'], options: [{ value: 'M', available: false }] }],
    });
    expect(value.rejection).toBe('SELECTION_UNAVAILABLE');
  });

  it('« en stock » explicite ⇒ AVAILABLE ; deux lectures divergentes ⇒ SELECTION_NOT_PROVEN', () => {
    const ok = evaluateAyWebsSelection(page('https://fr.shein.com/x-p-12345678.html') as never, {
      ...base, availability: 'AVAILABLE', availabilityReason: 'in_stock_capture', variantGroups: [SIZE_GROUP(['S'])],
    });
    expect(ok.availability).toBe('AVAILABLE');
    const unstable = evaluateAyWebsSelection(page('https://fr.shein.com/x-p-12345678.html', { selection: { stable: false, reads: 2 } }) as never, {
      ...base, variantGroups: [SIZE_GROUP(['S'])],
    });
    expect(unstable.rejection).toBe('SELECTION_NOT_PROVEN');
  });

  it('Amazon : ASIN choisi ≠ fiche ouverte ⇒ refus ; identifiant lié à l’ASIN', () => {
    const mismatch = evaluateAyWebsSelection(page('https://www.amazon.com/dp/B0AAAAAAAA', {
      amazon: { pageAsin: 'B0AAAAAAAA', selectedAsin: 'B0BBBBBBBB' },
    }) as never, { ...base, storeId: 'amazon', variantGroups: [] });
    expect(mismatch.rejection).toBe('SELECTION_NOT_PROVEN');
    const ok = evaluateAyWebsSelection(page('https://www.amazon.com/dp/B0AAAAAAAA', {
      amazon: { pageAsin: 'B0AAAAAAAA', selectedAsin: 'B0AAAAAAAA' },
    }) as never, { ...base, storeId: 'amazon', variantGroups: [] });
    expect(ok.variantId).toBe('B0AAAAAAAA');
    expect(ok.variantIdSource).toBe('asin');
  });
});

describe('validation en mode sélection', () => {
  const url = 'https://www.zalando.fr/robe-midi-zz111a00b-q11.html';

  it('aucune matrice reconstruite, empreinte liée à l’option choisie', () => {
    const payload = page(url, {
      variantGroups: [SIZE_GROUP(['M'])],
      variantMatrix: [{ attributes: { Taille: 'L' }, price: '€19.90', available: true }],
    });
    const a = validateAyWebsCapturedPage(payload, url, { selectionMode: true });
    expect(a.ok, a.notes.join(' ')).toBe(true);
    expect(a.skuCombinations).toEqual([]);
    expect(a.selection?.attributes).toEqual({ Taille: 'M' });
    expect(a.notes).toContain('capture_mode:selection');
    const b = validateAyWebsCapturedPage({ ...payload, variantGroups: [SIZE_GROUP(['L'])] }, url, { selectionMode: true });
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });

  it('refus nommés : SELECTION_INCOMPLETE / SELECTION_UNAVAILABLE', () => {
    expect(validateAyWebsCapturedPage(page(url, { variantGroups: [SIZE_GROUP()] }), url, { selectionMode: true }).rejection)
      .toBe('SELECTION_INCOMPLETE');
    expect(validateAyWebsCapturedPage(page(url, { variantGroups: [SIZE_GROUP(['M'])], addToCartText: 'Ajouter [disabled]' }), url, { selectionMode: true }).rejection)
      .toBe('SELECTION_UNAVAILABLE');
  });

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

describe('principe de capture par boutique (CRM)', () => {
  const previous = process.env.AYWEBS_SELECTION_CAPTURE;
  afterAll(() => { process.env.AYWEBS_SELECTION_CAPTURE = previous; });

  it('défaut d’environnement, puis une ligne CRM l’emporte', () => {
    process.env.AYWEBS_SELECTION_CAPTURE = 'amazon,zalando';
    expect(ayWebsSelectionCaptureDefault('amazon')).toBe('selection');
    expect(ayWebsSelectionCaptureDefault('shein')).toBe('matrix');
    process.env.AYWEBS_SELECTION_CAPTURE = 'all';
    const db = new QatafoDatabase(':memory:');
    ensureAyWebsSchema(db);
    resetAyWebsCaptureControlCache(db);
    expect(ayWebsCapturePrinciple(db, 'shein')).toBe('selection');
    setAyWebsCapturePrinciple(db, { storeId: 'shein', principle: 'matrix', note: 'retour arrière test' });
    expect(ayWebsCapturePrinciple(db, 'shein')).toBe('matrix');
    expect(ayWebsCapturePrinciple(db, 'amazon')).toBe('selection');
  });
});

/* ── De bout en bout : script servi (enveloppe « sélection ») → serveur → panier ── */
const AMAZON_URL = 'https://www.amazon.com/dp/B0GRAPHITE';
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

function readTwice(html: string, url = AMAZON_URL) {
  const dom = new JSDOM(html, { url });
  const script = buildAyWebsCaptureScript('amazon', { mode: 'selection' });
  const evaluate = new Function('window', 'document', 'location', 'URL', `return ${script}`);
  const first = JSON.parse(String(evaluate(dom.window, dom.window.document, dom.window.location, URL)));
  const second = JSON.parse(String(evaluate(dom.window, dom.window.document, dom.window.location, URL)));
  return { first, second };
}

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
    scrapeProduct: vi.fn(async () => { throw new Error('mode sélection : aucune lecture marchande attendue'); }),
  };
  const db = new QatafoDatabase(':memory:');
  ensureAyWebsSchema(db);
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const server = express();
  server.use(express.json());
  server.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as never));
  return { server, scraper };
}

describe('de bout en bout — Amazon en mode sélection', () => {
  const previous = process.env.AYWEBS_SELECTION_CAPTURE;
  beforeAll(() => { process.env.AYWEBS_SELECTION_CAPTURE = 'all'; });
  afterAll(() => { process.env.AYWEBS_SELECTION_CAPTURE = previous; });

  it('le script servi lit le choix deux fois, sans matrice, avec la quantité affichée', () => {
    const { first, second } = readTwice(AMAZON_PAGE('Graphite Black'));
    expect(first.captureMode).toBe('selection');
    expect(first.variantMatrix).toEqual([]);
    expect(first.selection.reads).toBe(1);
    expect(second.selection).toMatchObject({ reads: 2, stable: true });
    expect(second.pageQuantity).toBe(2);
    expect(second.contract.mode).toBe('selection');
  });

  it('/capture/script.js sert l’enveloppe « sélection » selon le principe de la boutique', async () => {
    const { server } = app();
    const response = await request(server).get('/api/v1/aywebs/capture/script.js?store_id=amazon');
    expect(response.status).toBe(200);
    expect(response.headers['x-aywebs-capture-principle']).toBe('selection');
    expect(response.headers['x-aywebs-capture-bundle']).toBe('dedicated:amazon+selection');
  });

  it('résolution : le choix capté est renvoyé, une seule combinaison, devis signé', async () => {
    const { server, scraper } = app();
    const { second } = readTwice(AMAZON_PAGE('Graphite Black'));
    const response = await request(server)
      .post('/api/v1/aywebs/product/resolve')
      .set({ 'x-session-id': 'aywebs-selection-e2e' })
      .send({ url: AMAZON_URL, store_id: 'amazon', capture: second, quantity: 2 });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(scraper.scrapeProduct).not.toHaveBeenCalled();
    expect(response.body.captured_selection).toMatchObject({ mode: 'selection', page_quantity: 2, variant_id: 'B0GRAPHITE' });
    const chosen = Object.values(response.body.captured_selection.attributes);
    expect(chosen).toContain('Graphite Black');
    for (const group of response.body.data.variant_groups || []) expect(group.values.length).toBe(1);
    expect(response.body.data.variant_quotes).toEqual([]);
    expect(response.body.quote_token).toBeTruthy();
  });

  it('aucune couleur choisie sur la page ⇒ 422 « choisissez … sur la page du marchand »', async () => {
    const { server } = app();
    const { second } = readTwice(AMAZON_PAGE('none'));
    const response = await request(server)
      .post('/api/v1/aywebs/product/resolve')
      .set({ 'x-session-id': 'aywebs-selection-e2e-3' })
      .send({ url: AMAZON_URL, store_id: 'amazon', capture: second });
    expect(response.status, JSON.stringify(response.body)).toBe(422);
    expect(response.body.code).toBe('VARIANT_REQUIRED');
    expect(String(response.body.error)).toMatch(/sur la page du marchand/);
  });

  it('un choix qui contredit la page est refusé : on change d’option SUR la page', async () => {
    const { server } = app();
    const { second } = readTwice(AMAZON_PAGE('Graphite Black'));
    const group = Object.keys(validateAyWebsCapturedPage(second, AMAZON_URL, { selectionMode: true }).selection?.attributes || {})[0];
    const response = await request(server)
      .post('/api/v1/aywebs/product/resolve')
      .set({ 'x-session-id': 'aywebs-selection-e2e-2' })
      .send({ url: AMAZON_URL, store_id: 'amazon', capture: second, variant: { [group]: 'Ruby Red' } });
    expect(response.status).toBe(409);
    expect(response.body.code).toBe('VARIANT_UNKNOWN');
    expect(String(response.body.error)).toMatch(/page du marchand/);
  });
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
