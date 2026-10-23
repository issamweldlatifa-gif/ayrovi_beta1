/**
 * AYWEBs — ثمن كل لون يمرّ بقانون التسعير على الخادم (23/10/2026).
 *
 * ما كان يصرا: المستخدم يبدّل اللون داخل الورقة، فالخادم يجاوب
 * « selection_not_verified_by_capture » لأنّه كان يعرف قيمة واحدة فقط: الّتي
 * كانت معروضة على الصفحة. الآن الصفحة تنشر لكل قيمة حالتها وثمنها، فالخادم
 * يحكم على التركيبة المطلوبة من هذه الحقائق — والثمن يمرّ على `calculatePrice`
 * كما يمرّ ثمن الصفحة، بلا قراءة ثانية وبلا اختراع.
 *
 * هذا الملف يشتغل على السكربت الحقيقي (pages HTML) وعلى المسارات الحقيقية،
 * ويتحقّق من أربع حالات:
 *   1. لون له ثمنه ⇒ ثمن الخادم = ثمن القيمة، والدينار محسوب على الخادم؛
 *   2. لون منشور بلا ثمن ⇒ رفض صريح (PRICE_UNAVAILABLE)، ماشي ثمن لون آخر؛
 *   3. لون منشور «épuisé» ⇒ OUT_OF_STOCK، بلا إضافة؛
 *   4. لون غير منشور ⇒ VARIANT_UNKNOWN.
 */
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { ayWebsSelectionEvidence } from '../src/aywebs/variantEvidence';
import { QatafoDatabase } from '../src/db/database';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { ensureAyWebsSchema } from '../src/aywebs/schema';
import { calculatePrice, DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';

const PAGE_URL = 'https://www.amazon.com/dp/B0GRAPHITE';

type Capture = {
  priceCandidates: Array<{ text: string; source: string }>;
  selectedVariantTexts: string[];
  availabilityText: string | null;
  variantGroups?: Array<{
    name: string;
    values: string[];
    selected?: string[];
    options?: Array<{ value: string; available?: true | false | null; price?: string | null; priceFrom?: boolean; stock?: number | null }>;
  }>;
  amazon?: unknown;
};

function run(html: string, url = PAGE_URL): Capture {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL))) as Capture;
}

const PRICE_BLOCK = (whole: string, fraction = '99', symbol = '$'): string => `
  <div id="corePriceDisplay_desktop_feature_div">
    <span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> ${symbol}${whole}.${fraction} </span>
    <span class="a-price priceToPay">
      <span class="a-offscreen"> </span>
      <span aria-hidden="true">
        <span class="a-price-symbol">${symbol}</span>
        <span class="a-price-whole">${whole}<span class="a-price-decimal">.</span></span>
        <span class="a-price-fraction">${fraction}</span>
      </span>
    </span>
  </div>`;

function page(body: string): string {
  return `<!doctype html><html lang="en"><head><title>Casque Bluetooth</title></head><body><div id="dp">${body}</div></body></html>`;
}

/* Trois couleurs :
   • Graphite Black : 89,99 $ — c'est la couleur affichée (prix de page) ;
   • Ruby Red       : 94,50 $ — prix publié sur sa propre pastille ;
   • Cloud White    : aucune pastille de prix, « Sold out » ;
   • Sand           : aucune pastille de prix, mais annoncée en stock. */
const COLOURS = page(`
  ${PRICE_BLOCK('89', '99')}
  <div id="availability"><span class="a-color-success">In Stock</span></div>
  <div id="inline-twister-row-color_name">
    <ul>
      <li id="color_name_0" data-csa-c-item-id="asin.B0GRAPHITE" aria-checked="true">
        <img alt="Graphite Black">
        <span class="a-price"><span class="a-offscreen">$89.99</span></span>
        <span>Only 6 left in stock</span>
      </li>
      <li id="color_name_1" data-csa-c-item-id="asin.B0RED00001">
        <img alt="Ruby Red">
        <span class="a-price"><span class="a-offscreen">$94.50</span></span>
        <span>Only 2 left in stock</span>
      </li>
      <li id="color_name_2" data-csa-c-item-id="asin.B0WHITE001">
        <img alt="Cloud White">
        <span class="swatchUnavailable">Sold out</span>
      </li>
      <li id="color_name_3" data-csa-c-item-id="asin.B0SAND0001">
        <img alt="Sand">
        <span>In Stock</span>
      </li>
    </ul>
  </div>`);

