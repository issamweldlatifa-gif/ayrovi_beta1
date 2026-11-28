#!/usr/bin/env node
/**
 * Z Sourcing — جامع الشواهد الحية (نقطة التوقف الأولى من أمر المالك 28/11).
 *
 * لماذا سكريبت Node خالص لا vitest؟ بيئة تطوير Agant محجوبة عن الخادم،
 * وrunner GitHub يوصل — لكن كل طبقة vitest/vite فوق runner بلا بناء تُعد
 * طبقة فشل إضافية؛ الشواهد لا تحتاج إلا fetch الأصلي. صفر اعتماديات،
 * صفر npm ci، صفر رموز — العنوان من env والمفتاح يبقى في Render env.
 *
 * الخروج: 0 نجاح / 1 فشل شاهد / 2 إعداد ناقص.
 * الشواهد تُطبع بسطر يبدأ [zsourcing-live] كي تُرفع annotations في الworkflow.
 */
const BASE = (process.env.ZS_LIVE_BASE_URL ?? '').replace(/\/+$/, '');
if (!BASE) {
  console.error('[zsourcing-live] خطأ إعداد: ZS_LIVE_BASE_URL مطلوب.');
  process.exit(2);
}

const TIMEOUT_MS = 120_000;
let failures = 0;

const ok = (label, condition, extra = '') => {
  console.log(`[zsourcing-live] ${condition ? '✓' : '✗'} ${label}${extra ? ' — ' + extra : ''}`);
  if (!condition) failures += 1;
};

async function postJson(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* رد غير JSON — نصه يُعرض في الخطأ */ }
  return { status: res.status, json, text };
}

/** ① البحث بالكلمات — منتجات حقيقية (zh: 瑜伽垫 سجادة يوغا من مثال الوثائق الرسمية). */
let firstOfferId = null;
try {
  const { status, json } = await postJson('/api/zsourcing/search', { zhQuery: '瑜伽垫', pageIndex: 1, pageSize: 10 });
  if (status === 404) {
    ok('① المسار /api/zsourcing/search منشور', false, '404 — انتظر اكتمال نشر Render ثم أعد التشغيل');
  } else if (json && json.code === 'ZS_NEXSCOPE_NOT_CONFIGURED') {
    ok('① البحث بالكلمات — NEXSCOPE_API_KEY مضبوط على الخادم', false, 'المفتاح غير موجود في Render env');
  } else {
    const products = Array.isArray(json?.data?.products) ? json.data.products : [];
    ok('① استجابة 200 + منتجات حقيقية', status === 200 && json?.success === true && products.length > 0,
      `http=${status} code=${json?.code ?? '-'} count=${products.length}`);
    // سطر واحد مدمج (حد GitHub: 10 annotations/job) — كل النتائج في سطر الشواهد.
    console.log(`[zsourcing-live] ① عينات: ${products.slice(0, 3).map((p) => `${p.offerId} | ${p.supplier ?? '?'} | ${p.priceCny ?? p.consignPrice ?? '?'} CNY`).join('  ·  ')}`);
    console.log(`[zsourcing-live] ① مفاتيح العنصر الخام: ${products[0] ? Object.keys(products[0].raw ?? {}).slice(0, 14).join(',') : '-'}`);
    firstOfferId = products[0]?.offerId ?? null;
  }
} catch (error) {
  ok('① البحث بالكلمات — الخادم يستجيب', false, String(error?.message ?? error));
}

/** ② البحث بالصورة — PNG حقيقي 1×1؛ الصادق: نجاح أو سبب بأكوادنا ZS_*. */
try {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const form = new FormData();
  form.append('image', new Blob([png], { type: 'image/png' }), 'probe.png');
  const res = await fetch(`${BASE}/api/zsourcing/image`, { method: 'POST', body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = await res.json().catch(() => null);
  const accepted = json?.success === true;
  const honestFailure = json && typeof json.code === 'string' && /^ZS_/.test(json.code);
  ok('② البحث بالصورة — نجاح أو سبب حقيقي بأكوادنا', accepted || honestFailure, `http=${res.status} code=${json?.code ?? '-'}`);
  console.log(`[zsourcing-live] ② نتائج الصورة: ${Array.isArray(json?.data?.products) ? json.data.products.length : 0}`);
} catch (error) {
  ok('② البحث بالصورة — الخادم يستجيب', false, String(error?.message ?? error));
}/** ③ التفاصيل بمعرّف من ① — تسجيل مفاتيح الاستجابة الحية لتقييد types.ts. */
try {
  if (!firstOfferId) {
    console.log('[zsourcing-live] ③ تفاصيل: تُختبر عند توفر نتيجة حية من ① — لا تخمين معرّفات.');
  } else {
    const { status, json } = await postJson('/api/zsourcing/item', { offerId: firstOfferId });
    if (json?.success === true) {
      const detail = json?.data?.detail ?? {};
      ok('③ التفاصيل — رد حي بمحتوى', Object.keys(detail).length > 0, `http=${status}`);
      // سطر مدمج: مفاتيح التفاصيل الحية كلها (أساس تقييد types.ts).
      console.log(`[zsourcing-live] ③ مفاتيح detail: ${Object.keys(detail).slice(0, 20).join(',')} | product: ${Object.keys(detail.product ?? {}).slice(0, 25).join(',')}`);
    } else {
      ok('③ التفاصيل — سبب حقيقي بأكوادنا', typeof json?.code === 'string' && /^ZS_/.test(json.code), `http=${status} code=${json?.code ?? '-'}`);
    }
  }
} catch (error) {
  ok('③ التفاصيل — الخادم يستجيب', false, String(error?.message ?? error));
}

/** ④ عَلَم مسار Apify القديم — توثيق حالة المسار القديم (لا فشل: قرار تشغيلي للمالك). */
try {
  const res = await fetch(`${BASE}/api/sbase/health`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = await res.json().catch(() => null);
  const data = json?.data ?? {};
  ok('④ الجاهزية تعلن حالة المسار القديم', res.status === 200 && typeof data.legacyApifyDisabled === 'boolean' && data.configured === true,
    `configured=${data.configured} legacyApifyDisabled=${data.legacyApifyDisabled}`);
} catch (error) {
  ok('④ الجاهزية sbase/health — الخادم يستجيب', false, String(error?.message ?? error));
}

console.log(`[zsourcing-live] النتيجة: ${failures === 0 ? 'الشواهد الثلاثية سليمة ✓' : `${failures} فشل — العوائق موثّقة أعلاه بصدق`}`);
process.exit(failures === 0 ? 0 : 1);
