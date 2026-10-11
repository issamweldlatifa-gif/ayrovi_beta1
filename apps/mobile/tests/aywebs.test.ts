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
  AYWEBS_SOURCE_VERIFICATION_REQUIRED,
  addAyWebsCartItem,
  analyzeAyWebsPage,
  ayWebsAddReadiness,
  ayWebsNeedsHumanRequest,
  bridgeAyWebsCartToAyrovi,
  buildAyWebsCaptureInjection,
  createAyWebsPurchaseRequest,
  createAyWebsStoreRequest,
  fetchAyWebsCaptureScript,
  fetchAyWebsCart,
  fetchAyWebsPurchaseRequests,
  fetchAyWebsStoreRequests,
  fetchAyWebsStores,
  parseAyWebsCaptureMessage,
  parseAyWebsCart,
  parseAyWebsPageAnalysis,
  parseAyWebsPurchaseRequest,
  parseAyWebsStoreRequest,
  parseAyWebsResolvedProduct,
  parseAyWebsStores,
  parseAyWebsVariantOption,
  parseAyWebsVariants,
  resetAyWebsCaptureScriptCache,
  resolveAyWebsProduct,
  resolveAyWebsProductWithCapture,
  updateAyWebsCartItem,
  verifyAyWebsCart,
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


/* ── الكابتشر: السكريبت، الحقن، ورسالة الجسر ─────────────────────────────── */

describe('سكريبت الكابتشر', () => {
  const SCRIPT = '(function () { return JSON.stringify({ v: 1 }); })();';

  beforeEach(() => { resetAyWebsCaptureScriptCache(); });
  afterEach(() => { resetAyWebsCaptureScriptCache(); });

  it('يجي من الخادم ويُخزّن (نفس مهلة الـ cache متاع الخادم)', async () => {
    const spy = stubFetch(() => new Response(SCRIPT, { status: 200 }));
    const first = await fetchAyWebsCaptureScript();
    const second = await fetchAyWebsCaptureScript();
    expect(first).toBe(SCRIPT);
    expect(second).toBe(SCRIPT);
    expect(spy).toHaveBeenCalledTimes(1); // الطلب الثاني من الذاكرة
    const [url] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/v1/aywebs/capture/script.js`);
  });

  it('جسم فارغ = خطأ صريح، موش سكريبت صامت', async () => {
    stubFetch(() => new Response('   ', { status: 200 }));
    await expect(fetchAyWebsCaptureScript()).rejects.toMatchObject({ kind: 'malformed' });
  });

  it('الحقن يغلّف السكريبت ويبعث النتيجة للجسر — وغلاف فارغ يُرفض', () => {
    const injection = buildAyWebsCaptureInjection(SCRIPT);
    expect(injection).toContain(SCRIPT);
    expect(injection).toContain('window.ReactNativeWebView.postMessage');
    expect(injection).toContain('__aywebs_error');
    expect(injection.trimEnd().endsWith('true;')).toBe(true);
    expect(() => buildAyWebsCaptureInjection('  ')).toThrow(/vide/);
  });
});

describe('رسالة الجسر', () => {
  it('كائن JSON ⇒ ناجح، والمحتوى للخادم يحكم فيه', () => {
    const result = parseAyWebsCaptureMessage('{"v":1,"priceCandidates":[]}');
    expect(result).toEqual({ ok: true, capture: { v: 1, priceCandidates: [] } });
  });

  it('يفرّق بين الفراغ، الحجم، الصيغة، النوع، وغلطة السكريبت', () => {
    expect(parseAyWebsCaptureMessage('')).toEqual({ ok: false, reason: 'EMPTY' });
    expect(parseAyWebsCaptureMessage('x'.repeat(64_001))).toEqual({ ok: false, reason: 'TOO_LARGE' });
    expect(parseAyWebsCaptureMessage('pas du json')).toEqual({ ok: false, reason: 'NOT_JSON' });
    expect(parseAyWebsCaptureMessage('[1,2]')).toEqual({ ok: false, reason: 'NOT_OBJECT' });
    expect(parseAyWebsCaptureMessage('{"__aywebs_error":"boom"}')).toEqual({ ok: false, reason: 'SCRIPT_ERROR' });
  });
});

describe('قراءة المنتوج بكابتشر العميل', () => {
  it('الصفحة ما تتبعثش: نبعثو الكابتشر كما هي ونقراو قرار الخادم', async () => {
    const spy = stubFetch(() => json({
      success: true,
      data: { product_id: 'ayweb_7', title: 'Article', store_id: 'amazon', price: 109, currency: 'USD' },
      capture: { used: true, fingerprint: 'f'.repeat(64), price_source: 'dom', corroborated: false, rejection: null },
      price_rejection: 'PRICE_AMBIGUOUS',
    }, 201));

    const CAPTURE = { v: 1, url: 'https://www.amazon.com/dp/B0GYM3V9H5', priceCandidates: [{ text: '$109.00', source: 'dom' }] };
    const outcome = await resolveAyWebsProductWithCapture('https://www.amazon.com/dp/B0GYM3V9H5', {
      sessionId: 'ayw-3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      storeId: 'amazon',
      capture: CAPTURE,
    });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/v1/aywebs/product/resolve`);
    const body = bodyOf(init);
    expect(body.capture).toEqual(CAPTURE); // بلا أي تصرّف
    expect(body.page).toBeUndefined();     // HTML ممنوع — حتى الحقل ما يتبعثش
    expect(outcome.product.productId).toBe('ayweb_7');
    expect(outcome.capture).toMatchObject({ used: true, priceSource: 'dom', corroborated: false });
    expect(outcome.priceRejection).toBe('PRICE_AMBIGUOUS');
  });
});

