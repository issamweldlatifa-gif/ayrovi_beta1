import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import express from 'express';
import { createAyrovixRouter } from '../src/ayrovix/routes';
import { SmartLinkScraper } from '../src/scraper/scraper';
import type { QatafoDatabase } from '../src/db/database';

/* La route /detect ne touche pas la base. Un routeur isolé évite d'initialiser
   le serveur global (et better-sqlite3) pour tester le contrat de découverte. */
const app = express();
app.use(express.json());
app.use('/api/ayrovix', createAyrovixRouter({} as QatafoDatabase, new SmartLinkScraper()));

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
    title: 'Baskets blanches Nike',
    link: 'https://www.zalando.fr/baskets-homme-AB1234.html',
    thumbnail: 'https://cdn.example.com/baskets.jpg',
    source: 'Zalando',
  },
  {
    title: 'Sweat à capuche jaune Adidas — 39.90 EUR',
    link: 'https://www.amazon.com/dp/B0ABC12345?th=1&psc=1&utm_source=lens',
    thumbnail: 'https://cdn.example.com/sweat.jpg',
    source: 'Amazon',
    price: { extracted_value: 39.9, currency: 'EUR' },
  },
  { title: 'Publication sneakers', link: 'https://www.instagram.com/p/ABC123/', thumbnail: 'https://cdn.example.com/social.jpg' },
  { title: 'Recherche Nike', link: 'https://www.amazon.com/s?k=nike', thumbnail: 'https://cdn.example.com/search.jpg' },
  { title: 'Collection homme', link: 'https://www.zalando.fr/collections/homme/', thumbnail: 'https://cdn.example.com/category.jpg' },
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

  test('ne renvoie que les fiches PRODUCT admises — aucun prix, aucune boîte, aucune lecture marchande', async () => {
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
        {
          name: 'Baskets blanches Nike', image: 'https://cdn.example.com/baskets.jpg',
          url: 'https://www.zalando.fr/baskets-homme-AB1234.html', source: 'Zalando',
        },
        {
          name: 'Sweat à capuche jaune Adidas', image: 'https://cdn.example.com/sweat.jpg',
          url: 'https://www.amazon.com/dp/B0ABC12345?th=1&psc=1', source: 'Amazon',
        },
      ]);
      expect(response.body.data.discovery).toEqual({ mode: 'PRODUCT_LINK_ADMISSION', merchantPagesRead: 0 });
      expect(response.body.data.excluded.count).toBe(3);
      expect(response.body.data.excluded.reasons).toMatchObject({
        SOCIAL_RESULT_NOT_PURCHASABLE: 1,
        AYWEBS_SEARCH: 1,
        NON_PRODUCT_CATEGORY: 1,
      });
      // Jamais de prix : il vient de la page marchande ouverte, pas de la photo.
      expect(JSON.stringify(matches)).not.toMatch(/price|39\.9/);
      // Seul SerpApi est contacté. Aucun lien de résultat n'est aspiré en lot.
      const urls = fetchMock.mock.calls.map(([url]) => String(url));
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.every((url) => url.includes('serpapi.com'))).toBe(true);
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
    // La route appelle SerpApi (France, Royaume-Uni, États-Unis), et rien d'autre.
    expect(routes).toContain('serpApiVisualSearch(small.data, 12, { countries: LENS_LIVE_SEARCH_COUNTRIES })');
  });
});
