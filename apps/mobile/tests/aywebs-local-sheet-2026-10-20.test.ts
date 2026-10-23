/**
 * AYWEBs — ورقة الاختيار من القراءة المحلية (20/10/2026).
 *  • الخيارات والمقاسات تجي من الصفحة مع ASIN ودليل التوفّر ;
 *  • التوفّر غير المثبت لا يفتح التأكيد أبداً ;
 *  • الاختيار الناقص أو غير الموجود يُرفض بسبب واضح ;
 *  • لا سعر محلي : السعر يأتي من الخادم عند الإضافة.
 */
import { describe, expect, it } from 'vitest';

import {
  defaultSelectionFromCapture, displayPriceForSelection, groupsFromVariants, localAddReadiness,
  localVariantsFromCapture, optionsFromVariants, productFromCapture, stockForSelection, stockFromAvailabilityText,
} from '@/features/aywebs/localProduct';

const CAPTURE = {
  title: 'T-shirt Coton',
  brand: 'Acme',
  images: [{ url: 'https://m.media-amazon.com/a.jpg' }, 'https://m.media-amazon.com/b.jpg', 'pas-une-url'],
  availabilityText: 'In stock',
  amazon: {
    pageAsin: 'B0PAGE0001',
    selectedAsin: 'B0PAGE0001',
    options: [
      { dimension: 'size', value: 'M', asin: 'B0SIZEMM01', selected: false, availabilityEvidence: 'available' },
      { dimension: 'size', value: 'L', asin: 'B0SIZELL02', selected: true, availabilityEvidence: 'unavailable' },
      { dimension: 'color', value: 'Noir', asin: 'B0SIZEMM01', selected: false, availabilityEvidence: 'available' },
    ],
    variants: [
      { asin: 'B0SIZEMM01', dimensions: [{ name: 'size', value: 'M' }, { name: 'color', value: 'Noir' }], selected: false },
      { asin: 'B0SIZELL02', dimensions: [{ name: 'size', value: 'L' }, { name: 'color', value: 'Noir' }], selected: true },
      { asin: 'B0SIZEXX03', dimensions: [{ name: 'size', value: 'XL' }], selected: false },
    ],
  },
};

describe('variantes depuis la capture', () => {
  it('ASIN, attributs et disponibilité prouvée par variante', () => {
    const variants = localVariantsFromCapture(CAPTURE);
    expect(variants.find((v) => v.asin === 'B0SIZEMM01')).toEqual({
      asin: 'B0SIZEMM01', attributes: { size: 'M', color: 'Noir' }, availability: 'AVAILABLE',
      cardPrice: '', stock: null,
    });
    expect(variants.find((v) => v.asin === 'B0SIZELL02')?.availability).toBe('OUT_OF_STOCK');
  });

  it('variante sans preuve de disponibilité ⇒ UNKNOWN (jamais AVAILABLE par défaut)', () => {
    expect(localVariantsFromCapture(CAPTURE).find((v) => v.asin === 'B0SIZEXX03')?.availability).toBe('UNKNOWN');
  });

  it('groupes d\'attributs dans l\'ordre de la page, sans doublons', () => {
    const groups = groupsFromVariants(localVariantsFromCapture(CAPTURE));
    expect(groups).toEqual([
      { attribute: 'size', values: ['M', 'L', 'XL'] },
      { attribute: 'color', values: ['Noir'] },
    ]);
  });

  it('options : ASIN comme sourceVariantId, sans prix local', () => {
    const options = optionsFromVariants(localVariantsFromCapture(CAPTURE));
    expect(options[0].sourceVariantId).toBe('B0SIZEMM01');
    expect(options.every((o) => o.totalTnd === null && o.price === null)).toBe(true);
  });

  it('pas de section Amazon ⇒ aucune variante', () => {
    expect(localVariantsFromCapture({ title: 'x' })).toEqual([]);
  });
});