/* ══ P3.3 — الخيارات، الجاهزية، سلّة AYWEBs، والجسر ═════════════════════════ */

const SESSION43 = 'ayw-3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const GROUPS = [
  { attribute: 'color', values: ['Black', 'Blue'] },
  { attribute: 'size', values: ['M', 'L'] },
];

const OPTIONS = [
  { source_variant_id: 'v1', attributes: { color: 'Black', size: 'M' }, availability: 'AVAILABLE', ayrovi_pricing: { total_tnd: 412.55 } },
  { source_variant_id: 'v2', attributes: { color: 'Black', size: 'L' }, availability: 'OUT_OF_STOCK', ayrovi_pricing: { total_tnd: 430 } },
  { source_variant_id: 'v3', attributes: { color: 'Blue', size: 'M' }, availability: 'AVAILABLE' },
].map(parseAyWebsVariantOption);

const CART_ITEM = {
  id: 'aywci_1',
  item_number: 'AYWITEM-000001',
  product_id: 'ayweb_42',
  store_id: 'amazon',
  store_name: 'Amazon',
  source_url: 'https://www.amazon.com/dp/B0GYM3V9H5',
  title: 'Écouteurs Bluetooth',
  images: ['https://m.media-amazon.com/images/I/x.jpg'],
  unit_price: 109,
  currency: 'USD',
  variant_label: 'color: Black · size: M',
  quantity: 2,
  availability: 'AVAILABLE',
  status: 'ACTIVE',
  status_reason: null,
  customer_note: '',
  purchase_mode: 'SUPPORTED',
  checkout_ready: true,
  line_total_tnd: 825.1,
  linked_to_ayrovi: true,
  created_at: '2026-10-07T10:00:00.000Z',
  updated_at: '2026-10-07T10:00:00.000Z',
};

const cartPayload = () => ({
  cart: { id: 'aywcart_1', status: 'ACTIVE', currency: 'TND', items_count: 1 },
  items: [CART_ITEM],
  groups: [{ store_id: 'amazon', store_name: 'Amazon', integration_type: 'PARTIALLY_SUPPORTED', subtotal_tnd: 825.1, blocked_items: 0, items: [CART_ITEM] }],
  totals: { units: 2, product_subtotal_tnd: 825.1, currency: 'TND', blocked_items: 0, checkout_ready: true, unlinked_units: 0 },
  blockers: [],
  live_data_requires_network: true,
});

