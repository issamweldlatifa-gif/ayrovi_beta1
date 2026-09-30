import { describe, expect, it } from 'vitest';
import { resolveOcerexText } from '../src/ocerex/extraction';
import { calculatePrice, DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';

function words(text: string) {
  return text.split(/\s+/).map((token, index) => ({ text: token, confidence: 0.96, x: index * 20, y: 10, width: 18, height: 12 }));
}

const rules: PricingRules = {
  id: 'test', version: 7, rateEUR: 3.4, rateUSD: 3.1, rateGBP: 4, rateJPY: 0.022,
  exchangeBufferPercent: 0, freightPerKgTND: 0, localDeliveryTND: 0, commissionPercent: 8,
  minimumCommissionTND: 10, rpdPercent: 0, rpdMinimumTND: 0, defaultTvaRate: 0.19,
  expressFeeTND: 0, categories: DEFAULT_CUSTOMS_CATEGORIES, updatedAt: new Date(0).toISOString(),
};

describe('OCEREX extraction safety', () => {
  it('uses an explicitly labelled original product price, not its sale price', () => {
    const text = 'Nike Air Force 1\nWas $79.99\nNow $49.99';
    const output = resolveOcerexText(text, words(text));
    expect(output.type).toBe('PRODUCT');
    expect(output.referencePrice).toBe(79.99);
    expect(output.currency).toBe('USD');
    expect(output.priceContext).toBe('REFERENCE');
  });

  it('uses a visually detected strike-through as original-price evidence', () => {
    const text = `Sneakers\n$79.99\n$49.99`;
    const output = resolveOcerexText(text, words(text), ['$79.99']);
    expect(output.referencePrice).toBe(79.99);
    expect(output.currency).toBe('USD');
  });

  it('uses the struck-through amount when multiple amounts share an OCR line', () => {
    const text = `Sneakers\n$49.99 $79.99`;
    const output = resolveOcerexText(text, words(text), ['$49.99 $79.99'], ['$49.99']);
    expect(output.referencePrice).toBe(49.99);
  });

  it('uses cart-level original total rather than an item price or current total', () => {
    const text = 'Cart\nShoes $99.00\nShirt $40.00\nOriginal total $180.00\nCurrent total $120.00';
    const output = resolveOcerexText(text, words(text));
    expect(output.type).toBe('CART');
    expect(output.referencePrice).toBe(180);
    expect(output.priceContext).toBe('CART_REFERENCE_TOTAL');
  });

  it('does not choose a largest product price when a cart has no original total', () => {
    const text = 'Cart\nShoes $199.00\nShirt $40.00\nTotal $120.00';
    const output = resolveOcerexText(text, words(text));
    expect(output.type).toBe('CART');
    expect(output.referencePrice).toBeNull();
    expect(output.errorCode).toBe('NO_REFERENCE_PRICE');
  });

  it('does not treat a discounted product price as reference when no original is shown', () => {
    const text = 'Sneakers\nSale price $49.99';
    const output = resolveOcerexText(text, words(text));
    expect(output.referencePrice).toBeNull();
    expect(output.errorCode).toBe('NO_REFERENCE_PRICE');
  });

  it('chooses the highest explicitly referenced product price and records OCR boxes', () => {
    const text = 'Dress\nWas €70.00\nOriginal price €75.00';
    const output = resolveOcerexText(text, words(text));
    expect(output.referencePrice).toBe(75);
    expect(output.currency).toBe('EUR');
    expect(output.textBoxes.length).toBeGreaterThan(0);
  });

  it('does not guess a currency from an unlabelled amount', () => {
    const text = 'Product\nOriginal price 79.99';
    const output = resolveOcerexText(text, words(text));
    expect(output.referencePrice).toBeNull();
  });

  it('does not confuse the ambiguous yuan/yen symbol without currency evidence', () => {
    const ambiguous = resolveOcerexText(`Phone\nOriginal price ¥100`, words(`Phone\nOriginal price ¥100`));
    expect(ambiguous.referencePrice).toBeNull();
    const cny = resolveOcerexText(`Phone\nOriginal price ¥100 CNY`, words(`Phone\nOriginal price ¥100 CNY`));
    expect(cny.referencePrice).toBe(100);
    expect(cny.currency).toBe('CNY');
  });

  it('marks an unclassifiable screen as unsupported', () => {
    const output = resolveOcerexText('Welcome to the store');
    expect(output.type).toBe('UNKNOWN');
    expect(output.errorCode).toBe('UNSUPPORTED_SCREEN');
  });

  it('passes a valid extracted amount to the single Ayrovi Price Engine', () => {
    const output = resolveOcerexText('Sneakers\nWas $79.99', words('Sneakers\nWas $79.99'));
    const quote = calculatePrice(rules, output.referencePrice!, output.currency!, { title: output.productName || '' });
    expect(quote?.pricingVersion).toBe(7);
    expect(quote?.totalTND).toBeGreaterThan(0);
  });
});
