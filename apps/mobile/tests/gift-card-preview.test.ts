import { expect, test } from 'vitest';
import { giftDesignsFor, parseGiftPreviewAmount } from '../../../shared/giftCardPreview';

test('preview denominations preserve millimes without rounding or converting currencies', () => {
  expect(parseGiftPreviewAmount(' ٢٥٫١٢٣ ', 'physical')).toBe(25123);
  expect(parseGiftPreviewAmount('۵۰,۲', 'digital')).toBe(50200);
  expect(parseGiftPreviewAmount('10.001', 'digital')).toBe(10001);
  expect(parseGiftPreviewAmount('24.999', 'physical')).toBeNull();
  expect(parseGiftPreviewAmount('200.000', 'digital')).toBe(200000);
  for (const amount of ['0', '9.999', '200.001', '50.1234', '1e2', '+25', '1 00', '10 TND', '12,2.1'])
    expect(parseGiftPreviewAmount(amount, 'digital')).toBeNull();
  expect(giftDesignsFor('physical')).not.toContain('orbit');
  expect(giftDesignsFor('digital')).toContain('orbit');
});
