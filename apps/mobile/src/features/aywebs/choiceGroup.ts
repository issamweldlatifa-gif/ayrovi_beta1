/**
 * اسم المجموعة كما يفهمه الإنسان (23/10/2026).
 *
 * الصفحات تسمّي مجموعاتها بأسماء تقنية أكثر مما تسمّيها بكلمات: `color_name`،
 * `size-selector`، `pdp-size`… الورقة لازم تكتب «المقاس» و«اللون» موش
 * `data-testid`. وهذا **ترجمة اسم**، موش اختراع خيار: القيم تبقى كما نشرتها
 * الصفحة حرفياً.
 *
 * ولمّا الاسم ما يتعرّفش، نكتبو كما هو («Taille»، «Format»، «Matière») — الصدق
 * خير من كلمة عامّة («الخيار 1»).
 */

export type ChoiceGroupKind = 'size' | 'color' | 'volume' | 'type' | 'material' | 'model' | 'other';

const KINDS: Array<{ kind: ChoiceGroupKind; pattern: RegExp }> = [
  { kind: 'size', pattern: /(^|[^a-z])(size|taille|talla|taglia|gr(ö|oe)(ß|ss)e|misura|maat|размер|مقاس|قياس|حجم المقاس)/i },
  { kind: 'color', pattern: /(colour|color|couleur|farbe|colore|kleur|لون|اللون)/i },
  { kind: 'volume', pattern: /(volume|capacity|contenance|inhalt|ml|liter|litre|litre|cl|oz|كمية السائل|سعة|حجم)/i },
  { kind: 'material', pattern: /(material|mati(è|e)re|stoff|materiale|خامة|الخامة|قماش)/i },
  { kind: 'model', pattern: /(model|mod(è|e)le|modell|موديل|الطراز)/i },
  { kind: 'type', pattern: /(type|kind|variant|version|style|shape|نوع|النوع|شكل)/i },
];

/** نوع المجموعة من اسمه المنشور — `other` لمّا ما نعرفوهش. */
export function choiceGroupKind(attribute: string): ChoiceGroupKind {
  const name = String(attribute ?? '').trim();
  if (!name) return 'other';
  for (const entry of KINDS) {
    if (entry.pattern.test(name)) return entry.kind;
  }
  return 'other';
}

/**
 * مفتاح الترجمة لاسم مجموعة معروفة، و`null` لمّا الاسم ما يتعرّفش (نكتبوه كما
 * هو). المفتاح يرجع بلا `t()` باش هذا الملف يبقى نقيّاً وقابلاً للاختبار.
 *
 * النوع اتحاد حرفي: قاموس الترجمة يرفض أي مفتاح غير موجود، وهذا يمنع كتابة
 * مفتاح غالط بلا ما يبان.
 */
export type ChoiceGroupKey =
  | 'aywebs.choice.size'
  | 'aywebs.choice.color'
  | 'aywebs.choice.volume'
  | 'aywebs.choice.material'
  | 'aywebs.choice.model'
  | 'aywebs.choice.type';

export function choiceGroupKey(attribute: string): ChoiceGroupKey | null {
  const kind = choiceGroupKind(attribute);
  switch (kind) {
    case 'size': return 'aywebs.choice.size';
    case 'color': return 'aywebs.choice.color';
    case 'volume': return 'aywebs.choice.volume';
    case 'material': return 'aywebs.choice.material';
    case 'model': return 'aywebs.choice.model';
    case 'type': return 'aywebs.choice.type';
    default: return null;
  }
}

/**
 * هل هذه القيمة تُعرض «غير متوفرة»؟
 *
 * نعم فقط إذا الصفحة قالتها: `OUT_OF_STOCK` منشور على القيمة. «ما نعرفوش»
 * موش «غير متوفر»، والقيمة المجهولة تبقى قابلة للاختيار — الخادم هو اللي يحكم
 * وقت الإضافة.
 */
export function choiceOptionIsUnavailable(state: string | null | undefined): boolean {
  return String(state ?? '').toUpperCase() === 'OUT_OF_STOCK';
}

/** سطر الحالة تحت القيمة: لا نكتب شيئاً عند «غير معروف». */
export function choiceOptionNote(input: {
  unavailable?: boolean;
  available?: boolean;
  price?: string;
  priceFrom?: boolean;
  priceFromLabel: string;
}): { price: string; state: 'out' | 'in' | null } {
  const price = input.price
    ? (input.priceFrom ? `${input.priceFromLabel} ${input.price}` : input.price)
    : '';
  const state = input.unavailable ? 'out' as const : input.available ? 'in' as const : null;
  return { price, state };
}