describe('produit depuis la capture', () => {
  it('titre, images http seulement, aucun prix local', () => {
    const product = productFromCapture(CAPTURE, 'https://www.amazon.com/dp/B0PAGE0001', 'amazon', 'Amazon');
    expect(product.title).toBe('T-shirt Coton');
    expect(product.images).toEqual(['https://m.media-amazon.com/a.jpg', 'https://m.media-amazon.com/b.jpg']);
    expect(product.price).toBeNull();
    expect(product.ayroviPricing).toBeNull();
    expect(product.sourceDomain).toBe('www.amazon.com');
  });
});

describe('prêt à confirmer (règles locales)', () => {
  const variants = localVariantsFromCapture(CAPTURE);
  const groups = groupsFromVariants(variants);

  it('choix complet et disponible ⇒ prêt', () => {
    const r = localAddReadiness({ groups, variants, selection: { size: 'M', color: 'Noir' }, pageInStockText: false });
    expect(r.ready).toBe(true);
  });

  it('attribut manquant ⇒ VARIANT_REQUIRED et le nom de l\'attribut', () => {
    const r = localAddReadiness({ groups, variants, selection: { size: 'M' }, pageInStockText: false });
    expect(r).toMatchObject({ ready: false, code: 'VARIANT_REQUIRED', missingAttributes: ['color'] });
  });

  it('variante en rupture ⇒ VARIANT_UNAVAILABLE', () => {
    const r = localAddReadiness({ groups, variants, selection: { size: 'L', color: 'Noir' }, pageInStockText: true });
    expect(r.code).toBe('VARIANT_UNAVAILABLE');
    expect(r.ready).toBe(false);
  });

  it('combinaison absente de la page ⇒ VARIANT_UNKNOWN', () => {
    const r = localAddReadiness({ groups, variants, selection: { size: 'XL', color: 'Noir' }, pageInStockText: true });
    expect(r.code).toBe('VARIANT_UNKNOWN');
  });

  it('disponibilité inconnue ⇒ STOCK_UNKNOWN (pas d\'ajout)', () => {
    const r = localAddReadiness({ groups, variants, selection: { size: 'XL' }, pageInStockText: true });
    expect(r.ready).toBe(false);
    expect(r.code).toBe('VARIANT_REQUIRED');
    const xl = localAddReadiness({ groups: [{ attribute: 'size', values: ['XL'] }], variants, selection: { size: 'XL' }, pageInStockText: true });
    expect(xl).toMatchObject({ ready: false, code: 'STOCK_UNKNOWN' });
  });

  it('produit sans variante : prêt seulement si la page dit « en stock »', () => {
    expect(localAddReadiness({ groups: [], variants: [], selection: {}, pageInStockText: true }).ready).toBe(true);
    expect(localAddReadiness({ groups: [], variants: [], selection: {}, pageInStockText: false })).toMatchObject({ ready: false, code: 'STOCK_UNKNOWN' });
  });
});

/**
 * ورقة الجهاز (23/10/2026) — الثلاثة اللي كانوا ناقصين: الاختيار الافتراضي،
 * الثمن المعروض، والمخزون المعلن. المصدر هو نفس capture اللي تبعثو الصفحة.
 */
const SHOWN = {
  title: 'Vince Camuto dress',
  availabilityText: 'In stock',
  priceCandidates: [
    { text: '$109.00', source: 'a11y_label' },
    { text: '$109.00', source: 'dom' },
  ],
  amazon: {
    pageAsin: 'B0GYM3V9H5',
    selectedAsin: 'B0GYM3V9H5',
    selectedValues: ['Small', 'Emerald Leaf'],
    options: [
      { dimension: 'size', value: 'Small', asin: 'B0GYM3V9H5', selected: true, availabilityEvidence: 'available' },
      { dimension: 'size', value: 'Large', asin: 'B0GYMKWMFW', selected: false, availabilityEvidence: 'unavailable' },
      { dimension: 'color', value: 'Emerald Leaf', asin: 'B0GYM3V9H5', selected: true, availabilityEvidence: 'available' },
      { dimension: 'color', value: 'Ruby Red', asin: 'B0RUBY0001', selected: false, availabilityEvidence: 'available', price: '$89.99', stock: 6 },
    ],
    variants: [
      { asin: 'B0GYM3V9H5', selected: true, dimensions: [{ name: 'size', value: 'Small' }, { name: 'color', value: 'Emerald Leaf' }] },
      { asin: 'B0GYMKWMFW', selected: false, dimensions: [{ name: 'size', value: 'Large' }, { name: 'color', value: 'Emerald Leaf' }] },
      { asin: 'B0RUBY0001', selected: false, dimensions: [{ name: 'size', value: 'Small' }, { name: 'color', value: 'Ruby Red' }] },
    ],
  },
};

