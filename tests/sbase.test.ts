/**
 * S Base — بحث 1688 عبر Apify (مزوّد واحد منذ 26/11/2026).
 *
 * ما تحميه هذه الاختبارات:
 *   1. الكتالوغ صادق: مصدر واحد (1688 عبر actor Apify)، والكلفة المنشورة تُقال؛
 *   2. المزوّد يدير وضع run + polling، والصورة تمرّ في POST واحد بbase64 —
 *      بلا token في الرابط ولا في الجسم؛
 *   3. كل فشل بكوده الحقيقي — ولا فشل يتلبس «ما فماش نتائج» ولا «صورة غالطة»؛
 *   4. بلا مفتاح: رفض 503 قبل أي نداء مدفوع؛
 *   5. الكلفة/الزمن لكل متجر، والكاش 10 دقائق، والتقدير من محرّك السعر المنزلي؛
 *   6. العزل: لا aywebs، لا zayrovix، ولا أثر لأي مزوّد قديم في src.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  SBASE_IMAGE_SOURCES,
  SBASE_IMAGE_SOURCE,
  SBASE_SOURCES,
  describeSbaseSources,
  findSbaseSource,
  validateSbaseQuery,
} from '../src/sbase/descriptors';
import {
  APIFY_ALIEXPRESS_IMAGE_COST_USD,
  APIFY_DETAIL_COST_USD,
  APIFY_IMAGE_BASE64_BUDGET,
  APIFY_IMAGE_COST_USD,
  APIFY_SEARCH_COST_USD,
  apifyConfigured,
  apifyImageBase64,
  apifyImageEndpoint,
  mapApifyDetailRow,
  runApifyDetail,
  runApifySearch,
  searchApifyAliexpressByImage,
  searchApifyByImage,
} from '../src/sbase/apify';
import { extractProducts, missingFacets, normalizeProduct, parsePriceText } from '../src/sbase/extract';
import { extractDetail } from '../src/sbase/detail';
import { clearSbaseCache, createSbaseRouter } from '../src/sbase/routes';
import { sbaseImageFailureFrom } from '../src/sbase/image';

const APIFY_KEY = 'test_apify_token';

// Vraie petite image PNG générée localement : `sharp` la valide sans réseau.
let PHOTO: Buffer = Buffer.alloc(0);
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  PHOTO = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 240, g: 240, b: 240 } } })
    .png()
    .toBuffer();
});

/**
 * Règles de prix RÉELLES du moteur (`services/pricing`) : S Base ne calcule
 * rien lui-même, il lui passe juste de quoi lire ses règles.
 */
const RULES = {
  id: 'test', version: 7,
  rateEUR: 3.4, rateUSD: 3.15, rateGBP: 4.0, rateJPY: 0.021,
  exchangeBufferPercent: 3,
  freightPerKgTND: 12, localDeliveryTND: 7,
  commissionPercent: 12, minimumCommissionTND: 8,
  rpdPercent: 1, rpdMinimumTND: 0.5,
  defaultTvaRate: 0.19, expressFeeTND: 25,
  categories: [],
  // CNY vient du marché (fxRates) ; on le fournit ici comme le ferait le sync.
  extraRates: { CNY: 0.43 },
  fxSource: 'live',
  updatedAt: new Date().toISOString(),
};

function app(options: { pricingRules?: unknown } = {}) {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/sbase', createSbaseRouter({
    getPricingRules: () => (options.pricingRules === undefined ? (RULES as never) : (options.pricingRules as never)),
  }));
  return instance;
}

/** جدولة Apify: POST runs → GET actor-runs → GET datasets/items (+ الـServer actor للصورة). */
function stubApify(handlers: Array<(url: string, init?: RequestInit) => Response | null>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    for (const handler of handlers) {
      const response = handler(String(url), init);
      if (response) return response;
    }
    return new Response(JSON.stringify({ error: { type: 'unexpected-url' } }), { status: 500 });
  }));
  return calls;
}

const runQueued = () => new Response(JSON.stringify({
  data: { id: 'run_9', actId: 'act_1', status: 'READY', defaultDatasetId: 'ds_1' },
}), { status: 200 });

const runSucceeded = () => new Response(JSON.stringify({
  data: { id: 'run_9', status: 'SUCCEEDED', defaultDatasetId: 'ds_1' },
}), { status: 200 });

const apifyFlow = (dataset: unknown) => [
  (url: string) => (url.includes('/v2/acts/sourabhbgp~1688-scraper/runs')
    ? new Response(JSON.stringify({ data: { id: 'run_9', status: 'READY', defaultDatasetId: 'ds_1' } }), { status: 200 })
    : null),
  (url: string) => (url.includes('/v2/actor-runs/run_9')
    ? new Response(JSON.stringify({ data: { id: 'run_9', status: 'SUCCEEDED', defaultDatasetId: 'ds_1' } }), { status: 200 })
    : null),
  (url: string) => (url.includes('/v2/datasets/ds_1/items') ? new Response(JSON.stringify(dataset), { status: 200 }) : null),
];

/** صفّ بحث حقيقي كما ينشره README الـactor (قُريء 26/11/2026). */
const searchRow = {
  offerId: '1089329678023',
  title: 'New macaron bowl lid insulated tumbler - large capacity water bottle',
  priceUsd: 2.38,
  priceCny: 15.5,
  minOrderQuantity: 1,
  sales: '500+ sold',
  salesCount: 500,
  supplierName: '义乌市乌桨五金制品厂',
  supplierYearsOnPlatform: 1,
  starLevel: 5,
  sellingPoints: ['Ships within 5h'],
  isAd: false,
  url: 'https://detail.1688.com/offer/1089329678023.html',
  images: ['https://cbu01.alicdn.com/img/ibank/a.jpg'],
};

/** بطاقة منتج حقيقية كما ينشرها `product_detail` (الوزن يغذّي الشحن). */
const detailRow = {
  offerId: '928596422357',
  title: 'Magnetic Phone Case Matte Version',
  priceCny: 4.5,
  priceRangeCny: '3.00-4.50',
  priceTiers: [{ minQuantity: 1, priceCny: 4.5 }, { minQuantity: 300, priceCny: 4 }],
  currency: 'CNY',
  minOrderQuantity: 1,
  stock: 730371,
  specs: { Brand: 'Hong xing', Material: 'Silicone' },
  supplierName: '深圳市罗湖区洪星电子商行',
  url: 'https://detail.1688.com/offer/928596422357.html',
  variants: [{
    skuId: '6090121414768',
    specAttributes: 'Pink1 > iPhone17',
    priceCny: 4.5,
    stock: 5217,
    imageUrl: 'https://cbu01.alicdn.com/img/ibank/v.jpg',
    weightGrams: 45,
  }],
};

