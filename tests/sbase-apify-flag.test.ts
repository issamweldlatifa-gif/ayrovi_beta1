/**
 * Z Sourcing — المرحلة 2: عَلَم مسار Apify القديم (أمر المالك 28/11).
 *
 * ما يُثبته: مع العلم `SBASE_APIFY_DISABLED` truthy، مسارات sbase الثلاثة
 * ترفض 503 صادقاً **قبل أي نداء Apify** (fetch محاكى يعدّ النداءات — صفر)،
 * والصورة ترفض قبل التحويل؛ وبإزالة العَلَم يعود المسار القديم يعمل كما كان
 * (لا حذف، لا فقد) — «Feature Flag يسمح بإعادة تفعيل المسار القديم».
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { clearSbaseCache, createSbaseRouter } from '../src/sbase/routes';

const RULES = {
  id: 'test', version: 7,
  rateEUR: 3.4, rateUSD: 3.15, rateGBP: 4.0, rateJPY: 0.021,
  exchangeBufferPercent: 3, freightPerKgTND: 12, localDeliveryTND: 7,
  commissionPercent: 12, minimumCommissionTND: 8, rpdPercent: 1, rpdMinimumTND: 0.5,
  defaultTvaRate: 0.19, expressFeeTND: 25, categories: [],
  extraRates: { CNY: 0.43 }, fxSource: 'live', updatedAt: new Date().toISOString(),
};

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/sbase', createSbaseRouter({ getPricingRules: () => RULES as never }));
  return instance;
}

function stubFetchCounted() {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    calls.push(String(url));
    return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
  }));
  return calls;
}

/** تدفّق Apify موثّق (نفس نمط sbase.test) للتحقق أن المسار يعود يعمل بعد رفع العَلَم. */
function stubApifyFlow(dataset: unknown) {
  const calls: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    calls.push(String(url));
    const u = String(url);
    if (u.includes('/v2/acts/sourabhbgp~1688-scraper/runs')) {
      return new Response(JSON.stringify({ data: { id: 'run_9', status: 'READY', defaultDatasetId: 'ds_1' } }), { status: 200 });
    }
    if (u.includes('/v2/actor-runs/run_9')) {
      return new Response(JSON.stringify({ data: { id: 'run_9', status: 'SUCCEEDED', defaultDatasetId: 'ds_1' } }), { status: 200 });
    }
    if (u.includes('/v2/datasets/ds_1/items')) return new Response(JSON.stringify(dataset), { status: 200 });
    return new Response(JSON.stringify({ error: 'unexpected' }), { status: 500 });
  }));
  return calls;
}

beforeEach(() => {
  process.env.APIFY_TOKEN = 'test_apify_token';
  delete process.env.SBASE_APIFY_DISABLED;
  clearSbaseCache();
});

afterEach(() => {
  delete process.env.APIFY_TOKEN;
  delete process.env.SBASE_APIFY_DISABLED;
  vi.unstubAllGlobals();
});

describe('Z Sourcing — المرحلة 2: عَلَم مسار Apify القديم', () => {
  test('العَلَم مرفوع: البحث يرفض 503 صادقاً قبل أي نداء Apify', async () => {
    process.env.SBASE_APIFY_DISABLED = '1';
    const calls = stubFetchCounted();
    const res = await request(app()).post('/api/sbase/search').send({ q: 'mini traceur' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SBASE_APIFY_DISABLED');
    expect(calls.length).toBe(0);
  });

  test('العَلَم مرفوع: البطاقة ترفض قبل أي قراءة', async () => {
    process.env.SBASE_APIFY_DISABLED = 'true';
    const calls = stubFetchCounted();
    const res = await request(app()).post('/api/sbase/item').send({ source: '1688', id: '978597247613' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SBASE_APIFY_DISABLED');
    expect(calls.length).toBe(0);
  });

  test('العَلَم مرفوع: الصورة ترفض قبل التحويل — والرفض بكود مستقلّ واضح', async () => {
    process.env.SBASE_APIFY_DISABLED = 'yes';
    const calls = stubFetchCounted();
    const res = await request(app()).post('/api/sbase/image').attach('image', Buffer.from('not-an-image'), { filename: 'x.png', contentType: 'image/png' });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('SBASE_APIFY_DISABLED');
    expect(calls.length).toBe(0);
  });

  test('الجاهزية تعلن حالة العَلَم بشفافية', async () => {
    process.env.SBASE_APIFY_DISABLED = '1';
    const res = await request(app()).get('/api/sbase/health');
    expect(res.status).toBe(200);
    expect(res.body.data.legacyApifyDisabled).toBe(true);
  });

  test('إزالة العَلَم: المسار القديم يعود يعمل كما كان — Feature Flag قابل للرجوع (لا حذف)', async () => {
    delete process.env.SBASE_APIFY_DISABLED;
    const calls = stubApifyFlow({ items: [] });
    const res = await request(app()).post('/api/sbase/search').send({ q: 'mini traceur' });
    expect(res.status).toBe(200);
    expect(calls.some((url) => url.includes('/v2/acts/sourabhbgp~1688-scraper/runs'))).toBe(true);
  });
});
