import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { parseDetections } from '../src/ayrovix/services/ai';

/**
 * Z Lens mobile — `/api/ayrovix/detect` : noms + boîtes des produits visibles,
 * pour poser le cadre de sélection (le seul produit, ou le plus grand) et pour
 * le mode Live. Aucune recherche marchande sur ce chemin.
 */

/** PNG 1x1 minimal (même image que tests/ayrovix.test.ts). */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

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

/** Erreur HTTP au format de l'API Anthropic. */
function anthropicError(status: number, message: string): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Réponse en flux (SSE) d'Anthropic contenant `text`. */
function anthropicStream(text: string, model = 'claude-haiku-4-5-20251001'): Response {
  const events = [
    { type: 'message_start', message: { model, usage: { input_tokens: 12 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } },
    { type: 'content_block_stop', index: 0 },
    { type: 'message_delta', usage: { output_tokens: 40 } },
    { type: 'message_stop' },
  ];
  const body = events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/** Corps JSON envoyé à Anthropic par l'appel n° `index`. */
function sentBody(mock: ReturnType<typeof vi.fn>, index: number): Record<string, any> {
  const init = mock.mock.calls[index]?.[1] as RequestInit | undefined;
  return JSON.parse(String(init?.body || '{}'));
}

describe('Z Lens — détection des produits (/api/ayrovix/detect)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  test('exige une image et refuse les formats non image', async () => {
    const missing = await request(app).post('/api/ayrovix/detect');
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('IMAGE_REQUIRED');

    const wrongType = await request(app)
      .post('/api/ayrovix/detect')
      .attach('image', Buffer.from('plain text'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(wrongType.status).toBe(415);
    expect(wrongType.body.code).toBe('UNSUPPORTED_IMAGE');
  });

  test('sans fournisseur vision configuré → 503 AYROVIX_UNAVAILABLE', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = '';
    try {
      const response = await request(app)
        .post('/api/ayrovix/detect')
        .attach('image', PNG_1PX, { filename: 'tenue.png', contentType: 'image/png' });
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('AYROVIX_UNAVAILABLE');
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previous);
    }
  });

  test('renvoie uniquement noms, catégories et boîtes normalisées — aucun prix, aucune recherche marchande', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-detect';
    const fetchMock = stubAnthropic(JSON.stringify({
      products: [
        { name: 'Sweat à capuche jaune', category: 'clothing', box: [0.12, 0.17, 0.74, 0.29] },
        { name: 'Jogging jaune', category: 'clothing', box: [0.34, 0.43, 0.4, 0.3] },
        { name: 'Baskets blanches', category: 'shoes', box: [0.33, 0.62, 0.4, 0.21] },
      ],
    }));
    try {
      const response = await request(app)
        .post('/api/ayrovix/detect')
        .attach('image', PNG_1PX, { filename: 'tenue.png', contentType: 'image/png' });
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const { products, width, height } = response.body.data;
      expect(width).toBe(1);
      expect(height).toBe(1);
      expect(products).toEqual([
        { name: 'Sweat à capuche jaune', category: 'clothing', box: [0.12, 0.17, 0.74, 0.29] },
        { name: 'Jogging jaune', category: 'clothing', box: [0.34, 0.43, 0.4, 0.3] },
        { name: 'Baskets blanches', category: 'shoes', box: [0.33, 0.62, 0.4, 0.21] },
      ]);
      // Un seul appel : le fournisseur vision. Ni SerpApi, ni page marchande.
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.some((url) => url.includes('serpapi.com'))).toBe(false);
      expect(urls.filter((url) => url.includes('anthropic.com'))).toHaveLength(1);
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previous);
    }
  });

  test('compte IA sans crédit → 422 avec un diagnostic court, sans relance inutile', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-detect';
    const fetchMock = vi.fn(async () => anthropicError(400, 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await request(app)
        .post('/api/ayrovix/detect')
        .attach('image', PNG_1PX, { filename: 'tenue.png', contentType: 'image/png' });
      expect(response.status).toBe(422);
      expect(response.body.code).toBe('DETECTION_FAILED');
      expect(response.body.reason).toBe('structured:billing');
      expect(typeof response.body.model).toBe('string');
      // Le corps brut du fournisseur ne sort jamais.
      expect(JSON.stringify(response.body)).not.toMatch(/credit balance|Plans & Billing/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previous);
    }
  });

  test('modèle configuré introuvable → relance JSON avec le modèle de secours → produits', async () => {
    const previousKey = process.env.ANTHROPIC_API_KEY;
    const previousModel = process.env.ANTHROPIC_MODEL;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-detect';
    process.env.ANTHROPIC_MODEL = 'claude-retired-test-model';
    const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body || '{}'));
      if (body.model === 'claude-retired-test-model') return anthropicError(404, 'model: claude-retired-test-model');
      return anthropicStream('Voici : {"products":[{"name":"Baskets blanches","category":"shoes","box":[0.3,0.6,0.4,0.2]}]} (fin)');
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await request(app)
        .post('/api/ayrovix/detect')
        .attach('image', PNG_1PX, { filename: 'tenue.png', contentType: 'image/png' });
      expect(response.status).toBe(200);
      expect(response.body.data.products).toEqual([
        { name: 'Baskets blanches', category: 'shoes', box: [0.3, 0.6, 0.4, 0.2] },
      ]);
      // 1) structuré sur le modèle configuré (404) ; 2) relance sans schéma, en flux, modèle configuré (404) ; 3) modèle de secours.
      expect(sentBody(fetchMock, 0).output_config).toBeDefined();
      expect(sentBody(fetchMock, 1).output_config).toBeUndefined();
      expect(sentBody(fetchMock, 1).stream).toBe(true);
      expect(sentBody(fetchMock, 2).model).toBe('claude-haiku-4-5-20251001');
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previousKey);
      restoreEnv('ANTHROPIC_MODEL', previousModel);
    }
  });

  test('deux réponses illisibles → 422 avec le code de chaque tentative', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-detect';
    const fetchMock = vi.fn(async (_url: string, init: RequestInit = {}) => {
      const body = JSON.parse(String(init.body || '{}'));
      if (body.stream) return anthropicStream('Je ne vois aucun produit.');
      return new Response(JSON.stringify({ content: [{ type: 'text', text: '' }] }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      const response = await request(app)
        .post('/api/ayrovix/detect')
        .attach('image', PNG_1PX, { filename: 'tenue.png', contentType: 'image/png' });
      expect(response.status).toBe(422);
      expect(response.body.reason).toBe('structured:empty_output;json:parse_no_json');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      restoreEnv('ANTHROPIC_API_KEY', previous);
    }
  });

  test('a son propre compteur : Live ne consomme pas le quota des recherches', () => {
    const server = fs.readFileSync(path.resolve(__dirname, '../src/server.ts'), 'utf8');
    expect(server).toContain("rateLimit('ayrovix-detect'");
    expect(server).toContain("rateLimit('ayrovix-detect-daily'");
    expect(server).toContain("req.path === '/detect'");
    expect(server).toContain('AYROVIX_DETECT_DAILY_LIMIT');
  });
});

