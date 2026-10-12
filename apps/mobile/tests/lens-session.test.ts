/**
 * جلسة الزائر على كتابات Lens: `x-session-id` إلزامي على الطلب الخارجي للسلّة
 * وعلى طلب المراجعة اليدوية، وبلاه الخادم يرفض قبل أي تحقق.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { addExternalToCart } from '../src/api/cart';
import { getManualReview, requestManualReview } from '../src/api/lens';
import { API_BASE_URL } from '../src/api/config';
import type { ExternalCartPayload } from '../src/features/lens/productOrder';

const SESSION = 'ayw-3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const headersOf = (init: RequestInit): Record<string, string> => (init.headers ?? {}) as Record<string, string>;

beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const PAYLOAD = {
  store: 'shein',
  url: 'https://www.shein.com/p/1',
  referenceUrl: 'https://www.shein.com/p/1',
  title: 'Robe',
  imageUrl: 'https://img.example/1.jpg',
  sourcePrice: 20,
  sourceCurrency: 'EUR',
  priceTND: 85,
  quantity: 1,
  priceVerificationStatus: 'PENDING_MANUAL',
  priceToken: null,
} as unknown as ExternalCartPayload;

describe('جلسة الزائر على كتابات Lens', () => {
  it('الطلب الخارجي للسلّة يرسل `x-session-id` مع POST /api/cart/items', async () => {
    const spy = vi.fn(async () => json({
      success: true, cartItem: { id: 'ci_9' }, totalItemsCount: 1, totalTND: 85, deliveryTND: 0,
    }, 201));
    vi.stubGlobal('fetch', spy);

    const result = await addExternalToCart({ payload: PAYLOAD, sessionId: SESSION });

    const [url, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${API_BASE_URL}/api/cart/items`);
    expect(init.method).toBe('POST');
    expect(headersOf(init)['x-session-id']).toBe(SESSION);
    expect(result.cartItemId).toBe('ci_9');
  });

  it('طلب المراجعة وقراءة الحالة يرسلان `x-session-id`', async () => {
    const review = {
      id: 'ayx_review_abcdef1234', status: 'PENDING', title: 'Robe', sourceUrl: 'https://www.shein.com/p/1',
      imageUrl: '', source: 'shein', lensPrice: 20, lensCurrency: 'EUR', desiredSize: 'L', desiredColor: '',
      quotedPrice: null, quotedCurrency: null, verifiedVariant: '', verifiedUrl: '', customerMessage: '',
      createdAt: '', updatedAt: '', duplicate: false,
    };
    const spy = vi.fn(async () => json({ success: true, data: review }, 201));
    vi.stubGlobal('fetch', spy);

    await requestManualReview({
      sourceUrl: 'https://www.shein.com/p/1', title: 'Robe', lensPrice: 20, lensCurrency: 'EUR',
      desiredSize: 'L', contact: '20123456',
    }, SESSION);
    const [postUrl, postInit] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(postUrl).toBe(`${API_BASE_URL}/api/ayrovix/review-request`);
    expect(headersOf(postInit)['x-session-id']).toBe(SESSION);

    await getManualReview('ayx_review_abcdef1234', SESSION);
    const [getUrl, getInit] = spy.mock.calls[1] as unknown as [string, RequestInit];
    expect(getUrl).toBe(`${API_BASE_URL}/api/ayrovix/review-request/ayx_review_abcdef1234`);
    expect(headersOf(getInit)['x-session-id']).toBe(SESSION);
  });
});
