/**
 * سلّة AYROVI (P5.1) — العقد، البوابة، والحدود.
 *
 * هذي الاختبارات تحمي المال: الأرقام تجي من الخادم، السطور تتقرا من الجذر
 * (بلا غلاف `data`)، الكمية مطلقة، و`STALE` توقف الطلب بسببه.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ayroviCartReadiness, fetchAyroviCart, parseAyroviCart, removeAyroviCartItem, updateAyroviCartQuantity,
} from '../src/api/cart';
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

const LINE = {
  id: 'ci_1',
  sessionId: SESSION,
  store: 'amazon',
  externalId: 'B0ABC',
  sourceUrl: 'https://www.amazon.fr/dp/B0ABC',
  title: 'Casque Bluetooth',
  imageUrl: '/media/casque.jpg',
  sourcePrice: 109,
  sourceCurrency: 'usd',
  priceTND: 583.01,
  variant: null,
  requestedSize: 'M',
  requestedColor: '',
  customerNote: '',
  referenceUrl: 'https://www.amazon.fr/dp/B0ABC',
  priceVerificationStatus: 'VERIFIED',
  quantity: 2,
  createdAt: '2026-10-07T10:00:00.000Z',
  updatedAt: '2026-10-07T10:00:00.000Z',
  lineTotalTND: 1166.02,
  originalLineTotalTND: 1200,
  promo: { percent: 5, label: 'Offre du jour', discountTND: 58.3 },
  availability: 'in_stock',
  availabilityReason: '',
  priceTrust: 'FRESH',
  priceTrustReason: 'TOKEN_VALID',
  priceTrustExpiresAt: '2026-10-07T12:00:00.000Z',
};

const CART = {
  success: true,
  sessionId: SESSION,
  itemCount: 1,
  totalItemsCount: 2,
  totalTND: 1173.02,
  deliveryTND: 7,
  priceVerification: [{ itemId: 'ci_1', status: 'FRESH', reason: 'TOKEN_VALID', expiresAt: '2026-10-07T12:00:00.000Z' }],
  items: [LINE],
};

describe('قراءة السلّة', () => {
  it('تتقرا من الجذر (بلا غلاف data) والأرقام كما هي من الخادم', () => {
    const cart = parseAyroviCart(CART);
    expect(cart.items).toHaveLength(1);
    expect(cart.units).toBe(2);
    expect(cart.deliveryTND).toBe(7);
    expect(cart.totalTND).toBe(1173.02);
    // مجموع المنتوجات = مجموع الخادم − التوصيل (طرح، موش حساب جديد).
    expect(cart.productSubtotalTND).toBe(1166.02);
    expect(cart.blockedIds).toEqual([]);
  });

  it('السطر يحوّل الحقول بصدق: العملة كبيرة، الاختيار، والبرومو', () => {
    const line = parseAyroviCart(CART).items[0];
    expect(line.sourceCurrency).toBe('USD');
    expect(line.variant).toBe('M');
    expect(line.lineTotalTND).toBe(1166.02);
    expect(line.promoLabel).toBe('Offre du jour');
    expect(line.discountTND).toBe(58.3);
    expect(line.priceTrust).toBe('FRESH');
  });

  it('سطر STALE يتقال ويوقف: معرّفه في `blockedIds` والسبب مقروء', () => {
    const cart = parseAyroviCart({
      ...CART,
      items: [{ ...LINE, priceTrust: 'STALE', priceTrustReason: 'TOKEN_EXPIRED_OR_ALTERED' }],
    });
    expect(cart.blockedIds).toEqual(['ci_1']);
    const gate = ayroviCartReadiness(cart);
    expect(gate.canCheckout).toBe(false);
    expect(gate.blockReason).toBe('PRICE_VERIFICATION_REQUIRED');
    expect(gate.staleLines[0].priceTrustReason).toBe('TOKEN_EXPIRED_OR_ALTERED');
  });

  it('`priceTrust` خارج القاموس ما يترقّاش: يولي فارغ (ما نخمّنوش FRESH)', () => {
    const line = parseAyroviCart({ ...CART, items: [{ ...LINE, priceTrust: 'PROBABLEMENT' }] }).items[0];
    expect(line.priceTrust).toBe('');
    expect(ayroviCartReadiness({ ...parseAyroviCart(CART), items: [line] }).canCheckout).toBe(true);
  });

  it('سلّة بلا `items` = عقد مكسور، وسطر بلا معرّف كذلك', () => {
    expect(() => parseAyroviCart({ success: true, totalTND: 0 })).toThrow(/panier/);
    expect(() => parseAyroviCart({ ...CART, items: [{ title: 'بلا معرّف' }] })).toThrow(/ligne/);
  });

  it('سلّة فارغة: باب الشراء مقفول بصراحة', () => {
    const gate = ayroviCartReadiness(parseAyroviCart({ ...CART, items: [], totalItemsCount: 0, totalTND: 0, deliveryTND: 0 }));
    expect(gate.canCheckout).toBe(false);
    expect(gate.blockReason).toBe('EMPTY');
    expect(ayroviCartReadiness(null).blockReason).toBe('EMPTY');
  });
});

describe('الشبكة', () => {
  it('القراءة: GET مع `x-session-id` فقط، بلا حساب محلي', async () => {
    const spy = stubFetch(() => json(CART));
    const cart = await fetchAyroviCart({ sessionId: SESSION });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/cart/items`);
    expect(init.method).toBe('GET');
    expect(headersOf(init)['x-session-id']).toBe(SESSION);
    expect(cart.totalTND).toBe(1173.02);
  });

  it('تعديل الكمية: مطلق (2) على PATCH، والمعرّف مُرمّز في المسار', async () => {
    const spy = stubFetch(() => json({ success: true, cartItem: { ...LINE, id: 'ci/1', quantity: 3 } }));
    const out = await updateAyroviCartQuantity({ itemId: 'ci/1', quantity: 3, sessionId: SESSION });

    const [url, init] = spy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/cart/items/ci%2F1`);
    expect(init.method).toBe('PATCH');
    expect(bodyOf(init)).toEqual({ quantity: 3 });
    expect(out).toEqual({ itemId: 'ci/1', quantity: 3 });
  });

  it('كمية خارج 0..99: خطأ قبل أي شبكة (بلا طلب محكوم عليه بالرفض)', async () => {
    const spy = stubFetch(() => json(CART));
    await expect(updateAyroviCartQuantity({ itemId: 'ci_1', quantity: 100, sessionId: SESSION }))
      .rejects.toMatchObject({ kind: 'malformed' });
    await expect(updateAyroviCartQuantity({ itemId: 'ci_1', quantity: 2.5, sessionId: SESSION }))
      .rejects.toMatchObject({ kind: 'malformed' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('الحذف: `removed:true` وحدها نجاح؛ بلاها عقد مكسور', async () => {
    stubFetch(() => json({ success: true, removed: true }));
    await expect(removeAyroviCartItem({ itemId: 'ci_1', sessionId: SESSION })).resolves.toBeUndefined();

    stubFetch(() => json({ success: true }));
    await expect(removeAyroviCartItem({ itemId: 'ci_1', sessionId: SESSION }))
      .rejects.toMatchObject({ kind: 'malformed' });
  });

  it('رفض الخادم يوصل بكوده ونصّه (بلا تلميع)', async () => {
    stubFetch(() => json({ success: false, code: 'INVALID_CART_ITEM', error: 'Données produit incomplètes ou invalides.' }, 400));
    await expect(fetchAyroviCart({ sessionId: SESSION })).rejects.toMatchObject({
      kind: 'http', code: 'INVALID_CART_ITEM',
    });
  });
});

describe('حدود الوحدة', () => {
  it('cart.ts ما يستوردش React Native ولا Expo', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('../src/api/cart.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]react-native['"]/);
    expect(source).not.toMatch(/from ['"]expo/);
  });
});
