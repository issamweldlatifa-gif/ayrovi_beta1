/**
 * AYWEBs — ZALANDO : ليش التطبيق ما يعرضش السعر اللي يعرضو الويب (26/10/2026).
 *
 * ── المعطيات (من لقطات المستعمل) ───────────────────────────────────────────
 * نفس الفيشة (Nike Revolution 8 — 64,95 EUR) على الويب: «64,95 EUR ≈ 411.69 DT».
 * في التطبيق: «Prix en dinars calculé à l'ajout.» + «Pas de devis serveur en
 * dinars : ajout impossible sans prix calculé.»
 *
 * ── الفرق في الكود ────────────────────────────────────────────────────────
 * الويب عندو طريقة واحدة: `POST /product/resolve` بالـURL برك — بلا capture،
 * بلا variante، بلا refresh (client/src/features/aywebs/components/
 * AyWebsVariantSheet.tsx:92). التطبيق كان يبعث capture + المقاس المختار:
 * والـresolve كي تجيه capture + variante يطلب **دليل ثمن لكل قيمة**
 * (productResolver.ts, `variant_price_not_published` ⇒ PRICE_UNAVAILABLE)،
 * ووقتها ما فماش `ayrovi_pricing` ⇒ «Prix en dinars calculé à l'ajout.»
 *
 * ── ما يُثبَّت هنا ─────────────────────────────────────────────────────────
 * خطّة القراءة: capture+variante ← capture وحدها ← طلب الويب بالضبط، ونتوقّفو
 * على أوّل دينار. والثابتة الأهمّ: **variante بلا capture ما تتطلبش أبداً**
 * (هذا الطريق اللي الويب ما يمشيش فيه)، و`refresh` يبقى للـ«Add» موش للعرض.
 */
import { describe, expect, it } from 'vitest';

import { lacksServerQuote, quoteReadPlan, type QuoteAttempt } from '@/features/aywebs/priceFallback';
import { selectionQuote } from '@/features/aywebs/selectionQuote';

const webRequest: QuoteAttempt = { capture: false, withVariant: false, refresh: false };

describe('خطّة قراءة الدينار — ترتيب المحاولات', () => {
  it('capture + اختيار: تجربة دقيقة، ثم الصفحة، ثم طلب الويب', () => {
    const plan = quoteReadPlan({ hasCapture: true, hasSelection: true });
    expect(plan).toEqual([
      { capture: true, withVariant: true, refresh: false },
      { capture: true, withVariant: false, refresh: false },
      webRequest,
    ]);
  });

  it('capture بلا اختيار: ما نبعثوش variante فارغة', () => {
    const plan = quoteReadPlan({ hasCapture: true, hasSelection: false });
    expect(plan).toEqual([{ capture: true, withVariant: false, refresh: false }, webRequest]);
  });

  it('بلا capture: نديرو كيف الويب بالضبط — طلب واحد', () => {
    expect(quoteReadPlan({ hasCapture: false, hasSelection: false })).toEqual([webRequest]);
    expect(quoteReadPlan({ hasCapture: false, hasSelection: true })).toEqual([webRequest]);
  });
});

