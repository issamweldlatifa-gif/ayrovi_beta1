/**
 * Z Sourcing — اختبارات طبقة Nexscope (المرحلة 3 — أمر المالك 28/11).
 *
 * على ماذا يقف هذا الملف:
 *  • كل الحقول والسلوكيات من **الوثائق الرسمية** (nexscope.ai/api-docs +
 *    مستودع nexscope-ai/nexscope-ecommerce-api، ملتقط 28/11) — لا افتراض
 *    وظيفة تسويقية.
 *  • fetch محاكى بالكامل — صفر نداءات حية، صفر مفاتيح في الاختبار.
 *  • «إعادة المحاولة بطريقة لا تسبب تكرار الطلبات» = **لا إعادة تلقائية**:
 *    كل اختبار فشل يثبت أن fetch نُادي مرة واحدة حصراً.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { createNexscopeProvider, nexscopeConfigured, ZSourcingError } from '../src/zsourcing/nexscope';

const KEY = 'test_nk_key';

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response> | null) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    const response = handler(String(url), init);
    if (response !== null && response !== undefined) return await response;
    return new Response(JSON.stringify({ error: 'unexpected-url' }), { status: 500 });
  }));
  return calls;
}

const envelopeOk = (data: unknown) => new Response(JSON.stringify({ code: 0, msg: 'success', data }), { status: 200 });

beforeEach(() => {
  process.env.NEXSCOPE_API_KEY = KEY;
  delete process.env.ZSOURCING_NEXSCOPE_TIMEOUT_MS;
});

afterEach(() => {
  delete process.env.NEXSCOPE_API_KEY;
  delete process.env.ZSOURCING_NEXSCOPE_TIMEOUT_MS;
  vi.unstubAllGlobals();
});

describe('Z Sourcing — طبقة Nexscope (موثّق رسمي، صفر شبكة)', () => {
  test('المفتاح غائب ⇒ مزوّد مرفوض وnexscopeConfigured صادق', () => {
    delete process.env.NEXSCOPE_API_KEY;
    expect(nexscopeConfigured()).toBe(false);
    expect(() => createNexscopeProvider()).toThrow(ZSourcingError);
    let thrown: ZSourcingError | null = null;
    try { createNexscopeProvider(); } catch (error) { thrown = error as ZSourcingError; }
    expect(thrown?.code).toBe('ZS_NEXSCOPE_NOT_CONFIGURED');
    expect(thrown?.status).toBe(503);
  });

  test('بحث الكلمات: غلاف code=0 يُحوَّل للنموذج الموحد — offerId نصّي والخام محفوظ', async () => {
    const calls = stubFetch(() => envelopeOk({
      products: [{
        asin: '789456123000',
        company: '义乌市某某工艺品厂',
        consignPrice: 3.5,
        currency: 'CNY',
        asinUrl: 'https://detail.1688.com/offer/789456123000.html',
        deliveryTime: '3 days',
      }],
    }));
    const provider = createNexscopeProvider();
    const result = await provider.searchByKeyword({ zhQuery: '女包' });
    expect(result.endpointCalled).toBe('dl/productSearch');
    expect(result.products).toHaveLength(1);
    const product = result.products[0];
    expect(product.offerId).toBe('789456123000'); // نصّي — حفظ المعرّفات الطويلة
    expect(product.supplier).toBe('义乌市某某工艺品厂');
    expect(product.consignPrice).toBe(3.5);
    expect(product.raw.company).toBe('义乌市某某工艺品厂'); // المرور الخام شفاف
    expect(calls[0].url).toContain('/dl/productSearch');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.keyWord).toBe('女包');
    expect(body.pageIndex).toBe(1);
    expect(body.pageSize).toBe(20);
  });

  test('موثّق: pageSize للبحث 10–100 — الحدّ يُطبَّق لا يُخمَّن', async () => {
    const calls = stubFetch(() => envelopeOk({ products: [] }));
    const provider = createNexscopeProvider();
    await provider.searchByKeyword({ zhQuery: '包', pageSize: 500 });
    await provider.searchByKeyword({ zhQuery: '包', pageSize: 2 });
    expect(JSON.parse(String(calls[0].init?.body)).pageSize).toBe(100);
    expect(JSON.parse(String(calls[1].init?.body)).pageSize).toBe(10);
  });

  test('بحث الصورة: base64 نقي بلا بادئة + سقف 50 موثّق يُطبَّق', async () => {
    const calls = stubFetch(() => envelopeOk({ items: [{ itemId: '111222333', price: '2.10', moq: '2' }] }));
    const provider = createNexscopeProvider();
    const result = await provider.searchByImage({ imageBase64: 'QUJD', pageSize: 80 });
    expect(result.endpointCalled).toContain('1688-search-by-image');
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.imageBase64).toBe('QUJD');
    expect(body.imageBase64.startsWith('data:')).toBe(false);
    expect(body.pageSize).toBe(50);
    expect(result.products[0]?.offerId).toBe('111222333');
    expect(result.products[0]?.priceCny).toBe(2.1);
    expect(result.products[0]?.moq).toBe('2');
  });

  test('التفاصيل: offerId يُرسل نصّياً حرفياً والعملة تُطبَّع', async () => {
    const calls = stubFetch(() => envelopeOk({ product: { offerId: '1040473674152' } }));
    const provider = createNexscopeProvider();
    const detail = await provider.getDetail({ offerId: '1040473674152', currency: 'usd' });
    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.offerId).toBe('1040473674152');
    expect(typeof body.offerId).toBe('string');
    expect(body.currency).toBe('USD');
    expect(((detail.product ?? {}) as { offerId?: string }).offerId).toBe('1040473674152');
  });

  test('غلاف موثّق: code=11209 (مفتاح غير صالح) ⇒ ZS_NEXSCOPE_AUTH 503 — بلا أي تفاصيل مفتاح', async () => {
    stubFetch(() => new Response(JSON.stringify({ code: 11209, msg: 'invalid api key' }), { status: 200 }));
    const provider = createNexscopeProvider();
    let thrown: ZSourcingError | null = null;
    try { await provider.searchByKeyword({ zhQuery: '包' }); } catch (error) { thrown = error as ZSourcingError; }
    expect(thrown?.code).toBe('ZS_NEXSCOPE_AUTH');
    expect(thrown?.status).toBe(503);
    expect(thrown?.providerCode).toBe('11209');
    expect(thrown?.message).not.toContain(KEY);
  });

  test('موثّق: 429 مع Retry-After ⇒ إعادة واحدة بعد النافذة (الطلب مرفوض عند البوّة — لم يُنفَّذ فوق، فليس تكراراً)', async () => {
    const calls = stubFetch(() => new Response(null, { status: 429, headers: { 'retry-after': '0' } }));
    const provider = createNexscopeProvider();
    let thrown: ZSourcingError | null = null;
    try { await provider.searchByKeyword({ zhQuery: '包' }); } catch (error) { thrown = error as ZSourcingError; }
    expect(thrown?.code).toBe('ZS_NEXSCOPE_RATE_LIMIT');
    expect(thrown?.status).toBe(429);
    expect(thrown?.retryAfterMs).toBe(0);
    expect(calls.length).toBe(2); // مرفوضة + إعادة النافذة — ما زال مرفوضاً ⇒ يصعد بلا محاولات ثالثة
  });

  test('موثّق: 429 ثم نجاح — إعادة النافذة تُجلب النتيجة بلا طلب ثالث', async () => {
    let callIndex = 0;
    const calls = stubFetch(() => {
      callIndex += 1;
      return callIndex === 1
        ? new Response(null, { status: 429, headers: { 'retry-after': '0' } })
        : envelopeOk({ products: [{ asin: '777000111222' }] });
    });
    const provider = createNexscopeProvider();
    const result = await provider.searchByKeyword({ zhQuery: '包' });
    expect(result.products[0]?.offerId).toBe('777000111222');
    expect(calls.length).toBe(2);
  });

  test('عطل نقل ⇒ ZS_NEXSCOPE_NETWORK ومرة واحدة حصراً — الطلب قد يكون نُفِّذ فوق فلا إعادة (التكرار المحرّم)', async () => {
    const calls = stubFetch(() => { throw new Error('socket hang up'); });
    const provider = createNexscopeProvider();
    let thrown: ZSourcingError | null = null;
    try { await provider.getDetail({ offerId: '1040473674152' }); } catch (error) { thrown = error as ZSourcingError; }
    expect(thrown?.code).toBe('ZS_NEXSCOPE_NETWORK');
    expect(calls.length).toBe(1);
  });

  test('انتهاء المهلة (TimeoutError) ⇒ ZS_NEXSCOPE_TIMEOUT 504', async () => {
    stubFetch(() => { const e = new Error('The operation was aborted'); e.name = 'TimeoutError'; throw e; });
    const provider = createNexscopeProvider();
    let thrown: ZSourcingError | null = null;
    try { await provider.searchByImage({ imageBase64: 'QUJD' }); } catch (error) { thrown = error as ZSourcingError; }
    expect(thrown?.code).toBe('ZS_NEXSCOPE_TIMEOUT');
    expect(thrown?.status).toBe(504);
  });

  test('خطأ عمل عام (code≠0) ⇒ ZS_NEXSCOPE_UPSTREAM_CODE بكود المزوّد', async () => {
    stubFetch(() => new Response(JSON.stringify({ code: 500, msg: 'upstream busy' }), { status: 200 }));
    const provider = createNexscopeProvider();
    let thrown: ZSourcingError | null = null;
    try { await provider.searchByKeyword({ zhQuery: '包' }); } catch (error) { thrown = error as ZSourcingError; }
    expect(thrown?.code).toBe('ZS_NEXSCOPE_UPSTREAM_CODE');
    expect(thrown?.providerCode).toBe('500');
  });

  test('عنصر بلا معرّف يُسقط ولا يُخترع له بديل (قاعدة لا اختراع بيانات)', async () => {
    stubFetch(() => envelopeOk({ products: [{ company: 'no id row' }, { asin: '555000111222' }] }));
    const provider = createNexscopeProvider();
    const result = await provider.searchByKeyword({ zhQuery: '包' });
    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.offerId).toBe('555000111222');
  });
});
