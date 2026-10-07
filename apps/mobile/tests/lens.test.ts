/**
 * Lens (P4.1) — العميل: الشكل، القواعد، والحدود.
 *
 * الاختبارات هنا تحمي ما لا يجب أن ينكسر:
 *  • السعر والقرار يجيو من الخادم — التطبيق ما يحسبش وما يخمّنش؛
 *  • سعر غايب يبقى `null` (يتقال «ما فماش»)، وتوفّر غريب يبقى `unknown`؛
 *  • فيشة بلا رابط ولا عنوان = عقد مكسور ⇒ خطأ، موش بطاقة فارغة؛
 *  • مهلة Lens أطول من الافتراضية (الخادم يزور صفحات المتاجر)؛
 *  • ما نستوردوش React Native في طبقة الـ API (تبقى قابلة للاختبار في Node).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  LENS_ANALYZE_TIMEOUT_MS, LENS_BARCODE_PATTERN, LENS_MIN_TEXT,
  analyzeLensBarcode, analyzeLensCode, analyzeLensImage, analyzeLensText, analyzeLensUrl,
  LENS_BARCODE_TYPES, classifyLensScan,
  fetchLensHistory, fetchLensWatches, isLensAllowedMime, lensLiveStock, lensUploadInputFrom,
  parseLensAnalysis, parseLensCandidate,
} from '../src/api/lens';
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

const bodyOf = (init: RequestInit): Record<string, unknown> =>
  JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/* ── فيشة واحدة ───────────────────────────────────────────────────────────── */

const CANDIDATE = {
  id: 'cand_1',
  kind: 'external',
  title: 'Écouteurs Bluetooth',
  brand: 'Anker',
  source: 'Amazon',
  sourceUrl: 'https://www.amazon.com/dp/B0GYM3V9H5',
  image: 'https://m.media-amazon.com/images/I/x.jpg',
  images: ['https://m.media-amazon.com/images/I/x.jpg'],
  price: 109,
  currency: 'USD',
  priceTnd: 583.01,
  priceOrigin: 'merchant',
  originalPrice: 149,
  originalPriceTnd: 800,
  availability: 'in_stock',
  priceVerificationStatus: 'VERIFIED',
  priceToken: 't'.repeat(64),
  match: 92,
  rating: 4.5,
  ratingCount: 1200,
  ratingKind: 'merchant',
  colors: ['Black'],
  sizes: ['M'],
  offerCount: 2,
  offers: [{ source: 'Amazon', sourceUrl: 'https://www.amazon.com/dp/B0GYM3V9H5', price: 109, currency: 'USD', priceTnd: 583.01 }],
};

describe('فيشة Lens', () => {
  it('تتقرا كما هي من الخادم', () => {
    const candidate = parseLensCandidate(CANDIDATE);
    expect(candidate.title).toBe('Écouteurs Bluetooth');
    expect(candidate.priceTnd).toBe(583.01);
    expect(candidate.availability).toBe('in_stock');
    expect(candidate.verification).toBe('VERIFIED');
    expect(candidate.priceToken).toBe('t'.repeat(64));
    expect(candidate.offers[0].priceTnd).toBe(583.01);
    expect(candidate.originalPriceTnd).toBe(800);
  });

  it('سعر غايب يبقى غايب، وتوفّر غريب يبقى «ما تأكّدناش»', () => {
    const candidate = parseLensCandidate({
      ...CANDIDATE,
      price: null,
      currency: null,
      priceTnd: null,
      availability: 'probablement',
      priceVerificationStatus: 'PENDING_MANUAL',
    });
    expect(candidate.price).toBeNull();
    expect(candidate.priceTnd).toBeNull();
    expect(candidate.currency).toBe('');
    // ما نرقّيوش قيمة مجهولة إلى «متوفّر» — القاموس مغلق.
    expect(candidate.availability).toBe('unknown');
    expect(candidate.verification).toBe('PENDING_MANUAL');
  });

  it('فيشة بلا عنوان ولا رابط = عقد مكسور ⇒ استثناء', () => {
    expect(() => parseLensCandidate({ ...CANDIDATE, title: '' })).toThrow(/résultat/);
    expect(() => parseLensCandidate({ ...CANDIDATE, sourceUrl: '' })).toThrow(/résultat/);
    expect(() => parseLensCandidate([])).toThrow(/résultat/);
  });
});