describe('جاهزية الإضافة (نفس شروط الخادم)', () => {
  const base = {
    groups: GROUPS,
    options: OPTIONS,
    productAvailability: 'AVAILABLE',
    productQuotedTnd: 400 as number | null,
    selection: {} as Record<string, string>,
  };

  it('الخصائص المنشورة إلزامية — والأسماء الناقصة تتقال', () => {
    const readiness = ayWebsAddReadiness(base);
    expect(readiness.ready).toBe(false);
    expect(readiness.code).toBe('VARIANT_REQUIRED');
    expect(readiness.missingAttributes).toEqual(['color', 'size']);
    expect(ayWebsAddReadiness({ ...base, selection: { color: 'Black' } }).missingAttributes).toEqual(['size']);
  });

  it('اختيار كامل ⇒ جاهز بسعر الخيار من الخادم', () => {
    const readiness = ayWebsAddReadiness({ ...base, selection: { color: 'Black', size: 'M' } });
    expect(readiness.ready).toBe(true);
    expect(readiness.code).toBe('');
    expect(readiness.quotedTotalTnd).toBe(412.55); // رقم الخادم للخيار، موش سعر المنتوج
    expect(readiness.availability).toBe('AVAILABLE');
  });

  it('خيار مفروغ ما يتخيّرش، وتركيبة غير منشورة ما تتخمّنش', () => {
    expect(ayWebsAddReadiness({ ...base, selection: { color: 'Black', size: 'L' } }).code).toBe('VARIANT_UNAVAILABLE');
    expect(ayWebsAddReadiness({ ...base, selection: { color: 'Red', size: 'M' } }).code).toBe('VARIANT_UNKNOWN');
    expect(ayWebsAddReadiness({ ...base, selection: { color: 'Blue', size: 'L' } }).code).toBe('VARIANT_UNKNOWN');
  });

  it('بلا خيار منشور: التوفّر يقرّر — مجهول = ممنوع (كي ما يرفضوش الخادم)', () => {
    const noGroups = { ...base, groups: [], options: [], selection: {} };
    expect(ayWebsAddReadiness({ ...noGroups, productAvailability: 'UNKNOWN' }).code).toBe('STOCK_UNKNOWN');
    expect(ayWebsAddReadiness({ ...noGroups, productAvailability: 'OUT_OF_STOCK' }).code).toBe('OUT_OF_STOCK');
    expect(ayWebsAddReadiness({ ...noGroups, productAvailability: 'LOW_STOCK', productQuotedTnd: 825.1 }).ready).toBe(true);
    // متوفّر بلا تسعير خادمي ⇒ ممنوع: ما فماش سطر بلا ثمن (§45).
    expect(ayWebsAddReadiness({ ...noGroups, productQuotedTnd: null }).code).toBe('PRICE_UNAVAILABLE');
  });

  it('خيار بلا تسعير خاص يرجع لسعر المنتوج — نفس قاعدة الخادم', () => {
    const readiness = ayWebsAddReadiness({ ...base, selection: { color: 'Blue', size: 'M' } });
    expect(readiness.ready).toBe(true);
    expect(readiness.quotedTotalTnd).toBe(400);
  });
});

describe('شكل الخيارات والسلّة', () => {
  it('variant_groups و variants يُقراوا، والعقد المكسور يُرمى بصوت عالي', () => {
    const parsed = parseAyWebsVariants({
      product_id: 'ayweb_42',
      store_id: 'amazon',
      source_url: 'https://www.amazon.com/dp/B0GYM3V9H5',
      variant_groups: GROUPS,
      variants: OPTIONS.map((option) => ({
        source_variant_id: option.sourceVariantId,
        attributes: option.attributes,
        label: option.label,
        price: option.price,
        currency: option.currency,
        quoted_price: option.quotedPrice,
        quoted_currency: option.quotedCurrency,
        price_source: option.priceSource,
        availability: option.availability,
        availability_reason: option.availabilityReason,
        image: option.image,
        ayrovi_pricing: option.totalTnd == null ? null : { total_tnd: option.totalTnd },
      })),
      selection_required: true,
      availability: 'AVAILABLE',
      availability_reason: 'merchant_stock',
      resolved_at: '2026-10-07T10:00:00.000Z',
    });
    expect(parsed.variantGroups).toEqual(GROUPS);
    expect(parsed.variants[0].attributes).toEqual({ color: 'Black', size: 'M' });
    expect(parsed.variants[0].totalTnd).toBe(412.55);
    expect(parsed.variants[2].totalTnd).toBeNull();
    expect(parsed.selectionRequired).toBe(true);

    expect(() => parseAyWebsVariants({ store_id: 'amazon' })).toThrow(/variantes/);
    expect(() => parseAyWebsVariants({ product_id: 'x', variants: { a: 1 } })).toThrow(/variantes/);
  });

  it('السلة: المجموعات، المجاميع، العوائق، وحالة الربط', () => {
    const cart = parseAyWebsCart(cartPayload());
    expect(cart.hasCart).toBe(true);
    expect(cart.totals.units).toBe(2);
    expect(cart.totals.unlinkedUnits).toBe(0);
    expect(cart.items[0].linkedToAyrovi).toBe(true);
    expect(cart.groups[0].items[0].itemNumber).toBe('AYWITEM-000001');
    expect(cart.blockers).toEqual([]);

    // `linked_to_ayrovi` غايب = «ما نعرفوش» (null)، موش «موش مربوط».
    const unknown = parseAyWebsCart({ ...cartPayload(), items: [{ ...CART_ITEM, linked_to_ayrovi: undefined }] });
    expect(unknown.items[0].linkedToAyrovi).toBeNull();

    expect(() => parseAyWebsCart({ items: { a: 1 } })).toThrow(/panier/);
  });

  it('سلّة ما فماش (جلسة جديدة) تفرق على سلّة فارغة', () => {
    const fresh = parseAyWebsCart({ cart: null, items: [], groups: [], totals: { units: 0, checkout_ready: false }, blockers: [] });
    expect(fresh.hasCart).toBe(false);
    expect(fresh.items).toEqual([]);
  });
});

