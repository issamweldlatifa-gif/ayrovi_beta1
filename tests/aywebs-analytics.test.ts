import { describe, expect, test } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import { ayWebsAnalyticsSummary, recordAyWebsEvent } from '../src/aywebs/analytics';

describe('AyWebs operations analytics', () => {
  test('reports capture and cart conversion by store without exposing visitor identifiers', () => {
    const db = new QatafoDatabase(':memory:');
    recordAyWebsEvent(db, 'aywebs_open', { sessionId: 'aywebs-session-analytics' });
    recordAyWebsEvent(db, 'capture_started', { store: 'amazon', captureId: 'cap-1', sessionId: 'aywebs-session-analytics' });
    recordAyWebsEvent(db, 'capture_succeeded', { store: 'amazon', captureId: 'cap-1', sessionId: 'aywebs-session-analytics' });
    recordAyWebsEvent(db, 'add_to_cart_clicked', { store: 'amazon', captureId: 'cap-1', sessionId: 'aywebs-session-analytics' });
    recordAyWebsEvent(db, 'add_to_cart_succeeded', { store: 'amazon', captureId: 'cap-1', sessionId: 'aywebs-session-analytics' });
    recordAyWebsEvent(db, 'capture_started', { store: 'shein', captureId: 'cap-2' });
    recordAyWebsEvent(db, 'capture_failed', { store: 'shein', captureId: 'cap-2', code: 'BOT_WALL' });

    const summary = ayWebsAnalyticsSummary(db, 30);
    expect(summary.counts).toMatchObject({
      aywebs_open: 1,
      capture_started: 2,
      capture_succeeded: 1,
      capture_failed: 1,
      add_to_cart_succeeded: 1,
    });
    expect(summary.captureSuccessRate).toBe(50);
    expect(summary.captureToCartRate).toBe(100);
    expect(summary.stores).toEqual(expect.arrayContaining([
      expect.objectContaining({ store: 'amazon', succeeded: 1, failed: 0, successRate: 100 }),
      expect.objectContaining({ store: 'shein', succeeded: 0, failed: 1, successRate: 0 }),
    ]));
    expect(summary.failures).toEqual([{ code: 'BOT_WALL', count: 1 }]);
    expect(JSON.stringify(summary)).not.toContain('aywebs-session-analytics');
  });
});
