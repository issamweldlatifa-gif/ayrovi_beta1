import { afterEach, describe, expect, test, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { app, db } from '../src/server';
import { buildSearchQuery } from '../src/ayrovix/services/ai';
import { anthropicWebSearch, scoreCandidate } from '../src/ayrovix/services/search';
import { getAyrovixStats } from '../src/ayrovix/events';
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

  test('scoreCandidate : le code article domine, la marque pèse, le catalogue est trié', () => {
    const withCode = scoreCandidate({ ...NIKE_ID, possible_model_codes: ['DC9412-400'] }, 'Nike DC9412-400', { title: 'Air Max 95 DC9412-400 bleu', brand: 'Nike' });
    const weak = scoreCandidate(NIKE_ID, 'Nike Air Max 95 navy grey', { title: 'Sandales plage', brand: 'Autre' });
    expect(withCode).toBeGreaterThan(85);
    expect(weak).toBeLessThan(withCode);
    expect(weak).toBeGreaterThanOrEqual(0);
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
    const previousSearch = process.env.AYROVIX_ANTHROPIC_WEB_SEARCH;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-web-search';
    process.env.ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
    process.env.AYROVIX_ANTHROPIC_WEB_SEARCH = 'true';
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
      const results = await anthropicWebSearch('Nike Air Max 95 navy grey', 6, Date.now() + 2_000);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ source: 'StockX', kind: 'external' });
      expect(results[1].source).toBe('eBay');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
      expect(body.tools[0]).toMatchObject({ type: 'web_search_20250305', max_uses: 1 });
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previousKey);
      restoreEnv('ANTHROPIC_MODEL', previousModel);
      restoreEnv('AYROVIX_ANTHROPIC_WEB_SEARCH', previousSearch);
    }
  });

  test('QR texte utilise Claude Web Search via /analyze-code', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousSearch = process.env.AYROVIX_ANTHROPIC_WEB_SEARCH;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-qr-search';
    process.env.AYROVIX_ANTHROPIC_WEB_SEARCH = 'true';
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
      expect(response.body.data.candidates[0]).toMatchObject({ source: 'Amazon', kind: 'external' });
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previousKey);
      restoreEnv('AYROVIX_ANTHROPIC_WEB_SEARCH', previousSearch);
    }
  });

  test('Claude Web Search respecte une deadline globale déjà presque épuisée', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousSearch = process.env.AYROVIX_ANTHROPIC_WEB_SEARCH;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-deadline';
    process.env.AYROVIX_ANTHROPIC_WEB_SEARCH = 'true';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      const startedAt = Date.now();
      const result = await anthropicWebSearch('deadline-test', 6, Date.now() + 150);
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(Date.now() - startedAt).toBeLessThan(300);
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previousKey);
      restoreEnv('AYROVIX_ANTHROPIC_WEB_SEARCH', previousSearch);
    }
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