beforeEach(() => {
  process.env.APIFY_TOKEN = APIFY_KEY;
  delete process.env.APIFY_1688_ACTOR;
  delete process.env.APIFY_IMAGE_ACTOR;
  delete process.env.SBASE_PROVIDER;
  clearSbaseCache();
});

afterEach(() => {
  delete process.env.APIFY_TOKEN;
  delete process.env.APIFY_1688_ACTOR;
  delete process.env.APIFY_IMAGE_ACTOR;
  delete process.env.SBASE_PROVIDER;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('S Base — catalogue', () => {
  test('مصدر واحد: 1688 عبر actor Apify — لا Alibaba ولا Amazon ولا Lens', () => {
    expect(SBASE_SOURCES.map((source) => source.id)).toEqual(['1688']);
    expect(findSbaseSource('alibaba')).toBeNull();
    expect(findSbaseSource('amazon')).toBeNull();
    expect(findSbaseSource('google-lens')).toBeNull();
    expect(findSbaseSource('inconnu')).toBeNull();
    for (const source of SBASE_SOURCES) {
      expect(source.actor).toBe('sourabhbgp~1688-scraper');
      expect(source.supports).toMatchObject({
        keyword: true, url: true, image: true, details: true, variants: true,
      });
      expect(source.supports.barcode).toBe(false);
      // استخراج الردّ يمشي على `items[]` المنشور.
      expect(source.arrays).toEqual([['items']]);
    }
  });

  test('الفاتورة المنشورة تُقال: بحث ≈0.02495$ · بطاقة ≈0.00899$ · صورة ≈0.001$', () => {
    expect(SBASE_SOURCES.filter((source) => source.defaultEnabled).map((source) => source.id)).toEqual(['1688']);
    const dev = findSbaseSource('1688')!;
    expect(dev.billedPerResult).toBe(false);
    expect(dev.costUsd).toBeCloseTo(0.02495, 5);
    expect(dev.detail?.costUsd).toBeCloseTo(0.00899, 5);
    // التفاصيل تقبل المعرّف ولا الرابط — بلا بدنيل منفصل (موثّق على الـactor).
    expect(dev.detail?.requiresId).toBe(false);
    expect(SBASE_IMAGE_SOURCE.costUsd).toBeCloseTo(0.001, 5);
  });

  test('قناة الصورة = 1688 فقط (قرار الهوية 27/11: Ali بيتها AYWEBS)', () => {
    expect(SBASE_IMAGE_SOURCES.map((source) => source.id)).toEqual(['1688']);
    // 1688: Server actor بPOST واحد بbase64 — ما فماش run ولا dataset.
    expect(SBASE_IMAGE_SOURCE.id).toBe('1688');
    expect(SBASE_IMAGE_SOURCE.kind).toBe('server-actor');
    expect(SBASE_IMAGE_SOURCE.actor).toBe('topapi~image-search-1688-api');
    expect(SBASE_IMAGE_SOURCE.store).toBe('1688');
    // خروج Ali: كل بحث صورة 0.001$ فقط — حماية الرصيد (قرار الهوية).
    for (const source of SBASE_IMAGE_SOURCES) {
      expect(source.supports.image).toBe(true);
      // الصورة لا تفتح فيش داخلية لهذين الـactorين — التفاصيل قناة الكلمة.
      expect(source.supports.details).toBe(false);
      expect(source.storeFromResults).toBe(false);
    }
  });

  test('readiness هو حالة المفتاح، والطلب يُتحقّق قبل أي نداء', () => {
    expect(describeSbaseSources({ configured: false }).every((source) => source.configured === false)).toBe(true);
    expect(describeSbaseSources({ configured: true }).every((source) => source.configured === true)).toBe(true);
    expect(validateSbaseQuery('a')).toEqual({ error: expect.any(String) });
    expect(validateSbaseQuery('x'.repeat(91))).toEqual({ error: expect.any(String) });
    expect(validateSbaseQuery('  mini   traceur ')).toEqual({ query: 'mini traceur' });
  });
});

describe('S Base — استخراج المنتجات', () => {
  test('صفّ 1688: عنوان، سعر CNY، MOQ، البائع — بلا أي حقل مخترَع', () => {
    const items = extractProducts({
      items: [{
        item_id: 990347938140, title: 'Phone case', title_origin: '手机壳',
        price: '2.10', currency: 'CNY', img: 'https://cbu01.alicdn.com/a.jpg',
        product_url: 'https://detail.1688.com/offer/990347938140.html', moq: '1',
        shop_info: { company_name: 'Shenzhen X' },
      }],
    }, { arrays: [['items']], storeFallback: '1688' });
    expect(items[0]).toMatchObject({
      id: '990347938140', title: 'Phone case', amount: 2.1, currency: 'CNY',
      moq: '1', store: '1688', seller: 'Shenzhen X', image: 'https://cbu01.alicdn.com/a.jpg',
    });
    expect(items[0].url).toBe('https://detail.1688.com/offer/990347938140.html');
  });

  test('الأشكال الحرّة: المسار العميق يجد المنتجات أينما كانت', () => {
    const items = extractProducts({
      result: { mods: { itemList: { content: [
        { itemId: 1001, title: 'Coque iPhone', salePrice: 'TND 12,500', imageUrl: 'https://ae/1.jpg', detailUrl: 'https://ae/1' },
      ] } } },
    });
    expect(items[0]).toMatchObject({ id: '1001', title: 'Coque iPhone', amount: 12.5, currency: 'TND' });
  });

  test('الأثمنة: صيغ FR/US/TN تُقرأ، ولا شيء يُخمَّن', () => {
    expect(parsePriceText('1 234,56 €')).toEqual({ amount: 1234.56, currency: 'EUR' });
    expect(parsePriceText('$1,549.00')).toEqual({ amount: 1549, currency: 'USD' });
    // «45,000 TND» = 45 دينار و000 مليم: الخانة الثالثة حقيقية في تونس.
    expect(parsePriceText('TND 45,000')).toEqual({ amount: 45, currency: 'TND' });
    expect(parsePriceText('')).toEqual({ amount: null, currency: null });
  });

  test('الحقول الناقصة تُسمّى، ولا صفّ وهمي يُصنع', () => {
    const items = extractProducts({ products: [{ asin: 'A', product_title: 'X' }] }, { arrays: [['products']] });
    expect(missingFacets(items)).toEqual(expect.arrayContaining(['image', 'price', 'currency', 'link']));
    expect(normalizeProduct({ not: 'a product' })).toBeNull();
  });
});

describe('S Base — استخراج البطاقة', () => {
  test('بدون بيانات: كل شيء يُسمّى ناقصاً، ولا شيء يُخترَع', () => {
    const detail = extractDetail({});
    expect(detail.title).toBeNull();
    expect(detail.variants).toEqual([]);
    expect(detail.missing).toEqual(expect.arrayContaining(['title', 'price', 'images', 'variants', 'specs', 'description']));
  });

  test('وصف المورّد (includeDescriptionHtml): HTML خام ⇒ نصّ مقروء بلا وسوم — وما وصلش يبقى غايباً', () => {
    // ما يرجعه الـactor فعلاً عند تفعيل الخيار يمرّ بمُترجم Apify أولاً.
    const mapped = mapApifyDetailRow({
      offerId: '1', currency: 'CNY', priceCny: 4.5,
      supplierName: 'مورّد',
      title: 'حالة هاتف',
      descriptionHtml: '<div>材质：硅胶<br>&nbsp;适合 iPhone 17 Pro Max</div><p>&amp;免运费</p>',
    });
    const detail = extractDetail(mapped);
    expect(detail.description).toBe('材质：硅胶 适合 iPhone 17 Pro Max &免运费');
    expect(detail.missing).not.toContain('description');

    // ما وصلش وصف (أو وصل وسوماً بلا نصّ) ⇒ يبقى ناقصاً بصدق، والقسم لا يظهر.
    const without = extractDetail(mapApifyDetailRow({
      offerId: '2', currency: 'CNY', priceCny: 4.5,
      supplierName: 'مورّد', title: 'حالة هاتف',
      descriptionHtml: '<div><img src="https://cbu01.alicdn.com/x.jpg"></div>',
    }));
    expect(without.description).toBeNull();
    expect(without.missing).toContain('description');
  });

  test('variantes ككائن {taille: [...]} والتفاهة المجهولة تبقى null', () => {
    const detail = extractDetail({
      product_results: {
        title: 'Sweat', price: { amount: 45, currency: 'eur' },
        variations: { Taille: [{ name: 'M' }, { name: 'L', in_stock: false }] },
      },
    });
    expect(detail.amount).toBe(45);
    expect(detail.currency).toBe('EUR');
    expect(detail.variants[0].name).toBe('Taille');
    expect(detail.variants[0].values).toEqual([
      { label: 'M', available: null, image: null },
      { label: 'L', available: false, image: null },
    ]);
  });

  test('بلا وعود كاذبة: بطاقة بلا variantes لا تصنع مقاسات', () => {
    const detail = extractDetail({ product_result: { title: 'Câble USB', specifications: [{ name: 'Longueur', value: '1 m' }] } });
    expect(detail.variants).toEqual([]);
    expect(detail.missing).toContain('variants');
  });
});

describe('S Base — مزوّد Apify', () => {
  test('الأثمنة المنشورة تُحسب من الموثّق: بحث 0.02495$ · تفاصيل 0.00899$ · صورة 1688=0.001$ · صورة AliExpress=0.02$', () => {
    expect(APIFY_SEARCH_COST_USD).toBeCloseTo(0.005 + 5 * 3.99 / 1000, 5);
    expect(APIFY_DETAIL_COST_USD).toBeCloseTo(0.005 + 3.99 / 1000, 5);
    expect(APIFY_IMAGE_COST_USD).toBeCloseTo(5 * 0.2 / 1000, 5);
    // AliExpress: 0.02$/صورة بحثت — موثّقة على صفحة الـactor، والفشل/الصفر مجّاني.
    expect(APIFY_ALIEXPRESS_IMAGE_COST_USD).toBe(0.02);
  });

  test('حدود النتائج: افتراضي 5 لكل actor (قرار المالك: 4–5 قوالب)، ومفاتيح البيئة تضبطهما', async () => {
    const prevImage = process.env.APIFY_IMAGE_MAX_RESULTS;
    const prevSearch = process.env.APIFY_SEARCH_MAX_ITEMS;
    try {
      process.env.APIFY_IMAGE_MAX_RESULTS = '8';
      process.env.APIFY_SEARCH_MAX_ITEMS = '12';
      vi.resetModules();
      const mod = await import('../src/sbase/apify.js');
      expect(mod.APIFY_IMAGE_MAX_RESULTS).toBe(8);
      expect(mod.APIFY_IMAGE_COST_USD).toBeCloseTo(8 * 0.2 / 1000, 5);
      expect(mod.APIFY_SEARCH_MAX_ITEMS).toBe(12);
      expect(mod.APIFY_SEARCH_COST_USD).toBeCloseTo(0.005 + 12 * 3.99 / 1000, 5);
    } finally {
      if (prevImage === undefined) delete process.env.APIFY_IMAGE_MAX_RESULTS;
      else process.env.APIFY_IMAGE_MAX_RESULTS = prevImage;
      if (prevSearch === undefined) delete process.env.APIFY_SEARCH_MAX_ITEMS;
      else process.env.APIFY_SEARCH_MAX_ITEMS = prevSearch;
      vi.resetModules();
    }
  });

  test('بدون مفتاح: رفض APIFY_NOT_CONFIGURED قبل أي نداء شبكي', async () => {
    delete process.env.APIFY_TOKEN;
    expect(apifyConfigured()).toBe(false);
    const calls = stubApify([]);
    await expect(runApifySearch('case')).rejects.toMatchObject({ code: 'APIFY_NOT_CONFIGURED', status: 503 });
    await expect(searchApifyByImage('QUJD')).rejects.toMatchObject({ code: 'APIFY_NOT_CONFIGURED' });
    expect(calls).toHaveLength(0);
  });

  test('بحث بالكلمة: POST runs ثم poll حتى SUCCEEDED ثم dataset — والحقول تُترجم للشكل الداخلي', async () => {
    const calls = stubApify([
      (url, init) => {
        if (!url.includes('/v2/acts/sourabhbgp~1688-scraper/runs')) return null;
        expect(init?.method).toBe('POST');
        return runQueued();
      },
      (url) => {
        if (!url.includes('/v2/actor-runs/run_9')) return null;
        return runSucceeded();
      },
      (url) => {
        if (!url.includes('/v2/datasets/ds_1/items')) return null;
        return new Response(JSON.stringify([searchRow]), { status: 200 });
      },
    ]);

    const result = await runApifySearch('water bottle', { pollIntervalMs: 1 });
    expect(calls).toHaveLength(3);
    // المفتاح في ترويسة Bearer فقط — لا token في الرابط ولا في الجسم.
    for (const call of calls) {
      expect(call.url).not.toContain(APIFY_KEY);
      expect((call.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${APIFY_KEY}`);
    }
    const runInput = JSON.parse(String(calls[0].init?.body));
    expect(runInput).toMatchObject({ mode: 'search', keywords: ['water bottle'], sortType: 'normal', maxItems: 5 });

    expect(result.runId).toBe('run_9');
    expect(result.costUsd).toBe(APIFY_SEARCH_COST_USD);
    expect(result.async).toBe(true);
    // الشكل الداخلي المعروف: نفس مسار استخراج 1688، بلا أي حقل مخترَع.
    expect(result.data.items[0]).toMatchObject({
      item_id: '1089329678023',
      title: 'New macaron bowl lid insulated tumbler - large capacity water bottle',
      price: '15.5',
      currency: 'CNY',
      moq: '1',
      product_url: 'https://detail.1688.com/offer/1089329678023.html',
      img: 'https://cbu01.alicdn.com/img/ibank/a.jpg',
      shop_info: { company_name: '义乌市乌桨五金制品厂' },
    });
    // وطبقة الاستخراج الموجودة تُكمل الباقي كما هي.
    const products = extractProducts(result.data, { arrays: [['items']], limit: 20, storeFallback: '1688' });
    expect(products[0]).toMatchObject({ id: '1089329678023', amount: 15.5, currency: 'CNY', seller: '义乌市乌桨五金制品厂', moq: '1' });
  });

  test('تفاصيل المنتج: proxy موثّق + offerIds، والوزن/المواصفات/الـSKU تصل extractDetail', async () => {
    const calls = stubApify([
      (url) => (url.includes('/v2/acts/sourabhbgp~1688-scraper/runs') ? runQueued() : null),
      (url) => (url.includes('/v2/actor-runs/run_9') ? runSucceeded() : null),
      (url) => {
        if (!url.includes('/v2/datasets/ds_1/items')) return null;
        return new Response(JSON.stringify([detailRow]), { status: 200 });
      },
    ]);

    const result = await runApifyDetail({ id: '928596422357', url: null }, { pollIntervalMs: 1 });
    const runInput = JSON.parse(String(calls[0].init?.body));
    // صفحة 1688 ما تتقراش بلا proxy — حدّ منشور على الـactor نفسه.
    expect(runInput).toMatchObject({
      mode: 'product_detail',
      offerIds: ['928596422357'],
      includeSkuDetails: true,
      proxyConfiguration: { useApifyProxy: true },
    });
    expect(result.costUsd).toBe(APIFY_DETAIL_COST_USD);

    // الجذر الداخلي: نفس الشكل اللي يفهمه extractDetail من 1688.
    expect(result.data).toMatchObject({
      item_id: '928596422357',
      currency: 'CNY',
      is_sold_out: false,
      weightGrams: 45,
    });
    expect(result.data.price_info).toMatchObject({ price: '4.5' });

    const detail = extractDetail(result.data);
    expect(detail).toMatchObject({
      amount: 4.5, currency: 'CNY', availability: 'in_stock', seller: '深圳市罗湖区洪星电子商行',
      url: 'https://detail.1688.com/offer/928596422357.html',
    });
    expect(detail.specs).toEqual(expect.arrayContaining([{ name: 'Brand', value: 'Hong xing' }]));
    // أسماء الأبعاد غير منشورة عند المصدر ⇒ مجموعة «options» كالـgeneric، بلا اختراع أسماء.
    expect(detail.variants[0]).toMatchObject({ name: 'options' });
    expect(detail.variants[0].values[0]).toMatchObject({ label: 'Pink1 > iPhone17', available: true, image: 'https://cbu01.alicdn.com/img/ibank/v.jpg' });
    expect(detail.images).toContain('https://cbu01.alicdn.com/img/ibank/v.jpg');
  });

  test('الرابط يكفي بلا معرّف: offerIds يقبل الرابط (موثّق)', async () => {
    const calls = stubApify([
      (url) => (url.includes('/v2/acts/sourabhbgp~1688-scraper/runs') ? runQueued() : null),
      (url) => (url.includes('/v2/actor-runs/run_9') ? runSucceeded() : null),
      (url) => (url.includes('/v2/datasets/ds_1/items')
        ? new Response(JSON.stringify([{ offerId: '857511694718', title: 'Cable USB-C', priceCny: 1.2, currency: 'CNY' }]), { status: 200 })
        : null),
    ]);
    const result = await runApifyDetail({ id: null, url: 'https://detail.1688.com/offer/857511694718.html' }, { pollIntervalMs: 1 });
    const runInput = JSON.parse(String(calls[0].init?.body));
    expect(runInput.offerIds).toEqual(['https://detail.1688.com/offer/857511694718.html']);
    expect(result.data).toMatchObject({ item_id: '857511694718' });
  });

  test('كل فشل بكوده الحقيقي: 401 · 429 · run FAILED · timeout — وما يتلبسش «لا نتائج»', async () => {
    // 401 على إنشاء الـrun.
    stubApify([() => new Response(JSON.stringify({ error: { type: 'unauthorized' } }), { status: 401 })]);
    await expect(runApifySearch('case')).rejects.toMatchObject({ code: 'APIFY_UNAUTHORIZED' });

    // 429.
    stubApify([() => new Response(JSON.stringify({ error: { type: 'rate-limit' } }), { status: 429 })]);
    await expect(runApifySearch('case')).rejects.toMatchObject({ code: 'APIFY_RATE_LIMIT', status: 429 });

    // الـrun فشل عند المزوّد (poll أرجع FAILED).
    stubApify([
      (url) => (url.includes('/v2/acts/') ? runQueued() : null),
      (url) => (url.includes('/v2/actor-runs/run_9') ? new Response(JSON.stringify({ data: { id: 'run_9', status: 'FAILED' } }), { status: 200 }) : null),
    ]);
    await expect(runApifySearch('case')).rejects.toMatchObject({ code: 'APIFY_FAILED', status: 502 });

    // الوقت تجاوز: الـpoll يبقى RUNNING.
    stubApify([
      (url) => (url.includes('/v2/acts/') ? runQueued() : null),
      (url) => (url.includes('/v2/actor-runs/run_9') ? new Response(JSON.stringify({ data: { id: 'run_9', status: 'RUNNING' } }), { status: 200 }) : null),
    ]);
    await expect(runApifySearch('case', { timeoutMs: 30, pollIntervalMs: 5 }))
      .rejects.toMatchObject({ code: 'APIFY_TIMEOUT', status: 504 });

    // HTTP غير معروف: الكود يحمل الحالة.
    stubApify([() => new Response(JSON.stringify({ error: { type: 'boom' } }), { status: 503 })]);
    await expect(runApifySearch('case')).rejects.toMatchObject({ code: 'APIFY_HTTP' });
  });

  test('dataset بلا صفوف للتفاصيل ⇒ APIFY_EMPTY صريح (404)، موش «فيش» فارغة', async () => {
    stubApify([
      (url) => (url.includes('/v2/acts/') ? runQueued() : null),
      (url) => (url.includes('/v2/actor-runs/run_9') ? runSucceeded() : null),
      (url) => (url.includes('/v2/datasets/ds_1/items') ? new Response(JSON.stringify([]), { status: 200 }) : null),
    ]);
    await expect(runApifyDetail({ id: '928596422357', url: null }, { pollIntervalMs: 1 }))
      .rejects.toMatchObject({ code: 'APIFY_EMPTY', status: 404 });
  });

  test('صورة: POST واحد بbase64 خام + excludeAds إلى نقطة الـServer actor — والنتائج تُترجم', async () => {
    expect(apifyImageEndpoint()).toBe('https://topapi--image-search-1688-api.apify.actor/search');
    const calls = stubApify([
      (url, init) => {
        if (!url.includes('topapi--image-search-1688-api.apify.actor/search')) return null;
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({
          ok: true,
          count: 2,
          items: [
            {
              rank: 1,
              similarityScore: 0.3453,
              offerId: '927875250705',
              title: '跨境适用苹果18promax手机壳',
              titleEn: 'Cross-border Apple 18promax phone case',
              detailUrl: 'https://detail.1688.com/offer/927875250705.html',
              image: 'https://cbu01.alicdn.com/img/ibank/m.jpg',
              price: 7.5,
              priceUsd: 1.1228,
              currency: 'CNY',
              minOrderQuantity: 50,
              isAd: true,
              supplier: { companyName: '佛山市南海区三丰手机配件有限公司', yearsOnPlatform: 11 },
            },
            { offerId: '927875250706', title: '手机壳', titleEn: 'Plain phone case', detailUrl: 'https://detail.1688.com/offer/927875250706.html' },
          ],
          meta: { totalMatches: 698, nextOffset: 2, charged: { match: 2 } },
        }), { status: 200 });
      },
    ]);

    const result = await searchApifyByImage('QUJDREVG');
    expect(calls).toHaveLength(1);
    const sent = JSON.parse(String(calls[0].init?.body));
    // base64 خام كما يوثّقه الـactor، والحدّ الأقصى للنتائج + استبعاد الإعلانات.
    expect(sent).toEqual({ imageBase64: 'QUJDREVG', maxResults: 5, excludeAds: true });
    expect(calls[0].url).not.toContain(APIFY_KEY);
    // المفتاح في الترويسة فقط.
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${APIFY_KEY}`);

    expect(result.count).toBe(2);
    expect(result.costUsd).toBe(APIFY_IMAGE_COST_USD);
    expect(result.data.items[0]).toMatchObject({
      item_id: '927875250705',
      // titleEn يتقدّم على العنوان الصيني — قاعدة الشاشة المعروفة.
      title: 'Cross-border Apple 18promax phone case',
      price: '7.5',
      currency: 'CNY',
      moq: '50',
      product_url: 'https://detail.1688.com/offer/927875250705.html',
      img: 'https://cbu01.alicdn.com/img/ibank/m.jpg',
      shop_info: { company_name: '佛山市南海区三丰手机配件有限公司' },
    });
    // النتيجة الثانية بلا سعر: «ما عطاناش» تُسجّل، ما يُخترعش صفر.
    const products = extractProducts(result.data, { arrays: [['items']], limit: 20, storeFallback: '1688' });
    expect(products[1].missing).toContain('price');
  });

  test('صورة: ok=false ⇒ APIFY_FAILED (فشل معلن، ما يتفوترش «لا نتائج»)', async () => {
    stubApify([() => new Response(JSON.stringify({ ok: false, error: { type: 'image_search_failed' } }), { status: 200 })]);
    await expect(searchApifyByImage('QUJDREVG')).rejects.toMatchObject({ code: 'APIFY_FAILED', status: 502 });
  });

  test('صورة: رفض HTTP من الـactor يحمل كوده الحقيقي (401 · 429 · HTTP_x)', async () => {
    stubApify([() => new Response(JSON.stringify({ error: { type: 'unauthorized' } }), { status: 401 })]);
    await expect(searchApifyByImage('QUJDREVG')).rejects.toMatchObject({ code: 'APIFY_UNAUTHORIZED' });
    stubApify([() => new Response(JSON.stringify({ error: { type: 'slow-down' } }), { status: 429 })]);
    await expect(searchApifyByImage('QUJDREVG')).rejects.toMatchObject({ code: 'APIFY_RATE_LIMIT' });
    stubApify([() => new Response(JSON.stringify({ error: { type: 'boom' } }), { status: 500 })]);
    await expect(searchApifyByImage('QUJDREVG')).rejects.toMatchObject({ code: 'APIFY_HTTP' });
  });

  test('صورة: 0 نتيجة = حالة عادية مجانية، موش خطأ', async () => {
    stubApify([() => new Response(JSON.stringify({ ok: true, count: 0, items: [], meta: { totalMatches: 0, nextOffset: null, charged: { match: 0 } } }), { status: 200 })]);
    const result = await searchApifyByImage('QUJDREVG');
    expect(result.count).toBe(0);
    expect(result.data.items).toEqual([]);
  });

  test('صورة: جسم يتجاوز حدّ 1MB الموثّق يُرفض محلياً (413) قبل أي نداء مدفوع', async () => {
    const calls = stubApify([]);
    await expect(searchApifyByImage('A'.repeat(1_100_000))).rejects.toMatchObject({ code: 'SBASE_IMAGE_TOO_LARGE', status: 413 });
    expect(calls).toHaveLength(0);
  });

  test('صورة كبيرة تتضغط تدرّجياً تحت الميزانية قبل الإرسال (حدّ موثّق: 1,000,000 بايت)', async () => {
    // PNG ضجيج عشوائي حقيقي 1024×1024 — يفوق الميزانية ولا يفوق سقف التطبيع (5MB).
    const sharp = (await import('sharp')).default;
    const noise = randomBytes(1024 * 1024 * 3);
    const png = await sharp(noise, { raw: { width: 1024, height: 1024, channels: 3 } })
      .png({ compressionLevel: 1 })
      .toBuffer();
    expect(png.length).toBeLessThan(5 * 1024 * 1024);

    const base64 = await apifyImageBase64(png, 'image/png');
    expect(base64.length).toBeLessThanOrEqual(APIFY_IMAGE_BASE64_BUDGET);
    // بعد الضغط يبقى JPEG صالحاً (بداية FFD8).
    const bytes = Buffer.from(base64, 'base64');
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  });
});

describe('S Base — المسارات', () => {
  test('/sources: المزوّد والكلفة المنشورة ونقطة الـServer actor', async () => {
    const response = await request(app()).get('/api/sbase/sources').expect(200);
    expect(response.body.data.provider).toBe('apify');
    expect(response.body.data.configured).toBe(true);
    expect(response.body.data.sources).toHaveLength(1);
    expect(response.body.data.sources[0]).toMatchObject({ id: '1688', actor: 'sourabhbgp~1688-scraper' });
    expect(response.body.data.sources[0].costUsd).toBeCloseTo(0.02495, 5);
    expect(response.body.data.image.endpoint).toBe('https://topapi--image-search-1688-api.apify.actor/search');
    expect(response.body.data.image.costUsd).toBeCloseTo(0.001, 5);
    // متاجر الصورة معلنة بأثمنتهم المنشورة: 1688 ثم AliExpress.
    expect(response.body.data.image.stores.map((store: { id: string }) => store.id)).toEqual(['1688']);
  });

  test('بلا مفتاح: 503 APIFY_NOT_CONFIGURED وبلا أي نداء', async () => {
    delete process.env.APIFY_TOKEN;
    const calls = stubApify([]);
    const response = await request(app()).post('/api/sbase/search').send({ q: 'casque' }).expect(503);
    expect(response.body.code).toBe('APIFY_NOT_CONFIGURED');
    expect(calls).toHaveLength(0);
  });

  test('طلب قصير ⇒ 400؛ قائمة فارغة ⇒ الاختيار الافتراضي', async () => {
    stubApify(apifyFlow([searchRow]));
    const short = await request(app()).post('/api/sbase/search').send({ q: 'a' }).expect(400);
    expect(short.body.code).toBe('INVALID_QUERY');
    const none = await request(app()).post('/api/sbase/search').send({ q: 'casque', sources: [] }).expect(200);
    expect(none.body.data.groups.length).toBe(1);
    expect(none.body.data.provider).toBe('apify');
  });

  test('البحث يمرّ من Apify: مجموعة واحدة بزمنها وكفتها المنشورة', async () => {
    stubApify(apifyFlow([searchRow]));
    const response = await request(app())
      .post('/api/sbase/search')
      .send({ q: 'coque', sources: ['1688'] })
      .expect(200);

    const groups = response.body.data.groups;
    expect(groups).toHaveLength(1);
    const group = groups[0];
    expect(group).toMatchObject({ status: 'ok', count: 1, error: null, cached: false, async: true });
    expect(group.costUsd).toBeCloseTo(0.02495, 5);
    expect(group.items[0]).toMatchObject({
      id: '1089329678023', amount: 15.5, currency: 'CNY', moq: '1',
    });
    // المتجر معروف من المجموعة نفسها (source.label) — الصورة وحدها تختم store.
    expect(response.body.data.provider).toBe('apify');
    expect(response.body.data.totalMs).toBeGreaterThanOrEqual(0);
  });

  test('مصدر ما رجّعش حتى صفّ: مجموعة `empty` صريحة (مش خطأ متخبّي)', async () => {
    stubApify(apifyFlow([]));
    const response = await request(app()).post('/api/sbase/search').send({ q: 'zzz introuvable', sources: ['1688'] }).expect(200);
    expect(response.body.data.groups[0]).toMatchObject({ status: 'empty', count: 0, items: [] });
  });

  test('فشل المزوّد: المجموعة تحمل كوده الحقيقي، وما تتفورتش «لا نتائج»', async () => {
    stubApify([() => new Response(JSON.stringify({ error: { type: 'unauthorized' } }), { status: 401 })]);
    const response = await request(app()).post('/api/sbase/search').send({ q: 'coque', sources: ['1688'] }).expect(200);
    expect(response.body.data.groups[0]).toMatchObject({
      status: 'error', count: 0,
      error: { code: 'APIFY_UNAUTHORIZED' },
    });
  });

  test('الكاش يخدم نفس الطلب 10 دقائق — النداءات المدفوعة مرة واحدة', async () => {
    const calls = stubApify(apifyFlow([searchRow]));
    await request(app()).post('/api/sbase/search').send({ q: 'coque', sources: ['1688'] }).expect(200);
    const second = await request(app()).post('/api/sbase/search').send({ q: 'coque', sources: ['1688'] }).expect(200);
    expect(second.body.data.groups[0].cached).toBe(true);
    // run + poll + dataset مرة واحدة فقط.
    expect(calls).toHaveLength(3);
  });

  test('البطاقة عبر Apify: الوزن المعلن يغذّي الشحن في محرّك السعر', async () => {
    stubApify(apifyFlow([detailRow]));
    const response = await request(app()).post('/api/sbase/item').send({ source: '1688', id: '928596422357' }).expect(200);
    const detail = response.body.data.detail;
    expect(detail).toMatchObject({
      amount: 4.5, currency: 'CNY', weightKg: 0.045, seller: '深圳市罗湖区洪星电子商行',
    });
    const estimate = response.body.data.detail.priceEstimate;
    // 45 غرام = 0.045kg × 12 TND/kg = 0.54 TND شحن حقيقي، موش وزن تصنيف افتراضي.
    expect(estimate.freightTND).toBeCloseTo(0.54, 3);
    // البطاقة تحسب التوصيل المنزلي (السطر الوحيد في الشاشة).
    expect(estimate.localDeliveryTND).toBe(7);
    expect(response.body.data.costUsd).toBeCloseTo(0.00899, 5);
  });

  test('البطاقة بالرابط بلا معرّف: offerIds يقبل detail.1688.com (موثّق)', async () => {
    stubApify(apifyFlow([{
      offerId: '857511694718', title: 'Cable USB-C', priceCny: 1.2, currency: 'CNY',
      url: 'https://detail.1688.com/offer/857511694718.html',
    }]));
    const response = await request(app())
      .post('/api/sbase/item')
      .send({ source: '1688', url: 'https://detail.1688.com/offer/857511694718.html' })
      .expect(200);
    expect(response.body.data.detail).toMatchObject({ title: 'Cable USB-C', amount: 1.2 });
  });

  test('مصدر غير معروف ⇒ 404 صريح، ومعرّف ناقص ⇒ 400، وبلا مفتاح ⇒ 503', async () => {
    const unknown = await request(app()).post('/api/sbase/item').send({ source: 'alibaba', id: '100500' }).expect(404);
    expect(unknown.body.code).toBe('UNKNOWN_SOURCE');

    const missing = await request(app()).post('/api/sbase/item').send({ source: '1688', title: 'x' }).expect(400);
    expect(missing.body.code).toBe('ITEM_ID_REQUIRED');

    delete process.env.APIFY_TOKEN;
    const noKey = await request(app()).post('/api/sbase/item').send({ source: '1688', id: '928596422357' }).expect(503);
    expect(noKey.body.code).toBe('APIFY_NOT_CONFIGURED');
  });

  test('كل نتيجة بحث تحمل تقدير TND من محرّك السعر المنزلي', async () => {
    stubApify(apifyFlow([searchRow]));
    const response = await request(app())
      .post('/api/sbase/search')
      .send({ q: 'coque', sources: ['1688'] })
      .expect(200);

    const estimate = response.body.data.groups[0].items[0].priceEstimate;
    expect(estimate).toMatchObject({ currency: 'CNY', amount: 15.5 });
    expect(estimate.totalTND).toBeGreaterThan(estimate.productTND);
    expect(estimate.productTND).toBeCloseTo(15.5 * 0.43 * 1.03, 1);
    expect(estimate.rateTND).toBeCloseTo(0.4429, 3);
    expect(estimate.pricingVersion).toBe(7);
    // سطر النتائج ما يحسبش التوصيل المنزلي.
    expect(estimate.localDeliveryTND).toBe(0);
  });

  test('بلا محرّك سعر: التقدير null — ما ناخترعوش تفا', async () => {
    stubApify(apifyFlow([searchRow]));
    const response = await request(app({ pricingRules: null }))
      .post('/api/sbase/search')
      .send({ q: 'coque', sources: ['1688'] })
      .expect(200);
    expect(response.body.data.groups[0].items[0].priceEstimate).toBeNull();
  });

  /** حالة AliExpress الموثّقة: run ينجح + dataset بصفوف المنتجات. */
  const aliexpressFlow = (rows: unknown[]) => [
    (url: string) => (url.includes('/v2/acts/piotrv1001~aliexpress-image-search-scraper/runs')
      ? new Response(JSON.stringify({ data: { id: 'run_ae', status: 'READY', defaultDatasetId: 'ds_ae' } }), { status: 200 })
      : null),
    (url: string) => (url.includes('/v2/actor-runs/run_ae')
      ? new Response(JSON.stringify({ data: { id: 'run_ae', status: 'SUCCEEDED', defaultDatasetId: 'ds_ae' } }), { status: 200 })
      : null),
    (url: string) => (url.includes('/v2/datasets/ds_ae/items') ? new Response(JSON.stringify(rows), { status: 200 }) : null),
  ];

  /** صفّ AliExpress الموثّق حرفياً على صفحة الـactor (مثال من run حقيقي، US/USD). */
  const aliexpressRow = {
    queryImage: 'https://example.com/photo.jpg',
    rank: 1,
    isBestMatch: true,
    productId: '1005012800262062',
    url: 'https://www.aliexpress.com/item/1005012800262062.html',
    title: '10-100Pcs Artificial Strawberries Fake Plastic Fruit for Home Kitchen Garden Decoration',
    image: 'https://ae-pic-a1.aliexpress-media.com/kf/Sbf5a5b9337a442c99336f7e29821977fx.jpg',
    price: 1.09,
    originalPrice: 5.14,
    discountPercent: 78,
    unitPrice: 0.11,
    unitLabel: 'pc',
    currency: 'USD',
    isNewShopperPrice: true,
    rating: 5,
    sold: 78,
    soldText: '78 sold',
    launchedAt: '2026-07-23',
    sellingPoints: ['$1.04 each, ≥ 2 pieces'],
    isChoice: true,
    shipTo: 'US',
    scrapedAt: '2026-10-20T06:02:28.652Z',
  };

  test('الصورة تمرّ على 1688 وحدها: base64 بلا نشر ولا سَبر، ومجموعتها بكلفتها (قرار الهوية 27/11)', async () => {
    const calls = stubApify([
      (url, init) => {
        if (!url.includes('topapi--image-search-1688-api.apify.actor/search')) return null;
        expect(init?.method).toBe('POST');
        const sent = JSON.parse(String(init?.body));
        // الصورة تُرسل base64 خام — لا data URI، لا رابط photo/… عندنا.
        expect(sent.imageBase64).toMatch(/^[A-Za-z0-9+/=]+$/);
        expect(sent.maxResults).toBe(5);
        expect(sent.excludeAds).toBe(true);
        return new Response(JSON.stringify({
          ok: true, count: 1,
          items: [{
            offerId: '927875250705', title: '手机壳', titleEn: 'Cross-border phone case',
            detailUrl: 'https://detail.1688.com/offer/927875250705.html', image: 'https://cbu01.alicdn.com/m.jpg',
            price: 7.5, currency: 'CNY', minOrderQuantity: 50, supplier: { companyName: '佛山三丰' },
          }],
          meta: { totalMatches: 12, nextOffset: 1 },
        }), { status: 200 });
      },
    ]);

    const response = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(200);

    // نداء 1688 واحد (Server actor) — وخروج Ali: ما فماش أي نداء run/dataset إطلاقاً.
    expect(calls.filter((call) => call.url.includes('topapi--image-search-1688-api'))).toHaveLength(1);
    expect(calls.filter((call) => call.url.includes('/v2/acts/') || call.url.includes('/v2/actor-runs/'))).toHaveLength(0);
    const data = response.body.data;
    expect(data.provider).toBe('apify');
    expect(data).toMatchObject({ mode: 'image', count: 1, stores: ['1688'] });
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0]).toMatchObject({ source: { id: '1688' }, status: 'ok', count: 1, costUsd: 0.001, error: null });
    expect(data.items[0]).toMatchObject({ store: '1688', title: 'Cross-border phone case', amount: 7.5, currency: 'CNY', moq: '50' });
    // الفاتورة الكلية = 0.001 فقط — الرصيد يعيش 21 ضعفاً أطول للاستعلام.
    expect(data.costUsd).toBeCloseTo(0.001, 5);
    expect(data.photoExpiresAt).toBeUndefined();
    expect(data.items[0].url).toBe('https://detail.1688.com/offer/927875250705.html');
  });

  test('التعمير التدريجي: ?stores=1688 يستجوب 1688 وحدها — AliExpress ما يُندَّىش أصلاً', async () => {
    const calls = stubApify([
      (url) => (url.includes('topapi--image-search-1688-api.apify.actor/search')
        ? new Response(JSON.stringify({
          ok: true, count: 1,
          items: [{
            offerId: '927875250705', title: '手机壳', titleEn: 'Cross-border phone case',
            detailUrl: 'https://detail.1688.com/offer/927875250705.html', image: 'https://cbu01.alicdn.com/m.jpg',
            price: 7.5, currency: 'CNY', minOrderQuantity: 50, supplier: { companyName: '佛山三丰' },
          }],
        }), { status: 200 })
        : null),
    ]);
    const response = await request(app())
      .post('/api/sbase/image?stores=1688')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(200);
    // الـactor المستبعد ما تُفتحش ولا صفحة من عنده — حصر صارم لا تخفية.
    expect(calls.filter((call) => call.url.includes('aliexpress'))).toHaveLength(0);
    const data = response.body.data;
    expect(data.groups).toHaveLength(1);
    expect(data.groups[0]).toMatchObject({ source: { id: '1688' }, status: 'ok', count: 1, costUsd: 0.001 });
    expect(data.stores).toEqual(['1688']);
    expect(data.costUsd).toBeCloseTo(0.001, 5);
  });

  test('?stores باسم غريب ⇒ 400 SBASE_STORE_UNKNOWN بلا أي نداء مدفوع', async () => {
    const calls = stubApify([
      () => new Response(JSON.stringify({ ok: true, count: 0, items: [] }), { status: 200 }),
    ]);
    const response = await request(app())
      .post('/api/sbase/image?stores=khayr')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(400);
    expect(response.body.code).toBe('SBASE_STORE_UNKNOWN');
    // الرفض المحلي قبل أي actor — صفر فاتورة.
    expect(calls).toHaveLength(0);
  });

  test('فشل المزوّد لا يُتنكّر: المجموعة تحمل كودها الحقيقي والفشل غير مفوتر (مخزن وحيد)', async () => {
    stubApify([
      // 1688 تردّ 429 — المجموعة تقولها كما هي، والفاتورة صفر.
      () => new Response(JSON.stringify({ error: { type: 'slow-down' } }), { status: 429 }),
    ]);
    const response = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(429);
    // المخزن الوحيد فاشل ⇒ الخطأ الصادق كاملاً: 429 بكوده، والمجموعة تحمل
    // الحقيقة (groups في الردّ)، والفاتورة صفر — ما يتخفّاش في «لا نتائج».
    expect(response.body.code).toBe('SBASE_IMAGE_RATE_LIMITED');
    const groups = response.body.groups as Array<{ source: { id: string }; status: string; count: number; costUsd: number }>;
    expect(groups[0]).toMatchObject({
      source: { id: '1688' }, status: 'error', count: 0, costUsd: 0,
    });
  });

  test('الصورة: صفوف فشل AliExpress الموثّقة كل واحدة بمعناها (no_matches مجّانية · image_error مرفوضة · failed فشل)', async () => {
    // no_matches = حالة عادية مجّانية: تردّ فارغة ما تمسّش كخطأ.
    stubApify(aliexpressFlow([{ queryImage: 'q', status: 'no_matches', error: 'no matches after 3 uploads' }]));
    const empty = await searchApifyAliexpressByImage('QUJDREVG', { pollIntervalMs: 1 });
    expect(empty.data.items).toEqual([]);
    expect(empty.async).toBe(true);

    stubApify(aliexpressFlow([{ queryImage: 'q', status: 'image_error', error: 'unreadable image' }]));
    await expect(searchApifyAliexpressByImage('QUJDREVG', { pollIntervalMs: 1 }))
      .rejects.toMatchObject({ code: 'SBASE_IMAGE_STORE_REFUSED', status: 502 });

    stubApify(aliexpressFlow([{ queryImage: 'q', status: 'failed', error: 'actor crashed' }]));
    await expect(searchApifyAliexpressByImage('QUJDREVG', { pollIntervalMs: 1 }))
      .rejects.toMatchObject({ code: 'APIFY_FAILED', status: 502 });
  });

  test('الصورة: 0 نتائج تُعرض «empty» — والفاتورة صفر (مجّاني، قرار الهوية: مخزن وحيد)', async () => {
    stubApify([
      (url) => (url.includes('topapi--image-search-1688-api.apify.actor/search')
        ? new Response(JSON.stringify({
          ok: true, count: 0, items: [], meta: { totalMatches: 0, nextOffset: null, charged: { match: 0 } },
        }), { status: 200 })
        : null),
    ]);
    const response = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(200);
    const data = response.body.data;
    expect(data).toMatchObject({ status: 'empty', count: 0, items: [], stores: [] });
    expect(data.groups[0]).toMatchObject({ status: 'empty', count: 0, costUsd: 0 });
    expect(data.costUsd).toBe(0);
  });

  test('الصورة: بلا ملف ⇒ 400 صريح', async () => {
    const response = await request(app()).post('/api/sbase/image').expect(400);
    expect(response.body.code).toBe('SBASE_IMAGE_EMPTY');
  });

  /*
   * 26/11/2026 — الشاشة كانت تعرض «فشل البحث / صورة غير صالحة» رغم أن الصورة
   * سليمة: العطب عند المزوّد. فشل المزوّد لا يُتنكّر أبداً في هيئة «صورة غالطة».
   */
  test('الصورة: رفض المزوّد يحتفظ بمعناه الحقيقي (402 · 429 · timeout)', async () => {
    stubApify([() => new Response(JSON.stringify({ error: { type: 'insufficient balance' } }), { status: 402 })]);
    const balance = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(402);
    expect(balance.body.code).toBe('SBASE_IMAGE_BALANCE');
    expect(balance.body.providerCode).toBe('APIFY_BALANCE');

    stubApify([() => new Response(JSON.stringify({ error: { type: 'slow-down' } }), { status: 429 })]);
    const limited = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(429);
    expect(limited.body.code).toBe('SBASE_IMAGE_RATE_LIMITED');

    stubApify([() => { throw new DOMException('timeout', 'TimeoutError'); }]);
    const slow = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(504);
    expect(slow.body.code).toBe('SBASE_IMAGE_TIMEOUT');
  });

  test('الصورة: غلطة في طلبنا لا تُعرض «1688 ما قراش صورتك»', async () => {
    // 26/11/2026 — شوهنا في حيّ: جسم طلب مشكّل غلط، والشاشة لومت الصورة.
    stubApify([() => new Response(JSON.stringify({
      error: { type: 'parameter validation failed: /maxResults: expected integer, but got string' },
    }), { status: 400 })]);
    const response = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(502);
    expect(response.body.code).toBe('SBASE_IMAGE_REQUEST_INVALID');
  });

  test('الصورة: صورة تعذّر فكّها فعلاً تبقى 400 SBASE_IMAGE_INVALID (الغلطة العميلية الوحيدة)', () => {
    const failure = sbaseImageFailureFrom(Object.assign(new Error('Format non supporté'), { code: 'INVALID_IMAGE' }));
    expect(failure.code).toBe('SBASE_IMAGE_INVALID');
    expect(failure.status).toBe(400);
  });
});

describe('S Base — isolation', () => {
  /** ملفات القالب: العزل الكامل (لا aywebs، لا zayrovix، لا serpapi). */
  const moduleFiles = [
    'descriptors.ts', 'extract.ts', 'detail.ts', 'pricing.ts', 'errors.ts',
    'image.ts', 'routes.ts', 'apify.ts',
  ].map((name) => join(process.cwd(), 'src/sbase', name));
  /** server.ts يربط القوالب ببعضها — فيه مراجع zayrovix مشروعة (مفاتيح الحدود). */
  const allFiles = moduleFiles.concat(join(process.cwd(), 'src/server.ts'));

  test('العميل القديم محذوف فعلاً من الشجرة', () => {
    expect(existsSync(join(process.cwd(), 'src/sbase/client.ts'))).toBe(false);
  });

  test('لا استيراد لـAYWEBs ولا Zayrovix ولا SerpApi في ملفات القالب', () => {
    for (const file of moduleFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/from '\.\.\/aywebs/);
      expect(source).not.toMatch(/zayrovix/);
      expect(source).not.toMatch(/SERPAPI_KEY|serpapi\.com/);
    }
  });

  test('المزوّد القديم مختفٍ كلياً من src: لا اسم، لا نطاق، لا متغيّر بيئة', () => {
    for (const file of allFiles) {
      const source = readFileSync(file, 'utf8');
      expect(source).not.toMatch(/sandbase/i);
      expect(source).not.toMatch(/SANDBASE_API_KEY|SBASE_PROVIDER/);
    }
  });
});
