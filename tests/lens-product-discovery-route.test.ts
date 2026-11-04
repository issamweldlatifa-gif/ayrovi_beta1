import express from 'express';
import request from 'supertest';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { QatafoDatabase } from '../src/db/database';
import type { AyrovixCandidate } from '../src/ayrovix/types';

vi.mock('../src/ayrovix/services/lensEngine', () => ({ recognizeImage: vi.fn() }));
vi.mock('../src/services/imageIsolation', () => ({ warmIsolation: vi.fn() }));
vi.mock('../src/services/imageComposition', () => ({ warmComposition: vi.fn() }));

import { createAyrovixRouter } from '../src/ayrovix/routes';
import { recognizeImage } from '../src/ayrovix/services/lensEngine';
import { SmartLinkScraper } from '../src/scraper/scraper';

const recognizeMock = vi.mocked(recognizeImage);
const db = {
  get: vi.fn(() => undefined),
  all: vi.fn(() => []),
  run: vi.fn(),
} as unknown as QatafoDatabase;
const scraper = new SmartLinkScraper();
const app = express();
app.use(express.json());
app.use('/api/ayrovix', createAyrovixRouter(db, scraper));

let image: Buffer;
let previousKey: string | undefined;
let previousAlias: string | undefined;

function candidate(id: string, title: string, sourceUrl: string, match: number): AyrovixCandidate {
  return {
    id,
    kind: 'external',
    title,
    brand: null,
    model: null,
    colors: [],
    sizes: [],
    source: 'Google Lens',
    sourceUrl,
    image: `https://cdn.example.com/${id}.jpg`,
    images: [`https://cdn.example.com/${id}.jpg`],
    price: null,
    currency: null,
    priceTnd: null,
    // Même un indice fournisseur ne doit pas survivre comme fait de stock.
    availability: 'in_stock',
    sourceRead: { at: '2026-10-24T00:00:00.000Z', variantsAvailable: 1, variantsUnavailable: 0, variantsUnknown: 0 },
    match,
  };
}

function recognition(matches: AyrovixCandidate[]) {
  return {
    matches,
    matchesError: null,
    cacheHit: 'none',
    timings: { matchesMs: 1 },
  } as Awaited<ReturnType<typeof recognizeImage>>;
}

beforeEach(async () => {
  image = await sharp({ create: { width: 3, height: 2, channels: 3, background: '#315c8a' } }).png().toBuffer();
  previousKey = process.env.SERPAPI_KEY;
  previousAlias = process.env.SERPAPI_API_KEY;
  process.env.SERPAPI_KEY = 'route-test-key';
  process.env.SERPAPI_API_KEY = '';
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  if (previousKey === undefined) delete process.env.SERPAPI_KEY;
  else process.env.SERPAPI_KEY = previousKey;
  if (previousAlias === undefined) delete process.env.SERPAPI_API_KEY;
  else process.env.SERPAPI_API_KEY = previousAlias;
});

describe('Lens /analyze-image — découverte PRODUCT sans scraping groupé', () => {
  it('admet les fiches reconnues, isole les échecs et ne visite aucun marchand', async () => {
    const parsedPage = vi.spyOn(scraper, 'scrapeParsedPage');
    const scrapeProduct = vi.spyOn(scraper, 'scrapeProduct');
    recognizeMock.mockResolvedValue(recognition([
      candidate('social', 'Post sneakers', 'https://www.instagram.com/p/ABC123/', 99),
      candidate('first', 'Nike baskets blanches', 'https://www.zalando.fr/baskets-homme-AB1234.html', 98),
      candidate('search', 'Recherche Nike', 'https://www.amazon.com/s?k=nike', 97),
      candidate('second', 'Adidas sweat à capuche', 'https://www.amazon.com/dp/B0ABC12345?th=1&psc=1&utm_source=lens', 96),
      candidate('unknown', 'Page quelconque', 'https://www.amazon.com/gp/help/customer/display.html?nodeId=1', 95),
    ]));

    const response = await request(app)
      .post('/api/ayrovix/analyze-image')
      .attach('image', image, { filename: 'product.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.data.discovery).toEqual({ mode: 'PRODUCT_LINK_ADMISSION', merchantPagesRead: 0 });
    expect(response.body.data.liveStock).toEqual({ fetched: 0, cacheHits: 0, applied: 0, budget: 0 });
    expect(response.body.data.candidates.map((row: AyrovixCandidate) => row.sourceUrl)).toEqual([
      'https://www.zalando.fr/baskets-homme-AB1234.html',
      'https://www.amazon.com/dp/B0ABC12345?th=1&psc=1',
    ]);
    for (const row of response.body.data.candidates as AyrovixCandidate[]) {
      expect(row.productPageType).toBe('PRODUCT');
      expect(row.productLinkStatus).toBe('VERIFIED');
      expect(row.availability).toBe('unknown');
      expect(row.sourceRead).toBeNull();
      expect(row.price).toBeNull();
      expect(row.priceToken).toBeNull();
      expect(row.priceVerificationStatus).toBe('PENDING_MANUAL');
    }
    expect(response.body.data.excluded.count).toBe(3);
    expect(response.body.data.excluded.reasons).toMatchObject({
      SOCIAL_RESULT_NOT_PURCHASABLE: 1,
      AYWEBS_SEARCH: 1,
    });
    expect(parsedPage).not.toHaveBeenCalled();
    expect(scrapeProduct).not.toHaveBeenCalled();
    expect(db.all).not.toHaveBeenCalled();
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it('SSE publie une seule version des cartes admises, puis termine sans enrichissement groupé', async () => {
    recognizeMock.mockResolvedValue(recognition([
      candidate('social', 'Post sneakers', 'https://www.tiktok.com/@shop/video/123456789', 99),
      candidate('product', 'Nike baskets blanches', 'https://www.zalando.fr/baskets-homme-AB1234.html', 98),
    ]));

    const response = await request(app)
      .post('/api/ayrovix/analyze-image')
      .set('accept', 'text/event-stream')
      .attach('image', image, { filename: 'product.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    const events = [...response.text.matchAll(/^event: ([^\n]+)\ndata: (.+)$/gm)]
      .map((match) => ({ event: match[1], data: JSON.parse(match[2]) }));
    const cards = events.filter((row) => row.event === 'card');
    expect(cards).toHaveLength(1);
    expect(cards[0].data.sourceUrl).toBe('https://www.zalando.fr/baskets-homme-AB1234.html');
    expect(cards[0].data.availability).toBe('unknown');
    const done = events.find((row) => row.event === 'done');
    expect(done?.data.liveStock).toEqual({ fetched: 0, cacheHits: 0, applied: 0, budget: 0 });
    expect(done?.data.excluded.reasons.SOCIAL_RESULT_NOT_PURCHASABLE).toBe(1);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });
});
