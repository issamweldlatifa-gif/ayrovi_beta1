/**
 * Lens — من ردّ الخادم إلى حالة البطاقة (بدون / مع الشارات).
 *
 *  • الردّ الخام ⇒ `parseLensCandidate` ⇒ `lensCardState`: هذا هو المسار الحقيقي للعرض؛
 *  • بلا `promo` ⇒ لا Promo ولا `-N%`، والسعر المشطوب يظهر فقط إذا أرسله الخادم أعلى من السعر؛
 *  • `promo` بنسبة 0 ⇒ كأنه ما جاش.
 */
import { describe, expect, it } from 'vitest';

import { parseLensAnalysis, parseLensCandidate } from '@/api/lens';
import { lensCardState } from '@/features/lens/lensCardState';

const base = { title: 'Pull marron', sourceUrl: 'https://shop.example/pull', image: 'https://shop.example/pull.jpg' };

describe('حالة بطاقة Lens من ردّ الخادم', () => {
  it('ردّ الخادم بعرض نشط ⇒ Promo و-N% والسعر المشطوب', () => {
    const candidate = parseLensCandidate({
      ...base,
      priceTnd: 80,
      originalPriceTnd: 100,
      promo: { percent: 20, label: 'Soldes', priceTnd: 80 },
    });
    expect(lensCardState(candidate)).toMatchObject({ promoBadge: true, discountPercent: 20, wasPriceTnd: 100 });
  });

  it('بلا promo ⇒ بلا شارة وبلا نسبة (حتى مع سعر مرجعي)', () => {
    const candidate = parseLensCandidate({ ...base, priceTnd: 80, originalPriceTnd: 100 });
    expect(lensCardState(candidate)).toMatchObject({ promoBadge: false, discountPercent: null, wasPriceTnd: 100 });
  });

  it('بلا أي سعر مرجعي ⇒ لا يُخترع سعر مشطوب', () => {
    const candidate = parseLensCandidate({ ...base, priceTnd: 80 });
    expect(lensCardState(candidate)).toMatchObject({ promoBadge: false, discountPercent: null, wasPriceTnd: null });
  });

  it('السعر المرجعي ليس أعلى من السعر ⇒ لا يُعرض', () => {
    const candidate = parseLensCandidate({ ...base, priceTnd: 100, originalPriceTnd: 100 });
    expect(lensCardState(candidate).wasPriceTnd).toBeNull();
  });

  it('promo بنسبة 0 ⇒ كأن العرض ما جاش', () => {
    const candidate = parseLensCandidate({ ...base, priceTnd: 80, promo: { percent: 0, label: '', priceTnd: 80 } });
    expect(lensCardState(candidate)).toMatchObject({ promoBadge: false, discountPercent: null, wasPriceTnd: null });
  });

  it('خانة promo بنسبة لكن بلا سعر مرجعي ⇒ النسبة تظهر والسعر المشطوب لا', () => {
    const candidate = parseLensCandidate({ ...base, priceTnd: 80, promo: { percent: 15, label: 'Promo', priceTnd: 80 } });
    expect(lensCardState(candidate)).toMatchObject({ promoBadge: true, discountPercent: 15, wasPriceTnd: null });
  });

  it('«à partir de» فقط إذا أعلن الخادم أكثر من عرض', () => {
    const one = parseLensCandidate({ ...base, priceTnd: 45.45, offerCount: 1 });
    const many = parseLensCandidate({ ...base, priceTnd: 45.45, offerCount: 3 });
    expect(lensCardState(one).priceFrom).toBe(false);
    expect(lensCardState(many)).toMatchObject({ priceTnd: 45.45, priceFrom: true });
  });

  it('نتيجة التحليل بالصورة: كل فيشة تأخذ حالتها من ردّها', () => {
    const analysis = parseLensAnalysis({
      identification: { products: [] },
      candidates: [
        { ...base, title: 'A', priceTnd: 80, originalPriceTnd: 100, promo: { percent: 20, label: 'x', priceTnd: 80 } },
        { ...base, title: 'B', sourceUrl: 'https://shop.example/b', priceTnd: 50 },
      ],
      eventId: 'evt',
    });
    expect(analysis.candidates.map((c) => lensCardState(c).promoBadge)).toEqual([true, false]);
  });
});
