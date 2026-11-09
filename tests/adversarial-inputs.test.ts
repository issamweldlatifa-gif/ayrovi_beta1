import { describe, expect, test } from 'vitest';
import { parsePublicHttpUrl, resolveSafeHttpUrl, UnsafeUrlError } from '../src/services/safeUrl';
import { createAyrovixPriceToken, verifyAyrovixPriceToken } from '../src/ayrovix/priceQuote';

const privateTargets = [
  'http://2130706433/', 'http://0x7f000001/', 'http://0177.0.0.1/', 'http://127.1/',
  'http://[::ffff:127.0.0.1]/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/',
  'http://localhost./', 'http://LOCALHOST/', 'http://%6cocalhost/', 'http://ｌｏｃａｌｈｏｓｔ/',
  'http://10.0.0.1/', 'http://192.168.1.1/', 'http://172.16.1.1/',
];

describe('adversarial remote URL encodings (no network calls)', () => {
  test.each(privateTargets)('normalization cannot disguise private destination %s', value => {
    expect(() => parsePublicHttpUrl(value)).toThrow(UnsafeUrlError);
  });
  test.each(['127.0.0.1', '10.0.0.2', '169.254.169.254', '::1', 'fc00::1'])('public hostname with mixed DNS including %s is rejected', async address => {
    await expect(resolveSafeHttpUrl('https://merchant.example.com/item', async () => [
      { address: '1.1.1.1', family: 4 }, { address, family: address.includes(':') ? 6 : 4 },
    ])).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe('signed price adversarial mutation campaign', () => {
  const claim = { price: 199.99, currency: 'EUR', title: 'Local security fixture', referenceUrl: 'https://merchant.example.com/item', status: 'VERIFIED' as const };
  test('every single-character payload/signature mutation is denied', () => {
    const token = createAyrovixPriceToken(claim)!;
    expect(verifyAyrovixPriceToken(token, claim)).toBe(true);
    let attempts = 0;
    for (let i = 0; i < token.length; i++) {
      if (token[i] === '.') continue;
      const changed = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1);
      expect(verifyAyrovixPriceToken(changed, claim), `mutation at ${i}`).toBe(false);
      attempts++;
    }
    expect(attempts).toBeGreaterThan(100);
  });
  test.each([0, -1, 0.01, 1, 199.98, 200, 1e12])('valid signature cannot authorize substituted price %s', price => {
    const token = createAyrovixPriceToken(claim)!;
    expect(verifyAyrovixPriceToken(token, { ...claim, price })).toBe(false);
  });
});