/* ── التحليل الكامل ───────────────────────────────────────────────────────── */

describe('تحليل Lens', () => {
  it('يفرّق بين ثقة 0 وثقة غايبة، ويقرا الإحصائيات', () => {
    const parsed = parseLensAnalysis({
      identification: { brand: 'Anker', model: 'Q30', description: '', confidence: 0 },
      query: 'Anker Q30',
      candidates: [CANDIDATE],
      eventId: 'ayx_1',
      liveStock: { fetched: 3, cacheHits: 5, applied: 3, budget: 8 },
      excluded: { count: 2, reasons: { out_of_stock: 2 } },
    });
    expect(parsed.identification.confidence).toBe(0);
    expect(parsed.candidates).toHaveLength(1);
    expect(parsed.liveStock.fetched).toBe(3);
    expect(parsed.excluded).toEqual({ count: 2, reasons: { out_of_stock: 2 } });

    const empty = parseLensAnalysis({ identification: {}, candidates: [] });
    expect(empty.identification.confidence).toBe(0);
    expect(empty.liveStock.applied).toBe(0);
    expect(empty.excluded.count).toBe(0);
  });

  it('قائمة نتائج غايبة = خطأ، موش «صفر نتيجة» في الصمت', () => {
    expect(() => parseLensAnalysis({ identification: {}, query: 'x' })).toThrow(/liste/);
    expect(() => parseLensAnalysis(null)).toThrow(/analyse/);
  });
});

/* ── الرفع: الصورة ───────────────────────────────────────────────────────── */

describe('رفع الصورة', () => {
  it('تُبعث كملف إلى /analyze-image، والـ ROI في الخادم', async () => {
    const spy = stubFetch(() => json({
      success: true,
      data: { identification: { brand: 'Anker', confidence: 0.8 }, query: 'Anker', candidates: [CANDIDATE], eventId: 'ayx_1' },
    }));

    const analysis = await analyzeLensImage({
      uri: 'file:///tmp/photo.jpg',
      mimeType: 'image/jpeg',
      roi: { x: 10, y: 20, w: 30, h: 40 },
    });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/ayrovix/analyze-image`);
    expect(init.method).toBe('POST');
    // بلا Content-Type يدوي: الحدّ (boundary) متاع multipart يخترعو المحرّك.
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('roi')).toBe(JSON.stringify({ x: 10, y: 20, w: 30, h: 40 }));
    expect(analysis.candidates[0].priceTnd).toBe(583.01);
  });

  it('صورة بلا مسار = خطأ قبل أي شبكة', async () => {
    const spy = stubFetch(() => json({ success: true, data: { candidates: [] } }));
    await expect(analyzeLensImage({ uri: '', mimeType: 'image/jpeg' })).rejects.toMatchObject({ kind: 'malformed' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('نوع الملف يُستنتج من الامتداد كي ما يعلنوش المصوّر', () => {
    expect(lensUploadInputFrom({ uri: 'file:///a/b.png' }).mimeType).toBe('image/png');
    expect(lensUploadInputFrom({ uri: 'file:///a/b.webp', mimeType: 'IMAGE/WEBP' }).mimeType).toBe('image/webp');
    expect(lensUploadInputFrom({ uri: 'file:///a/b.jpg' }).mimeType).toBe('image/jpeg');
    expect(() => lensUploadInputFrom({ uri: '' })).toThrow(/Aucune image/);
  });

  it('نقبل غير الأنواع الثلاثة اللّي يقبلها الخادم', () => {
    expect(isLensAllowedMime('image/jpeg')).toBe(true);
    expect(isLensAllowedMime('image/PNG')).toBe(true);
    expect(isLensAllowedMime('image/webp')).toBe(true);
    expect(isLensAllowedMime('image/gif')).toBe(false);
    expect(isLensAllowedMime('application/pdf')).toBe(false);
  });

  it('الرفض من الخادم يوصل بكودو — بلا تجميل', async () => {
    stubFetch(() => json({ success: false, code: 'AYROVIX_UNAVAILABLE', error: "AYROVIX n'est pas encore activé." }, 503));
    await expect(analyzeLensImage({ uri: 'file:///a.jpg', mimeType: 'image/jpeg' }))
      .rejects.toMatchObject({ code: 'AYROVIX_UNAVAILABLE', status: 503 });
  });
});

/* ── النصّ، الرمز، الباركود، الرابط ─────────────────────────────────────── */

describe('القنوات النصّية', () => {
  it('النصّ يمشي في `query`، والحدّ الأدنى معروف', async () => {
    const spy = stubFetch(() => json({ success: true, data: { query: 'anker', candidates: [CANDIDATE], eventId: 'ayx_2' } }));
    const result = await analyzeLensText('anker');
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/ayrovix/analyze-text`);
    expect(bodyOf(init)).toEqual({ query: 'anker' });
    expect(result.candidates[0].title).toBe('Écouteurs Bluetooth');
    expect(result.eventId).toBe('ayx_2');
    expect(LENS_MIN_TEXT).toBe(2);
  });

  it('QR في `value`، والباركود في `code` بستّ خانات على الأقل', async () => {
    const spy = stubFetch((url) => url.includes('analyze-barcode')
      ? json({ success: true, data: { code: '1234567890', candidates: [], eventId: 'ayx_3' } })
      : json({ success: true, data: { value: '(قيمة QR)', candidates: [], eventId: 'ayx_4' } }));

    await analyzeLensCode('https://ayrovi.tn/x');
    expect(bodyOf(spy.mock.calls[0][1] as RequestInit)).toEqual({ value: 'https://ayrovi.tn/x' });

    await analyzeLensBarcode('1234567890');
    expect(bodyOf(spy.mock.calls[1][1] as RequestInit)).toEqual({ code: '1234567890' });

    expect(LENS_BARCODE_PATTERN.test('123456')).toBe(true);
    expect(LENS_BARCODE_PATTERN.test('12345')).toBe(false);
    expect(LENS_BARCODE_PATTERN.test('123456789012345')).toBe(false);
  });

  it('الرابط: المنتوج والبدائل والـ fallback يتقال', async () => {
    stubFetch(() => json({
      success: true,
      data: {
        product: {
          title: 'Sac à dos', brand: null, description: '', image: '', images: [], source: 'Web',
          sourceUrl: 'https://x.test/p', price: null, currency: null, priceTnd: null,
          availability: 'unknown', priceVerificationStatus: 'PENDING_MANUAL',
          verificationFailureCode: 'MERCHANT_EXTRACTION_FAILED',
        },
        alternates: [CANDIDATE],
        eventId: 'ayx_5',
        fallback: true,
      },
    }));
    const result = await analyzeLensUrl('https://x.test/p');
    expect(result.fallback).toBe(true);
    expect(result.product.price).toBeNull();
    expect(result.product.priceToken).toBe('');
    expect(result.alternates[0].priceTnd).toBe(583.01);
  });
});

