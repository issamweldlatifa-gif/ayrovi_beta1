import { describe, expect, it } from 'vitest';
import { parseAyWebsLastVisit } from '@/features/aywebs/lastVisitedStore';

describe('AYWEBs last visit storage parser', () => {
  it('keeps a valid merchant page and label', () => {
    expect(parseAyWebsLastVisit(JSON.stringify({
      storeId: 'amazon',
      storeName: 'Amazon',
      url: 'https://www.amazon.com/dp/example?color=black',
      visitedAt: 1234,
    }))).toEqual({
      storeId: 'amazon',
      storeName: 'Amazon',
      url: 'https://www.amazon.com/dp/example?color=black',
      visitedAt: 1234,
    });
  });

  it('rejects malformed values and non-web schemes', () => {
    expect(parseAyWebsLastVisit('{')).toBeNull();
    expect(parseAyWebsLastVisit(JSON.stringify({ storeId: 'amazon', storeName: 'Amazon', url: 'intent://open' }))).toBeNull();
    expect(parseAyWebsLastVisit(JSON.stringify({ storeId: '', storeName: 'Amazon', url: 'https://amazon.com' }))).toBeNull();
  });

  it('normalizes missing timestamps without fabricating visit details', () => {
    expect(parseAyWebsLastVisit(JSON.stringify({
      storeId: 'amazon', storeName: 'Amazon', url: 'https://amazon.com',
    }))).toEqual({ storeId: 'amazon', storeName: 'Amazon', url: 'https://amazon.com', visitedAt: 0 });
  });
});
