/**
 * AYWEBs — ورقة الإضافة: كل رفض خادم له جملة صادقة، بلا «La demande n'a pas
 * abouti» الصمّاء (25/10/2026).
 *
 * السياق: على بطاقة Zalando (متجر «مكتبة» بلا قراءة خادم مخصّصة)، كان رفض
 * الكابتشر (ثمن وحيد المصدر) يُسطَّح إلى PRODUCT_PAGE_REQUIRED ثم يسقط في
 * احتياطي رسالة عامّة. الخادم يرسل الآن الكود الدقيق، وهذه الوحدة تُسقط كل كود
 * على مفتاح ترجمة موجود في القاموسين الفرنسي والعربي.
 */
import { describe, expect, it } from 'vitest';

import { ApiError } from '@/api/errors';
import { translate } from '@/i18n/keys';
import { ar } from '@/i18n/ar';
import { fr } from '@/i18n/fr';
import { addErrorMessage, ayWebsErrorTranslationKey } from '@/features/aywebs/addError';

const tFr = (key: Parameters<typeof translate>[1]) => translate('fr', key);
const tAr = (key: Parameters<typeof translate>[1]) => translate('ar', key);
const httpError = (code: string, status = 422) => new ApiError('http', code, { status, code });

/** الأكواد التي يجب أن تُترجَم إلى جملة موجّهة (لا احتياطي عام). */
const MAPPED_CODES: ReadonlyArray<{ code: string; key: string }> = [
  { code: 'STOCK_UNKNOWN', key: 'aywebs.selectionUnverified' },
  { code: 'OUT_OF_STOCK', key: 'aywebs.block.VARIANT_UNAVAILABLE' },
  { code: 'PRODUCT_UNAVAILABLE', key: 'aywebs.block.VARIANT_UNAVAILABLE' },
  { code: 'VARIANT_UNAVAILABLE', key: 'aywebs.block.VARIANT_UNAVAILABLE' },
  { code: 'VARIANT_UNKNOWN', key: 'aywebs.block.VARIANT_UNKNOWN' },
  { code: 'VARIANT_REQUIRED', key: 'aywebs.block.VARIANT_REQUIRED' },
  { code: 'PRICE_UNAVAILABLE', key: 'aywebs.block.PRICE_UNAVAILABLE' },
  { code: 'PRICE_AMBIGUOUS', key: 'aywebs.block.PRICE_AMBIGUOUS' },
  { code: 'PRICE_CHANGED', key: 'aywebs.priceChanged' },
  { code: 'CAPTURE_INCOMPLETE', key: 'aywebs.captureFailed' },
  { code: 'CAPTURE_FAILED', key: 'aywebs.captureFailed' },
  { code: 'PRODUCT_PAGE_REQUIRED', key: 'aywebs.notAProductPage' },
  { code: 'STORE_UNAVAILABLE', key: 'aywebs.block.STORE_UNAVAILABLE' },
  { code: 'CAPTCHA_REQUIRED', key: 'aywebs.block.CAPTCHA_REQUIRED' },
  { code: 'CUSTOMER_ACTION_REQUIRED', key: 'aywebs.block.CUSTOMER_ACTION_REQUIRED' },
  { code: 'DOMAIN_NOT_ALLOWED', key: 'aywebs.block.DOMAIN_NOT_ALLOWED' },
  { code: 'STORE_MISMATCH', key: 'aywebs.captureFailed' },
  { code: 'INVALID_URL', key: 'aywebs.captureFailed' },
  { code: 'HTTPS_REQUIRED', key: 'aywebs.captureFailed' },
];

describe('ayWebsErrorTranslationKey — كل كود يعرف مفتاحه', () => {
  it.each(MAPPED_CODES)('$code → $key (موجود في fr و ar)', ({ code, key }) => {
    expect(ayWebsErrorTranslationKey(code)).toBe(key);
    expect(fr).toHaveProperty(key);
    expect(ar).toHaveProperty(key);
    expect(fr[key as keyof typeof fr]).toBeTruthy();
    expect(ar[key as keyof typeof ar]).toBeTruthy();
  });

  it('كود غير معروف لدينا يعيد null (لا مفتاح مخترع)', () => {
    expect(ayWebsErrorTranslationKey('SOME_FUTURE_CODE')).toBeNull();
  });
});

describe('addErrorMessage — لا احتياطي صمّاء على الرفوض المعروفة', () => {
  const GENERIC_FR = "La demande n’a pas abouti.";
  const GENERIC_AR = 'الطلب ما نجحش.';

  it.each(MAPPED_CODES)('$code يعطي جملة موجّهة بالفرنسية وبالعربية', ({ code }) => {
    const error = httpError(code);
    const frMsg = addErrorMessage(error, 'fr', tFr);
    const arMsg = addErrorMessage(error, 'ar', tAr);
    expect(frMsg).toBeTruthy();
    expect(arMsg).toBeTruthy();
    expect(frMsg).not.toBe(GENERIC_FR);
    expect(arMsg).not.toBe(GENERIC_AR);
    /* المفتاح يُحَل فعلياً إلى نصّ، لا يُعاد اسم المفتاح كما هو. */
    expect(frMsg).not.toContain('aywebs.');
    expect(arMsg).not.toContain('aywebs.');
  });

  it('حالة Zalando: ثمن وحيد المصدر (PRICE_AMBIGUOUS) يشرح السبب الحقيقي', () => {
    const error = httpError('PRICE_AMBIGUOUS');
    const frMsg = addErrorMessage(error, 'fr', tFr);
    const arMsg = addErrorMessage(error, 'ar', tAr);
    expect(frMsg).toBe(fr['aywebs.block.PRICE_AMBIGUOUS']);
    expect(arMsg).toBe(ar['aywebs.block.PRICE_AMBIGUOUS']);
    expect(frMsg).not.toBe(GENERIC_FR);
  });

  it('كود غير مغطّى يسقط على رسالة userMessage المُترجَمة (لا انهيار)', () => {
    const error = httpError('RATE_LIMITED', 429);
    expect(addErrorMessage(error, 'fr', tFr)).toBe('Trop de requêtes — patientez un instant.');
    expect(addErrorMessage(error, 'ar', tAr)).toBe('طلبات برشة — استنّى شوية.');
  });

  it('خطأ غير ApiError (شبكة/استثناء محلي) → رسالة فشل القراءة', () => {
    expect(addErrorMessage(new Error('boom'), 'fr', tFr)).toBe(fr['aywebs.captureFailed']);
    expect(addErrorMessage(undefined, 'ar', tAr)).toBe(ar['aywebs.captureFailed']);
  });
});