/* ── الطازج: المخزون والسعر ─────────────────────────────────────────────── */

describe('قراءة المخزون الطازجة', () => {
  it('8 روابط على الأكثر، والقراءة بلا ذاكرة تتقال بتاريزها', async () => {
    const spy = stubFetch(() => json({
      success: true,
      data: {
        results: [{
          url: 'https://x.test/p', availability: 'limited', price: 20, currency: 'USD', priceTnd: 100,
          originalPriceTnd: null, sizes: ['M'], colors: ['Black'], images: [],
          variants: [{ value: 'M', color: 'Black', availability: 'available' }, { value: 'L', color: null, availability: 'weird' }],
          checkedAt: '2026-10-07T12:00:00.000Z', reason: 'merchant_page_read', priceToken: 'tok',
        }],
      },
    }));

    const urls = Array.from({ length: 12 }, (_, index) => `https://x.test/${index}`);
    const results = await lensLiveStock({ urls, title: 'Sac' });

    const body = bodyOf(spy.mock.calls[0][1] as RequestInit);
    expect((body.urls as string[])).toHaveLength(8); // الحدّ من الخادم، مطبّق بصراحة
    expect(body.title).toBe('Sac');
    expect(results[0].availability).toBe('limited');
    expect(results[0].checkedAt).toBe('2026-10-07T12:00:00.000Z');
    // توفّر متغيّرة غريب ما يولّيش «متوفّر».
    expect(results[0].variants[1].availability).toBe('unknown');
  });

  it('بلا روابط = خطأ قبل الشبكة', async () => {
    const spy = stubFetch(() => json({ success: true, data: { results: [] } }));
    await expect(lensLiveStock({ urls: [] })).rejects.toMatchObject({ kind: 'malformed' });
    expect(spy).not.toHaveBeenCalled();
  });
});