describe('الورقة تفتح على الاختيار المعروض', () => {
  const groups = groupsFromVariants(localVariantsFromCapture(SHOWN));

  it('اللون والمقاس المعروضين مختارين من الأوّل — الورقة ما تفتحش فارغة', () => {
    expect(defaultSelectionFromCapture(SHOWN, groups)).toEqual({ size: 'Small', color: 'Emerald Leaf' });
  });

  it('ما نزيدوش قيمة ما نشرتهاش الصفحة', () => {
    const partial = { ...SHOWN, amazon: { ...SHOWN.amazon, variants: [] as unknown[] } };
    expect(defaultSelectionFromCapture(partial, groups)).toEqual({});
  });

  it('الاختيار المعروض جاهز للإضافة فوراً (توفّر مثبت)', () => {
    const selection = defaultSelectionFromCapture(SHOWN, groups);
    const r = localAddReadiness({
      groups,
      variants: localVariantsFromCapture(SHOWN),
      selection,
      pageInStockText: true,
    });
    expect(r).toMatchObject({ ready: true, code: '' });
  });
});

describe('الثمن المعروض للمستعمل', () => {
  const groups = groupsFromVariants(localVariantsFromCapture(SHOWN));

  it('سعر صفحة واحد (قراءتان متّفقتان) يظهر كما كتبتو الصفحة', () => {
    expect(displayPriceForSelection(SHOWN, defaultSelectionFromCapture(SHOWN, groups))).toEqual({ text: '$109.00' });
  });

  it('سعر بطاقة الاختيار يغلب سعر الصفحة (لون آخر، بطاقة تنشر ثمنها ومخزونها)', () => {
    const selection = { size: 'Small', color: 'Ruby Red' };
    expect(displayPriceForSelection(SHOWN, selection)).toEqual({ text: '$89.99' });
    expect(stockForSelection(SHOWN, selection)).toBe(6);
  });

  it('اختيار بلا ثمن منشور ⇒ لا رقم (ما نعرضوش ثمن الصفحة لتركيبة أخرى)', () => {
    expect(displayPriceForSelection(SHOWN, { size: 'Large', color: 'Emerald Leaf' })).toBeNull();
  });

  it('قراءتان مختلفتان للثمن ⇒ لا ثمن معروض', () => {
    const conflicting = { ...SHOWN, priceCandidates: [{ text: '$109.00' }, { text: '$99.00' }] };
    expect(displayPriceForSelection(conflicting, { size: 'Small', color: 'Emerald Leaf' })).toBeNull();
  });
});

describe('المخزون المعلن', () => {
  it('« Only 6 left in stock » ⇒ 6 ; بلا رقم ⇒ لا سقف', () => {
    expect(stockFromAvailabilityText('Only 6 left in stock - order soon.')).toBe(6);
    expect(stockFromAvailabilityText('In Stock')).toBeNull();
    expect(stockFromAvailabilityText('il ne reste plus que 3')).toBe(3);
    expect(stockFromAvailabilityText('نشر 0')).toBeNull();
  });

  it('نصّ توفّر الصفحة يُستعمل فقط كي الاختيار هو المعروض', () => {
    const capture = { ...SHOWN, availabilityText: 'Only 4 left in stock' };
    const variants = localVariantsFromCapture(capture);
    /* الاختيار المعروض ما عندوش مخزون على بطاقتو ⇒ الرقم يجي من نصّ الصفحة. */
    expect(variants.find((v) => v.asin === 'B0GYM3V9H5')!.stock).toBeNull();
    expect(stockForSelection(capture, { size: 'Small', color: 'Emerald Leaf' })).toBe(4);
    expect(stockForSelection(capture, { size: 'Large', color: 'Emerald Leaf' })).toBeNull();
  });
});
