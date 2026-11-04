/**
 * AYWEBs — ورقة الاختيار على Amazon: الدليل من الصفحة، والحكم من الخادم
 * (23/10/2026، بعد تقرير الجهاز).
 *
 * ما كان يصرا على الجهاز:
 *   1. الورقة تفتح بلا لون ولا مقاس، وتقول «التاجر ما نشر حتى خيار»؛
 *   2. لا ثمن، فقط جملة ثابتة «الثمن يحسبو الخادم… (§45)»؛
 *   3. الإضافة ترفض: `CAPTURE_INCOMPLETE` / `missing_fields:["verified_price"]`.
 *
 * الأسباب (مقروءة في الكود، موش مُخمّنة):
 *   • `dimensionValuesDisplayData` وحدها تعطي «dimension 1 / dimension 2» لأن
 *     `variationValues` فارغة، وبلا ASIN للقيمة ⇒ لا توفّر، لا اختيار افتراضي،
 *     ولا خريطة قيمة ⇒ ASIN. طاولة الـtwister (`sortedDimValuesForAllDims`) ما
 *     كانتش تتقرا: فيها الاسم، والـASIN، والحالة (SELECTED/AVAILABLE/UNAVAILABLE)؛
 *   • Amazon ما تنشرش JSON-LD، و`.a-offscreen` داخل بلوك الثمن فارغ في الصفحة
 *     المقيسة ⇒ القراءة الوحيدة `dom`؛ والتصديق يتطلّب مصدرين مختلفين.
 *
 * هذا الملف يقفل العقود الثلاثة: الاختيار من البيانات، الثمن بمصدرين، والحكم
 * النهائي على الخادم (تصديق + توفّر + دليل الاختيار).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

import { buildAyWebsCaptureScript } from '../src/aywebs/captureScript';
const AYWEBS_CAPTURE_SCRIPT = buildAyWebsCaptureScript('amazon');
import { validateAyWebsCapturedPage } from '../src/aywebs/webviewCapture';
import { QatafoDatabase } from '../src/db/database';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { ensureAyWebsSchema } from '../src/aywebs/schema';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';

const FIXTURE = readFileSync(join(__dirname, 'fixtures', 'amazon-product-page.html'), 'utf8');
const PAGE_URL = 'https://www.amazon.com/dp/B0GYM3V9H5';

type Capture = {
  priceCandidates: Array<{ text: string; source: string }>;
  selectedVariantTexts: string[];
  availabilityText: string | null;
  amazon: {
    pageAsin: string | null;
    selectedAsin: string | null;
    selectedValues: string[];
    options: Array<{
      dimension: string; value: string; asin: string | null; selected: boolean;
      availabilityEvidence: string; price?: string | null; stock?: number | null;
    }>;
    variants: Array<{ asin: string; selected: boolean; dimensions: Array<{ name: string; value: string }> }>;
  } | null;
};

function run(html: string, url = PAGE_URL): Capture {
  const dom = new JSDOM(html, { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  return JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL))) as Capture;
}

function page(body: string): string {
  return `<!doctype html><html lang="en"><head><title>x</title></head><body><div id="dp">${body}</div></body></html>`;
}

/** بلوك الثمن كما في الفيديو المرفق: « .a-offscreen » فارغ، والمبلغ مجزّأ. */
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

