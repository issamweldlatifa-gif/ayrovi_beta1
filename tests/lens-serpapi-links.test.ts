import { afterEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { extractSerpApiMerchantProductUrl } from '../src/ayrovix/services/search';

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('Lens → SerpApi → vrais liens produits marchands pour AYWEBs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('extractSerpApiMerchantProductUrl : rejette Google Shopping/Search et déplie les wrappers vers le marchand', () => {
    expect(extractSerpApiMerchantProductUrl('https://www.google.com/shopping/product/987654321?gl=fr')).toBeNull();
    expect(extractSerpApiMerchantProductUrl('https://www.google.fr/search?tbm=shop&q=nike')).toBeNull();
    expect(extractSerpApiMerchantProductUrl('https://www.instagram.com/p/ABC123/')).toBeNull();
    expect(extractSerpApiMerchantProductUrl('https://www.zalando.fr/')).toBeNull();
    expect(extractSerpApiMerchantProductUrl('https://www.amazon.fr/s?k=nike')).toBeNull();

    expect(extractSerpApiMerchantProductUrl(
      'https://www.google.com/url?q=https%3A%2F%2Fwww.zalando.fr%2Fnike-air-max-90-ni112o0bt.html%3Fsrsltid%3DAfm123&sa=U',
    )).toBe('https://www.zalando.fr/nike-air-max-90-ni112o0bt.html');

    expect(extractSerpApiMerchantProductUrl(
      'http://www.asos.com/fr/nike/prd/204958123?clr=blanc&utm_source=google_shopping',
    )).toBe('https://www.asos.com/fr/nike/prd/204958123?clr=blanc');
  });

  test('analyze-text : demande direct_link=true à SerpApi et garde une carte par fiche marchande distincte', async () => {
    const previousKey = process.env.SERPAPI_KEY;
    process.env.SERPAPI_KEY = 'test-serpapi-direct-links';
    const seenUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL) => {
      const target = String(input);
      seenUrls.push(target);
      return new Response(JSON.stringify({
        shopping_results: [
          {
            title: 'Adidas Samba OG Blanc',
            brand: 'Adidas',
            source: 'Google Shopping',
            product_link: 'https://www.google.com/shopping/product/111111111?gl=fr',
            extracted_price: 119.99,
            price: '119,99 €',
            thumbnail: 'https://cdn.example.com/google-agg.jpg',
          },
          {
            title: 'Adidas Samba OG Chaussures Blanc',
            brand: 'Adidas',
            source: 'Zalando',
            link: 'https://www.zalando.fr/adidas-originals-samba-og-ad115o1j8.html?srsltid=test1',
            extracted_price: 119.95,
            price: '119,95 €',
            thumbnail: 'https://cdn.example.com/zalando-samba.jpg',
          },
          {
            title: 'Adidas Samba OG Blanc Noir',
            brand: 'Adidas',
            source: 'Courir',
            link: 'https://www.courir.com/fr/p/adidas-samba-og-1498723.html',
            extracted_price: 120,
            price: '120,00 €',
            thumbnail: 'https://cdn.example.com/courir-samba.jpg',
          },
        ],
      }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await request(app)
        .post('/api/ayrovix/analyze-text')
        .send({ query: `Adidas Samba OG ${Date.now()}` });

      expect(response.status).toBe(200);
      expect(seenUrls).toHaveLength(1);
      const parsedReq = new URL(seenUrls[0]);
      expect(parsedReq.searchParams.get('engine')).toBe('google_shopping');
      expect(parsedReq.searchParams.get('direct_link')).toBe('true');

      const urls = response.body.data.candidates.map((row: any) => row.sourceUrl);
      expect(urls).toEqual(expect.arrayContaining([
        'https://www.zalando.fr/adidas-originals-samba-og-ad115o1j8.html',
        'https://www.courir.com/fr/p/adidas-samba-og-1498723.html',
      ]));
      expect(urls.some((u: string) => u.includes('google.com'))).toBe(false);
      for (const candidate of response.body.data.candidates) {
        expect(candidate.priceTnd).toBeGreaterThan(0);
      }
    } finally {
      restoreEnv('SERPAPI_KEY', previousKey);
    }
  });

  test('analyze-barcode : résout immersive_product_page_token via SerpApi quand shopping_results ne contient pas de lien direct', async () => {
    const previousKey = process.env.SERPAPI_KEY;
    process.env.SERPAPI_KEY = 'test-serpapi-immersive';
    const fetchMock = vi.fn(async (input: string | URL) => {
      const parsed = new URL(String(input));
      const engine = parsed.searchParams.get('engine');
      if (engine === 'google_shopping') {
        return new Response(JSON.stringify({
          shopping_results: [{
            title: 'Sony WH-1000XM5 Casque Bluetooth',
            product_link: 'https://www.google.com/shopping/product/99887766?gl=fr',
            immersive_product_page_token: 'immersive_tok_xm5',
            extracted_price: 299.99,
            price: '299,99 €',
            thumbnail: 'https://cdn.example.com/xm5.jpg',
          }],
        }), { status: 200 });
      }
      if (engine === 'google_immersive_product') {
        expect(parsed.searchParams.get('page_token')).toBe('immersive_tok_xm5');
        return new Response(JSON.stringify({
          product_results: {
            title: 'Sony WH-1000XM5',
            brand: 'Sony',
            thumbnails: ['https://cdn.example.com/xm5-hd.jpg'],
            stores: [
              {
                name: 'Amazon.fr',
                title: 'Sony WH-1000XM5 Casque à réduction de bruit',
                link: 'https://www.amazon.fr/dp/B09XS7JWHH?th=1',
                extracted_price: 299,
                price: '299,00 €',
              },
              {
                name: 'Fnac',
                title: 'Casque Sony WH-1000XM5 Noir',
                link: 'https://www.fnac.com/Casque-Sony-WH-1000XM5/a16890123/w-4',
                extracted_price: 319.99,
                price: '319,99 €',
              },
            ],
          },
        }), { status: 200 });
      }
      throw new Error(`Unexpected SerpApi engine: ${engine}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await request(app)
        .post('/api/ayrovix/analyze-barcode')
        .send({ code: '4548736132580' });

      expect(response.status).toBe(200);
      const urls = response.body.data.candidates.map((row: any) => row.sourceUrl);
      expect(urls).toEqual([
        'https://www.amazon.fr/dp/B09XS7JWHH?th=1',
        'https://www.fnac.com/Casque-Sony-WH-1000XM5/a16890123/w-4',
      ]);
    } finally {
      restoreEnv('SERPAPI_KEY', previousKey);
    }
  });
});
