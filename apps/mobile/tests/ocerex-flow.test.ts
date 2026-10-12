import { describe, expect, it } from 'vitest';
import type { OcerexExtraction } from '../src/api/ocerex';
import { afterAnalyze, errorCopy, isHttpUrl } from '../src/features/lens/ocerex/ocerexFlow';

const base: OcerexExtraction = {
  extractionId: 'e', type: 'PRODUCT', referencePrice: 50, referenceTnd: 150, currency: 'EUR', confidence: 0.9,
  confidenceLevel: 'HIGH', priceContext: 'REFERENCE', productTitle: null, platform: null, sourceUrl: null,
  code: 'OK', ayroviPrice: null, supportedCurrencies: ['EUR', 'USD'], resolved: null,
};

describe('OCEREX — enchaînement des étapes', () => {
  it('code OK + devise connue ⇒ prix direct', () => {
    expect(afterAnalyze(base)).toEqual({ next: 'price' });
  });
  it('devise absente de la liste ⇒ confirmation avec la première devise supportée', () => {
    expect(afterAnalyze({ ...base, currency: 'JPY' })).toEqual({ next: 'currency', defaultCurrency: 'EUR' });
    expect(afterAnalyze({ ...base, currency: null, supportedCurrencies: [] })).toEqual({ next: 'currency', defaultCurrency: 'USD' });
  });
  it('code non OK ⇒ erreur بنفس الكود', () => {
    expect(afterAnalyze({ ...base, code: 'NO_PRICE_FOUND' })).toEqual({ next: 'error', code: 'NO_PRICE_FOUND' });
  });
  it('code OK بلا سعر مرجعي ⇒ خطأ (لا تقدّم بسعر مختلق)', () => {
    expect(afterAnalyze({ ...base, referencePrice: null })).toEqual({ next: 'error', code: 'OK' });
  });
});

describe('OCEREX — messages et actions', () => {
  it('NO_REFERENCE_PRICE: لا زر رئيسي، لكن نموذج رابط احتياطي', () => {
    expect(errorCopy('NO_REFERENCE_PRICE')).toMatchObject({ primary: 'none', linkFallback: true });
  });
  it('INVALID_URL: إجراء «تصحيح الرابط»', () => {
    expect(errorCopy('INVALID_URL').primary).toBe('correctUrl');
  });
  it('كود غير معروف ⇒ رسالة المعالجة العامة', () => {
    expect(errorCopy('CURRENCY_UNCONFIRMED').messageKey).toBe('ocerex.error.PROCESSING_ERROR');
  });
});

describe('OCEREX — lien', () => {
  it('http(s) فقط', () => {
    expect(isHttpUrl('https://shop.example/p')).toBe(true);
    expect(isHttpUrl('  http://x.y ')).toBe(true);
    expect(isHttpUrl('ftp://x.y')).toBe(false);
    expect(isHttpUrl('shop.example')).toBe(false);
  });
});
