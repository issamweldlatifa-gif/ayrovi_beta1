/**
 * الشراء (P5.2) — قاعدة البيع، وسائل الخلاص، والحدود.
 *
 * هذي الاختبارات هي اللي تمنع «صفقة مخترعة»: الطلب يتخلق بـ`PENDING_SELECTION`،
 * الوسيلة المعلنة لازم تكون متاحة فعلاً، والرفض يوصل بكوده، والكارطة بلا
 * `payUrl` = عقد مكسور موش نجاح.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  availablePaymentChoices, checkoutRefusalText, fetchCommercePolicy, initiateCardPayment, isEmail,
  isTunisianPhone, normalizeTunisianPhone, parseCheckoutResult, parseCommercePolicy, paymentChoices,
  refuseCheckout, resolvePaymentMethod, submitCheckout,
} from '../src/api/checkout';
import { ApiError } from '../src/api/errors';
import { API_BASE_URL } from '../src/api/config';

type Handler = (url: string, init: RequestInit) => Promise<Response> | Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (handler: Handler) => {
  const spy = vi.fn(async (url: unknown, init: unknown) =>
    handler(String(url), (init ?? {}) as RequestInit));
  vi.stubGlobal('fetch', spy);
  return spy;
};

const headersOf = (init: RequestInit): Record<string, string> => (init.headers ?? {}) as Record<string, string>;
const bodyOf = (init: RequestInit): Record<string, unknown> =>
  JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;

const SESSION = 'ayw-3f2504e0-4f89-41d3-9a0c-0305e82c3301';

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const CONFIG = {
  governorates: ['Tunis', 'Ariana'],
  paymentMethods: ['COD', 'BANK_TRANSFER'],
  deliveryDelay: '3–7 jours',
  capabilities: { cardGateway: false },
  pricing: { localDeliveryTND: 7, expressFeeTND: 45 },
  deposit: {
    percent: 20, cardDiscountPercent: 5, companyName: 'AYSONIC',
    bankRib: 'TN59 1000 6035 1234', posteAccount: '', flouciNumber: '',
    reviewDelay: 'Sous 1 jour ouvré', unavailableRefundPolicy: 'Acompte remboursé',
  },
};

describe('سياسة التجارة', () => {
  it('تتقرا من `data` وتحوّل الرموز والعملة', async () => {
    const spy = stubFetch(() => json({ success: true, data: CONFIG }));
    const policy = await fetchCommercePolicy();

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/public/commerce-config`);
    expect(init.method).toBe('GET');
    expect(policy.governorates).toEqual(['Tunis', 'Ariana']);
    expect(policy.paymentMethods).toEqual(['COD', 'BANK_TRANSFER']);
    expect(policy.cardGateway).toBe(false);
    expect(policy.deposit.percent).toBe(20);
  });

  it('شروط بيع ناقصة = خطأ صريح (ما نعرضوش عربوناً مخترعاً)', () => {
    expect(() => parseCommercePolicy({ ...CONFIG, deposit: { ...CONFIG.deposit, percent: 0 } }))
      .toThrow(/COMMERCE_TERMS_INVALID/);
    expect(() => parseCommercePolicy({ ...CONFIG, deposit: { ...CONFIG.deposit, cardDiscountPercent: -1 } }))
      .toThrow(/COMMERCE_TERMS_INVALID/);
  });
});

describe('وسائل الخلاص', () => {
  it('ما تتاحش وسيلة بلا بوابة: FLOUCI/D17 مقفولين بالسبب', () => {
    const choices = paymentChoices(parseCommercePolicy(CONFIG));
    const byId = Object.fromEntries(choices.map((choice) => [choice.id, choice]));
    expect(byId.COD.available).toBe(true);
    expect(byId.FLOUCI.available).toBe(false);
    expect(byId.D17.available).toBe(false);
    expect(byId.CARD.available).toBe(false); // البوابة موش مركّبة
    expect(byId.BANK_TRANSFER.available).toBe(true); // RIB منشور
    expect(byId.POSTE.available).toBe(false); // ما فماش حساب بريدي
  });

  it('قائمة الخادم تحكم: وسيلة متاحة تقنياً وماشي في القائمة ما تتاحش', () => {
    const choices = paymentChoices(parseCommercePolicy({ ...CONFIG, paymentMethods: ['CARD'] }));
    const byId = Object.fromEntries(choices.map((choice) => [choice.id, choice]));
    expect(byId.COD.available).toBe(false);
    expect(byId.BANK_TRANSFER.available).toBe(false);
    // قائمة فارغة = ما نضيّقوش (نفس الويب)
    const open = paymentChoices(parseCommercePolicy({ ...CONFIG, paymentMethods: [] }));
    expect(open.find((choice) => choice.id === 'COD')?.available).toBe(true);
  });

  it('بلا وسيلة متاحة: الطلب يتخلق والعربون يتأجّل (`PENDING_SELECTION`)', () => {
    expect(resolvePaymentMethod('', { anyAvailable: false, isAvailable: () => false }))
      .toEqual({ method: 'PENDING_SELECTION', deferred: true });
  });

  it('وسيلة مقفولة ما تولّدش طلباً مقبولاً: رفض صريح', () => {
    expect(resolvePaymentMethod('CARD', { anyAvailable: true, isAvailable: (id) => id === 'COD' }))
      .toEqual({ refusal: 'PAYMENT_UNAVAILABLE' });
    expect(resolvePaymentMethod('COD', { anyAvailable: true, isAvailable: (id) => id === 'COD' }))
      .toEqual({ method: 'COD', deferred: false });
  });

  it('المتاح فعلاً يتعرض وحده', () => {
    const available = availablePaymentChoices(parseCommercePolicy(CONFIG)).map((choice) => choice.id);
    expect(available).toEqual(['COD', 'BANK_TRANSFER']);
  });
});

describe('شروط الطلب', () => {
  it('الرقم التونسي: الصيغ المقبولة تتنقّى', () => {
    expect(normalizeTunisianPhone('+216 98 123 456')).toBe('98123456');
    expect(isTunisianPhone('00216 98 123 456')).toBe(true);
    expect(isTunisianPhone('21698123456')).toBe(true);
    expect(isTunisianPhone('12345678')).toBe(false); // ما تبداش بـ2/4/5/7/9
    expect(isTunisianPhone('9812345')).toBe(false); // 7 أرقام
  });

  it('الرفض يجي بالترتيب وبالسبب', () => {
    const identity = { authenticated: true, emailVerified: true, phoneVerified: false };
    const base = { name: 'Ali', email: 'ali@example.tn', phone: '98123456', address: 'Rue 1', termsAccepted: true };
    expect(refuseCheckout({ ...identity, authenticated: false }, base)).toBe('AUTH_REQUIRED');
    expect(refuseCheckout({ authenticated: true, emailVerified: false, phoneVerified: false }, base)).toBe('CONTACT_NOT_VERIFIED');
    expect(refuseCheckout(identity, { ...base, address: '  ' })).toBe('FIELDS_MISSING');
    expect(refuseCheckout(identity, { ...base, email: 'pas-un-email' })).toBe('EMAIL_INVALID');
    expect(refuseCheckout(identity, { ...base, phone: '0612345678' })).toBe('PHONE_INVALID');
    expect(refuseCheckout(identity, { ...base, termsAccepted: false })).toBe('TERMS_REQUIRED');
    expect(refuseCheckout(identity, base)).toBeNull();
    expect(isEmail('a@b.tn')).toBe(true);
  });
});

describe('إرسال الطلب', () => {
  it('يتخلق بـ`PENDING_SELECTION` وباللغة `x-TN`، والحقول تتنقّى قبل الإرسال', async () => {
    const spy = stubFetch(() => json({
      success: true, orderId: 'order_1', orderNumber: 'AYR-123456', totalTND: 590.01, itemCount: 2,
      message: 'Votre commande a été enregistrée avec succès chez AYSONIC !',
      breakdown: { totalTnd: 590.01 },
      deposit: { percent: 20, amountTnd: 118, balanceTnd: 472.01, cardDiscountPercent: 5, status: 'PENDING' },
    }, 200));

    const result = await submitCheckout({
      name: ' Ali Ben Salah ', email: 'ali@example.tn', phone: '98 123 456', city: 'Tunis',
      address: '12 Rue de Rome', deliveryMode: 'home', latitude: null, longitude: null,
      locale: 'ar', termsAccepted: true,
    }, { sessionId: SESSION });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/checkout`);
    expect(init.method).toBe('POST');
    expect(headersOf(init)['x-session-id']).toBe(SESSION);
    expect(bodyOf(init)).toMatchObject({
      name: 'Ali Ben Salah', city: 'Tunis', deliveryMode: 'home',
      paymentMethod: 'PENDING_SELECTION', locale: 'ar-TN', termsAccepted: true,
    });
    expect(result.orderNumber).toBe('AYR-123456');
    expect(result.deposit.amountTND).toBe(118);
  });

  it('تأكيد بلا رقم طلب = عقد مكسور', () => {
    expect(() => parseCheckoutResult({ success: true, orderId: 'order_1' })).toThrow(/illisible/);
  });

  it('رفض الخادم يوصل بكوده ونصّه، والكود يتحوّل لمفتاح ترجمة', async () => {
    stubFetch(() => json({ success: false, code: 'PRICE_VERIFICATION_REQUIRED', error: 'Le prix vérifié a expiré.' }, 409));
    try {
      await submitCheckout({
        name: 'Ali', email: 'ali@example.tn', phone: '98123456', city: 'Tunis', address: 'Rue 1',
        deliveryMode: 'home', latitude: null, longitude: null, locale: 'fr', termsAccepted: true,
      }, { sessionId: SESSION });
      throw new Error('attendu : refus');
    } catch (error) {
      const refusal = checkoutRefusalText(error);
      expect(refusal.code).toBe('PRICE_VERIFICATION_REQUIRED');
      expect(refusal.key).toBe('checkout.refusal.PRICE_VERIFICATION_REQUIRED');
      expect(refusal.message).toContain('expiré');
    }
  });

  it('كود معروف يتحوّل لمفتاح، وكود جديد يبقى يبان (الدعم يقراه)', () => {
    const known = checkoutRefusalText(new ApiError('http', 'Mode inconnu.', { code: 'DELIVERY_MODE_INVALID' }));
    expect(known.key).toBe('checkout.refusal.DELIVERY_MODE_INVALID');

    const unknown = checkoutRefusalText(new ApiError('http', 'Règle nouvelle côté serveur.', { code: 'NEW_SERVER_RULE' }));
    expect(unknown.key).toBe('');
    expect(unknown.code).toBe('NEW_SERVER_RULE');
    expect(unknown.message).toBe('Règle nouvelle côté serveur.');

    // رفض محلي (موش ApiError): الكود يتقال بنفس طريقة رفض الخادم.
    const local = checkoutRefusalText(Object.assign(new Error('Champs manquants.'), { code: 'FIELDS_MISSING' }));
    expect(local.key).toBe('checkout.refusal.FIELDS_MISSING');

    // خطأ موش ApiError وبلا كود: ما فماش مفتاح — الشاشة تستعمل رسالتها العامة.
    expect(checkoutRefusalText(new Error('boom'))).toEqual({ key: '', code: '', message: '' });
  });
});

describe('الخلاص بالكارطة', () => {
  it('يتعلّق بالطلب ويرجّع صفحة الخلاص (مغلّف بـ`data`)', async () => {
    const spy = stubFetch(() => json({
      success: true,
      data: { payUrl: 'https://konnect.example/pay/abc', transactionNumber: 'TX-1', amountTnd: 118, status: 'PENDING' },
    }));
    const out = await initiateCardPayment('order/1');

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/customer/account/orders/order%2F1/payments/card/initiate`);
    expect(init.method).toBe('POST');
    expect(out.payUrl).toBe('https://konnect.example/pay/abc');
    expect(out.amountTND).toBe(118);
  });

  it('بلا `payUrl` ما فماش خلاص: عقد مكسور، موش نجاح صامت', async () => {
    stubFetch(() => json({ success: true, data: { transactionNumber: 'TX-1' } }));
    await expect(initiateCardPayment('order_1')).rejects.toMatchObject({ kind: 'malformed' });
  });
});
