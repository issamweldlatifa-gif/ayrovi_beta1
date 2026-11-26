/**
 * S Base — تقدير السعر النهائي بالدينار، عبر **محرّك السعر الموجود**
 * (`services/pricing.ts`) — ما فماش محرّك ثاني، ولا معادلة موازية.
 *
 * علاش هذا الملف (26/11/2026): بطاقة المنتج لازم تعرض «شحال يوقّف عليّ»
 * موش غير ثمن 1688 بالـCNY. والمحرّك موجود أصلاً ويحسب: تحويل العملة بهامش
 * الصرف، الشحن بالكيلو، المعاليم الديوانية، TVA، RPD، عمولة الخدمة، التوصيل
 * المحلّي — بمصفوفة تصنيف جمركي حسب العنوان.
 *
 * القاعدة: إذا المحرّك ما ينجّمش يقتبس (عملة بلا سعر صرف، مبلغ غايب) نرجّعوا
 * `null` ونتفلسفوش. الواجهة تكتبها صريحة «تقدير غير متوفّر» بدل رقم مخترع.
 */
import { calculatePrice, type PriceBreakdown, type PricingRules } from '../services/pricing';

export interface SbasePriceEstimate {
  /** عملة المصدر كما وصلت (CNY من 1688). */
  currency: string;
  /** مبلغ الوحدة عند المصدر. */
  amount: number;
  /** سعر الصرف الفعّال TND لكل وحدة (بهامش الصرف). */
  rateTND: number;
  /** الثمن محوّلاً بلا معاليم. */
  productTND: number;
  freightTND: number;
  dutyTND: number;
  tvaTND: number;
  serviceFeeTND: number;
  localDeliveryTND: number;
  /** المجموع التقديري بالدينار (الوحدة + الشحن + المعاليم + التوصيل). */
  totalTND: number;
  categoryLabel: string;
  categoryStatus: PriceBreakdown['categoryStatus'];
  restricted: boolean;
  requiresWeightValidation: boolean;
  pricingVersion: number;
}

export interface SbasePriceInput {
  amount: number | null;
  currency: string | null;
  title: string;
  quantity?: number;
  weightKg?: number;
  /** في البطاقة: بلا توصيل محلّي (التوصيل يتخلّص مرة في الطلبية). */
  includeLocalDelivery?: boolean;
}

export function estimateSbasePrice(rules: PricingRules | null | undefined, input: SbasePriceInput): SbasePriceEstimate | null {
  if (!rules) return null;
  const amount = Number(input.amount);
  const currency = String(input.currency ?? '').trim().toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !currency) return null;
  const breakdown = calculatePrice(rules, amount, currency, {
    title: input.title,
    quantity: input.quantity ?? 1,
    ...(input.weightKg ? { weightKg: input.weightKg } : {}),
    includeLocalDelivery: input.includeLocalDelivery ?? false,
  });
  // العملة بلا سعر صرف (مثال: CNY قبل إضافته إلى fxRates) ⇒ لا تقدير، لا كذب.
  if (!breakdown) return null;
  return {
    currency,
    amount,
    rateTND: breakdown.exchangeRate,
    productTND: breakdown.convertedPriceTND,
    freightTND: breakdown.freightTND,
    dutyTND: breakdown.dutyTND,
    tvaTND: breakdown.tvaTND,
    serviceFeeTND: breakdown.serviceFeeTND,
    localDeliveryTND: breakdown.localDeliveryTND,
    totalTND: breakdown.totalTND,
    categoryLabel: breakdown.categoryLabel,
    categoryStatus: breakdown.categoryStatus,
    restricted: breakdown.restricted,
    requiresWeightValidation: breakdown.requiresWeightValidation,
    pricingVersion: breakdown.pricingVersion,
  };
}
