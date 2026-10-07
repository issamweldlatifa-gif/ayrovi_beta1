/**
 * AYWEBs (P3) — العميل: الشكل، الجلسة، والنداءات.
 *
 * الاختبارات هنا تحمي قواعد ثابتة، موش تفاصيل:
 *  • كل طلب معلّم بـ `x-session-id` (الخادم يرفض بلاها) ؛
 *  • كل ردّ يتحقّق من الشكل — غلاف ناجح بمحتوى مغلوط يرمي `malformed` بصوت عالي؛
 *  • الأرقام تبقى كما جاءت من الخادم (السعر بالدينار ما يتحسبش هنا أبداً)؛
 *  • معرّف الجلسة يحتوي غير الرموز اللّي يقبلها الخادم.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  AYWEBS_RESOLVE_TIMEOUT_MS,
  analyzeAyWebsPage,
  fetchAyWebsStores,
  parseAyWebsPageAnalysis,
  parseAyWebsResolvedProduct,
  parseAyWebsStores,
  resolveAyWebsProduct,
} from '../src/api/aywebs';
import { ApiError } from '../src/api/errors';
import { API_BASE_URL } from '../src/api/config';
import { formatAyWebsSessionId, isValidAyWebsSessionId } from '../src/features/aywebs/sessionId';

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const stubFetch = (handler: Handler) => {
  const spy = vi.fn(async (url: unknown, init: unknown) =>
    handler(String(url), (init ?? {}) as RequestInit));
  vi.stubGlobal('fetch', spy);
  return spy;
};

const headersOf = (init: RequestInit): Record<string, string> =>
  (init.headers ?? {}) as Record<string, string>;

const bodyOf = (init: RequestInit): Record<string, unknown> =>
  JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/* ── معرّف الجلسة ──────────────────────────────────────────────────────────── */

describe('معرّف جلسة AYWEBs', () => {
  it('يقبل النمط اللّي يفرضو الخادم ويرفض ما سواه', () => {
    expect(isValidAyWebsSessionId('ayw-3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    expect(isValidAyWebsSessionId('court')).toBe(false);
    expect(isValidAyWebsSessionId('فيه فراغ')).toBe(false);
    expect(isValidAyWebsSessionId('a'.repeat(161))).toBe(false);
    expect(isValidAyWebsSessionId(42)).toBe(false);
  });

  it('يبني المعرّف من UUID، ويفشل بصوت عالي إذا UUID غير صالح', () => {
    expect(formatAyWebsSessionId('3F2504E0-4F89-41D3-9A0C-0305E82C3301'))
      .toBe('ayw-3f2504e0-4f89-41d3-9a0c-0305e82c3301');
    expect(() => formatAyWebsSessionId('x')).toThrow(/UUID invalide/);
  });
});

/* ── الشكل ─────────────────────────────────────────────────────────────────── */

const ANALYSIS = {
  url: 'https://www.amazon.com/dp/B0GYM3V9H5',
  store_id: 'amazon',
  store_name: 'Amazon',
  integration_type: 'PARTIALLY_SUPPORTED',
  registered: true,
  browse_allowed: true,
  capture_allowed: true,
  external_capture_allowed: false,
  page_type: 'PRODUCT',
  is_product_page: true,
  product_detected: true,
  customer_action_required: false,
  browser_mode: 'IN_APP',
  fallback: 'Ajoutez au panier, nous achetons pour vous.',
  reason: '',
  analyzed_at: '2026-10-07T12:00:00.000Z',
};

describe('تحليل الصفحة', () => {
  it('يفكّ الشكل الكامل', () => {
    const parsed = parseAyWebsPageAnalysis(ANALYSIS);
    expect(parsed.storeId).toBe('amazon');
    expect(parsed.productDetected).toBe(true);
    expect(parsed.captureAllowed).toBe(true);
    expect(parsed.fallback).toContain('achetons');
  });

  it('غلاف ناجح بمحتوى ناقص = خطأ صريح', () => {
    expect(() => parseAyWebsPageAnalysis({ store_id: 'amazon' })).toThrow(ApiError);
    expect(() => parseAyWebsPageAnalysis(null)).toThrow(/illisible/);
  });
});

describe('قائمة المتاجر', () => {
  const STORE = {
    id: 'amazon', name: 'Amazon', display_name: 'Amazon', country: 'US', currency: 'USD',
    enabled: true, capture_supported: true, operational: true, operational_reason: null,
    adapter: 'amazon', status: 'PARTIALLY_SUPPORTED', integration_type: 'PARTIALLY_SUPPORTED',
    capabilities: ['browse', 'product'], browser_mode: 'IN_APP', home_url: 'https://www.amazon.com',
    purchase_mode: 'MANUAL_REVIEW', popular: true,
  };

  it('يفكّ اللائحة ويحفظ الحالة كما هي', () => {
    const parsed = parseAyWebsStores([STORE, { ...STORE, id: 'shein', operational: false, operational_reason: 'RENDER_PROVIDER_NOT_CONFIGURED' }]);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].operational).toBe(true);
    expect(parsed[1].operationalReason).toBe('RENDER_PROVIDER_NOT_CONFIGURED');
    expect(parsed[0].capabilities).toEqual(['browse', 'product']);
  });

  it('يرفض لائحة فيها متجر بلا معرّف', () => {
    expect(() => parseAyWebsStores([{ name: 'sans id' }])).toThrow(/sans identifiant/);
    expect(() => parseAyWebsStores({})).toThrow(/liste des boutiques/);
  });
});

