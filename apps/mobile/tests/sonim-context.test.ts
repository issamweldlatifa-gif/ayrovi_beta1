import { afterEach, describe, expect, it } from 'vitest';
import { cartContext, shareableStoreUrl, sonimOwner, stageSonimDraft } from '../src/features/sonim/sonimContext';
import { clearSonimSession, useSonimSession } from '../src/features/sonim/sonimSession';
import { applySonimToolEvent } from '../src/features/sonim/sonimModel';
import type { AyroviCart } from '../src/api/cart';

describe('Sonim explicit shopping context', () => {
  afterEach(clearSonimSession);

  it('does not invent zero prices or fees when values are missing', () => {
    const message = { id: 'answer', role: 'assistant' as const, text: '' };
    const result = applySonimToolEvent(message, 'search_products', { products: [{
      id: '1', title: 'Product', sourceUrl: 'https://shop.example/item', price: 10, currency: 'EUR', priceTnd: null,
    }] });
    expect(result.products?.[0]?.priceTnd).toBeNull();
    const price = applySonimToolEvent(message, 'calculate_price', { breakdown: { totalTND: 100, convertedPriceTND: 80, customsFeeTND: null } });
    expect(price.priceBreakdown?.customsFeeTND).toBeNull();
    expect(price.priceBreakdown?.shippingFeeTND).toBeNull();
  });

  it('strips URL parameters and rejects credentialed or non-web URLs', () => {
    expect(shareableStoreUrl('https://shop.example/item/1?token=secret&sku=3#tracking')).toBe('https://shop.example/item/1');
    expect(shareableStoreUrl('https://user:secret@shop.example/item')).toBeNull();
    expect(shareableStoreUrl('javascript:alert(1)')).toBeNull();
  });

  it('stages an editable draft without losing existing content or sending anything', () => {
    const owner = sonimOwner('visitor', 'signedIn', 'a');
    expect(stageSonimDraft(owner, 'Première question')).toBe(true);
    expect(stageSonimDraft(owner, 'Lien')).toBe(true);
    expect(useSonimSession.getState().draft).toBe('Première question\n\nLien');
    expect(useSonimSession.getState().messages).toEqual([]);
    expect(stageSonimDraft(owner, 'a'.repeat(8001))).toBe(false);
    expect(useSonimSession.getState().draft).toBe('Première question\n\nLien');
    expect(sonimOwner('visitor', 'signedIn', null)).toBe('');
    expect(stageSonimDraft('', 'no identity')).toBe(false);
  });

  it('shares a bounded cart snapshot with no notes, IDs, images or links', () => {
    const cart = {
      serverNow: '2026-10-30T12:00:00Z', totalTND: 80, deliveryTND: 5,
      items: [{ id: 'private_id', title: 'Article', store: 'Store', quantity: 1, variant: 'M',
        lineTotalTND: null, priceTrust: '', availability: '', customerNote: 'secret note', sourceUrl: 'https://secret' }],
    } as unknown as AyroviCart;
    const result = cartContext(cart, 'ar');
    expect(result).toContain('Article');
    expect(result).toContain('المجموع: غير محدد');
    expect(result).toContain('غير محدد');
    expect(result).not.toContain('secret');
    expect(result).not.toContain('private_id');
  });
});
