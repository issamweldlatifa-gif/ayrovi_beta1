/**
 * OCEREX (P4.3) — العميل: العقد، البوابة، والحدود.
 *
 * هذي الاختبارات تحمي الخطّ الحسّاس: صورة ⇒ سعر ⇒ رابط ⇒ سطر سلّة.
 *   • ردود OCEREX بلا غلاف `data` — نتأكّد أن القراءة تتوقّع الشكل الحقيقي؛
 *   • `success:false` + `code` يوصل الاستخراج كامل (الرحلة ما تتوقّفش)؛
 *   • `LOW` توقف التسعير والشراء؛ و`CURRENCY_LOCKED` ما تتخمّنش في الجهاز؛
 *   • الشراء ما يتمّش بلا سعر محسوب، بلا عملة، وبلا رابط HTTPS؛
 *   • `cartItemId` غايب = عقد مكسور (موش نجاح صامت).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OCEREX_TIMEOUT_MS, analyzeOcerexImage, calculateOcerexPrice, commitOcerexToCart,
  ocerexReadiness, parseOcerexExtraction, resolveOcerexUrl,
} from '../src/api/ocerex';
import { DEFAULT_TIMEOUT_MS } from '../src/api/client';
import { API_BASE_URL } from '../src/api/config';

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (handler: Handler) => {
  const spy = vi.fn(async (url: unknown, init: unknown) =>
    handler(String(url), (init ?? {}) as RequestInit));
  vi.stubGlobal('fetch', spy);
  return spy;
};

const headersOf = (init: RequestInit): Record<string, string> => (init.headers ?? {}) as Record<string, string>;
const bodyOf = (init: RequestInit): Record<string, unknown> =>
  JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;

const SESSION = 'ayw-3f2504e0-4f89-41d3-9a0c-0305e82c3301';

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const EXTRACTION = {
  success: true,
  extractionId: 'ocx_1',
  type: 'PRODUCT',
  referencePrice: 129,
  currency: 'EUR',
  confidence: 0.86,
  confidenceLevel: 'HIGH',
  source: 'OCR',
  priceContext: 'REFERENCE',
  productTitle: 'Veste en jean',
  platform: 'Zara',
  sourceUrl: '',
  code: 'OK',
  ayroviPrice: null,
  pricingVersion: null,
  supportedCurrencies: ['TND', 'EUR', 'USD', 'GBP', 'JPY'],
};

describe('شكل الاستخراج', () => {
  it('يتقرا من الجذر (بلا غلاف data) ويحوّل الحقول', () => {
    const parsed = parseOcerexExtraction(EXTRACTION);
    expect(parsed.extractionId).toBe('ocx_1');
    expect(parsed.type).toBe('PRODUCT');
    expect(parsed.referencePrice).toBe(129);
    expect(parsed.currency).toBe('EUR');
    expect(parsed.confidenceLevel).toBe('HIGH');
    expect(parsed.supportedCurrencies).toContain('TND');
  });

  it('أنواع ومستويات خارج القاموس ما تترقّاش', () => {
    const parsed = parseOcerexExtraction({ ...EXTRACTION, type: 'PROBABLEMENT', confidenceLevel: 'PEUT_ETRE' });
    expect(parsed.type).toBe('UNKNOWN');
    expect(parsed.confidenceLevel).toBe('LOW');
  });

  it('بلا معرّف استخراج = عقد مكسور', () => {
    expect(() => parseOcerexExtraction({ ...EXTRACTION, extractionId: '' })).toThrow(/extraction/);
    expect(() => parseOcerexExtraction(null)).toThrow(/extraction/);
  });
});

describe('تحليل الصورة', () => {
  it('يرفع الملف مع جلسة AYWEBs، والـ`success:false` ما يمنعش الرحلة', async () => {
    const spy = stubFetch(() => json({ ...EXTRACTION, success: false, code: 'LOW_CONFIDENCE', confidenceLevel: 'LOW' }));

    const outcome = await analyzeOcerexImage(
      { uri: 'file:///tmp/capture.png', mimeType: 'image/png' },
      SESSION,
    );

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/ocerex/analyze`);
    expect(headersOf(init)['x-session-id']).toBe(SESSION);
    expect(init.body).toBeInstanceOf(FormData);
    // القرار يوصل: نعرفو أنه موش OK، والاستخراج موجود باش نعرضو السبب.
    expect(outcome.ok).toBe(false);
    expect(outcome.extraction.code).toBe('LOW_CONFIDENCE');
    expect(outcome.extraction.confidenceLevel).toBe('LOW');
  });

  it('صورة بلا مسار = خطأ قبل أي شبكة', async () => {
    const spy = stubFetch(() => json(EXTRACTION));
    await expect(analyzeOcerexImage({ uri: '', mimeType: 'image/jpeg' }, SESSION))
      .rejects.toMatchObject({ kind: 'malformed' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('مهلة OCEREX أطول بوضوح: قراءة OCR + محرّك التسعير', () => {
    expect(OCEREX_TIMEOUT_MS).toBeGreaterThan(DEFAULT_TIMEOUT_MS * 3);
  });
});

describe('التسعير', () => {
  it('بلا عملة مقروءة: نبعثو العملة المختارة، والرقم يجي من الخادم', async () => {
    const spy = stubFetch(() => json({
      ...EXTRACTION, currency: 'EUR', ayroviPrice: 512.4, pricingVersion: 3, code: 'OK',
    }));

    const next = await calculateOcerexPrice({ extractionId: 'ocx_1', currency: 'EUR' }, SESSION);
    expect(bodyOf(spy.mock.calls[0][1] as RequestInit)).toEqual({ extractionId: 'ocx_1', currency: 'EUR' });
    expect(next.ayroviPrice).toBe(512.4);
    expect(next.pricingVersion).toBe(3);
  });

  it('العملة المقروءة ما تنبعثش للتبديل، ورفض الخادم يوصل بكودو', async () => {
    const spy = stubFetch(() => json({ success: false, code: 'CURRENCY_LOCKED', error: 'La devise extraite ne peut pas être remplacée.' }, 400));
    await expect(calculateOcerexPrice({ extractionId: 'ocx_1' }, SESSION))
      .rejects.toMatchObject({ code: 'CURRENCY_LOCKED', status: 400 });
    // بلا عملة في الجسم: ما نبدّلوش اللي قرى الخادم.
    expect(bodyOf(spy.mock.calls[0][1] as RequestInit)).toEqual({ extractionId: 'ocx_1' });
  });
});

describe('الرابط والإضافة', () => {
  it('الرابط: يُبعث مع المعرّف، والربط يرجع من `resolved`', async () => {
    const spy = stubFetch(() => json({
      ...EXTRACTION,
      resolved: { title: 'Veste en jean', platform: 'Zara', url: 'https://www.zara.com/tn/x', imageUrl: '' },
    }));
    const outcome = await resolveOcerexUrl({ extractionId: 'ocx_1', url: 'https://www.zara.com/tn/x' }, SESSION);
    expect(bodyOf(spy.mock.calls[0][1] as RequestInit)).toEqual({ extractionId: 'ocx_1', url: 'https://www.zara.com/tn/x' });
    expect(outcome.resolution.platform).toBe('Zara');
    expect(outcome.extraction.extractionId).toBe('ocx_1');
  });

  it('الإضافة: 201 + معرّف سطر الخادم؛ وبلا معرّف = عقد مكسور', async () => {
    const spy = stubFetch(() => json({ ...EXTRACTION, cartItemId: 'cart_item_9', ayroviPrice: 512.4 }, 201));
    const outcome = await commitOcerexToCart('ocx_1', SESSION);
    expect(String(spy.mock.calls[0][0])).toBe(`${API_BASE_URL}/api/ocerex/commit`);
    expect(outcome.cartItemId).toBe('cart_item_9');

    stubFetch(() => json({ ...EXTRACTION }, 201));
    await expect(commitOcerexToCart('ocx_1', SESSION)).rejects.toMatchObject({ kind: 'malformed' });
  });
});

describe('بوابة الجاهزية (نفس شروط الخادم)', () => {

  it('LOW توقف التسعير والشراء', () => {
    const readiness = ocerexReadiness(parseOcerexExtraction({ ...EXTRACTION, confidenceLevel: 'LOW' }));
    expect(readiness.canCalculate).toBe(false);
    expect(readiness.canCommit).toBe(false);
    expect(readiness.calculateBlock).toBe('LOW_CONFIDENCE');
  });

  it('بلا سعر مرجعي ما فماش شي يتحسب', () => {
    const readiness = ocerexReadiness(parseOcerexExtraction({ ...EXTRACTION, referencePrice: null }));
    expect(readiness.canCalculate).toBe(false);
    expect(readiness.calculateBlock).toBe('NO_REFERENCE_PRICE');
  });

  it('الشراء يستلزم: تسعير خادمي + عملة + رابط HTTPS', () => {
    // تسعير موجود + عملة + رابط ⇒ جاهز للشراء.
    const ready = ocerexReadiness(parseOcerexExtraction({
      ...EXTRACTION, ayroviPrice: 512.4, sourceUrl: 'https://www.zara.com/tn/x',
    }));
    expect(ready.canCommit).toBe(true);
    expect(ready.commitBlock).toBe('');

    // بلا تسعير ⇒ الشراء موقوف، والسبب «السعر ما تحسبش» موش «ما فماش سعر مرجعي».
    const noPrice = ocerexReadiness(parseOcerexExtraction({ ...EXTRACTION, sourceUrl: 'https://www.zara.com/tn/x' }));
    expect(noPrice.canCommit).toBe(false);
    expect(noPrice.commitBlock).toBe('PRICE_NOT_CALCULATED');
    expect(noPrice.canCalculate).toBe(true); // التسعير نفسه ممكن — الرقم ما تحسبش بعد

    // بلا عملة ⇒ العملة تتقال.
    const noCurrency = ocerexReadiness(parseOcerexExtraction({
      ...EXTRACTION, currency: '', ayroviPrice: 512.4, sourceUrl: 'https://www.zara.com/tn/x',
    }));
    expect(noCurrency.commitBlock).toBe('CURRENCY_UNCONFIRMED');

    // بلا رابط ولا رابط غير HTTPS ⇒ موقوف.
    const noUrl = ocerexReadiness(parseOcerexExtraction({ ...EXTRACTION, ayroviPrice: 512.4 }));
    expect(noUrl.commitBlock).toBe('INVALID_URL');
    const httpUrl = ocerexReadiness(parseOcerexExtraction({
      ...EXTRACTION, ayroviPrice: 512.4, sourceUrl: 'http://www.zara.com/tn/x',
    }));
    expect(httpUrl.canCommit).toBe(false);
    expect(httpUrl.commitBlock).toBe('INVALID_URL');
    const base = ocerexReadiness(parseOcerexExtraction(EXTRACTION));
    expect(base.canCalculate).toBe(true); // القاعدة الأساسية: التسعير ممكن
    expect(base.canCommit).toBe(false); // بلا سعر محسوب ما فماش شراء
  });

  it('بلا استخراج: كل شي موقوف بلا كلام زايد', () => {
    expect(ocerexReadiness(null)).toEqual({
      canCalculate: false, canResolve: false, canCommit: false, calculateBlock: '', commitBlock: '',
    });
  });
});

describe('حدود الوحدة', () => {
  it('ocerex.ts ما يستوردش React Native ولا Expo', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('../src/api/ocerex.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]react-native['"]/);
    expect(source).not.toMatch(/from ['"]expo-/);
  });
});
