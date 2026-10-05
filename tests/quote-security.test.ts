import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAyrovixPriceToken, verifyAyrovixPriceToken, validateQuoteSecret } from '../src/ayrovix/priceQuote';
const claim = { price: 34.5, currency: 'EUR', title: 'Test product', referenceUrl: 'https://www.amazon.fr/dp/B012345678', status: 'VERIFIED' as const };
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });
describe('quote signing trust', () => {
  it('requires an independent secret before production startup', () => {
    vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('AYROVIX_QUOTE_SECRET', ''); vi.stubEnv('CUSTOMER_AUTH_SECRET', 'a'.repeat(64));
    expect(() => validateQuoteSecret()).toThrow('NOT_CONFIGURED');
    vi.stubEnv('AYROVIX_QUOTE_SECRET', 'a'.repeat(64)); expect(() => validateQuoteSecret()).toThrow('INVALID');
    vi.stubEnv('AYROVIX_QUOTE_SECRET', 'change-me'.repeat(10)); expect(() => validateQuoteSecret()).toThrow('INVALID');
    vi.stubEnv('AYROVIX_QUOTE_SECRET', 'f37b571ad2e1d988c88a66712223697f7b519d4577354a4f3ee7458ac4b6c8ff');
    expect(validateQuoteSecret()).toHaveLength(64);
  });
  it.each([
    { price: 1 }, { currency: 'USD' }, { title: 'Another' },
    { referenceUrl: 'https://evil.test/' }, { status: 'PENDING_MANUAL' as const },
  ])('rejects individually altered claim %j', changed => {
    const token = createAyrovixPriceToken(claim);
    expect(verifyAyrovixPriceToken(token, claim)).toBe(true);
    expect(verifyAyrovixPriceToken(token, { ...claim, ...changed })).toBe(false);
  });
  it('rejects expired, malformed and payload-tampered tokens', () => {
    vi.useFakeTimers(); const token = createAyrovixPriceToken(claim, 1000)!;
    expect(verifyAyrovixPriceToken(token, claim)).toBe(true);
    vi.advanceTimersByTime(1001); expect(verifyAyrovixPriceToken(token, claim)).toBe(false);
    for (const t of ['', 'x.y', token + '.extra', 'x' + token, null]) expect(verifyAyrovixPriceToken(t, claim)).toBe(false);
  });
});
