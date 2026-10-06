import { describe, expect, it } from 'vitest';
import { ayWebsAvailabilityAfterFailedRecheck } from '../src/aywebs/productResolver';

const lastChecked = {
  state: 'AVAILABLE' as const,
  reason: 'merchant_in_stock',
  checkedAt: '2026-10-06T10:00:00.000Z',
  source: 'amazon:product',
  quantityHint: null,
};

describe('AYWEBs availability after a failed live check', () => {
  it('does not return a stale positive stock signal as current availability', () => {
    expect(ayWebsAvailabilityAfterFailedRecheck(lastChecked, 'source_reread_failed')).toEqual({
      ...lastChecked,
      state: 'UNKNOWN',
      reason: 'source_reread_failed;last_known_state=AVAILABLE;last_known_reason=merchant_in_stock',
    });
  });

  it('preserves the last successful source timestamp and the failure reason', () => {
    const result = ayWebsAvailabilityAfterFailedRecheck(lastChecked, 'source_recheck_unavailable');
    expect(result.state).toBe('UNKNOWN');
    expect(result.checkedAt).toBe(lastChecked.checkedAt);
    expect(result.source).toBe(lastChecked.source);
    expect(result.reason).toContain('source_recheck_unavailable');
    expect(result.reason).toContain('last_known_state=AVAILABLE');
  });
});