describe('نداءات السلّة', () => {
  it('الإضافة: نيّة فقط — بلا سعر ولا عملة ولا حالة', async () => {
    const spy = stubFetch(() => json({
      success: true,
      data: {
        item: CART_ITEM,
        duplicate: false,
        idempotent_replay: false,
        message: 'Ajouté',
        ayrovi: { linked: true, cart_item_id: 'cart_9', quantity: 2, reason: 'LINKED' },
        quote_used: true,
        source_reread: false,
        reread_reason: null,
      },
      cart: cartPayload(),
    }, 201));

    const outcome = await addAyWebsCartItem({
      productId: 'ayweb_42',
      sourceUrl: 'https://www.amazon.com/dp/B0GYM3V9H5',
      storeId: 'amazon',
      variant: { color: 'Black', size: 'M' },
      quantity: 2,
      quoteToken: 'q'.repeat(40),
      capture: { v: 1 },
      requestId: 'aywadd-1',
    }, { sessionId: SESSION43 });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/v1/aywebs/cart/items`);
    expect(init.method).toBe('POST');
    expect(headersOf(init)['x-session-id']).toBe(SESSION43);

    const body = bodyOf(init);
    expect(Object.keys(body).sort()).toEqual([
      'capture', 'product_id', 'quantity', 'quote_token', 'request_id', 'source_url', 'store_id', 'variant_attributes',
    ]);
    for (const forbidden of ['price', 'currency', 'status', 'availability', 'unit_price', 'total_tnd', 'page']) {
      expect(body).not.toHaveProperty(forbidden);
    }

    expect(outcome.item.itemNumber).toBe('AYWITEM-000001');
    expect(outcome.ayrovi).toMatchObject({ linked: true, cartItemId: 'cart_9', quantity: 2 });
    expect(outcome.quoteUsed).toBe(true);
    expect(outcome.cart.totals.units).toBe(2);
  });

  it('تعديل الكمية: رقم مطلق — «3» تعني ثلاث قطع، موش +3', async () => {
    const spy = stubFetch(() => json({
      success: true,
      data: { item: { ...CART_ITEM, quantity: 3 }, removed: false, ayrovi: { linked: true, cartItemId: 'cart_9', quantity: 3, reason: 'SYNCED' } },
      cart: cartPayload(),
    }));

    await updateAyWebsCartItem('aywci_1', { quantity: 3 }, { sessionId: SESSION43 });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/v1/aywebs/cart/items/aywci_1`);
    expect(init.method).toBe('PATCH');
    // لا `+1` ولا `delta`: الرقم المطلق وحدو — هذا اللي يمنع المضاعفة.
    expect(bodyOf(init)).toEqual({ quantity: 3 });
  });

  it('التحقّق: قراءة جديدة من التاجر مطلوبة صراحةً', async () => {
    const spy = stubFetch(() => json({
      success: true,
      data: { changes: [{ itemId: 'aywci_1', code: 'PRICE_CHANGED', message: 'Prix changé' }] },
      cart: cartPayload(),
    }));

    const result = await verifyAyWebsCart({ sessionId: SESSION43, recheckSource: true });
    expect(bodyOf(spy.mock.calls[0][1] as RequestInit)).toEqual({ recheck_source: true });
    expect(result.changes).toEqual([{ itemId: 'aywci_1', code: 'PRICE_CHANGED', message: 'Prix changé' }]);
  });

  it('الجسر: يرجّع ما تحرّك وما تُخطّي (camelCase متاع الخدمة)', async () => {
    stubFetch(() => json({
      success: true,
      data: {
        moved: [{ aywebsItemId: 'aywci_1', aywebsItemNumber: 'AYWITEM-000001', cartItemId: 'cart_9', store: 'amazon', title: 'Écouteurs', quantity: 2, priceTnd: 825.1, duplicate: false, synced: true }],
        skipped: [{ aywebsItemId: 'aywci_2', code: 'NOT_CHECKOUT_READY', message: 'Stock inconnu' }],
        totalItemsCount: 1,
        totalTnd: 825.1,
        message: '1 ligne synchronisée',
      },
    }));

    const result = await bridgeAyWebsCartToAyrovi({ sessionId: SESSION43 });
    expect(result.moved[0]).toMatchObject({ cartItemId: 'cart_9', synced: true, quantity: 2 });
    expect(result.skipped[0].code).toBe('NOT_CHECKOUT_READY');
    expect(result.totalTnd).toBe(825.1);
  });

  it('409 من الجسر: الكود يوصل كما هو — ما نكمّولوش على حالة قديمة', async () => {
    stubFetch(() => json({
      success: false,
      code: 'AYWEBS_SOURCE_VERIFICATION_REQUIRED',
      error: 'Vérifiez les articles AYWEBs avant de continuer.',
    }, 409));

    await expect(bridgeAyWebsCartToAyrovi({ sessionId: SESSION43 })).rejects.toMatchObject({
      code: AYWEBS_SOURCE_VERIFICATION_REQUIRED,
      status: 409,
    });
  });

  it('قراءة السلّة: GET بجلسة AYWEBs', async () => {
    const spy = stubFetch(() => json({ success: true, data: cartPayload() }));
    const cart = await fetchAyWebsCart({ sessionId: SESSION43 });
    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/v1/aywebs/cart`);
    expect(init.method ?? 'GET').toBe('GET');
    expect(headersOf(init)['x-session-id']).toBe(SESSION43);
    expect(cart.items).toHaveLength(1);
  });

  it('السعر: فاتورة السعر والحقول الناقصة توصل — والخيارات تتقرا', async () => {
    stubFetch(() => json({
      success: true,
      data: {
        product_id: 'ayweb_42',
        title: 'Écouteurs',
        store_id: 'amazon',
        variant_groups: GROUPS,
        variant_details: [{ source_variant_id: 'v1', attributes: { color: 'Black', size: 'M' }, availability: 'AVAILABLE', ayrovi_pricing: { total_tnd: 412.55 } }],
      },
      missing: ['size'],
      quote_token: 'q'.repeat(40),
      quote_expires_at: '2026-10-07T11:00:00.000Z',
    }, 201));

    const outcome = await resolveAyWebsProductWithCapture('https://www.amazon.com/dp/B0GYM3V9H5', { sessionId: SESSION43 });
    expect(outcome.quoteToken).toBe('q'.repeat(40));
    expect(outcome.missing).toEqual(['size']);
    expect(outcome.product.variantGroups).toEqual(GROUPS);
    expect(outcome.product.variantDetails[0].totalTnd).toBe(412.55);
    expect(outcome.capture).toBeNull();
  });
});

/* ══ P3.4 — طلب الشراء بالنيابة وطلب إضافة متجر ═══════════════════════════════ */

const PURCHASE_REQUEST = {
  id: 'aywpr_1',
  request_number: 'AYWREQ-000042',
  store_id: 'shein',
  store_name: 'Shein',
  registered_store: true,
  product_url: 'https://www.shein.com/x-p-123.html',
  source_domain: 'shein.com',
  quantity: 2,
  product_name: 'Veste en jean',
  variant_attributes: { size: 'M' },
  requirements: 'Couleur foncée',
  customer_notes: 'Avant fin du mois',
  status: 'SUBMITTED',
  reason: null,
  decision_note: '',
  decided_at: null,
  order_id: null,
  next_action: 'WAIT_FOR_REVIEW',
  created_at: '2026-10-07T12:00:00.000Z',
  updated_at: '2026-10-07T12:00:00.000Z',
};

const STORE_REQUEST = {
  id: 'aywsr_1',
  store_url: 'https://www.zara.com/tn/',
  store_name: 'zara.com',
  source_domain: 'zara.com',
  intent: 'Manteau d’hiver',
  notes: '',
  status: 'SUBMITTED',
  decision_note: '',
  decided_at: null,
  promoted_store_id: null,
  created_at: '2026-10-07T12:00:00.000Z',
};

describe('الطلبات (§37/§38)', () => {
  it('طلب الشراء: الجسم فيه المعطيات بلا أي حقل سعر، والرد حالة الخادم', async () => {
    const spy = stubFetch(() => json({ success: true, data: PURCHASE_REQUEST }, 201));

    const request = await createAyWebsPurchaseRequest({
      productUrl: PURCHASE_REQUEST.product_url,
      productName: 'Veste en jean',
      variant: { size: 'M' },
      quantity: 2,
      requirements: 'Couleur foncée',
      customerNotes: 'Avant fin du mois',
      storeId: 'shein',
    }, { sessionId: SESSION43 });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/v1/aywebs/purchase-requests`);
    expect(init.method).toBe('POST');
    expect(headersOf(init)['x-session-id']).toBe(SESSION43);

    const body = bodyOf(init);
    expect(body).toMatchObject({ product_url: PURCHASE_REQUEST.product_url, quantity: 2 });
    for (const forbidden of ['price', 'currency', 'total_tnd', 'status', 'page']) {
      expect(body).not.toHaveProperty(forbidden);
    }

    expect(request.requestNumber).toBe('AYWREQ-000042');
    expect(request.status).toBe('SUBMITTED');
    expect(request.nextAction).toBe('WAIT_FOR_REVIEW');
    expect(request.variantAttributes).toEqual({ size: 'M' });
  });

  it('what the client can do now يبقى من القائمة المغلقة، وإلا فراغ صريح', () => {
    expect(parseAyWebsPurchaseRequest({ ...PURCHASE_REQUEST, next_action: 'PROVIDE_MORE_DETAILS' }).nextAction)
      .toBe('PROVIDE_MORE_DETAILS');
    // قيمة ما نعرفهاش ما تولّدش عبارة مخترعة.
    expect(parseAyWebsPurchaseRequest({ ...PURCHASE_REQUEST, next_action: 'SOMETHING_NEW' }).nextAction).toBe('');
    expect(parseAyWebsPurchaseRequest({ ...PURCHASE_REQUEST, next_action: undefined }).nextAction).toBe('');
  });

  it('العقد المكسور يُرمى: بلا رقم طلب ولا بلا رابط = خطأ بصوت عالي', () => {
    expect(() => parseAyWebsPurchaseRequest({ id: 'aywpr_1' })).toThrow(/demande d’achat/);
    expect(() => parseAyWebsPurchaseRequest({ request_number: 'AYWREQ-1' })).toThrow(/demande d’achat/);
    expect(() => parseAyWebsStoreRequest({ store_name: 'zara.com' })).toThrow(/demande de boutique/);
  });

  it('طلب المتجر: POST بجسم المتجر، والرد حالة الخادم', async () => {
    const spy = stubFetch(() => json({ success: true, data: STORE_REQUEST }, 201));
    const request = await createAyWebsStoreRequest({
      storeUrl: STORE_REQUEST.store_url,
      storeName: 'zara.com',
      intent: 'Manteau d’hiver',
    }, { sessionId: SESSION43 });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/v1/aywebs/store-requests`);
    expect(bodyOf(init)).toEqual({
      store_url: STORE_REQUEST.store_url,
      store_name: 'zara.com',
      intent: 'Manteau d’hiver',
    });
    expect(request.status).toBe('SUBMITTED');
    expect(request.sourceDomain).toBe('zara.com');
  });

  it('السجلّ يقرا من الخادم، والمصفوفة شرط', async () => {
    const spy = stubFetch(() => json({ success: true, data: [PURCHASE_REQUEST] }));
    const list = await fetchAyWebsPurchaseRequests({ sessionId: SESSION43, limit: 5 });
    expect(String(spy.mock.calls[0][0])).toContain('/purchase-requests?limit=5');
    expect(list[0].requestNumber).toBe('AYWREQ-000042');

    stubFetch(() => json({ success: true, data: { not: 'an array' } }));
    await expect(fetchAyWebsStoreRequests({ sessionId: SESSION43 })).rejects.toMatchObject({ kind: 'malformed' });
  });

  it('قاعدة «شراء بالنيابة؟» في بلاصة واحدة: SUPPORTED = مباشر، الباقي = مراجعة', () => {
    expect(ayWebsNeedsHumanRequest('SUPPORTED')).toBe(false);
    expect(ayWebsNeedsHumanRequest('URL_REQUEST')).toBe(true);
    expect(ayWebsNeedsHumanRequest('MANUAL_REVIEW')).toBe(true);
    // '' = الخادم ما قالش: ما نستنتجوش، وما نزيدوش شاشة ما يستحقّهاش.
    expect(ayWebsNeedsHumanRequest('')).toBe(false);
  });
});
