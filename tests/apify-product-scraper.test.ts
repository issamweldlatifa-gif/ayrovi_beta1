import { describe, expect, test, vi } from 'vitest';
import {
  apifyProductScraperEnabled,
  mapApifyItem,
  pickScrapedProduct,
  scrapeProductWithApify,
} from '../src/ayrovix/services/apifyProductScraper';
import type { ScrapedProduct } from '../src/types';

const URL_PRODUCT = 'https://shop.example.com/p/air-max-95';

const ITEM = {
  url: URL_PRODUCT,
  store: 'shop.example.com',
  title: 'Nike Air Max 95',
  price: 149.99,
  currency: 'eur',
  in_stock: true,
  image: 'https://cdn.example.com/a.jpg',
  brand: 'Nike',
  sku: 'DC9412-400',
  description: 'Baskets bleu marine',
  rating: 4.5,
  review_count: 12,
};

describe('apifyProductScraper', () => {
  test('mapping: prix et dispo viennent de la source, vérification = false', () => {
    const product = mapApifyItem(ITEM, URL_PRODUCT, '2026-10-12T10:00:00.000Z') as ScrapedProduct;
    expect(product).toMatchObject({
      title: 'Nike Air Max 95',
      sourcePrice: 149.99,
      sourceCurrency: 'EUR',
      availability: 'in_stock',
      priceVerified: false,
      verificationProvider: 'apify',
      titleSource: 'merchant',
      mainImage: 'https://cdn.example.com/a.jpg',
      storeName: 'shop.example.com',
    });
  });

  test('absences restent absentes : pas de prix inventé, dispo inconnue', () => {
    const product = mapApifyItem({ title: 'Sac', price: null, in_stock: null }, URL_PRODUCT) as ScrapedProduct;
    expect(product.sourcePrice).toBe(0);
    expect(product.sourceCurrency).toBe('');
    expect(product.availability).toBe('unknown');
  });

  test('élément sans titre ou non objet est rejeté', () => {
    expect(mapApifyItem({ price: 10 }, URL_PRODUCT)).toBeNull();
    expect(mapApifyItem('texte', URL_PRODUCT)).toBeNull();
    expect(mapApifyItem(null, URL_PRODUCT)).toBeNull();
  });

  test('activation : nécessite APIFY_TOKEN et ne se laisse pas couper autrement que par off', () => {
    expect(apifyProductScraperEnabled({})).toBe(false);
    expect(apifyProductScraperEnabled({ APIFY_TOKEN: 'x' })).toBe(true);
    expect(apifyProductScraperEnabled({ APIFY_TOKEN: 'x', AYROVIX_APIFY_PRODUCT_SCRAPER: 'off' })).toBe(false);
  });

  test('appel : jeton dans l’en-tête, jamais dans l’URL', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify([ITEM]), { status: 200 }));
    const product = await scrapeProductWithApify(URL_PRODUCT, { APIFY_TOKEN: 'secret-token' }, fetchMock as unknown as typeof fetch);
    expect(product?.sourcePrice).toBe(149.99);
    const [calledUrl, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toContain('/v2/acts/skipper_lume~ecommerce-product-scraper/run-sync-get-dataset-items');
    expect(calledUrl).not.toContain('secret-token');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
    expect(JSON.parse(String(init.body))).toEqual({ urls: [URL_PRODUCT], maxConcurrency: 1, forcePlaywright: false });
  });

  test('erreurs HTTP, réponse non tableau et réseau ⇒ null (pas d’exception)', async () => {
    const env = { APIFY_TOKEN: 't' };
    expect(await scrapeProductWithApify(URL_PRODUCT, env, vi.fn(async () => new Response('no', { status: 402 })) as unknown as typeof fetch)).toBeNull();
    expect(await scrapeProductWithApify(URL_PRODUCT, env, vi.fn(async () => new Response('{"a":1}', { status: 200 })) as unknown as typeof fetch)).toBeNull();
    expect(await scrapeProductWithApify(URL_PRODUCT, env, vi.fn(async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch)).toBeNull();
  });

  test('sans jeton, aucun appel réseau', async () => {
    const fetchMock = vi.fn();
    expect(await scrapeProductWithApify(URL_PRODUCT, {}, fetchMock as unknown as typeof fetch)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('choix : Apify avec prix gagne ; sinon le local avec titre ; sinon Apify seul', () => {
    const apify = mapApifyItem(ITEM, URL_PRODUCT) as ScrapedProduct;
    const noPrice = mapApifyItem({ ...ITEM, price: null }, URL_PRODUCT) as ScrapedProduct;
    const local = { ...apify, title: 'Local', sourcePrice: 120, verificationProvider: 'local' } as ScrapedProduct;
    expect(pickScrapedProduct(apify, local)).toBe(apify);
    expect(pickScrapedProduct(noPrice, local)).toBe(local);
    expect(pickScrapedProduct(noPrice, null)).toBe(noPrice);
    expect(pickScrapedProduct(null, local)).toBe(local);
    expect(pickScrapedProduct(null, null)).toBeNull();
  });
});
