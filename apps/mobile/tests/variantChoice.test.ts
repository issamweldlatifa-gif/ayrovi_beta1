/**
 * اختيار المقاس/اللون — قواعد صافية (24/10/2026).
 *
 * الورقة الكبيرة تقرا اختيارات الخادم (`sheet.dimensions` + `sheet.variants`)،
 * وهذا الاختبار يحمي القرار الوحيد اللي يهمّ المستعمل: **وقتاش زر «زيد للسلّة»
 * يخدم؟** وأهم حالة: اختيار ناقص ما يبعثش طلب ناقص للخادم.
 */
import { describe, expect, test } from 'vitest';
import { dimensionValueUsable, variantChoiceState } from '../src/features/shopping/variantChoice';
import type { ProductSheet } from '../src/api/catalog';

const sheet = (over: Partial<ProductSheet> = {}): ProductSheet => ({
  images: [],
  dimensions: [],
  variants: [],
  stock: { tracked: false, quantity: null, status: 'UNKNOWN' },
  purchasable: true,
  ...over,
});

const dimensions = [
  { key: 'size' as const, label: 'Taille', values: [
    { value: 'M', available: true, stock: 3 },
    { value: 'L', available: false, stock: 0 },
  ] },
  { key: 'color' as const, label: 'Couleur', values: [
    { value: 'Noir', available: true, stock: 3 },
    { value: 'Beige', available: false, stock: null },
  ] },
];

const variants = [
  { id: 'v1', sku: 'S1', size: 'M', color: 'Noir', available: true, stock: 3, reason: null },
  { id: 'v2', sku: 'S2', size: 'L', color: 'Noir', available: false, stock: 0, reason: 'OUT_OF_STOCK' as const },
];

describe('variantChoiceState — الزر يخدم ولا لا', () => {
  test('منتوج بلا اختيارات: ما نسألوش، والزر يتبع قرار الخادم', () => {
    expect(variantChoiceState(sheet(), {})).toEqual({ ready: true, missing: null, matched: false, available: true, variant: null });
    expect(variantChoiceState(null, { size: 'M' })).toMatchObject({ ready: true, missing: null });
  });

  test('اختيار ناقص: نسمّي الناقص، والزر ما يخدمش', () => {
    const choice = variantChoiceState(sheet({ dimensions, variants }), { size: 'M' });
    expect(choice).toMatchObject({ ready: false, missing: 'color', matched: false });
    expect(variantChoiceState(sheet({ dimensions, variants }), {}).missing).toBe('size');
  });

  test('اختيار كامل ومتوفّر: جاهز، والمتغيّر يتبعث', () => {
    const choice = variantChoiceState(sheet({ dimensions, variants }), { size: 'M', color: 'Noir' });
    expect(choice).toMatchObject({ ready: true, missing: null, matched: true, available: true });
    expect(choice.variant?.id).toBe('v1');
  });

  test('اختيار موجود لكن نافد: ماشي جاهز، والمتغيّر يبان', () => {
    const choice = variantChoiceState(sheet({ dimensions, variants }), { size: 'L', color: 'Noir' });
    expect(choice).toMatchObject({ ready: false, matched: true, available: false });
    expect(choice.variant?.reason).toBe('OUT_OF_STOCK');
  });

  test('اختيار ما عندوش مقابلة في المخزون: ماشي جاهز', () => {
    const choice = variantChoiceState(sheet({ dimensions, variants }), { size: 'XL', color: 'Beige' });
    expect(choice).toMatchObject({ ready: false, matched: false, available: false, variant: null });
  });

  test('اختيار واحد برك كافي إذا الخادم نشر بعد واحد', () => {
    const oneDimension = [{ key: 'size' as const, label: 'Taille', values: [{ value: 'M', available: true, stock: 2 }] }];
    const choice = variantChoiceState(
      sheet({ dimensions: oneDimension, variants: [{ id: 'v9', sku: 'S9', size: 'M', color: '', available: true, stock: 2, reason: null }] }),
      { size: 'M' },
    );
    expect(choice).toMatchObject({ ready: true, matched: true });
  });
});

describe('dimensionValueUsable — قيمة قابلة للنقر', () => {
  test('القيمة النافدة تتعطّل، المتوفّرة تتختار', () => {
    expect(dimensionValueUsable({ available: true })).toBe(true);
    expect(dimensionValueUsable({ available: false })).toBe(false);
  });
});
