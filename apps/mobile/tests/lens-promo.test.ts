/**
 * Lens — الترويج على الفيشة: `promo` يجي من الخادم كما هو.
 *
 *  • الخادم يرسل `promo` (النسبة والعنوان والسعر) فقط حين يكون عرض نشط؛
 *  • التطبيق ما يحسبش نسبة تخفيض، وما يعرضش شارة بلا بيانات من الخادم.
 */
import { describe, expect, it } from 'vitest';

import { parseLensCandidate } from '@/api/lens';

describe('الترويج على الفيشة (promo)', () => {
  it('تقرا promo من الخادم كما يرسله', () => {
    const candidate = parseLensCandidate({
      title: 'Pull marron',
      sourceUrl: 'https://shop.example/pull',
      priceTnd: 80,
      originalPriceTnd: 100,
      promo: { percent: 20, label: 'Soldes', priceTnd: 80 },
    });
    expect(candidate.promo).toEqual({ percent: 20, label: 'Soldes', priceTnd: 80 });
  });

  it('promo غايب ⇒ null (ما فماش شارة)', () => {
    const candidate = parseLensCandidate({ title: 'Pull', sourceUrl: 'https://shop.example/pull' });
    expect(candidate.promo).toBeNull();
  });

  it('promo غلط الشكل ⇒ null', () => {
    const candidate = parseLensCandidate({ title: 'Pull', sourceUrl: 'https://shop.example/pull', promo: 'yes' });
    expect(candidate.promo).toBeNull();
  });
});