describe('fiche réelle — choix publié par les données du twister', () => {
  const capture = run(FIXTURE);

  it('nomme les dimensions (taille, couleur) au lieu de « dimension 1/2 »', () => {
    const names = new Set(capture.amazon!.options.map((option) => option.dimension));
    expect([...names].sort()).toEqual(['color', 'size']);
    const sizeVariant = capture.amazon!.variants.find((variant) => variant.asin === 'B0GYM3V9H5');
    expect(sizeVariant!.dimensions.map((dimension) => dimension.name).sort()).toEqual(['color', 'size']);
  });

  it('publie l’état de chaque valeur : « Large » est épuisé, les autres disponibles', () => {
    const byValue = new Map(capture.amazon!.options.map((option) => [option.value.toLowerCase(), option]));
    expect(byValue.get('large')!.availabilityEvidence).toBe('unavailable');
    expect(byValue.get('small')!.availabilityEvidence).toBe('available');
    expect(byValue.get('emerald leaf')!.availabilityEvidence).toBe('available');
  });

  it('donne l’ASIN de chaque valeur — sans lui, aucune variante n’est identifiable', () => {
    for (const option of capture.amazon!.options) expect(option.asin).toMatch(/^[A-Z0-9]{10}$/);
    expect(capture.amazon!.options.find((option) => option.value === 'Emerald Leaf')!.asin).toBe('B0GYM3V9H5');
  });

  it('publie la combinaison AFFICHÉE (ASIN de page + valeurs choisies)', () => {
    expect(capture.amazon!.selectedAsin).toBe('B0GYM3V9H5');
    expect(capture.amazon!.pageAsin).toBe('B0GYM3V9H5');
    expect(capture.amazon!.selectedValues).toEqual(['Small', 'Emerald Leaf']);
    expect(capture.selectedVariantTexts).toEqual(['Small', 'Emerald Leaf']);
  });
});

describe('الخادم — نفس الصفحة تمرّ الآن بالتصديق الكامل', () => {
  it('ثمن مصدّق + عملة مصدّقة + توفّر، مع شرط المصدرين (مسار Amazon)', () => {
    const validation = validateAyWebsCapturedPage(run(FIXTURE), PAGE_URL, { requireCorroboration: true });
    expect(validation.ok).toBe(true);
    expect(validation.price).toBe(109);
    expect(validation.currency).toBe('USD');
    expect(validation.priceVerified).toBe(true);
    expect(validation.corroborated).toBe(true);
    expect(validation.availability).toBe('AVAILABLE');
    expect(validation.scraped!.verificationFailureCode).toBeUndefined();
  });

  it('بلا شاهد ثانٍ، الرفض يبقى (ما نرخّصوش الشرط — نزيدو مصدراً حقيقياً)', () => {
    /* نموذج بلا étiquette d'accessibilité : قراءة واحدة « dom » فقط. */
    const solo = run(page(`${PRICE_BLOCK('89', '90')}`.replace(/id="apex-pricetopay-accessibility-label"[^>]*>[^<]*</, 'data-x="1"><')));
    const validation = validateAyWebsCapturedPage(solo, PAGE_URL, { requireCorroboration: true });
    expect(validation.ok).toBe(false);
    expect(validation.rejection).toBe('PRICE_NOT_CORROBORATED');
  });
});

describe('cartes de choix rendues — prix et stock par option', () => {
  /* Tracé des cartes actuelles : une rangée par dimension, un <li> par valeur,
     l'ASIN dans `data-csa-c-item-id`, le prix et le stock SUR la carte. */
  const CARDS = page(`
    ${PRICE_BLOCK('89', '99')}
    <div id="availability"><span class="a-color-success">In Stock</span></div>
    <div id="inline-twister-row-color_name">
      <ul>
        <li id="color_name_0" data-csa-c-item-id="asin.B0GRAPHITE">
          <img alt="Graphite Black">
          <span class="a-price"><span class="a-offscreen">$89.99</span></span>
          <span>Only 6 left in stock</span>
        </li>
        <li id="color_name_1" data-csa-c-item-id="asin.B0RED00001">
          <img alt="Ruby Red">
          <span class="a-price"><span class="a-offscreen">$94.50</span></span>
          <span class="a-price a-text-price"><span class="a-offscreen">$120.00</span></span>
          <span>Only 2 left in stock</span>
        </li>
        <li id="color_name_2" data-csa-c-item-id="asin.B0WHITE001">
          <img alt="Cloud White">
          <span class="swatchUnavailable">Sold out</span>
        </li>
      </ul>
    </div>`);

  const capture = run(CARDS);

  it('lit une rangée par dimension, sans imbriquer les blocs', () => {
    const dimensions = new Set(capture.amazon!.options.map((option) => option.dimension));
    expect([...dimensions]).toEqual(['color']);
  });

  it('lit l’ASIN de la carte (data-csa-c-item-id) et son état', () => {
    const byValue = new Map(capture.amazon!.options.map((option) => [option.value, option]));
    expect(byValue.get('Graphite Black')!.asin).toBe('B0GRAPHITE');
    expect(byValue.get('Cloud White')!.availabilityEvidence).toBe('unavailable');
  });

  it('publie le prix de la carte SANS le prix barré, et le stock annoncé', () => {
    const byValue = new Map(capture.amazon!.options.map((option) => [option.value, option]));
    expect(byValue.get('Graphite Black')!.price).toBe('$89.99');
    expect(byValue.get('Graphite Black')!.stock).toBe(6);
    expect(byValue.get('Ruby Red')!.price).toBe('$94.50');
    expect(byValue.get('Ruby Red')!.stock).toBe(2);
    expect(byValue.get('Cloud White')!.price ?? '').toBe('');
  });
});

