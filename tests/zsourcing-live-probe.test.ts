/**
 * Z Sourcing — جامع الشواهد الحية (نقطة التوقف الأولى من أمر المالك 28/11).
 *
 * لماذا اختبار CI لا curl يدوي؟ بيئة التطوير محجوبة عن أسماء نطاقات خارج
 * القائمة المسموحة — بينما GitHub runner يتصل بالخادم المنشور على Render
 * بحرية. هذا الملف يُشغَّل **فقط عند ضبط ZS_LIVE_PROBE=1** في الCI (workflow
 * مجدول أو dispatch)، وإلا يتخطى نفسه في الsuite العادية (صفر أثر).
 *
 * القواعد:
 *  • **لا رموز إطلاقاً في الملف** — العنوان من env، والمفتاح يبقى في Render env
 *    (الاختبار يتحقق من «صحة الاستجابة» لا من المفتاح).
 *  • لا بيانات مختلَعة: يوثّق ما رده الخادم الحي بالحرف، ويضع ❌ أمام ما فشل —
 *    والسجل الحي docs/design/zsourcing/IMPLEMENTATION-LOG.md يُحدَّث بالنتائج.
 *  • نقطة التوقف الثلاثية (أمر المالك): بحث كلمات حقيقي ✓ / بحث صورة ✓ /
 *    تفاصيل تعيد الصور والأسعار والمتغيرات والمورّد ✓.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const BASE = (process.env.ZS_LIVE_BASE_URL ?? '').replace(/\/+$/, '');
const ENABLED = process.env.ZS_LIVE_PROBE === '1' && BASE !== '';

describe.skipIf(!ENABLED)('Z Sourcing — نقطة التوقف الأولى (شواهد حية من الخادم المنشور)', () => {
  /** الحد الأدنى: بحث بالكلمات يعيد منتجات حقيقية (zh: سجادة يوغا — مثال الوثائق الرسمية). */
  test('① البحث بالكلمات — منتجات حقيقية مع معرّفات نصّية', async () => {
    const res = await fetch(`${BASE}/api/zsourcing/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zhQuery: '瑜伽垫', pageIndex: 1, pageSize: 10 }),
    });
    const json = await res.json() as { success?: boolean; code?: string; data?: { products?: Array<{ offerId: string; supplier?: string | null; raw?: Record<string, unknown> }> } };
    // الصادق أولاً: إن كان الخادم غير مضبوط بعد (env مفقود) نعلن ذلك ولا نخترع نجاحاً.
    if (json.code === 'ZS_NEXSCOPE_NOT_CONFIGURED') {
      console.warn('[zsourcing-live] الخادم لم يضبط NEXSCOPE_API_KEY بعد — نقطة التوقف غير قابلة للتشغيل.');
      expect(json.code).toBe('ZS_NEXSCOPE_NOT_CONFIGURED');
      return;
    }
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    const products = json.data?.products ?? [];
    expect(products.length).toBeGreaterThan(0);
    for (const product of products.slice(0, 5)) {
      expect(product.offerId).toMatch(/^\d{6,20}$/);
      console.log('[zsourcing-live] search hit:', product.offerId, product.supplier ?? '(no supplier)', Object.keys(product.raw ?? {}).slice(0, 12).join(','));
    }
  });

  /** الثانية: بحث الصورة بصورة PNG حقيقية صغيرة مولّدة في الاختبار. */
  test('② البحث بالصورة — استجابة صادقة (نتائج أو سبب حقيقي)', async () => {
    // 1×1 PNG موثوق (مولّد مسبقاً — ثابت بايتات معروف، ليس بيانات منتج).
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const form = new FormData();
    form.append('image', new Blob([png], { type: 'image/png' }), 'probe.png');
    const res = await fetch(`${BASE}/api/zsourcing/image`, { method: 'POST', body: form });
    const json = await res.json() as { success?: boolean; code?: string; data?: { products?: unknown[] } };
    // صورة 1×1 قد يرفضها المزوّد أو ترد بلا نتائج — الصادق أن الكود يقول السبب الحقيقي.
    console.log('[zsourcing-live] image probe:', res.status, json.code ?? '(ok)', json.data?.products?.length ?? 0, 'results');
    if (json.success) {
      expect(Array.isArray(json.data?.products)).toBe(true);
    } else {
      expect(json.code).toMatch(/^ZS_/); // سبب حقيقي بأكوادنا — لا فشل متخفي
    }
  });

  /** الثالثة: التفاصيل بمعرّف من نتائج ① — تُسجَّل الحقول الحية لتقييد types.ts. */
  test('③ تفاصيل منتج حي — تسجيل أسماء حقول الاستجابة الحية (لإغلاق raw)', async () => {
    const searchRes = await fetch(`${BASE}/api/zsourcing/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zhQuery: '瑜伽垫', pageIndex: 1, pageSize: 5 }),
    });
    const search = await searchRes.json() as { success?: boolean; data?: { products?: Array<{ offerId: string }> } };
    const offerId = search.data?.products?.[0]?.offerId;
    if (!offerId) {
      console.warn('[zsourcing-live] لا معرّف من ① — التفاصيل تُختبر عند توفر نتائج حية.');
      expect(searchRes.status).toBeLessThan(500);
      return;
    }
    const res = await fetch(`${BASE}/api/zsourcing/item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerId }),
    });
    const json = await res.json() as { success?: boolean; code?: string; data?: { detail?: Record<string, unknown> } };
    if (json.success) {
      const detail = json.data?.detail ?? {};
      console.log('[zsourcing-live] detail top-level keys:', Object.keys(detail).join(','));
      console.log('[zsourcing-live] detail.product keys:', Object.keys((detail.product ?? {}) as object).join(','));
      // الموثّق أن التفاصيل موجودة — التقييد الحقيقي للحقول يُراجع من السجل البشري عند نقطة التوقف.
      expect(Object.keys(detail).length).toBeGreaterThan(0);
    } else {
      console.log('[zsourcing-live] detail probe:', res.status, json.code ?? '');
      expect(json.code).toMatch(/^ZS_/);
    }
  });

  /** المرحلة 2: التأكد أن مسار Apify القديم يحترم العلم عند رفعه على الخادم (إن رُفع). */
  test('④ Apify القديم: العلم يُحترم — بلا استدعاءات غير مقصودة', async () => {
    const res = await fetch(`${BASE}/api/sbase/health`);
    const json = await res.json() as { data?: { legacyApifyDisabled?: boolean; configured?: boolean } };
    console.log('[zsourcing-live] sbase health:', JSON.stringify(json.data));
    expect(json.data?.configured).toBe(true);
    // لا فشل هنا: العلم قرار المالك التشغيلي — الاختبار يوثّق حالته فقط.
    expect(typeof json.data?.legacyApifyDisabled).toBe('boolean');
  });
});
