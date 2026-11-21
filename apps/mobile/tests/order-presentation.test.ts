import { describe, expect, it } from 'vitest';
import { formatOrderDate, orderDate, orderMonth, orderStep, sixMonthsBefore } from '../src/features/orders/orderPresentation';

describe('order history and fulfillment presentation', () => {
  it('clamps the six-month window on short months and across years', () => {
    expect(sixMonthsBefore(new Date('2024-08-31T08:00:00Z')).toISOString()).toBe('2024-02-29T08:00:00.000Z');
    expect(sixMonthsBefore(new Date('2026-01-20T08:00:00Z')).toISOString()).toBe('2025-07-20T08:00:00.000Z');
  });

  it('does not give invalid dates a month and uses UTC for display and groups', () => {
    expect(orderDate('invalid')).toBeNull();
    expect(formatOrderDate('', 'fr')).toBe('—');
    expect(orderMonth(new Date('2026-11-01T00:30:00+01:00'))).toBe('2026-10');
    expect(formatOrderDate('2026-11-01T00:30:00+01:00', 'fr', true)).toContain('octobre');
  });

  it('only derives progress for known fulfillment states', () => {
    expect(['AWAITING_DEPOSIT', 'PREPARING', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].map(orderStep)).toEqual([0, 1, 2, 3, 4]);
    expect(orderStep('CANCELLED')).toBeNull();
    expect(orderStep('UNKNOWN')).toBeNull();
  });
});