const CAPTURE = run(COLOURS);

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

const SESSION = { 'x-session-id': 'aywebs-variant-price-2026-10-23' };

function app() {
  const scraper = {
    cleanPastedUrl: (value: string) => value.trim(),
    scrapeProduct: vi.fn(async () => { throw new Error('la capture ne doit PAS déclencher de lecture marchande'); }),
  };
  const db = new QatafoDatabase(':memory:');
  ensureAyWebsSchema(db);
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const server = express();
  server.use(express.json());
  server.use((req, _res, next) => { (req as { requestId?: string }).requestId = 'variant-price-test'; next(); });
  server.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as never));
  return { server, scraper };
}

describe('la page publie un état et un prix PAR valeur', () => {
  const validation = validateAyWebsCapturedPage(CAPTURE, PAGE_URL);

  it('la capture est acceptée et nomme ses valeurs', () => {
    expect(validation.ok, JSON.stringify(validation.notes)).toBe(true);
    const group = validation.variantGroups.find((entry) => /colou?r/i.test(entry.name));
    expect(group?.values).toEqual(['Graphite Black', 'Ruby Red', 'Cloud White', 'Sand']);
  });

  it('chaque valeur garde SON état et SON prix (le barré n’est jamais le prix)', () => {
    const group = validation.variantGroups.find((entry) => /colou?r/i.test(entry.name))!;
    const byValue = new Map((group.options || []).map((option) => [option.value, option]));
    expect(byValue.get('Graphite Black')).toMatchObject({ price: '$89.99', available: true, stock: 6 });
    expect(byValue.get('Ruby Red')).toMatchObject({ price: '$94.50', available: true, stock: 2 });
    expect(byValue.get('Cloud White')).toMatchObject({ available: false });
    expect(byValue.get('Cloud White')!.price ?? null).toBeNull();
  });

  it('l’évidence de sélection répond valeur par valeur, jamais en bloc', () => {
    const evidence = ayWebsSelectionEvidence(validation.variantGroups, { color: 'Ruby Red' }, { currency: 'USD' });
    expect(evidence.complete).toBe(true);
    expect(evidence.available).toBe(true);
    expect(evidence.shownCombination).toBe(false);
    expect(evidence.price).toBe(94.5);
    expect(evidence.priceFrom).toBe(false);

    const blocked = ayWebsSelectionEvidence(validation.variantGroups, { color: 'Cloud White' }, { currency: 'USD' });
    expect(blocked.blocked).toBe(true);

    /* « Sand » n'annonce ni état ni prix : la capture ne prouve RIEN pour elle. */
    const unpriced = ayWebsSelectionEvidence(validation.variantGroups, { color: 'Sand' }, { currency: 'USD' });
    expect(unpriced.complete).toBe(true);
    expect(unpriced.available).toBe(false);
    expect(unpriced.price).toBeNull();
  });

  it('« 5 options from $56.32 » n’est jamais le prix de la valeur', () => {
    /* Même contrat côté Amazon : le drapeau `priceFrom` traverse le nettoyage. */
    const amazonCapture = {
      ...CAPTURE,
      variantGroups: [],
      amazon: {
        pageAsin: 'B0GRAPHITE', selectedAsin: 'B0GRAPHITE', variants: [],
        options: [
          { dimension: 'Color', value: 'Graphite Black', asin: 'B0GRAPHITE', selected: true, availabilityEvidence: 'available', price: '$89.99', stock: 6 },
          { dimension: 'Color', value: 'Pink', asin: 'B0PINK0002', selected: false, availabilityEvidence: 'unknown', price: '$56.32', priceFrom: true },
        ],
      },
    };
    const cleaned = validateAyWebsCapturedPage(amazonCapture, PAGE_URL);
    const group = cleaned.variantGroups.find((entry) => entry.name.toLowerCase() === 'color')!;
    const pink = group.options!.find((option) => option.value === 'Pink')!;
    expect(pink).toMatchObject({ price: '$56.32', priceFrom: true });

    const evidence = ayWebsSelectionEvidence(cleaned.variantGroups, { color: 'Pink' }, { currency: 'USD' });
    expect(evidence.priceFrom).toBe(true);
    expect(evidence.available).toBe(false);
  });

  it('une devise publiée qui contredit la devise de la page ne devient jamais un prix', () => {
    const evidence = ayWebsSelectionEvidence(
      [{ name: 'Couleur', values: ['Rouge'], selected: [], options: [{ value: 'Rouge', available: true, price: '120,00 €' }] }],
      { couleur: 'Rouge' },
      { currency: 'USD' },
    );
    expect(evidence.price).toBeNull();
    expect(evidence.currencyMismatch).toBe(true);
  });
});

