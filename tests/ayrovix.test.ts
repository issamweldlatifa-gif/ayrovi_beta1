import { afterEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { app, db } from '../src/server';
import { buildSearchQuery } from '../src/ayrovix/services/ai';
import { scoreCandidate } from '../src/ayrovix/services/search';
import { getAyrovixStats } from '../src/ayrovix/events';
import type { AyrovixIdentification } from '../src/ayrovix/types';

/** PNG 1x1 minimal — multer valide le mimetype déclaré, pas le contenu. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const NIKE_ID: AyrovixIdentification = {
  category: 'sneakers',
  brand: 'Nike',
  model: 'Air Max 95',
  color: ['navy', 'grey'],
  visible_text: ['NIKE'],
  possible_model_codes: [],
  description: 'Baskets running bleu marine à bulle visible.',
  confidence: 0.9,
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

function stubClaude(text: string) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ content: [{ type: 'text', text }] }),
  })));
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
    process.env.ANTHROPIC_API_KEY = 'sk-test-ayrovix-suite-key-0123456789';
    stubClaude(JSON.stringify({
      category: 'sneakers', brand: 'Nike', model: 'Air Max 95',
      color: ['navy', 'grey'], visible_text: ['NIKE'], possible_model_codes: [],
      description: 'Baskets running bleu marine à bulle visible.', confidence: 0.9,
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

  test('analyze-url : SSRF bloqué (localhost) et lien vide rejeté', async () => {
    const localhost = await request(app).post('/api/ayrovix/analyze-url').send({ url: 'http://localhost:3000/secret', channel: 'qr' });
    expect(localhost.status).toBe(400);
    expect(localhost.body.code).toBe('INVALID_URL');

    const empty = await request(app).post('/api/ayrovix/analyze-url').send({ url: '' });
    expect(empty.status).toBe(400);
  });

  test('analyze-url : échec d\'extraction → 422 EXTRACTION_FAILED (fallback capture côté client)', async () => {
    // domaine volontairement inatteignable/invalide côté scraper → message propre, aucune donnée devinée
    const response = await request(app)
      .post('/api/ayrovix/analyze-url')
      .send({ url: 'https://produit-inexistant-ayrovix-test.invalid/page-produit' });
    expect([422, 500]).toContain(response.status);
    expect(response.body.code).toBe('EXTRACTION_FAILED');
    expect(response.body.error).toContain('Impossible');
  }, 30_000);
});
