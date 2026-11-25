/**
 * S Base — banc d'essai SandBase (marchand, indépendant d'AYWEBs et de Z Lens).
 *
 * Ce que ces tests protègent :
 *   1. la matrice de capacités est HONNÊTE (aucune image/URL/code-barres promis) ;
 *   2. le client SandBase gère l'enveloppe synchrone ET le mode run + polling ;
 *   3. `durationMs` est un temps réel mesuré, jamais une constante ;
 *   4. les routes disent la vérité : 503 sans clé, 404 source inconnue, 400 requête
 *      trop courte — et jamais de résultat inventé ;
 *   5. le module reste ISOLÉ : aucun import d'AYWEBs ni de Zayrovix.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  SBASE_SOURCES,
  describeSbaseSources,
  findSbaseSource,
  validateSbaseQuery,
} from '../src/sbase/descriptors';
import { SbaseError, runSandbaseSearch, sandbaseConfigured } from '../src/sbase/client';
import { extractProducts, missingFacets, normalizeProduct, parsePriceText } from '../src/sbase/extract';
import { clearSbaseCache, createSbaseRouter } from '../src/sbase/routes';

const KEY = 'sb_test_key';

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/sbase', createSbaseRouter());
  return instance;
}

const envelope = (data: unknown) => ({ status: 'completed', id: 'run_1', outputs: [{ data }] });

beforeEach(() => {
  process.env.SANDBASE_API_KEY = KEY;
  clearSbaseCache();
});

afterEach(() => {
  delete process.env.SANDBASE_API_KEY;
  vi.unstubAllGlobals();
});

describe('S Base — catalogue de sources', () => {
  test('chaque source est un endpoint SandBase réel, et la matrice ne promet que le vrai', () => {
    expect(SBASE_SOURCES.length).toBeGreaterThanOrEqual(6);
    const ids = new Set<string>();
    for (const source of SBASE_SOURCES) {
      expect(ids.has(source.id)).toBe(false);
      ids.add(source.id);
      expect(source.endpoint.startsWith('/v1/api/')).toBe(true);
      expect(source.supports.keyword).toBe(true);
      // v1 = recherche par mots-clés uniquement : rien d'autre n'est exposé.
      expect(source.supports.image).toBe(false);
      expect(source.supports.url).toBe(false);
      expect(source.supports.barcode).toBe(false);
      expect(source.supports.variants).toBe(false);
      expect(source.supports.details).toBe(false);
      expect(source.fields.length).toBeGreaterThan(0);
    }
  });

  test('les endpoints sont ceux de la documentation publiée', () => {
    expect(findSbaseSource('aliexpress')?.endpoint).toBe('/v1/api/aliexpress/search/products');
    expect(findSbaseSource('amazon')?.endpoint).toBe('/v1/api/amazon/search-products');
    expect(findSbaseSource('ebay')?.endpoint).toBe('/v1/api/ebay/search');
    expect(findSbaseSource('google-shopping')?.endpoint).toBe('/v1/api/google-shopping/search');
    expect(findSbaseSource('bing-shopping')?.endpoint).toBe('/v1/api/bing-shopping/search');
    expect(findSbaseSource('taobao')?.endpoint).toBe('/v1/api/taobao/search/items');
    expect(findSbaseSource('inconnu')).toBeNull();
  });

  test('le corps envoyé utilise les paramètres documentés de chaque plateforme', () => {
    expect(findSbaseSource('aliexpress')?.buildBody('case', null)).toMatchObject({ q: 'case' });
    expect(findSbaseSource('amazon')?.buildBody('case', 'DE')).toMatchObject({ keyword: 'case', country: 'DE' });
    expect(findSbaseSource('ebay')?.buildBody('case', null)).toMatchObject({ _nkw: 'case' });
    expect(findSbaseSource('google-shopping')?.buildBody('case', 'it')).toMatchObject({ q: 'case', gl: 'it' });
    expect(findSbaseSource('bing-shopping')?.buildBody('case', 'gb')).toMatchObject({ q: 'case', cc: 'gb' });
  });

  test('readiness est un état de configuration, pas un résultat de test', () => {
    expect(describeSbaseSources({ configured: false }).every((source) => source.configured === false)).toBe(true);
    expect(describeSbaseSources({ configured: true }).every((source) => source.configured === true)).toBe(true);
  });

  test('la requête est validée avant tout appel payant', () => {
    expect(validateSbaseQuery('a')).toEqual({ error: expect.any(String) });
    expect(validateSbaseQuery('   ')).toEqual({ error: expect.any(String) });
    expect(validateSbaseQuery('x'.repeat(91))).toEqual({ error: expect.any(String) });
    expect(validateSbaseQuery('  casque   bluetooth ')).toEqual({ query: 'casque bluetooth' });
  });
});

describe('S Base — extraction des produits', () => {
  test('Amazon (`products[]`) : champs réels, aucun champ inventé', () => {
    const items = extractProducts({
      country: 'FR',
      products: [{
        asin: 'B0TEST', product_title: 'Casque Bluetooth', product_price: '89,99 €', currency: 'EUR',
        product_url: 'https://www.amazon.fr/dp/B0TEST', product_photo: 'https://img/1.jpg',
        product_star_rating: '4.5', product_num_ratings: 1200, delivery: 'Livraison gratuite',
      }],
    }, { arrays: [['products']] });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'B0TEST', title: 'Casque Bluetooth', amount: 89.99, currency: 'EUR',
      url: 'https://www.amazon.fr/dp/B0TEST', store: null, rating: 4.5, reviews: 1200,
    });
    expect(items[0].missing).toContain('store');
  });

  test('Google/Bing (`shopping_results[]`) : prix + vendeur', () => {
    const items = extractProducts({
      shopping_results: [{ title: 'Écouteurs', price: '$14.99', extracted_price: 14.99, source: 'Target', thumbnail: 'https://i/t.jpg', product_id: 'p1' }],
    }, { arrays: [['shopping_results']] });
    expect(items[0]).toMatchObject({ title: 'Écouteurs', amount: 14.99, currency: 'USD', store: 'Target', id: 'p1' });
  });

  test('AliExpress (forme libre) : le parcours profond trouve les produits sans schéma connu', () => {
    const items = extractProducts({
      result: { mods: { itemList: { content: [
        { itemId: 1001, title: 'Coque iPhone', salePrice: 'TND 12,500', imageUrl: 'https://ae/1.jpg', detailUrl: 'https://ae/1' },
      ] } } },
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: '1001', title: 'Coque iPhone', amount: 12.5, currency: 'TND' });
  });

  test('prix : formats FR/US/CN sont lus, jamais devinés', () => {
    expect(parsePriceText('1 234,56 €')).toEqual({ amount: 1234.56, currency: 'EUR' });
    expect(parsePriceText('$1,549.00')).toEqual({ amount: 1549, currency: 'USD' });
    // «45,000 TND» = 45 dinars et 000 millimes — la 3e décimale est réelle en Tunisie.
    expect(parsePriceText('TND 45,000')).toEqual({ amount: 45, currency: 'TND' });
    expect(parsePriceText('')).toEqual({ amount: null, currency: null });
  });

  test('les facettes manquantes sont nommées (pas de valeur de remplacement)', () => {
    const items = extractProducts({ products: [{ asin: 'A', product_title: 'X' }] }, { arrays: [['products']] });
    expect(missingFacets(items)).toEqual(expect.arrayContaining(['image', 'price', 'currency', 'link']));
    expect(normalizeProduct({ not: 'a product' })).toBeNull();
  });
});

describe('S Base — client SandBase', () => {
  test('enveloppe synchrone : durée mesurée, data extraite', async () => {
    const started = Date.now();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(envelope({ products: [] })), { status: 200 })));
    const result = await runSandbaseSearch(findSbaseSource('amazon')!, 'casque', 'FR');
    expect(result.data).toEqual({ products: [] });
    expect(result.polls).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  test('mode asynchrone : POST puis GET /v1/run/{id} jusqu’à completed', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (init?.method === 'POST') {
        return new Response(JSON.stringify({ status: 'queued', id: 'run_42' }), { status: 200 });
      }
      return new Response(JSON.stringify(envelope({ shopping_results: [] })), { status: 200 });
    }));
    const result = await runSandbaseSearch(findSbaseSource('ebay')!, 'iphone', null, { pollIntervalMs: 1 });
    expect(result.runId).toBe('run_42');
    expect(result.polls).toBe(1);
    expect(result.async).toBe(true);
    expect(calls[0]).toContain('POST https://api.sandbase.ai/v1/api/ebay/search');
    expect(calls[1]).toContain('GET https://api.sandbase.ai/v1/run/run_42');
  });

  test('une clé refusée devient une erreur explicite, pas une liste vide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'bad key' }), { status: 401 })));
    await expect(runSandbaseSearch(findSbaseSource('amazon')!, 'x', null)).rejects.toMatchObject({
      code: 'SANDBASE_UNAUTHORIZED',
    });
  });

  test('sans clé, le client refuse AVANT tout appel réseau', async () => {
    delete process.env.SANDBASE_API_KEY;
    expect(sandbaseConfigured()).toBe(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(runSandbaseSearch(findSbaseSource('amazon')!, 'x', null)).rejects.toBeInstanceOf(SbaseError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('S Base — routes publiques', () => {
  test('sources : la capacité réelle et la readiness sortent telles quelles', async () => {
    const response = await request(app()).get('/api/sbase/sources').expect(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.configured).toBe(true);
    const aliexpress = response.body.data.sources.find((source: { id: string }) => source.id === 'aliexpress');
    expect(aliexpress.supports).toMatchObject({ keyword: true, image: false, barcode: false });
  });

  test('sans clé : 503 explicite, et jamais de faux résultats', async () => {
    delete process.env.SANDBASE_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const response = await request(app()).post('/api/sbase/search').send({ source: 'amazon', q: 'casque' }).expect(503);
    expect(response.body).toMatchObject({ success: false, code: 'SANDBASE_NOT_CONFIGURED' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('source inconnue / requête trop courte : 404 et 400', async () => {
    await request(app()).post('/api/sbase/search').send({ source: 'zara', q: 'casque' }).expect(404);
    const short = await request(app()).post('/api/sbase/search').send({ source: 'amazon', q: 'a' }).expect(400);
    expect(short.body.code).toBe('INVALID_QUERY');
  });

  test('recherche réussie : durée réelle + champs manquants + cache explicite', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(envelope({
      products: [
        { asin: 'B01', product_title: 'Casque A', product_price: '99,00 €', currency: 'EUR', product_url: 'https://a/1', product_photo: 'https://a/1.jpg' },
        { asin: 'B02', product_title: 'Casque B', product_price: '129,00 €', currency: 'EUR', product_url: 'https://a/2', product_photo: 'https://a/2.jpg' },
      ],
    })), { status: 200 })));

    const first = await request(app()).post('/api/sbase/search').send({ source: 'amazon', q: 'casque', market: 'fr' }).expect(200);
    expect(first.body.data.status).toBe('ok');
    expect(first.body.data.count).toBe(2);
    expect(first.body.data.durationMs).toBeGreaterThanOrEqual(0);
    expect(first.body.data.cached).toBe(false);
    expect(first.body.data.missingFields).toContain('store');
    expect(first.body.data.items[0]).toMatchObject({ title: 'Casque A', amount: 99, currency: 'EUR' });

    const second = await request(app()).post('/api/sbase/search').send({ source: 'amazon', q: 'casque', market: 'fr' }).expect(200);
    expect(second.body.data.cached).toBe(true);
    expect(second.body.data.durationMs).toBe(first.body.data.durationMs);
  });

  test('résultat vide : status `empty` (pas une erreur déguisée)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(envelope({ shopping_results: [] })), { status: 200 })));
    const response = await request(app()).post('/api/sbase/search').send({ source: 'bing-shopping', q: 'zzzz introuvable' }).expect(200);
    expect(response.body.data).toMatchObject({ status: 'empty', count: 0, items: [] });
  });
});

describe('S Base — isolation', () => {
  test('le module n’importe ni AYWEBs ni Zayrovix', () => {
    for (const file of ['descriptors.ts', 'client.ts', 'extract.ts', 'routes.ts']) {
      const source = readFileSync(join(process.cwd(), 'src/sbase', file), 'utf8');
      expect(source).not.toMatch(/from '\.\.\/aywebs/);
      expect(source).not.toMatch(/from '\.\.\/zayrovix/);
      expect(source).not.toMatch(/api\.sandbase\.ai\/v1\/run.*recherche unifiée/i);
    }
  });
});