describe('le serveur cote la COMBINAISON demandée depuis la capture', () => {
  it('l’autre couleur : son propre prix marchand, et le total TND recalculé ici', async () => {
    const { server } = app();
    const response = await request(server)
      .post('/api/v1/aywebs/product/resolve')
      .set(SESSION)
      .send({ url: PAGE_URL, capture: CAPTURE, variant: { color: 'Ruby Red' } });

    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.data.price).toBe(94.5);
    expect(response.body.data.currency).toBe('USD');
    expect(response.body.data.availability.state).toBe('AVAILABLE');
    /* Le prix TND n'est pas recopié de la page : il est calculé sur le serveur
       à partir du prix de LA VALEUR. */
    const expected = calculatePrice(pricingRules(), 94.5, 'USD', { title: response.body.data.title });
    expect(response.body.data.ayrovi_pricing.total_tnd).toBeCloseTo(expected.totalTND, 2);
    expect(response.body.quote_token).toBeTruthy();
    expect(response.body.capture.used).toBe(true);
    /* La page de test ne publie aucune image : seul champ non lu, et il ne bloque pas. */
    expect(response.body.missing_fields).toEqual(['image']);
  });

  it('la couleur affichée garde le prix de la page (comportement historique intact)', async () => {
    const { server } = app();
    const response = await request(server)
      .post('/api/v1/aywebs/product/resolve')
      .set(SESSION)
      .send({ url: PAGE_URL, capture: CAPTURE, variant: { color: 'Graphite Black' } });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.data.price).toBe(89.99);
  });

  it('une couleur épuisée est refusée pour ELLE, même si la page est achetable', async () => {
    const { server } = app();
    const response = await request(server)
      .post('/api/v1/aywebs/product/resolve')
      .set(SESSION)
      .send({ url: PAGE_URL, capture: CAPTURE, variant: { color: 'Cloud White' } });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.data.availability.state).toBe('OUT_OF_STOCK');
    expect(String(response.body.data.availability.reason)).toContain('selection_option_out_of_stock');
  });

  it('une couleur sans prix publié ⇒ AUCUN devis (jamais le prix d’une autre)', async () => {
    const { server } = app();
    const response = await request(server)
      .post('/api/v1/aywebs/product/resolve')
      .set(SESSION)
      .send({ url: PAGE_URL, capture: CAPTURE, variant: { color: 'Sand' } });
    expect(response.status, JSON.stringify(response.body)).toBe(422);
    expect(response.body.code).toBe('PRICE_UNAVAILABLE');
    expect(response.body.quote_token ?? null).toBeNull();
  });

  it('une couleur qui n’existe pas sur la page ⇒ VARIANT_UNKNOWN', async () => {
    const { server } = app();
    const response = await request(server)
      .post('/api/v1/aywebs/product/resolve')
      .set(SESSION)
      .send({ url: PAGE_URL, capture: CAPTURE, variant: { color: 'Mauve' } });
    expect(response.status, JSON.stringify(response.body)).toBe(409);
    expect(response.body.code).toBe('VARIANT_UNKNOWN');
  });
});
