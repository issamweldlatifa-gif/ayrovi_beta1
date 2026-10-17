/**
 * منطق تدفّق OCEREX — دوال نقية (نفس قواعد الموقع في `OcerexScreen.tsx`).
 *
 * الخطوات: التهيئة (مرة واحدة) ⇒ الرئيسية ⇒ المعالجة ⇒ العملة (عند الحاجة) ⇒
 * النتيجة ⇒ الملخص ⇒ الخطأ.
 */
import type { OcerexCode, OcerexExtraction } from '@/api/ocerex';

export type OcerexStep = 'onboarding' | 'home' | 'processing' | 'currency' | 'result' | 'summary' | 'error';

export type AfterAnalyze =
  | { next: 'error'; code: OcerexCode }
  | { next: 'currency'; defaultCurrency: string }
  | { next: 'price' };

/**
 * بعد التحليل. كما في الموقع: أي كود غير OK، أو غياب السعر المرجعي، خطأ بالكود نفسه.
 * عملة غير مدعومة ⇒ خطوة تأكيد العملة، مع أول عملة مدعومة كاختيار افتراضي.
 */
export function afterAnalyze(extraction: OcerexExtraction): AfterAnalyze {
  if (extraction.code !== 'OK' || extraction.referencePrice == null) {
    return { next: 'error', code: extraction.code || 'PROCESSING_ERROR' };
  }
  const currencyKnown = Boolean(extraction.currency && extraction.supportedCurrencies.includes(extraction.currency));
  if (!currencyKnown) {
    return { next: 'currency', defaultCurrency: extraction.supportedCurrencies[0] || 'USD' };
  }
  return { next: 'price' };
}

/** الإجراء الأساسي لكل خطأ. */
export type ErrorPrimary = 'retry' | 'correctUrl' | 'none';

export interface ErrorCopy {
  messageKey:
    | 'ocerex.error.NO_PRICE_FOUND' | 'ocerex.error.LOW_CONFIDENCE' | 'ocerex.error.NO_REFERENCE_PRICE'
    | 'ocerex.error.INVALID_URL' | 'ocerex.error.UNSUPPORTED_SCREEN' | 'ocerex.error.INVALID_IMAGE'
    | 'ocerex.error.PROCESSING_ERROR' | 'ocerex.error.RESTRICTED';
  primary: ErrorPrimary;
  /** نموذج الرابط الاحتياطي يظهر فقط عند هذا الخطأ. */
  linkFallback: boolean;
}

const COPY: Partial<Record<OcerexCode, ErrorCopy>> = {
  NO_PRICE_FOUND: { messageKey: 'ocerex.error.NO_PRICE_FOUND', primary: 'retry', linkFallback: false },
  LOW_CONFIDENCE: { messageKey: 'ocerex.error.LOW_CONFIDENCE', primary: 'retry', linkFallback: false },
  NO_REFERENCE_PRICE: { messageKey: 'ocerex.error.NO_REFERENCE_PRICE', primary: 'none', linkFallback: true },
  INVALID_URL: { messageKey: 'ocerex.error.INVALID_URL', primary: 'correctUrl', linkFallback: false },
  UNSUPPORTED_SCREEN: { messageKey: 'ocerex.error.UNSUPPORTED_SCREEN', primary: 'retry', linkFallback: false },
  INVALID_IMAGE: { messageKey: 'ocerex.error.INVALID_IMAGE', primary: 'retry', linkFallback: false },
  RESTRICTED: { messageKey: 'ocerex.error.RESTRICTED', primary: 'retry', linkFallback: false },
};
const FALLBACK: ErrorCopy = { messageKey: 'ocerex.error.PROCESSING_ERROR', primary: 'retry', linkFallback: false };

/** الأكواد غير المعروفة (مثل CURRENCY_UNCONFIRMED) تأخذ رسالة المعالجة العامة. */
export function errorCopy(code: OcerexCode): ErrorCopy {
  return COPY[code] ?? FALLBACK;
}

/** الرابط يجب أن يكون http(s) قبل إرساله. */
export function isHttpUrl(value: string): boolean {
  return /^https?:\/\/.+/i.test(value.trim());
}