describe('parseDetections', () => {
  test('ramène des pixels à 0..1 et convertit des coins [x1, y1, x2, y2]', () => {
    const pixels = parseDetections(JSON.stringify({
      products: [{ name: 'Sac', category: 'bags', box: [100, 200, 300, 200] }],
    }), { width: 1000, height: 800 });
    expect(pixels).toEqual([{ name: 'Sac', category: 'bags', box: [0.1, 0.25, 0.3, 0.25] }]);

    const corners = parseDetections(JSON.stringify({
      products: [{ name: 'Montre', category: 'accessories', box: [0.5, 0.6, 0.9, 0.95] }],
    }));
    expect(corners[0].box).toEqual([0.5, 0.6, 0.4, 0.35]);
  });

  test('écarte le bruit, les doublons, les boîtes invalides et borne à 8 produits', () => {
    const many = Array.from({ length: 12 }, (_, index) => ({
      name: `Produit ${index}`, category: 'other', box: [0.02 + (index % 4) * 0.24, 0.02 + Math.floor(index / 4) * 0.3, 0.2, 0.25],
    }));
    const result = parseDetections(JSON.stringify({
      products: [
        { name: 'Bruit', category: 'other', box: [0.5, 0.5, 0.01, 0.01] },
        { name: '', category: 'other', box: [0.1, 0.1, 0.5, 0.5] },
        { name: 'Sans boîte', category: 'other', box: [] },
        { name: 'Négatif', category: 'other', box: [-0.2, 0.1, 0.5, 0.5] },
        { name: 'T-shirt', category: 'clothing', box: [0.1, 0.1, 0.5, 0.5] },
        { name: 'T-shirt (doublon)', category: 'clothing', box: [0.1, 0.1, 0.51, 0.5] },
        ...many,
      ],
    }));
    expect(result).toHaveLength(8);
    expect(result[0]).toEqual({ name: 'T-shirt', category: 'clothing', box: [0.1, 0.1, 0.5, 0.5] });
    expect(result.map((item) => item.name)).not.toContain('Bruit');
    expect(result.map((item) => item.name)).not.toContain('T-shirt (doublon)');
  });

  test('tableau nu, texte autour (avec accolades) et réponse tronquée', () => {
    const bare = parseDetections('[{"name":"Sac","category":"bags","box":[0.1,0.2,0.3,0.4]}]');
    expect(bare).toEqual([{ name: 'Sac', category: 'bags', box: [0.1, 0.2, 0.3, 0.4] }]);

    const chatty = parseDetections('Voici {le résultat} :\n{"products":[{"name":"Lunettes","category":"accessories","box":[0.4,0.1,0.2,0.1]}]}\nNote : {aucune marque}.');
    expect(chatty.map((item) => item.name)).toEqual(['Lunettes']);

    const cut = parseDetections('{"products":[{"name":"Sweat","category":"clothing","box":[0.1,0.1,0.6,0.3]},{"name":"Jogging","category":"clothing","box":[0.2,0.45,0.5,0.3]},{"name":"Bask');
    expect(cut.map((item) => item.name)).toEqual(['Sweat', 'Jogging']);

    expect(() => parseDetections('')).toThrow(/vide/);
    expect(() => parseDetections('{"products":[{"name":"A",')).toThrow(/invalide/);
  });

  test('catégorie inconnue → other ; réponse illisible → erreur explicite', () => {
    expect(parseDetections('```json\n{"products":[{"name":"Lampe","category":"furniture","box":[0.2,0.2,0.4,0.5]}]}\n```')[0].category).toBe('other');
    expect(parseDetections('{"products":[]}')).toEqual([]);
    expect(() => parseDetections('pas de JSON')).toThrow(/inexploitable/);
  });
});