describe('خطّة قراءة الدينار — الثوابت', () => {
  const cases = [
    { hasCapture: true, hasSelection: true },
    { hasCapture: true, hasSelection: false },
    { hasCapture: false, hasSelection: true },
    { hasCapture: false, hasSelection: false },
  ];

  it('variante ما تتطلبش بلا capture (الطريق اللي يرفضه الخادم)', () => {
    for (const input of cases) {
      for (const attempt of quoteReadPlan(input)) {
        if (attempt.withVariant) expect(attempt.capture, JSON.stringify(input)).toBe(true);
      }
    }
  });

  it('العرض ما يفرضش relecture marchande — `refresh` للـ«Add» برك', () => {
    for (const input of cases) {
      for (const attempt of quoteReadPlan(input)) expect(attempt.refresh).toBe(false);
    }
  });

  it('آخر محاولة هي طلب الويب دائماً (المرجع كي يختلفو)', () => {
    for (const input of cases) {
      const plan = quoteReadPlan(input);
      expect(plan[plan.length - 1]).toEqual(webRequest);
    }
  });

  it('ما فماش محاولات مكرّرة (كل محاولة عندها سبب)', () => {
    for (const input of cases) {
      const plan = quoteReadPlan(input);
      const keys = plan.map((attempt) => JSON.stringify(attempt));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});

describe('«فمّة دينار؟» — شرط التوقّف في الخطّة', () => {
  const priced = (totalTnd: number | null) => ({
    ayroviPricing: totalTnd == null ? null : {
      totalTnd, pricingVersion: 3, breakdown: null,
    },
  });

  it('411.69 DT = devis موجود ⇒ الخطّة تتوقّف هنا', () => {
    expect(lacksServerQuote(priced(411.69))).toBe(false);
  });

  it('بلا devis (أو صفر أو رقم غير صالح) ⇒ نكمّلو المحاولة الجاية', () => {
    expect(lacksServerQuote(priced(null))).toBe(true);
    expect(lacksServerQuote(priced(0))).toBe(true);
    expect(lacksServerQuote(priced(Number.NaN))).toBe(true);
    expect(lacksServerQuote(null)).toBe(true);
  });
});

/* ── السعر لكل اختيار: نفس مصدر الويب (جدول التركيبات) ────────────────────── */

describe('سعر الاختيار — من جدول التركيبات اللي يعرضو الويب', () => {
  const page = {
    selection: { size: '36', color: 'black/white/noir' },
    unitTnd: 411.69,
    availability: 'AVAILABLE' as const,
    stock: null,
    sourcePrice: 64.95,
    sourceCurrency: 'EUR',
  };

  const combinations = [
    { attributes: { size: '35.5', color: 'black/white/noir' }, totalTnd: 411.69, quotedPrice: 64.95, quotedCurrency: 'EUR', availability: 'OUT_OF_STOCK' },
    { attributes: { size: '36', color: 'black/white/noir' }, totalTnd: 411.69, quotedPrice: 64.95, quotedCurrency: 'EUR', availability: 'AVAILABLE' },
    { attributes: { size: '38.5', color: 'black/white/noir' }, totalTnd: 419.5, quotedPrice: 66.2, quotedCurrency: 'EUR', availability: 'AVAILABLE' },
  ];

  it('بلا devis لكل قيمة: التركيبة الدقيقة تعطي دينار (كيف الويب)', () => {
    const quote = selectionQuote({
      page: { ...page, selection: { size: '35.5' } },
      quotes: [],
      combinations,
      selection: { size: '36', color: 'black/white/noir' },
    });
    expect(quote.unitTnd).toBeCloseTo(411.69, 2);
    expect(quote.availability).toBe('AVAILABLE');
    expect(quote.sourcePrice).toBeCloseTo(64.95, 2);
  });

  it('تركيبة أخرى ما تعطيش سعر: 419.5 ما تتلبّسش بـ36', () => {
    const quote = selectionQuote({
      page: null,
      quotes: [],
      combinations,
      selection: { size: '40', color: 'black/white/noir' },
    });
    expect(quote.unitTnd).toBeNull();
    expect(quote.availability).toBe('UNKNOWN');
  });

  it('اسم المجموعة يختلف (Taille / size) والبصمة هي البصمة', () => {
    const quote = selectionQuote({
      page: null,
      quotes: [],
      combinations: [{ attributes: { size: '36' }, totalTnd: 411.69, quotedPrice: 64.95, quotedCurrency: 'EUR', availability: 'AVAILABLE' }],
      selection: { Taille: '36' },
    });
    expect(quote.unitTnd).toBeCloseTo(411.69, 2);
  });

  it('devis لكل قيمة موجود ⇒ هو اللي يتقدّم (ما نبدّلوش الأولوية)', () => {
    const quote = selectionQuote({
      page: null,
      quotes: [{ group: 'size', value: '36', availability: 'AVAILABLE', stock: null, sourcePrice: 64.95, currency: 'EUR', totalTnd: 400, priceFrom: false, pricingVersion: 1 }],
      combinations,
      selection: { size: '36' },
    });
    expect(quote.unitTnd).toBeCloseTo(400, 2);
    expect(quote.fromValue).toBe(true);
  });

  it('devis جزئي ما يغطّيش لون ناقص — بلا combination يفضل بلا سعر', () => {
    const quote = selectionQuote({
      page: null,
      quotes: [{ group: 'size', value: '36', availability: 'AVAILABLE', stock: null, sourcePrice: 64.95, currency: 'EUR', totalTnd: 411.69, priceFrom: false, pricingVersion: 1 }],
      selection: { size: '36', color: 'black' },
    });
    expect(quote.unitTnd).toBeNull();
  });

  it('تركيبة exact من الخادم تحسم حتى لو devis القيم ناقص', () => {
    const quote = selectionQuote({
      page: null,
      quotes: [{ group: 'size', value: '36', availability: 'AVAILABLE', stock: null, sourcePrice: 64.95, currency: 'EUR', totalTnd: 411.69, priceFrom: false, pricingVersion: 1 }],
      combinations: [{ attributes: { size: '36', color: 'black' }, totalTnd: 420, quotedPrice: 66, quotedCurrency: 'EUR', availability: 'AVAILABLE' }],
      selection: { size: '36', color: 'black' },
    });
    expect(quote.unitTnd).toBe(420);
  });

  it('بلا تركيبة وبلا devis: ما نختارعوش سعر', () => {
    const quote = selectionQuote({ page: null, quotes: [], selection: { size: '36' } });
    expect(quote.unitTnd).toBeNull();
    expect(quote.sourcePrice).toBeNull();
  });
});
