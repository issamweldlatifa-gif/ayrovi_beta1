import { describe, expect, it } from 'vitest';

import { eventsForExtraction } from '../src/features/lens/ocerex/ocerexEvents';

describe('أحداث OCEREX — تصنيف النتيجة', () => {
  it('منتج بسعر مرجعي وثقة عالية', () => {
    expect(eventsForExtraction({ type: 'PRODUCT', referencePrice: 42, confidenceLevel: 'HIGH' }))
      .toEqual(['ocerex_product_detected', 'ocerex_reference_price_detected']);
  });

  it('سلة وثقة منخفضة بلا سعر مرجعي', () => {
    expect(eventsForExtraction({ type: 'cart', referencePrice: null, confidenceLevel: 'low' }))
      .toEqual(['ocerex_cart_detected', 'ocerex_low_confidence']);
  });
});
