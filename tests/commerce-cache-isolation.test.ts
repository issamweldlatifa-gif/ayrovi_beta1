import { afterEach, describe, expect, it, vi } from 'vitest';
import { serpApiVisualSearchUrl } from '../src/ayrovix/services/visualSearch';
import { pipelineKey, refreshCachedImagePricing } from '../src/ayrovix/routes';
import { QatafoDatabase } from '../src/db/database';
import { normalizeSerpApiMatch, priceCommerceProduct, projectCandidate } from '../src/ayrovix/services/commerceProduct';
import { verifyCommerceProduct } from '../src/ayrovix/commerceQuote';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('image analysis cache identity', () => {
  it('hashes the entire image and the intent, not matching headers/tails', () => {
    const head = Buffer.alloc(4096, 0x42), tail = Buffer.alloc(4096, 0x25);
    const shoe = Buffer.concat([head, Buffer.from('shoe photo bytes'), tail]);
    const laptop = Buffer.concat([head, Buffer.from('skin photo bytes'), tail]);
    expect(shoe.length).toBe(laptop.length);
    expect(pipelineKey(shoe, 'shoes')).not.toBe(pipelineKey(laptop, 'shoes'));
    expect(pipelineKey(shoe, 'shoes')).not.toBe(pipelineKey(shoe, 'laptops'));
    expect(pipelineKey(shoe, 'shoes')).toBe(pipelineKey(Buffer.from(shoe), 'shoes'));
  });
});

describe('cached response pricing', () => {
  it('recomputes FX, promotion breakdowns and signatures without mutating the source snapshot', () => {
    const db = new QatafoDatabase(':memory:');
    try {
      const first = priceCommerceProduct(db, normalizeSerpApiMatch({
        title: 'Merchant coat', link: 'https://clothes-shop.com/products/coat', source: 'Clothes Shop',
        price: { value: 49.95, currency: 'EUR' },
        variants: [{ id: 'size-m', attributes: { Size: 'M' }, price: { value: 59.95, currency: 'EUR' } }],
      }));
      const oldCandidate = projectCandidate(first, 80);
      const oldScreenshot = { sourcePrice: 49.95, sourceCurrency: 'EUR', totalPriceTND: first.pricing.ayroviPriceTnd,
        convertedPriceTND: null, serviceFeeTND: null, estimatedShippingTND: null,
        priceToken: null, title: 'Merchant coat', brand: null, isCartScreenshot: false, imageUrl: null };
      const before = db.getPricingRules();
      db.run("UPDATE pricing_config SET rate_eur=?, version=version+1 WHERE id='default'", before.rateEUR * 1.25);
      const fresh = refreshCachedImagePricing(db, { candidates: [oldCandidate], detectedPrice: oldScreenshot });
      expect(fresh.candidates[0].canonical?.pricing.pricingVersion).toBe(before.version + 1);
      expect(verifyCommerceProduct(fresh.candidates[0].canonical!)).toBe(true);
      expect(fresh.candidates[0].priceTnd).not.toBe(oldCandidate.priceTnd);
      expect(fresh.candidates[0].canonical?.variants.offers[0].ayroviPriceTnd)
        .not.toBe(first.variants.offers[0].ayroviPriceTnd);
      expect(fresh.detectedPrice?.totalPriceTND).not.toBe(oldScreenshot.totalPriceTND);
      expect(oldCandidate.canonical).toBe(first);
      expect(oldCandidate.priceTnd).toBe(first.pricing.ayroviPriceTnd);
      expect(first.pricing.pricingVersion).toBe(before.version);
    } finally { db.close(); }
  });
});

describe('visual source snapshots', () => {
  it('returns independent deep snapshots to concurrent callers and later cache hits', async () => {
    vi.stubEnv('SERPAPI_KEY', 'nonsecret-test-placeholder');
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ visual_matches: [{
      title: 'Merchant jacket', source: 'Clothes Shop', link: 'https://clothes-shop.com/p/jacket',
      price: { value: 49.95, currency: 'EUR' },
      thumbnail: 'https://cdn.clothes-shop.com/jacket.jpg',
      options: [{ name: 'Size', options: [{ id: 'M', label: 'M' }, { id: 'L', label: 'L' }] }],
    }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetcher);
    const fixture = `https://photos-shop.com/testing-${Date.now()}.jpg`;
    const [first, parallel] = await Promise.all([serpApiVisualSearchUrl(fixture), serpApiVisualSearchUrl(fixture)]);
    expect(first).toHaveLength(1);
    expect(parallel).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const originalId = first[0].canonical!.id;
    first[0].canonical!.variants.groups[0].options[0].label = 'mutated';
    first[0].canonical!.media.originalImages.push('https://unrelated-shop.com/image.jpg');
    first[0].title = 'not source';
    expect(parallel[0].canonical!.variants.groups[0].options[0].label).toBe('M');
    expect(parallel[0].canonical!.media.originalImages).toEqual(['https://cdn.clothes-shop.com/jacket.jpg']);
    const cached = await serpApiVisualSearchUrl(fixture);
    expect(cached[0].title).toBe('Merchant jacket');
    expect(cached[0].canonical!.id).toBe(originalId);
    expect(cached[0].canonical!.variants.groups[0].options[0].label).toBe('M');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
