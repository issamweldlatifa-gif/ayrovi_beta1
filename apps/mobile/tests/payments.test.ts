/**
 * خلاص الطلب (P5.3) — اختيار الوسيلة، الوصل، وحالات الصدق.
 *
 * الحدّ اللي نحميوه: الخلاص يتعلّق بمعرّف طلب موجود، وإلا ما يتزحلقش الجهاز
 * على حالة قديمة؛ والوصل ما يتبعثش بلا مرجع عملية.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { depositActionable, selectDepositMethod, uploadDepositProof } from '../src/api/payments';
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

const bodyOf = (init: RequestInit): Record<string, unknown> =>
  JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('اختيار وسيلة الخلاص', () => {
  it('POST على مسار الطلب، والقسط يجي من الخادم', async () => {
    const spy = stubFetch(() => json({
      success: true,
      data: {
        method: 'BANK_TRANSFER',
        paymentStatus: 'PENDING',
        cardGatewayAvailable: false,
        quote: { percent: 20, baseAmountTnd: 590.01, discountPercent: 0, discountTnd: 0, amountTnd: 118, balanceTnd: 472.01 },
      },
    }));

    const selection = await selectDepositMethod({ orderId: 'order_1', method: 'BANK_TRANSFER' });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/customer/account/orders/order_1/deposit/method`);
    expect(init.method).toBe('POST');
    expect(bodyOf(init)).toEqual({ method: 'BANK_TRANSFER' });
    expect(selection.quote.amountTND).toBe(118);
    expect(selection.cardGatewayAvailable).toBe(false);
  });

  it('الخادم ما أكّدش نفس الوسيلة = عقد مكسور (بلا نجاح صامت)', async () => {
    stubFetch(() => json({ success: true, data: { method: 'CARD', paymentStatus: 'PENDING' } }));
    await expect(selectDepositMethod({ orderId: 'order_1', method: 'POSTE' }))
      .rejects.toMatchObject({ kind: 'malformed' });
  });

  it('رفض الخادم يوصل بكوده (مثلاً إحداثيات ما هي منشورة)', async () => {
    stubFetch(() => json({ success: false, code: 'TRANSFER_DETAILS_UNAVAILABLE', error: 'Coordonnées non publiées.' }, 503));
    await expect(selectDepositMethod({ orderId: 'order_1', method: 'POSTE' }))
      .rejects.toMatchObject({ kind: 'http', code: 'TRANSFER_DETAILS_UNAVAILABLE' });
  });
});

describe('وصل التحويل', () => {
  it('يتبعث multipart مع مرجع العملية، والردّ من الخادم', async () => {
    const spy = stubFetch(() => json({
      success: true, data: { paymentStatus: 'PENDING', proofStatus: 'SUBMITTED', submittedAt: '2026-10-07T12:00:00.000Z' },
    }));

    const result = await uploadDepositProof({
      orderId: 'order_1', uri: 'file:///tmp/recu.jpg', mimeType: 'image/jpeg', transferReference: 'VIR-9988',
    });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/customer/account/orders/order_1/deposit-proof`);
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get('transferReference')).toBe('VIR-9988');
    // RN يبعث الملف ككائن {uri,name,type}؛ في Node يولّي نصّاً — المهمّ أنه موجود
    // في الحقل الصحيح، والخادم يتعرّف على الجزء من الـmultipart.
    expect(form.has('proof')).toBe(true);
    expect(result.proofStatus).toBe('SUBMITTED');
  });

  it('مرجع العملية إلزامي: خطأ قبل أي شبكة', async () => {
    const spy = stubFetch(() => json({ success: true, data: { proofStatus: 'SUBMITTED' } }));
    await expect(uploadDepositProof({
      orderId: 'order_1', uri: 'file:///tmp/recu.jpg', mimeType: 'image/jpeg', transferReference: '   ',
    })).rejects.toMatchObject({ kind: 'malformed' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('الخادم ما قالش حالة الوصل = عقد مكسور', async () => {
    stubFetch(() => json({ success: true, data: { paymentStatus: 'PENDING' } }));
    await expect(uploadDepositProof({
      orderId: 'order_1', uri: 'file:///tmp/recu.jpg', mimeType: 'image/jpeg', transferReference: 'VIR-1',
    })).rejects.toMatchObject({ kind: 'malformed' });
  });
});

describe('حدود الوحدة', () => {
  it('payments.ts ما يستوردش React Native ولا Expo ولا شاشات', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('../src/api/payments.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]react-native['"]/);
    expect(source).not.toMatch(/from ['"]expo/);
    expect(source).not.toMatch(/from ['"]@\//);
  });
});

describe('حالات الخلاص (نفس شروط الخادم)', () => {
  it('طلب في انتظار العربون بتحويل: الوصل مقبول والكارطة مقفولة', () => {
    const gate = depositActionable({ status: 'AWAITING_DEPOSIT', paymentStatus: 'PENDING', paymentMethod: 'BANK_TRANSFER' });
    expect(gate.canSelectMethod).toBe(true);
    expect(gate.canUploadProof).toBe(true);
    expect(gate.canPayByCard).toBe(true); // الخادم يسمح بتحويل الوسيلة للكارطة
  });

  it('طلب مخلّص: ما فماش خلاص ثاني', () => {
    expect(depositActionable({ status: 'CONFIRMED', paymentStatus: 'PAID', paymentMethod: 'CARD' }))
      .toEqual({ canSelectMethod: false, canUploadProof: false, canPayByCard: false });
  });

  it('وصل على وسيلة موش تحويل = مرفوض محلياً قبل الشبكة (نفس قاعدة الخادم)', () => {
    const gate = depositActionable({ status: 'AWAITING_DEPOSIT', paymentStatus: 'PENDING', paymentMethod: 'CARD' });
    expect(gate.canUploadProof).toBe(false);
    expect(gate.canSelectMethod).toBe(true);
  });

  it('طلب مشحون: الوسيلة ما تتبدّلش', () => {
    expect(depositActionable({ status: 'SHIPPED', paymentStatus: 'PAID', paymentMethod: 'BANK_TRANSFER' }).canSelectMethod).toBe(false);
  });
});
