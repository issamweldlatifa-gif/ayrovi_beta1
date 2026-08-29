import { afterEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { app, db } from '../src/server';
import { buildSearchQuery } from '../src/ayrovix/services/ai';
import { providerWebSearch, scoreCandidate, searchCandidates } from '../src/ayrovix/services/search';
import { serpApiVisualSearch } from '../src/ayrovix/services/visualSearch';
import { filterDisplayableCandidates } from '../src/ayrovix/services/candidatePolicy';
import { parseProductPageHtml } from '../src/scraper/productPageParser';
import { fetchRenderedProductPage, RenderedPageError } from '../src/scraper/renderedPageFetcher';
import { createAyrovixPriceToken, verifyAyrovixPriceToken } from '../src/ayrovix/priceQuote';
import { recordAyrovixHistory } from '../src/ayrovix/history';
import { getAyrovixStats } from '../src/ayrovix/events';
import { createCustomerSession } from '../src/customer/auth';
import { isUnsafeIpAddress, resolveSafeHttpUrl } from '../src/services/safeUrl';
import type { AyrovixIdentification } from '../src/ayrovix/types';

/** PNG 1x1 minimal — multer valide le mimetype déclaré, pas le contenu. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const NIKE_ID: AyrovixIdentification = {
  input_kind: 'product_photo',
  category: 'sneakers',
  brand: 'Nike',
  model: 'Air Max 95',
  color: ['navy', 'grey'],
  visible_text: ['NIKE'],
  possible_model_codes: [],
  description: 'Baskets running bleu marine à bulle visible.',
  confidence: 0.9,
  detected_price: { amount: 0, currency: '', label: 'none', confidence: 0 },
};

function seedCatalogProduct() {
  const now = new Date().toISOString();
  const id = `prd_test_${Math.random().toString(36).slice(2, 10)}`;
  db.run(
    `INSERT INTO products (id,name,description,image,brand_name,category,source_url,source_platform,
      original_price,currency,converted_price,customs_fee,shipping_fee,service_fee,final_price,express_available,stock_status,status,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,0,0,0,0,?,1,'AVAILABLE','ACTIVE',?,?)`,
    id, 'Nike Air Max 95 Ultra', '', '', 'Nike', 'chaussures', 'https://www.shein.com/nike-air-max-95-p-1.html', 'SHEIN',
    44, 'EUR', 250, now, now,
  );
  return id;
}

function stubAnthropic(text: string) {
  const mock = vi.fn(async (_url: string, _init: RequestInit = {}) => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text }] }),
  }));
  vi.stubGlobal('fetch', mock);
  return mock;
}

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe('AYROVIX Lens', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  test('analyze-image exige une image et refuse les formats non image', async () => {
    const missing = await request(app).post('/api/ayrovix/analyze-image');
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('IMAGE_REQUIRED');

    const wrongType = await request(app)
      .post('/api/ayrovix/analyze-image')
      .attach('image', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(wrongType.status).toBe(415);
    expect(wrongType.body.code).toBe('UNSUPPORTED_IMAGE');
  });

  test('rejette une fausse image sans écrire de fichier et garde le serveur disponible', async () => {
    const uploadsDir = path.resolve(process.cwd(), 'data/uploads');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const before = fs.readdirSync(uploadsDir).sort();

    const response = await request(app)
      .post('/api/ayrovix/analyze-image')
      .attach('image', Buffer.from("console.log('not an image')"), {
        filename: 'payload.js',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(415);
    expect(response.body.code).toBe('INVALID_IMAGE');
    expect(fs.readdirSync(uploadsDir).sort()).toEqual(before);
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  test('analyze-image sans clé serveur → 503 AYROVIX_UNAVAILABLE (la clé ne part jamais au client)', async () => {
    const response = await request(app)
      .post('/api/ayrovix/analyze-image')
      .attach('image', PNG_1PX, { filename: 'sneakers.png', contentType: 'image/png' });
    expect(response.status).toBe(503);
    expect(response.body.code).toBe('AYROVIX_UNAVAILABLE');
  });

  test('buildSearchQuery : code article prioritaire, sinon marque + modèle + couleurs', () => {
    expect(buildSearchQuery(NIKE_ID)).toBe('Nike Air Max 95 navy grey sneakers');
    expect(buildSearchQuery({ ...NIKE_ID, possible_model_codes: ['DC9412-400'] })).toBe('Nike DC9412-400');
    expect(buildSearchQuery({ ...NIKE_ID, brand: null, model: null, color: [] })).toBe('sneakers');
  });

  test('politique résultats : prix positif + devise + lien public, avec note toujours visible', () => {
    const base = {
      kind: 'external', title: 'Produit test', brand: null, model: null, colors: [], sizes: [],
      source: 'Test', image: '', priceTnd: null, match: 86,
    } as const;
    const results = filterDisplayableCandidates([
      { ...base, id: 'ok', sourceUrl: 'https://shop.example.com/product/1', price: 29.9, currency: 'EUR' },
      { ...base, id: 'no-price', sourceUrl: 'https://shop.example.com/product/2', price: null, currency: 'EUR' },
      { ...base, id: 'private', sourceUrl: 'http://127.0.0.1/product/3', price: 10, currency: 'EUR' },
      { ...base, id: 'credentials', sourceUrl: 'https://user:pass@shop.example.com/product/4', price: 10, currency: 'EUR' },
    ] as any);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: 'ok', rating: 4.3, ratingKind: 'match' });
  });

  test('scoreCandidate : le code article domine, la marque pèse, le catalogue est trié', () => {
    const withCode = scoreCandidate({ ...NIKE_ID, possible_model_codes: ['DC9412-400'] }, 'Nike DC9412-400', { title: 'Air Max 95 DC9412-400 bleu', brand: 'Nike' });
    const weak = scoreCandidate(NIKE_ID, 'Nike Air Max 95 navy grey', { title: 'Sandales plage', brand: 'Autre' });
    expect(withCode).toBeGreaterThan(85);
    expect(weak).toBeLessThan(withCode);
    expect(weak).toBeGreaterThanOrEqual(0);
  });

  test('SerpApi Google Lens renvoie produits, images et prix puis évite la recherche texte Claude', async () => {
    const previousKey = process.env.SERPAPI_KEY;
    process.env.SERPAPI_KEY = 'test-serpapi-key';
    const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.startsWith('https://serpapi.com/image?')) {
        expect(init.method).toBe('POST');
        expect(init.body).toBeInstanceOf(FormData);
        return new Response(JSON.stringify({ image_id: 'temporary-image-id' }), { status: 200 });
      }
      if (url.startsWith('https://serpapi.com/search.json?')) {
        const parsed = new URL(url);
        expect(parsed.searchParams.get('engine')).toBe('google_lens');
        expect(parsed.searchParams.get('type')).toBe('products');
        expect(parsed.searchParams.get('image_id')).toBe('temporary-image-id');
        return new Response(JSON.stringify({
          visual_matches: [{
            title: 'Nike Air Max 95 Navy DC9412-400',
            link: 'https://shop.example.com/nike-air-max-95',
            source: 'Example Shop',
            thumbnail: 'https://encrypted-tbn.example.com/nike-air-max-95-thumb.jpg',
            image: 'https://cdn.example.com/nike-air-max-95.jpg',
            exact_matches: true,
            price: { extracted_value: 149.99, currency: '€' },
          }],
        }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const visual = await serpApiVisualSearch(PNG_1PX, 8);
      expect(visual).toHaveLength(1);
      expect(visual[0]).toMatchObject({
        kind: 'external',
        image: 'https://encrypted-tbn.example.com/nike-air-max-95-thumb.jpg',
        images: [
          'https://encrypted-tbn.example.com/nike-air-max-95-thumb.jpg',
          'https://cdn.example.com/nike-air-max-95.jpg',
        ],
        price: 149.99,
        currency: 'EUR',
        match: 99,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);

      const cachedVisual = await serpApiVisualSearch(PNG_1PX, 8);
      expect(cachedVisual).toEqual(visual);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      fetchMock.mockClear();
      const candidates = await searchCandidates(db, NIKE_ID, 'Nike Air Max 95 DC9412-400', visual);
      expect(candidates.find((item) => item.id.startsWith('lens_'))?.images).toEqual(expect.arrayContaining([
        expect.stringContaining('nike-air-max-95-thumb.jpg'),
        expect.stringContaining('nike-air-max-95.jpg'),
      ]));
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      restoreEnv('SERPAPI_KEY', previousKey);
    }
  });

  test('fiche marchand : extrait uniquement les variantes disponibles et leur prix réel', () => {
    const html = `<!doctype html><html><head>
      <meta property="og:title" content="Sneaker Test">
      <meta property="product:price:amount" content="129,99 €">
      <meta property="product:price:currency" content="EUR">
      <meta property="og:image" content="/products/shoe.jpg">
      <script type="application/ld+json">{"@type":"Product","name":"Sneaker Test","sku":"SKU-42","color":["Noir","Blanc"],"offers":{"price":"129.99","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script>
      <script type="application/json">{"product":{"id":42,"title":"Sneaker Test","options":["Taille","Couleur"],"variants":[
        {"id":1,"option1":"42 EU","option2":"Noir","available":true,"price":12999,"public_title":"42 EU / Noir","requires_shipping":true},
        {"id":2,"option1":"43 EU","option2":"Noir","available":false,"price":12999,"public_title":"43 EU / Noir","requires_shipping":true},
        {"id":3,"option1":"44 EU","option2":"Blanc","available":true,"price":13999,"public_title":"44 EU / Blanc","requires_shipping":true}
      ]}}</script>
    </head><body><h1>Sneaker Test</h1></body></html>`;
    const parsed = parseProductPageHtml(html, 'https://shop.example.org/item', 'generic');
    expect(parsed).toMatchObject({ title: 'Sneaker Test', price: 129.99, currency: 'EUR', externalId: 'SKU-42', priceSource: 'json_ld' });
    expect(parsed.images[0]).toBe('https://shop.example.org/products/shoe.jpg');
    expect(parsed.variants.sizes).toEqual(['42 EU', '44 EU']);
    expect(parsed.variants.colors).toEqual(['Noir', 'Blanc']);
    expect(parsed.variants.details).toEqual([
      expect.objectContaining({ id: '1', size: '42 EU', color: 'Noir', price: 129.99, available: true }),
      expect.objectContaining({ id: '3', size: '44 EU', color: 'Blanc', price: 139.99, available: true }),
    ]);
  });

  test('parser prix : JSON-LD précède meta, puis regex prix contextuel en dernier recours', () => {
    const prioritized = parseProductPageHtml(`<!doctype html><html><head>
      <meta property="og:title" content="Produit prioritaire"><meta property="product:price:amount" content="49.90"><meta property="product:price:currency" content="USD">
      <script type="application/ld+json">{"@type":"Product","name":"Produit prioritaire","offers":{"price":"79.95","priceCurrency":"EUR"}}</script>
    </head><body>Prix : 29,90 €</body></html>`, 'https://shop.example.org/p/priority', 'generic');
    expect(prioritized).toMatchObject({ price: 79.95, currency: 'EUR', priceSource: 'json_ld' });

    const contextual = parseProductPageHtml('<html><head><title>Produit contextuel</title></head><body><strong>Prix : 1 299,50 EUR</strong></body></html>', 'https://shop.example.org/p/context', 'generic');
    expect(contextual).toMatchObject({ price: 1299.5, currency: 'EUR', priceSource: 'context_regex' });
  });

  test('devis signé : lie prix, devise, titre, lien et statut et refuse altération ou expiration', () => {
    const quote = { price: 89.99, currency: 'EUR', title: 'Robe noire', referenceUrl: 'https://shop.example.org/robe', status: 'PENDING_MANUAL' as const };
    const token = createAyrovixPriceToken(quote);
    expect(token).toBeTruthy();
    expect(verifyAyrovixPriceToken(token, quote)).toBe(true);
    expect(verifyAyrovixPriceToken(token, { ...quote, price: 8.99 })).toBe(false);
    expect(verifyAyrovixPriceToken(token, { ...quote, referenceUrl: 'https://evil.example/other' })).toBe(false);
    expect(verifyAyrovixPriceToken(createAyrovixPriceToken(quote, -1), quote)).toBe(false);
  });

  test('historique hybride : invité local côté client, compte authentifié isolé et synchronisé côté serveur', async () => {
    const guest = await request(app).get('/api/ayrovix/history');
    expect(guest.status).toBe(200);
    expect(guest.body.data).toEqual([]);

    const accountId = `account_lens_history_${Date.now()}`;
    const eventId = `ayx_${randomUUID()}`;
    const now = new Date().toISOString();
    db.run("INSERT INTO customer_accounts (id,display_name,status,created_at,updated_at) VALUES (?,?,'ACTIVE',?,?)",
      accountId, 'Client historique Lens', now, now);
    try {
      const session = createCustomerSession(db, accountId, { ip: '127.0.0.1', headers: { 'user-agent': 'Vitest' } } as any);
      recordAyrovixHistory(db, {
        eventId, accountId, kind: 'url', inputValue: 'https://www.amazon.fr/dp/TESTHISTORY',
        queryLabel: 'Sneaker historique', title: 'Sneaker historique', imageUrl: 'https://images.example.org/history.jpg',
        sourceUrl: 'https://www.amazon.fr/dp/TESTHISTORY', source: 'Amazon', price: 79.99, currency: 'EUR',
        verificationStatus: 'VERIFIED', resultsCount: 3,
      });
      const cookie = `ayrovi_customer_session=${encodeURIComponent(session.token)}`;
      const analyzed = await request(app).post('/api/ayrovix/analyze-barcode').set('Cookie', cookie).send({ code: '619125062532' });
      expect(analyzed.status).toBe(200);

      const response = await request(app).get('/api/ayrovix/history').set('Cookie', cookie);
      expect(response.status).toBe(200);
      expect(response.body.data).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: eventId, kind: 'url', title: 'Sneaker historique', price: 79.99, currency: 'EUR', verificationStatus: 'VERIFIED', resultsCount: 3 }),
        expect.objectContaining({ id: analyzed.body.data.eventId, kind: 'barcode', inputValue: '619125062532' }),
      ]));
      expect(response.body.data[0]).not.toHaveProperty('accountId');
    } finally {
      db.run('DELETE FROM customer_accounts WHERE id=?', accountId);
    }
  });

  test('rendu headless : ScraperAPI reçoit render=true et les erreurs conservent fournisseur et cause', async () => {
    const previous = {
      scraperApi: process.env.SCRAPERAPI_KEY,
      scrapingBee: process.env.SCRAPINGBEE_API_KEY,
      brightToken: process.env.BRIGHTDATA_API_TOKEN,
      brightZone: process.env.BRIGHTDATA_UNLOCKER_ZONE,
      provider: process.env.AYROVIX_RENDER_PROVIDER,
    };
    process.env.SCRAPERAPI_KEY = 'scraper-api-test';
    delete process.env.SCRAPINGBEE_API_KEY;
    delete process.env.BRIGHTDATA_API_TOKEN;
    delete process.env.BRIGHTDATA_UNLOCKER_ZONE;
    process.env.AYROVIX_RENDER_PROVIDER = 'scraperapi';
    try {
      const fetchMock = vi.fn(async (url: string) => {
        const requestUrl = new URL(url);
        expect(requestUrl.searchParams.get('render')).toBe('true');
        expect(requestUrl.searchParams.get('url')).toBe('https://www.amazon.fr/dp/TEST');
        return new Response('<html><body><span>Prix : 44,90 EUR</span></body></html>', { status: 200 });
      });
      vi.stubGlobal('fetch', fetchMock);
      await expect(fetchRenderedProductPage('https://www.amazon.fr/dp/TEST')).resolves.toMatchObject({ provider: 'scraperapi' });

      vi.stubGlobal('fetch', vi.fn(async () => new Response('Forbidden', { status: 403 })));
      await expect(fetchRenderedProductPage('https://fr.shein.com/test')).rejects.toMatchObject({
        name: 'RenderedPageError', code: 'RENDER_ACCESS_DENIED', provider: 'scraperapi',
      } satisfies Partial<RenderedPageError>);

      delete process.env.SCRAPERAPI_KEY;
      process.env.SCRAPINGBEE_API_KEY = 'bee-test';
      process.env.AYROVIX_RENDER_PROVIDER = 'scrapingbee';
      vi.stubGlobal('fetch', vi.fn(async (url: string) => {
        const requestUrl = new URL(url);
        expect(requestUrl.hostname).toBe('app.scrapingbee.com');
        expect(requestUrl.searchParams.get('render_js')).toBe('true');
        return new Response('<html><body>Prix : 60 EUR</body></html>', { status: 200 });
      }));
      await expect(fetchRenderedProductPage('https://fr.shein.com/test')).resolves.toMatchObject({ provider: 'scrapingbee' });

      delete process.env.SCRAPINGBEE_API_KEY;
      process.env.BRIGHTDATA_API_TOKEN = 'bright-token';
      process.env.BRIGHTDATA_UNLOCKER_ZONE = 'unlocker-zone';
      process.env.AYROVIX_RENDER_PROVIDER = 'brightdata';
      vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
        expect(url).toBe('https://api.brightdata.com/request');
        expect((init.headers as Record<string, string>).Authorization).toBe('Bearer bright-token');
        expect(JSON.parse(String(init.body))).toMatchObject({ zone: 'unlocker-zone', url: 'https://www.amazon.fr/dp/TEST', format: 'raw' });
        return new Response('<html><body>Prix : 60 EUR</body></html>', { status: 200 });
      }));
      await expect(fetchRenderedProductPage('https://www.amazon.fr/dp/TEST')).resolves.toMatchObject({ provider: 'brightdata' });
    } finally {
      restoreEnv('SCRAPERAPI_KEY', previous.scraperApi);
      restoreEnv('SCRAPINGBEE_API_KEY', previous.scrapingBee);
      restoreEnv('BRIGHTDATA_API_TOKEN', previous.brightToken);
      restoreEnv('BRIGHTDATA_UNLOCKER_ZONE', previous.brightZone);
      restoreEnv('AYROVIX_RENDER_PROVIDER', previous.provider);
    }
  });

  test('image → identification Claude (simulée) → candidats catalogue → événement → choix', async () => {
    seedCatalogProduct();
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    stubAnthropic(JSON.stringify({
      input_kind: 'product_photo', category: 'sneakers', brand: 'Nike', model: 'Air Max 95',
      color: ['navy', 'grey'], visible_text: ['NIKE'], possible_model_codes: [],
      description: 'Baskets running bleu marine à bulle visible.', confidence: 0.9,
      detected_price: { amount: 0, currency: '', label: 'none', confidence: 0 },
    }));
    try {
      const response = await request(app)
        .post('/api/ayrovix/analyze-image')
        .attach('image', PNG_1PX, { filename: 'sneakers.png', contentType: 'image/png' });
      expect(response.status).toBe(200);
      const data = response.body.data;
      expect(data.identification.brand).toBe('Nike');
      expect(data.query).toContain('Nike');
      expect(data.candidates.length).toBeGreaterThan(0);
      expect(data.candidates[0].match).toBeGreaterThanOrEqual(35);
      expect(data.candidates[0].title).toContain('Nike');
      expect(data.candidates[0].priceTnd).toBeGreaterThan(0);
      expect(data.candidates[0].priceToken).toMatch(/^[^.]+\.[^.]+$/);
      expect(data.candidates[0].priceVerificationStatus).toBe('VERIFIED');
      expect(data.eventId).toMatch(/^ayx_/);

      const event = db.get<any>('SELECT * FROM ayrovix_events WHERE id=?', data.eventId);
      expect(event.channel).toBe('image');
      expect(event.candidates_count).toBeGreaterThan(0);
      expect(event.chosen).toBe(0);

      const choose = await request(app).post('/api/ayrovix/choose').send({ eventId: data.eventId });
      expect(choose.status).toBe(200);
      expect(db.get<any>('SELECT chosen FROM ayrovix_events WHERE id=?', data.eventId).chosen).toBe(1);

      const stats = getAyrovixStats(db);
      expect(stats.last7d.total).toBeGreaterThanOrEqual(1);
      expect(stats.last7d.image).toBeGreaterThanOrEqual(1);
    } finally {
      process.env.ANTHROPIC_API_KEY = '';
    }
  });

  test('analyze-image continue avec Google Lens si Claude Vision échoue', async () => {
    const previousAnthropic = process.env.ANTHROPIC_API_KEY;
    const previousSerp = process.env.SERPAPI_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-down';
    process.env.SERPAPI_KEY = 'test-serpapi-key';
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('api.anthropic.com')) {
        return new Response('internal', { status: 500 });
      }
      if (String(url).startsWith('https://serpapi.com/image?')) {
        return new Response(JSON.stringify({ image_id: 'temporary-image-id' }), { status: 200 });
      }
      if (String(url).startsWith('https://serpapi.com/search.json?')) {
        return new Response(JSON.stringify({
          visual_matches: [{
            title: 'Nike Air Max 95 Navy',
            link: 'https://shop.example.com/nike-air-max-95-navy',
            source: 'Example Shop',
            thumbnail: 'https://encrypted-tbn.example.com/nike-navy.jpg',
            price: { extracted_value: 129.99, currency: '€' },
          }],
        }), { status: 200 });
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await request(app)
        .post('/api/ayrovix/analyze-image')
        .attach('image', PNG_1PX, { filename: 'sneakers.png', contentType: 'image/png' });
      expect(response.status).toBe(200);
      expect(response.body.data.candidates.length).toBeGreaterThan(0);
      expect(response.body.data.candidates[0].title).toContain('Nike Air Max 95');
      expect(response.body.data.candidates[0].price).toBe(129.99);
      expect(response.body.data.identification.description).toContain('Nike');
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previousAnthropic);
      restoreEnv('SERPAPI_KEY', previousSerp);
    }
  });

  test('Claude lit le prix visible dans la même requête structurée que Vision', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-price';
    const fetchMock = stubAnthropic(JSON.stringify({
      input_kind: 'product_screenshot', category: 'handbag', brand: 'Zara', model: null,
      color: ['black'], visible_text: ['49.99 EUR'], possible_model_codes: [],
      description: 'Sac à main noir.', confidence: 0.88,
      detected_price: { amount: 49.99, currency: 'EUR', label: 'product_price', confidence: 0.96 },
    }));
    try {
      const response = await request(app)
        .post('/api/ayrovix/analyze-image')
        .attach('image', PNG_1PX, { filename: 'capture-produit.png', contentType: 'image/png' });
      expect(response.status).toBe(200);
      expect(response.body.data.detectedPrice).toMatchObject({
        sourcePrice: 49.99,
        sourceCurrency: 'EUR',
        isCartScreenshot: false,
      });
      expect(response.body.data.detectedPrice.totalPriceTND).toBeGreaterThan(0);
      expect(response.body.data.detectedPrice.priceToken).toMatch(/^[^.]+\.[^.]+$/);
      const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(requestBody.output_config.format.type).toBe('json_schema');
      const schemaJson = JSON.stringify(requestBody.output_config.format.schema);
      expect(schemaJson).not.toMatch(/"(?:minimum|maximum|minItems|maxItems|pattern|format)"/);
      expect(requestBody.tools).toBeUndefined();
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previousKey);
    }
  });

  test("un ancien prix barré n'est jamais accepté comme prix de commande", async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-old-price';
    stubAnthropic(JSON.stringify({
      input_kind: 'product_screenshot', category: 'shoes', brand: 'Nike', model: null,
      color: ['white'], visible_text: ['99.00 EUR'], possible_model_codes: [],
      description: 'Chaussures blanches.', confidence: 0.8,
      detected_price: { amount: 99, currency: 'EUR', label: 'old_price', confidence: 0.99 },
    }));
    try {
      const response = await request(app)
        .post('/api/ayrovix/analyze-image')
        .attach('image', PNG_1PX, { filename: 'ancien-prix.png', contentType: 'image/png' });
      expect(response.status).toBe(200);
      expect(response.body.data.detectedPrice).toBeNull();
      expect(response.body.data).not.toHaveProperty('ocrPrice');
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previousKey);
    }
  });

  test('SSRF : bloque les IP privées issues du DNS et accepte une résolution publique', async () => {
    expect(isUnsafeIpAddress('127.0.0.1')).toBe(true);
    expect(isUnsafeIpAddress('169.254.169.254')).toBe(true);
    expect(isUnsafeIpAddress('10.20.30.40')).toBe(true);
    expect(isUnsafeIpAddress('2606:4700:4700::1111')).toBe(false);

    await expect(resolveSafeHttpUrl('https://shop.example.org/product', async () => [
      { address: '127.0.0.1', family: 4 },
    ])).rejects.toMatchObject({ code: 'UNSAFE_URL' });

    const publicTarget = await resolveSafeHttpUrl('https://shop.example.org/product', async () => [
      { address: '1.1.1.1', family: 4 },
      { address: '2606:4700:4700::1111', family: 6 },
    ]);
    expect(publicTarget.addresses).toEqual(['1.1.1.1', '2606:4700:4700::1111']);
  });

  test('analyze-url : SSRF bloqué (localhost) et lien vide rejeté', async () => {
    const localhost = await request(app).post('/api/ayrovix/analyze-url').send({ url: 'http://localhost:3000/secret', channel: 'qr' });
    expect(localhost.status).toBe(400);
    expect(localhost.body.code).toBe('INVALID_URL');

    const empty = await request(app).post('/api/ayrovix/analyze-url').send({ url: '' });
    expect(empty.status).toBe(400);
  });

  test('analyze-url : rejette un domaine non résolvable avant tout scraping', async () => {
    const response = await request(app)
      .post('/api/ayrovix/analyze-url')
      .send({ url: 'https://produit-inexistant-ayrovix-test.invalid/page-produit' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('INVALID_URL');
  });

  test('Claude Web Search transforme les résultats officiels Anthropic en candidats', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousModel = process.env.ANTHROPIC_MODEL;
    const previousSearch = process.env.AYROVIX_AI_WEB_SEARCH;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-web-search';
    process.env.ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
    process.env.AYROVIX_AI_WEB_SEARCH = 'true';
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit = {}) => new Response(JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      content: [{
        type: 'web_search_tool_result',
        content: [
          { type: 'web_search_result', title: 'Nike Air Max 95 Navy Grey', url: 'https://stockx.com/nike-air-max-95-navy-grey' },
          { type: 'web_search_result', title: 'Nike Air Max 95 listing', url: 'https://www.ebay.com/itm/123' },
        ],
      }],
      usage: { server_tool_use: { web_search_requests: 1 } },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const results = await providerWebSearch('Nike Air Max 95 navy grey', 6, Date.now() + 2_000);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ source: 'StockX', kind: 'external' });
      expect(results[1].source).toBe('eBay');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(body.tools[0]).toMatchObject({ type: 'web_search_20250305', max_uses: 1 });
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previousKey);
      restoreEnv('ANTHROPIC_MODEL', previousModel);
      restoreEnv('AYROVIX_AI_WEB_SEARCH', previousSearch);
    }
  });

  test('QR texte exclut toute page Web Search sans prix et lien marchand exploitables', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousSearch = process.env.AYROVIX_AI_WEB_SEARCH;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-qr-search';
    process.env.AYROVIX_AI_WEB_SEARCH = 'true';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      content: [{ type: 'web_search_tool_result', content: [
        { type: 'web_search_result', title: 'Produit QR AYR-REF-2026', url: 'https://www.amazon.fr/dp/B000000001' },
      ] }],
      usage: { server_tool_use: { web_search_requests: 1 } },
    }), { status: 200, headers: { 'content-type': 'application/json' } })));
    try {
      const response = await request(app).post('/api/ayrovix/analyze-code').send({ value: 'AYR-REF-2026' });
      expect(response.status).toBe(200);
      expect(response.body.data.code).toBe('AYR-REF-2026');
      expect(response.body.data.candidates).not.toEqual(expect.arrayContaining([
        expect.objectContaining({ source: 'Amazon', kind: 'external' }),
      ]));
      for (const candidate of response.body.data.candidates) {
        expect(candidate.price).toBeGreaterThan(0);
        expect(candidate.sourceUrl).toMatch(/^https?:\/\//);
        expect(candidate.rating).toBeGreaterThan(0);
      }
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previousKey);
      restoreEnv('AYROVIX_AI_WEB_SEARCH', previousSearch);
    }
  });

  test('Claude Web Search respecte une deadline globale déjà presque épuisée', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousSearch = process.env.AYROVIX_AI_WEB_SEARCH;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-deadline';
    process.env.AYROVIX_AI_WEB_SEARCH = 'true';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const startedAt = Date.now();
      const result = await providerWebSearch('deadline-test', 6, Date.now() + 150);
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(Date.now() - startedAt).toBeLessThan(300);
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previousKey);
      restoreEnv('AYROVIX_AI_WEB_SEARCH', previousSearch);
    }
  });

  test('demande de revue : validation, persistance, déduplication et propriété de session', async () => {
    const sessionId = `lens-review-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const payload = {
      sourceUrl: 'https://shop.example.org/products/nike-air-max-95',
      title: 'Nike Air Max 95 Navy',
      imageUrl: 'https://cdn.example.org/nike.jpg',
      source: 'Example Shop',
      lensPrice: 149.99,
      lensCurrency: 'EUR',
      desiredSize: '41 EU',
      desiredColor: 'Navy',
      contact: '+216 20 123 456',
    };

    expect((await request(app).post('/api/ayrovix/review-request').send(payload)).status).toBe(400);
    expect((await request(app).post('/api/ayrovix/review-request').set('x-session-id', sessionId).send({ ...payload, contact: 'bad' })).body.code).toBe('CONTACT_REQUIRED');
    expect((await request(app).post('/api/ayrovix/review-request').set('x-session-id', sessionId).send({ ...payload, sourceUrl: 'http://127.0.0.1/private' })).body.code).toBe('INVALID_PRODUCT');

    const created = await request(app).post('/api/ayrovix/review-request').set('x-session-id', sessionId).send(payload);
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      status: 'PENDING', title: payload.title, sourceUrl: payload.sourceUrl,
      lensPrice: payload.lensPrice, lensCurrency: 'EUR', duplicate: false,
    });
    expect(created.body.data).not.toHaveProperty('contact');
    expect(created.body.data).not.toHaveProperty('adminNote');
    const id = created.body.data.id;
    expect(id).toMatch(/^ayx_review_/);

    const duplicate = await request(app).post('/api/ayrovix/review-request').set('x-session-id', sessionId).send(payload);
    expect(duplicate.status).toBe(200);
    expect(duplicate.body.data).toMatchObject({ id, duplicate: true });
    expect(db.get<any>('SELECT COUNT(*) count FROM ayrovix_review_requests WHERE id=?', id).count).toBe(1);

    const owned = await request(app).get(`/api/ayrovix/review-request/${id}`).set('x-session-id', sessionId);
    expect(owned.status).toBe(200);
    expect(owned.body.data.id).toBe(id);
    const isolated = await request(app).get(`/api/ayrovix/review-request/${id}`).set('x-session-id', `${sessionId}-other`);
    expect(isolated.status).toBe(404);

    const notification = db.get<any>('SELECT * FROM admin_notifications WHERE action_url LIKE ? ORDER BY created_at DESC', `%request=${id}%`);
    expect(notification).toMatchObject({ type: 'ORDER', title: 'Produit Lens à vérifier' });
  });

  test('administration des revues Lens : permissions, devis validé, audit et réponse publique sûre', async () => {
    const sessionId = `lens-admin-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const created = await request(app).post('/api/ayrovix/review-request').set('x-session-id', sessionId).send({
      sourceUrl: 'https://shop.example.org/products/admin-review', title: 'Produit à confirmer', source: 'Shop Test',
      lensPrice: 75, lensCurrency: 'EUR', desiredSize: 'M', contact: 'review@example.org',
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id;

    expect((await request(app).get('/api/admin/ayrovix-reviews')).status).toBe(401);
    const reviewer = request.agent(app);
    const login = await reviewer.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    const csrf = login.body.data.csrfToken;

    const queue = await reviewer.get('/api/admin/ayrovix-reviews?status=PENDING&search=Produit%20à%20confirmer');
    expect(queue.status).toBe(200);
    expect(queue.body.data.some((row: any) => row.id === id)).toBe(true);
    const invalidQuote = await reviewer.put(`/api/admin/ayrovix-reviews/${id}`).set('x-csrf-token', csrf).send({ status: 'QUOTED' });
    expect(invalidQuote.status).toBe(400);

    const quoted = await reviewer.put(`/api/admin/ayrovix-reviews/${id}`).set('x-csrf-token', csrf).send({
      status: 'QUOTED', quotedPrice: 389.5, quotedCurrency: 'TND', verifiedVariant: 'M · Noir · en stock',
      verifiedUrl: 'https://shop.example.org/products/admin-review?variant=m-black',
      customerMessage: 'Prix et stock confirmés pour la variante M noire.',
      adminNote: 'Vérifié manuellement par la fiche marchand.',
    });
    expect(quoted.status).toBe(200);
    expect(quoted.body.data).toMatchObject({ status: 'QUOTED', quoted_price: 389.5, quoted_currency: 'TND', verified_variant: 'M · Noir · en stock' });
    expect(db.get<any>('SELECT action,module FROM audit_logs WHERE entity_id=? ORDER BY created_at DESC', id)).toMatchObject({ action: 'STATUS_CHANGE', module: 'AYROVIX_REVIEWS' });

    const publicStatus = await request(app).get(`/api/ayrovix/review-request/${id}`).set('x-session-id', sessionId);
    expect(publicStatus.status).toBe(200);
    expect(publicStatus.body.data).toMatchObject({
      status: 'QUOTED', quotedPrice: 389.5, quotedCurrency: 'TND', verifiedVariant: 'M · Noir · en stock',
      customerMessage: 'Prix et stock confirmés pour la variante M noire.',
    });
    expect(publicStatus.body.data).not.toHaveProperty('adminNote');
    expect(JSON.stringify(publicStatus.body.data)).not.toContain('Vérifié manuellement');
  });

  test('analyze-barcode : validation stricte + réponse propre sans fournisseur de recherche', async () => {
    const invalid = await request(app).post('/api/ayrovix/analyze-barcode').send({ code: 'ABC-123' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('INVALID_BARCODE');

    const valid = await request(app).post('/api/ayrovix/analyze-barcode').send({ code: '619125062532' });
    expect(valid.status).toBe(200);
    expect(valid.body.data.code).toBe('619125062532');
    expect(Array.isArray(valid.body.data.candidates)).toBe(true); // vide sans clé Anthropic — jamais de résultat inventé
    expect(valid.body.data.eventId).toMatch(/^ayx_/);
    expect(db.get<any>('SELECT query FROM ayrovix_events WHERE id=?', valid.body.data.eventId).query).toBe('barcode:619125062532');
  });
});