describe('prix — familles de preuve', () => {
  it('étiquette + bloc d’accord ⇒ deux familles, même montant', () => {
    const capture = run(page(PRICE_BLOCK('89', '99')));
    expect(capture.priceCandidates).toEqual([
      { text: '$89.99', source: 'a11y_label' },
      { text: '$89.99', source: 'dom' },
    ]);
  });

  it('deux montants distincts dans la zone d’achat ⇒ aucun prix (abstention)', () => {
    const capture = run(page(`${PRICE_BLOCK('89')}<div id="corePrice_feature_div"><span class="a-price"><span class="a-offscreen">$74.00</span></span></div>`));
    expect(capture.priceCandidates).toEqual([]);
  });
});

/* ── Le parcours réel : capture → devis → ligne de panier ────────────────────
   C'est ici que le client s'est arrêté sur le téléphone : `product_resolve`
   renvoyait `CAPTURE_INCOMPLETE (verified_price)`, donc aucune feuille de choix.
   Le test passe par les VRAIES routes, avec la capture produite par le VRAI
   script sur la VRAIE page. */

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

const SESSION = { 'x-session-id': 'amazon-choice-sheet-2026-10-23' };

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
  server.use((req, _res, next) => { (req as { requestId?: string }).requestId = 'choice-sheet-test'; next(); });
  server.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as never));
  return { server, scraper };
}

describe('parcours réel — la capture CORROBORE le prix et l’ajout passe', () => {
  it('/product/resolve rend un prix vérifié et un devis signé (boutique à motif d’URL)', async () => {
    const { server, scraper } = app();
    const response = await request(server)
      .post('/api/v1/aywebs/product/resolve')
      .set(SESSION)
      .send({ url: PAGE_URL, capture: run(FIXTURE) });
    expect(response.status, JSON.stringify(response.body)).toBe(201);
    expect(response.body.data.price).toBe(109);
    expect(response.body.data.currency).toBe('USD');
    expect(response.body.data.price_verified).toBe(true);
    expect(response.body.capture).toMatchObject({ used: true, corroborated: true, price_source: 'a11y_label' });
    expect(response.body.quote_token).toBeTruthy();
    expect(response.body.quote_expires_at).toBeTruthy();
    /* Aucun champ manquant : c'est le refus `CAPTURE_INCOMPLETE` du téléphone qui disparaît. */
    expect(response.body.missing_fields).toEqual([]);
    /* La vérification par échantillon (asynchrone) peut relire la page ; elle ne
       doit jamais être la SOURCE du prix. C'est `capture.used` qui le prouve. */
    expect(response.body.capture.used).toBe(true);
    void scraper;
  });

  it('POST /cart/items : la combinaison choisie part avec sa quantité', async () => {
    const { server } = app();
    const capture = run(FIXTURE);
    const resolved = await request(server)
      .post('/api/v1/aywebs/product/resolve')
      .set(SESSION)
      .send({ url: PAGE_URL, capture });
    expect(resolved.status, JSON.stringify(resolved.body)).toBe(201);

    const added = await request(server)
      .post('/api/v1/aywebs/cart/items')
      .set(SESSION)
      .send({
        source_url: PAGE_URL,
        store_id: 'amazon',
        variant: { size: 'Small', color: 'Emerald Leaf' },
        quantity: 2,
        capture,
        quote_token: resolved.body.quote_token,
      });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body.data.item).toMatchObject({ quantity: 2, store_id: 'amazon' });
    expect(added.body.data.item.unit_price).toBe(109);
  });
});
