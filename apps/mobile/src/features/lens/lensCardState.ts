/**
 * حالة عرض بطاقة Lens — قرار «ما يتعرضش إلا ما يرسله الخادم».
 *
 *  • شارة Promo ونسبة `-N%` ⇐ `candidate.promo` فقط (نسبة أكبر من 0)؛
 *  • السعر المشطوب ⇐ `originalPriceTnd` إذا كان أكبر من السعر الحالي؛
 *  • ما فماش حساب ولا تقريب: الدالة تقرا الأرقام كما جاءت.
 */
import type { LensCandidate } from '@/api/lens';

export interface LensCardState {
  promoBadge: boolean;
  /** نسبة التخفيض من الخادم، أو `null` إذا ما فماش عرض نشط. */
  discountPercent: number | null;
  /** السعر المرجعي المشطوب، أو `null` إذا ما يتعرضش. */
  wasPriceTnd: number | null;
}

export function lensCardState(candidate: LensCandidate): LensCardState {
  const percent = candidate.promo != null && candidate.promo.percent > 0 ? candidate.promo.percent : null;
  const wasPrice = candidate.originalPriceTnd != null
    && candidate.priceTnd != null
    && candidate.originalPriceTnd > candidate.priceTnd
    ? candidate.originalPriceTnd
    : null;
  return { promoBadge: percent !== null, discountPercent: percent, wasPriceTnd: wasPrice };
}
