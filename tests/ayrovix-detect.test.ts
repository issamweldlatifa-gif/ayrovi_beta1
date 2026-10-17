import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { app } from '../src/server';

/**
 * Z Lens mobile — `/api/ayrovix/detect` : ce que la photo fait RESSEMBLER.
 *
 * 17/10/2026 : SerpApi EST l'entrée de la reconnaissance visuelle. Il rend
 * des PAGES ressemblantes (titre, vignette, lien, marchand) — PAS de boîtes :
 * le cadre de sélection reste donc manuel. Aucun prix ici : le prix vient de
 * la page marchande, quand on l'ouvre.
 */

/** PNG 1x1 minimal (même image que tests/ayrovix.test.ts). */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

/**
 * Une AUTRE image que PNG_1PX : la recherche visuelle met en cache par empreinte
 * de l'image (10 min), deux tests sur la même image ne verraient qu'un seul
 * appel à SerpApi.
 */
async function otherPixel(): Promise<Buffer> {
  return sharp({ create: { width: 3, height: 2, channels: 3, background: '#c03030' } }).png().toBuffer();
}

/**
 * Double de SerpApi : l'upload de l'image puis la recherche Google Lens.
 * `visual` = les correspondances rendues par le moteur.
 */
function stubSerpApiVisual(visual: unknown, options: { fail?: 'timeout' } = {}) {
  const mock = vi.fn(async (url: string) => {
    const target = String(url);
    if (target.includes('/image')) {
      return new Response(JSON.stringify({ image_id: 'img_test_1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (options.fail === 'timeout') {
      throw Object.assign(new Error('The operation was aborted due to timeout'), { name: 'TimeoutError' });
    }
    return new Response(JSON.stringify({ visual_matches: visual }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

const VISUAL_MATCHES = [
  {
    title: 'Sweat à capuche jaune Adidas — 39.90 EUR',
    link: 'https://shop.test/sweat-jaune',
    thumbnail: 'https://cdn.test/sweat.jpg',
    source: 'Shop Test',
    price: { extracted_value: 39.9, currency: 'EUR' },
  },
  {
    title: 'Baskets blanches Nike',
    link: 'https://shop.test/baskets-blanches',
    thumbnail: 'https://cdn.test/baskets.jpg',
    source: 'Shop Test',
  },
];

describe('Z Lens — correspondances visuelles (/api/ayrovix/detect)', () => {
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

  test('sans clé SerpApi → 503 AYROVIX_UNAVAILABLE', async () => {
    const previous = process.env.SERPAPI_KEY;
    const previousAlias = process.env.SERPAPI_API_KEY;
    process.env.SERPAPI_KEY = '';
    process.env.SERPAPI_API_KEY = '';
    try {
      const response = await request(app)
        .post('/api/ayrovix/detect')
        .attach('image', PNG_1PX, { filename: 'tenue.png', contentType: 'image/png' });
      expect(response.status).toBe(503);
      expect(response.body.code).toBe('AYROVIX_UNAVAILABLE');
    } finally {
      restoreEnv('SERPAPI_KEY', previous);
      restoreEnv('SERPAPI_API_KEY', previousAlias);
    }
  });

  test('renvoie les correspondances visuelles (nom, vignette, lien, marchand) — aucun prix, aucune boîte', async () => {
    const previous = process.env.SERPAPI_KEY;
    process.env.SERPAPI_KEY = 'test-serpapi-detect';
    const fetchMock = stubSerpApiVisual(VISUAL_MATCHES);
    try {
      const response = await request(app)
        .post('/api/ayrovix/detect')
        .attach('image', PNG_1PX, { filename: 'tenue.png', contentType: 'image/png' });
      expect(response.status).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      const { products, matches, width, height } = response.body.data;
      expect(width).toBe(1);
      expect(height).toBe(1);
      // SerpApi ne rend pas de boîtes : le cadre reste manuel.
      expect(products).toEqual([]);
      expect(matches).toEqual([
        { name: 'Sweat à capuche jaune Adidas', image: 'https://cdn.test/sweat.jpg', url: 'https://shop.test/sweat-jaune', source: 'Shop Test' },
        { name: 'Baskets blanches Nike', image: 'https://cdn.test/baskets.jpg', url: 'https://shop.test/baskets-blanches', source: 'Shop Test' },
      ]);
      // Jamais de prix : il vient de la page marchande, pas de la photo.
      expect(JSON.stringify(matches)).not.toMatch(/price|39\.9/);
      // Un seul fournisseur : SerpApi. Jamais Anthropic.
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.some((url) => url.includes('serpapi.com'))).toBe(true);
      expect(urls.some((url) => url.includes('anthropic.com'))).toBe(false);
    } finally {
      restoreEnv('SERPAPI_KEY', previous);
    }
  });

  test('SerpApi en retard → 502 VISUAL_SEARCH_FAILED, avec le code du fournisseur', async () => {
    const previous = process.env.SERPAPI_KEY;
    process.env.SERPAPI_KEY = 'test-serpapi-detect';
    stubSerpApiVisual([], { fail: 'timeout' });
    try {
      const response = await request(app)
        .post('/api/ayrovix/detect')
        .attach('image', await otherPixel(), { filename: 'tenue.png', contentType: 'image/png' });
      expect(response.status).toBe(502);
      expect(response.body.code).toBe('VISUAL_SEARCH_FAILED');
      expect(response.body.providerCode).toBe('SERPAPI_TIMEOUT');
      // Le message client est en clair, jamais le corps du fournisseur.
      expect(typeof response.body.error).toBe('string');
      expect(response.body.error.length).toBeGreaterThan(10);
    } finally {
      restoreEnv('SERPAPI_KEY', previous);
    }
  });

  test('a son propre compteur : Live ne consomme pas le quota des recherches', () => {
    const server = fs.readFileSync(path.resolve(__dirname, '../src/server.ts'), 'utf8');
    expect(server).toContain("rateLimit('ayrovix-detect'");
    expect(server).toContain("rateLimit('ayrovix-detect-daily'");
    expect(server).toContain("req.path === '/detect'");
    expect(server).toContain('AYROVIX_DETECT_DAILY_LIMIT');
  });

  test('la vision Anthropic n’est plus dans le code de la détection', () => {
    const ai = fs.readFileSync(path.resolve(__dirname, '../src/ayrovix/services/ai.ts'), 'utf8');
    const routes = fs.readFileSync(path.resolve(__dirname, '../src/ayrovix/routes.ts'), 'utf8');
    expect(ai).not.toContain('export async function detectProducts');
    expect(ai).not.toContain('export function parseDetections');
    expect(routes).not.toContain('detectProducts(');
    // La route appelle SerpApi, et rien d'autre.
    expect(routes).toContain('serpApiVisualSearch(small.data, 12)');
  });
});
