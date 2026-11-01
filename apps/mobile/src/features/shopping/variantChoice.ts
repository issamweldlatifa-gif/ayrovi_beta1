/**
 * اختيار المقاس/اللون في الورقة الكبيرة (24/10/2026).
 *
 * علاش ملف صافي بلا React: القرار «الزر يخدم ولا لا؟» هو **قرار واحد**، وما
 * نجمّوش نخلّيوه مبعثر بين `disabled` و`onPress` وشرط سطر. هنا يتكتب مرّة،
 * ويتّختبر بلا محاكي.
 *
 * القواعد (نفس ترتيب مصفوفة الحالات في `docs/design/bigcard/index.html`):
 *  1. منتوج بلا اختيارات ⇒ ما فماش سؤال: `ready: true` (الزر يخدم إذا السعر
 *     والمخزون يسمحوا — وهذا قرار الخادم في `sheet.purchasable`)؛
 *  2. اختيار ناقص ⇒ `missing` يسمّي المفتاح الناقص، والزر ما يخدمش؛
 *  3. اختيار كامل ما عندوش مقابلة في المخزون ⇒ `matched: false`؛
 *  4. اختيار موجود لكن موش متوفّر (نافد ولا مقاس مسحوب) ⇒ `available: false`؛
 *  5. كل شي باهي ⇒ `ready: true` والمتغيّر يتبعث مع السلّة.
 */
import type { ProductSheet, SheetVariant } from '@/api/catalog';

export interface VariantChoiceInput {
  size?: string;
  color?: string;
}

export interface VariantChoice {
  /** كل شي جاهز: الزر ينجّم يبعث. */
  ready: boolean;
  /** أوّل اختيار ناقص، ولا `null`. */
  missing: 'size' | 'color' | null;
  /** لقينا مقابلة للمقاس/اللون في لائحة المتغيّرات؟ */
  matched: boolean;
  /** المقابلة موجودة ومتوفّرة؟ */
  available: boolean;
  /** المتغيّر اللي باش يتبعث (ولا `null` إذا ما فماش اختيارات). */
  variant: SheetVariant | null;
}

export function variantChoiceState(
  sheet: Pick<ProductSheet, 'dimensions' | 'variants'> | null | undefined,
  selection: VariantChoiceInput = {},
): VariantChoice {
  const dimensions = sheet?.dimensions ?? [];
  const variants = sheet?.variants ?? [];
  const size = String(selection.size ?? '').trim();
  const color = String(selection.color ?? '').trim();

  // بلا اختيارات معلنة: ما نسألوش على حاجة ما موجوداش.
  if (dimensions.length === 0) {
    return { ready: true, missing: null, matched: false, available: true, variant: null };
  }

  const missing = dimensions.find((dimension) => !(dimension.key === 'size' ? size : color))?.key ?? null;
  if (missing) return { ready: false, missing, matched: false, available: false, variant: null };

  const variant = variants.find(
    (entry) => (!size || entry.size === size) && (!color || entry.color === color),
  ) ?? null;
  if (!variant) return { ready: false, missing: null, matched: false, available: false, variant: null };
  return {
    ready: variant.available,
    missing: null,
    matched: true,
    available: variant.available,
    variant,
  };
}

/** قيمة اختيار تنجّم تتختار؟ (نفس قاعدة الخادم، بلا إعادة حساب مخزون) */
export function dimensionValueUsable(value: { available: boolean }): boolean {
  return value.available === true;
}