/* ── المراقبة والسجلّ ───────────────────────────────────────────────────── */

describe('المراقبة والسجلّ', () => {
  it('المراقبة تُقرا بحقولها (camelCase من الخدمة)', async () => {
    const spy = stubFetch(() => json({
      success: true,
      data: [{
        id: 'watch_1', url: 'https://x.test/p', title: 'Sac', image_url: 'https://x.test/i.jpg',
        imageUrl: 'https://x.test/i.jpg', source: 'Amazon', targetPriceTnd: 90, lastPriceTnd: 95.5,
        lastCurrency: 'USD', lastPrice: 20, status: 'ACTIVE',
        lastCheckedAt: '2026-10-07T10:00:00.000Z', createdAt: '2026-10-01T10:00:00.000Z',
      }],
    }));
    const watches = await fetchLensWatches();
    expect(String(spy.mock.calls[0][0])).toBe(`${API_BASE_URL}/api/ayrovix/watch`);
    expect(watches[0]).toMatchObject({ id: 'watch_1', targetPriceTnd: 90, lastPriceTnd: 95.5, status: 'ACTIVE' });
  });

  it('401 على المراقبة يوصل كخطأ مصنّف (شاشة تتصرّف، ما تتخبّطش)', async () => {
    stubFetch(() => json({ success: false, error: 'Connectez-vous pour voir vos veilles.' }, 401));
    const error = await fetchLensWatches().catch((caught: unknown) => caught);
    expect(error).toMatchObject({ kind: 'http', status: 401 });
  });

  it('السجلّ: قائمة فارغة كي ما كانش حساب — بلا خطأ', async () => {
    stubFetch(() => json({ success: true, data: [] }));
    await expect(fetchLensHistory()).resolves.toEqual([]);
  });
});

/* ── الحدود ────────────────────────────────────────────────────────────── */

describe('حدود الوحدة', () => {
  it('lens.ts ما يستوردش React Native ولا Expo (يخدم في Node)', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('../src/api/lens.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]react-native['"]/);
    expect(source).not.toMatch(/from ['"]expo-/);
  });

  it('مهلة Lens أطول بوضوح من مهلة النداء العادي', async () => {
    const { DEFAULT_TIMEOUT_MS } = await import('../src/api/client');
    expect(LENS_ANALYZE_TIMEOUT_MS).toBeGreaterThan(DEFAULT_TIMEOUT_MS * 3);
  });
});

/* ── تصنيف قيمة المسح (P4.2) ───────────────────────────────────────────── */

describe('تصنيف الرمز المقروء', () => {
  const cases: Array<[string, string]> = [
    ['1234567890', 'barcode'],
    ['123456', 'barcode'],
    ['https://www.amazon.com/dp/B0GYM3V9H5', 'url'],
    ['http://www.amazon.com/dp/B0GYM3V9H5', 'url'],   // تتصلّح إلى https
    ['www.shein.com/x-p-1.html', 'url'],              // بلا بروتوكول
    ['ECOUTEURS ANKER Q30', 'code'],
    ['   ', 'skip'],
    ['1', 'skip'],
  ];

  it('كل قيمة تمشي لقناتها الصحيحة', () => {
    for (const [input, kind] of cases) {
      const target = classifyLensScan(input);
      if (kind === 'skip') {
        expect(target, `« ${input} » ما لازمش تتقبل`).toBeNull();
        continue;
      }
      expect(target?.kind, `« ${input} »`).toBe(kind);
    }
  });

  it('الروابط بلا بروتوكول تتصلّح، والقيم الطويلة/المخفيّة تتنقّى', () => {
    expect(classifyLensScan('http://x.test/a')?.value).toBe('https://x.test/a');
    expect(classifyLensScan('www.x.test/a')?.value).toBe('https://www.x.test/a');
    // محارف تحكّم + مسافات زايدة: تتنقّى قبل ما تتبعث.
    expect(classifyLensScan('  ECOUTEURS\u0000  ANKER ')?.value).toBe('ECOUTEURS ANKER');
    expect((classifyLensScan('A'.repeat(3000))?.value ?? '').length).toBe(2000);
  });

  it('أنواع الباركود المطلوبة من الكاميرا كلها يعرفها الخادم', () => {
    expect([...LENS_BARCODE_TYPES]).toEqual(expect.arrayContaining(['ean13', 'ean8', 'upc_a', 'qr', 'code128']));
  });
});
