/**
 * Lens — العناصر المتعددة في الصورة: cadres الخادم وتحويلها إلى `roi`.
 *
 *  • الكادر يجي من الخادم فقط؛ التطبيق ما يخمّنش مكان أي عنصر؛
 *  • كادر غايب، أو خارج الصورة، أو بلا اسم ⇒ العنصر يتخبّى (ما يتعرضش بكادر وهمي)؛
 *  • الـ`roi` يتبعث بالنسب المائوية 0..100 (نفس عقد الخادم).
 */
import { describe, expect, it } from 'vitest';

import { detectedItemRoi, parseDetectedItems, parseLensAnalysis } from '@/api/lens';

describe('العناصر المكتشفة في الصورة', () => {
  it('تقرا العناصر ذات الكادر الصالح فقط', () => {
    const items = parseDetectedItems({
      products: [
        { name: 'Pull marron', brand: 'Levi’s', box: [0.2, 0.1, 0.4, 0.5] },
        { name: 'Jean', brand: null, box: [0.1, 0.6, 0.5, 0.4] },
        { name: 'Sans cadre', brand: null, box: null },
        { name: 'Hors image', brand: null, box: [0.9, 0.1, 0.3, 0.2] },
        { name: '', brand: null, box: [0.1, 0.1, 0.2, 0.2] },
        { name: 'Cadre vide', brand: null, box: [0.1, 0.1, 0, 0.2] },
        { name: 'Mauvais type', brand: null, box: ['a', 0, 0.2, 0.2] },
      ],
    });
    expect(items.map((item) => item.name)).toEqual(['Pull marron', 'Jean']);
    expect(items[0]).toEqual({ name: 'Pull marron', brand: 'Levi’s', box: { x: 0.2, y: 0.1, w: 0.4, h: 0.5 } });
    expect(items[1].brand).toBeNull();
  });

  it('تعطي قائمة فارغة إذا ما فماش products أو identification غلط', () => {
    expect(parseDetectedItems(undefined)).toEqual([]);
    expect(parseDetectedItems({})).toEqual([]);
    expect(parseDetectedItems({ products: 'x' })).toEqual([]);
  });

  it('تحوّل الكادر إلى roi بالنسب المائوية', () => {
    const roi = detectedItemRoi({ name: 'Pull', brand: null, box: { x: 0.2, y: 0.1, w: 0.4, h: 0.5 } });
    expect(roi.x).toBeCloseTo(20);
    expect(roi.y).toBeCloseTo(10);
    expect(roi.w).toBeCloseTo(40);
    expect(roi.h).toBeCloseTo(50);
  });

  it('parseLensAnalysis تملأ items من identification.products', () => {
    const analysis = parseLensAnalysis({
      identification: { brand: '', model: '', description: '', confidence: 0.5, products: [{ name: 'Pull', box: [0, 0, 0.5, 0.5] }] },
      candidates: [],
      eventId: 'e1',
    });
    expect(analysis.items).toHaveLength(1);
    expect(analysis.items[0].box).toEqual({ x: 0, y: 0, w: 0.5, h: 0.5 });
  });

  it('تبقى items فارغة إذا الخادم ما أرسلش identification', () => {
    const analysis = parseLensAnalysis({ candidates: [], eventId: 'e2' });
    expect(analysis.items).toEqual([]);
  });
});
