/**
 * ترجمة رفض الخادم إلى جملة يفهمها المستعمل في ورقة الإضافة.
 *
 * تاريخ المشكل (25/10/2026): على بطاقة Zalando («مكتبة»، لا قراءة خادم
 * مخصّصة لها)، أي رفض لكابتشر الصفحة كان يُسطَّح خادمياً إلى
 * PRODUCT_PAGE_REQUIRED، فيتلقّى التطبيق 422 لا يعرف له مفتاح ترجمة فيسقط على
 * «La demande n'a pas abouti» — جملة صمّاء تخفي السبب الحقيقي (ثمن غير مُثبَّت،
 * كابتشر قديم، نفاد مخزون…).
 *
 * الخادم صار يرسل الكود الدقيق (PRICE_AMBIGUOUS، OUT_OF_STOCK، CAPTURE_INCOMPLETE…).
 * هذه الوحدة النقية تُسقط كل كود على مفتاح ترجمة واحد، فلا يصل الزبون قط إلى
 * الاحتياطي الصمّاء. قابل للاختبار بلا واجهة (مثل selectionQuote).
 */
import { isApiError, userMessage } from '@/api/errors';
import type { TranslationKey, Translate } from '@/i18n/keys';

/**
 * مفتاح الترجمة الذي يشرح كود الرفض. نعيد null للأكواد غير المعروفة لدينا:
 * عندها تبقى رسالة الخادم المُترجَمة (userMessage) هي المرجع، ولا نخترع جملة.
 */
export function ayWebsErrorTranslationKey(code: string): TranslationKey | null {
  switch (code) {
    case 'STOCK_UNKNOWN':
      return 'aywebs.selectionUnverified';
    case 'OUT_OF_STOCK':
    case 'PRODUCT_UNAVAILABLE':
    case 'VARIANT_UNAVAILABLE':
      return 'aywebs.block.VARIANT_UNAVAILABLE';
    case 'VARIANT_UNKNOWN':
      return 'aywebs.block.VARIANT_UNKNOWN';
    case 'VARIANT_REQUIRED':
      return 'aywebs.block.VARIANT_REQUIRED';
    case 'PRICE_UNAVAILABLE':
      return 'aywebs.block.PRICE_UNAVAILABLE';
    /* ثمن الصفحة وحيد المصدر: الخادم يرفض نشر مبلغ غير مُثبَّت. نطلب إعادة
       قراءة الفيش، لا رسالة شبكة عامّة. */
    case 'PRICE_AMBIGUOUS':
      return 'aywebs.block.PRICE_AMBIGUOUS';
    case 'PRICE_CHANGED':
      return 'aywebs.priceChanged';
    case 'CAPTURE_INCOMPLETE':
    case 'CAPTURE_FAILED':
      return 'aywebs.captureFailed';
    /* الفيش مفتوح لكن طبيعته غير مثبتة (صفحة قائمة، استقبال…): نوجّه إلى
       بطاقة المنتوج الحقيقية. */
    case 'PRODUCT_PAGE_REQUIRED':
      return 'aywebs.notAProductPage';
    case 'STORE_UNAVAILABLE':
      return 'aywebs.block.STORE_UNAVAILABLE';
    case 'CAPTCHA_REQUIRED':
      return 'aywebs.block.CAPTCHA_REQUIRED';
    case 'CUSTOMER_ACTION_REQUIRED':
      return 'aywebs.block.CUSTOMER_ACTION_REQUIRED';
    case 'DOMAIN_NOT_ALLOWED':
      return 'aywebs.block.DOMAIN_NOT_ALLOWED';
    /* أخطاء الرابط أو هوية المتجر: إعادة قراءة الفيش هي الفعل الصحيح. */
    case 'STORE_MISMATCH':
    case 'INVALID_URL':
    case 'HTTPS_REQUIRED':
      return 'aywebs.captureFailed';
    default:
      return null;
  }
}

export function addErrorMessage(caught: unknown, locale: 'fr' | 'ar', t: Translate): string {
  if (isApiError(caught)) {
    const key = ayWebsErrorTranslationKey(caught.code);
    if (key) return t(key);
    return userMessage(caught)[locale];
  }
  return t('aywebs.captureFailed');
}