describe('بطاقة المنتوج', () => {
  const PRODUCT = {
    product_id: 'ayweb_42',
    store_id: 'amazon',
    store_name: 'Amazon',
    source_url: 'https://www.amazon.com/dp/B0GYM3V9H5',
    source_domain: 'amazon.com',
    title: 'Écouteurs sans fil',
    brand: 'Acme',
    images: ['https://m.media-amazon.com/images/I/x.jpg', 42],
    price: 109,
    currency: 'USD',
    price_verified: true,
    currency_verified: true,
    availability: { state: 'AVAILABLE', reason: '', checked_at: '2026-10-07T12:00:00.000Z', source: 'dom', quantity_hint: null },
    purchase_mode: 'MANUAL_REVIEW',
    integration_type: 'PARTIALLY_SUPPORTED',
    from_cache: false,
    cache_age_ms: null,
    ayrovi_pricing: {
      total_tnd: 583.01,
      pricing_version: 3,
      breakdown: { converted_source_price: 436, shipping: 65, customs: 52, service_fee: 30, other: 0.01 },
    },
  };

  it('يقرا السعر بالدينار كما جاء من الخادم، بلا أي حساب محلي', () => {
    const parsed = parseAyWebsResolvedProduct(PRODUCT);
    expect(parsed.ayroviPricing?.totalTnd).toBe(583.01);
    expect(parsed.ayroviPricing?.breakdown?.shipping).toBe(65);
    expect(parsed.priceVerified).toBe(true);
    expect(parsed.images).toEqual(['https://m.media-amazon.com/images/I/x.jpg']);
  });

  it('يقبل بطاقة بلا سعر منشور (الحقيقة: لا سعر) وبلا حسبة', () => {
    const parsed = parseAyWebsResolvedProduct({
      ...PRODUCT, price: null, currency: '', ayrovi_pricing: null, price_verified: false, currency_verified: false,
    });
    expect(parsed.price).toBeNull();
    expect(parsed.ayroviPricing).toBeNull();
    expect(parsed.currencyVerified).toBe(false);
  });

  it('بطاقة بلا عنوان أو بلا معرّف = خطأ صريح', () => {
    expect(() => parseAyWebsResolvedProduct({ ...PRODUCT, product_id: '' })).toThrow(/fiche produit/);
    expect(() => parseAyWebsResolvedProduct({ ...PRODUCT, title: '   ' })).toThrow(/fiche produit/);
  });
});

/* ── النداءات ──────────────────────────────────────────────────────────────── */

describe('نداءات AYWEBs', () => {
  const SESSION = 'ayw-3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('التحليل: POST إلى الخادم مع الجلسة والرابط', async () => {
    const spy = stubFetch(() => json({ success: true, data: ANALYSIS }));
    const result = await analyzeAyWebsPage(ANALYSIS.url, { sessionId: SESSION });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/v1/aywebs/page/analyze`);
    expect(init.method).toBe('POST');
    expect(headersOf(init)['x-session-id']).toBe(SESSION);
    expect(bodyOf(init)).toEqual({ url: ANALYSIS.url });
    expect(result.registered).toBe(true);
  });

  it('السعر: POST مع الجلسة ومعرّف المتجر، وبمهلة كافية للقراءة الباردة', async () => {
    const spy = stubFetch(() => json({
      success: true,
      data: { product_id: 'ayweb_42', title: 'Écouteurs', store_id: 'amazon' },
    }, 201));
    const result = await resolveAyWebsProduct('https://www.amazon.com/dp/B0GYM3V9H5', {
      sessionId: SESSION,
      storeId: 'amazon',
      quantity: 1,
    });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/v1/aywebs/product/resolve`);
    expect(headersOf(init)['x-session-id']).toBe(SESSION);
    expect(bodyOf(init)).toMatchObject({ store_id: 'amazon', quantity: 1 });
    expect(result.productId).toBe('ayweb_42');
    // 12 ثانية الافتراضية تقطع قراءة باردة صحيحة: المهلة متاع السعر أطول بوضوح.
    expect(AYWEBS_RESOLVE_TIMEOUT_MS).toBeGreaterThan(12_000);
  });

  it('رفض الخادم يوصل بالكود متاعو — SESSION_REQUIRED ما يتخبّاش', async () => {
    stubFetch(() => json({ success: false, code: 'SESSION_REQUIRED', error: 'Session AYROVI invalide ou absente.' }, 400));
    await expect(analyzeAyWebsPage(ANALYSIS.url, { sessionId: '' })).rejects.toMatchObject({
      code: 'SESSION_REQUIRED',
      status: 400,
    });
  });

  it('المتاجر: GET بدون جلسة (نقطة عمومية)', async () => {
    const spy = stubFetch(() => json({ success: true, data: [] }));
    await fetchAyWebsStores();
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/v1/aywebs/stores`);
    expect(init.method ?? 'GET').toBe('GET');
  });
});

/* ── تحقق من أن الوحدتين النقيتين ما تجرّوش React Native ──────────────────── */

describe('حدود الوحدات', () => {
  it('sessionId و aywebs ما يستوردوش React Native (يخدمو في Node)', async () => {
    const fs = await import('node:fs');
    const sources = [
      fs.readFileSync(new URL('../src/features/aywebs/sessionId.ts', import.meta.url), 'utf8'),
      fs.readFileSync(new URL('../src/api/aywebs.ts', import.meta.url), 'utf8'),
    ];
    for (const source of sources) {
      expect(source).not.toMatch(/from ['"]react-native['"]/);
      expect(source).not.toMatch(/from ['"]expo-/);
    }
  });
});
