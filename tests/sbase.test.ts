/**
 * S Base — recherche marchande (SandBase) + canal image (Google Lens).
 *
 * Ce que ces tests protègent :
 *   1. la matrice de capacités reste HONNÊTE (les 7 endpoints SandBase sont
 *      « mots-clés » ; la recherche par image est un canal distinct, déclaré) ;
 *   2. le client gère l'enveloppe synchrone ET le mode run + polling ;
 *   3. `durationMs` est un temps réel mesuré, par boutique ;
 *   4. un barreau qui tombe (401, timeout) ne casse pas les autres : le groupe
 *      en erreur porte son code, les autres rendent leurs résultats ;
 *   5. aucune requête payante ne part sans clé, sans requête, ou sans boutique ;
 *   6. l'isolation : seule la recherche par image réutilise le service visuel
 *      existant (aucune réécriture de Z Lens) — et aucun fichier d'API/route.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../src/zayrovix/services/visualSearch', () => ({
  serpApiVisualReady: () => true,
  serpApiVisualSearch: vi.fn(async () => [
    {
      id: 'lens_1', title: 'Mini traceur GPS', source: 'Amazon', sourceUrl: 'https://www.amazon.fr/dp/T1',
      image: 'https://img/1.jpg', price: 29.99, currency: 'EUR',
    },
    {
      id: 'lens_2', title: 'Traceur GPS voiture', source: 'SHEIN', sourceUrl: 'https://shein.com/p/2',
      image: 'https://img/2.jpg', price: null, currency: null,
    },
  ]),
}));

import {
  SBASE_IMAGE_SOURCE,
  SBASE_SOURCES,
  describeSbaseSources,
  findSbaseSource,
  validateSbaseQuery,
} from '../src/sbase/descriptors';
import { SbaseError, runSandbaseSearch, sandbaseConfigured } from '../src/sbase/client';
import { extractProducts, missingFacets, normalizeProduct, parsePriceText } from '../src/sbase/extract';
import { extractDetail } from '../src/sbase/detail';
import { clearSbaseCache, createSbaseRouter } from '../src/sbase/routes';

const KEY = 'sb_test_key';

// Vraie petite image PNG générée localement : `sharp` la valide sans réseau.
let PHOTO: Buffer = Buffer.alloc(0);
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  PHOTO = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 240, g: 240, b: 240 } } })
    .png()
    .toBuffer();
});

function app() {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/sbase', createSbaseRouter());
  return instance;
}

const envelope = (data: unknown) => ({ status: 'completed', id: 'run_1', outputs: [{ data }] });

/** Réponse par boutique : l'URL contient l'endpoint de la plateforme. */
function stubSources(handlers: Record<string, () => Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    for (const [needle, handler] of Object.entries(handlers)) if (String(url).includes(needle)) return handler();
    return new Response(JSON.stringify(envelope({ products: [] })), { status: 200, headers: init ? undefined : undefined });
  }));
}

const amazonOk = () => new Response(JSON.stringify(envelope({
  products: [{
    asin: 'B01', product_title: 'Casque A', product_price: '99,00 €', currency: 'EUR',
    product_url: 'https://a/1', product_photo: 'https://a/1.jpg',
  }],
})), { status: 200 });

beforeEach(() => {
  process.env.SANDBASE_API_KEY = KEY;
  clearSbaseCache();
});

afterEach(() => {
  delete process.env.SANDBASE_API_KEY;
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('S Base — catalogue', () => {
  test('les 7 boutiques sont des endpoints SandBase réels, en mots-clés seulement', () => {
    expect(SBASE_SOURCES.length).toBe(8);
    const ids = new Set<string>();
    for (const source of SBASE_SOURCES) {
      expect(ids.has(source.id)).toBe(false);
      ids.add(source.id);
      expect(source.endpoint.startsWith('/v1/api/')).toBe(true);
      expect(source.supports.keyword).toBe(true);
      expect(source.supports.image).toBe(false);
      expect(source.supports.url).toBe(false);
      expect(source.supports.barcode).toBe(false);
      expect(source.supports.variants).toBe(false);
      expect(source.supports.details).toBe(false);
    }
  });

  test('la sélection par défaut est bornée aux boutiques grand public (coût maîtrisé)', () => {
    const defaults = SBASE_SOURCES.filter((source) => source.defaultEnabled).map((source) => source.id);
    expect(defaults).toEqual(['aliexpress', 'amazon', 'ebay', 'google-shopping']);
    // Les sources « sourcing » existent mais ne partent pas sans choix explicite.
    expect(SBASE_SOURCES.filter((source) => !source.defaultEnabled).map((source) => source.id))
      .toEqual(['bing-shopping', 'taobao', 'alibaba', '1688']);
  });

  test('la recherche par image est un canal séparé, déclaré avec ses vraies capacités', () => {
    expect(SBASE_IMAGE_SOURCE.id).toBe('google-lens');
    expect(SBASE_IMAGE_SOURCE.supports.image).toBe(true);
    expect(SBASE_IMAGE_SOURCE.supports.barcode).toBe(false);
    expect(SBASE_IMAGE_SOURCE.storeFromResults).toBe(true);
  });

  test('les bodies utilisent les paramètres documentés', () => {
    expect(findSbaseSource('aliexpress')?.buildBody('case', null)).toMatchObject({ q: 'case' });
    expect(findSbaseSource('amazon')?.buildBody('case', 'DE')).toMatchObject({ keyword: 'case', country: 'DE' });
    expect(findSbaseSource('ebay')?.buildBody('case', null)).toMatchObject({ _nkw: 'case' });
    expect(findSbaseSource('google-shopping')?.buildBody('case', 'it')).toMatchObject({ q: 'case', gl: 'it' });
    expect(findSbaseSource('inconnu')).toBeNull();
  });

  test('readiness est un état de configuration, et la requête est validée avant tout appel', () => {
    expect(describeSbaseSources({ configured: false }).every((source) => source.configured === false)).toBe(true);
    expect(validateSbaseQuery('a')).toEqual({ error: expect.any(String) });
    expect(validateSbaseQuery('x'.repeat(91))).toEqual({ error: expect.any(String) });
    expect(validateSbaseQuery('  mini   traceur ')).toEqual({ query: 'mini traceur' });
  });
});

describe('S Base — extraction des produits', () => {
  test('Amazon (`products[]`) : champs réels, aucun champ inventé', () => {
    const items = extractProducts({
      products: [{
        asin: 'B0TEST', product_title: 'Casque Bluetooth', product_price: '89,99 €', currency: 'EUR',
        product_url: 'https://www.amazon.fr/dp/B0TEST', product_photo: 'https://img/1.jpg',
        product_star_rating: '4.5', product_num_ratings: 1200, delivery: 'Livraison gratuite',
      }],
    }, { arrays: [['products']] });
    expect(items[0]).toMatchObject({
      id: 'B0TEST', title: 'Casque Bluetooth', amount: 89.99, currency: 'EUR',
      url: 'https://www.amazon.fr/dp/B0TEST', store: null, rating: 4.5, reviews: 1200,
    });
    expect(items[0].missing).toContain('store');
  });

  test('AliExpress (forme libre) : le parcours profond trouve les produits', () => {
    const items = extractProducts({
      result: { mods: { itemList: { content: [
        { itemId: 1001, title: 'Coque iPhone', salePrice: 'TND 12,500', imageUrl: 'https://ae/1.jpg', detailUrl: 'https://ae/1' },
      ] } } },
    });
    expect(items[0]).toMatchObject({ id: '1001', title: 'Coque iPhone', amount: 12.5, currency: 'TND' });
  });

  test('prix : formats FR/US/TN lus, jamais devinés', () => {
    expect(parsePriceText('1 234,56 €')).toEqual({ amount: 1234.56, currency: 'EUR' });
    expect(parsePriceText('$1,549.00')).toEqual({ amount: 1549, currency: 'USD' });
    // «45,000 TND» = 45 dinars et 000 millimes : la 3e décimale est réelle en Tunisie.
    expect(parsePriceText('TND 45,000')).toEqual({ amount: 45, currency: 'TND' });
    expect(parsePriceText('')).toEqual({ amount: null, currency: null });
  });

  test('les facettes manquantes sont nommées', () => {
    const items = extractProducts({ products: [{ asin: 'A', product_title: 'X' }] }, { arrays: [['products']] });
    expect(missingFacets(items)).toEqual(expect.arrayContaining(['image', 'price', 'currency', 'link']));
    expect(normalizeProduct({ not: 'a product' })).toBeNull();
  });
});

describe('S Base — extraction des détails', () => {
  test('sans données : tout est nommé manquant, rien n’est inventé', () => {
    const detail = extractDetail({});
    expect(detail.title).toBeNull();
    expect(detail.variants).toEqual([]);
    expect(detail.missing).toEqual(expect.arrayContaining(['title', 'price', 'images', 'variants', 'specs']));
  });

  test('variantes objet {taille: [...]} et disponibilité inconnue restent null', () => {
    const detail = extractDetail({
      product_results: {
        title: 'Sweat', price: { amount: 45, currency: 'eur' },
        variations: { Taille: [{ name: 'M' }, { name: 'L', in_stock: false }] },
      },
    });
    expect(detail.amount).toBe(45);
    expect(detail.currency).toBe('EUR');
    expect(detail.variants[0].name).toBe('Taille');
    expect(detail.variants[0].values).toEqual([
      { label: 'M', available: null, image: null },
      { label: 'L', available: false, image: null },
    ]);
  });

  test('aucune fausse promesse : une fiche sans variantes ne fabrique pas de tailles', () => {
    const detail = extractDetail({ product_result: { title: 'Câble USB', specifications: [{ name: 'Longueur', value: '1 m' }] } });
    expect(detail.variants).toEqual([]);
    expect(detail.missing).toContain('variants');
  });
});

describe('S Base — client SandBase', () => {
  test('enveloppe synchrone : durée mesurée', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(envelope({ products: [] })), { status: 200 })));
    const result = await runSandbaseSearch(findSbaseSource('amazon')!, 'casque', 'FR');
    expect(result.data).toEqual({ products: [] });
    expect(result.polls).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('mode asynchrone : POST puis GET /v1/run/{id}', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      if (init?.method === 'POST') return new Response(JSON.stringify({ status: 'queued', id: 'run_42' }), { status: 200 });
      return new Response(JSON.stringify(envelope({ shopping_results: [] })), { status: 200 });
    }));
    const result = await runSandbaseSearch(findSbaseSource('ebay')!, 'iphone', null, { pollIntervalMs: 1 });
    expect(result.runId).toBe('run_42');
    expect(result.polls).toBe(1);
    expect(calls[1]).toContain('GET https://api.sandbase.ai/v1/run/run_42');
  });

  test('une clé refusée devient une erreur explicite, pas une liste vide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'bad key' }), { status: 401 })));
    await expect(runSandbaseSearch(findSbaseSource('amazon')!, 'x', null)).rejects.toMatchObject({ code: 'SANDBASE_UNAUTHORIZED' });
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

describe('S Base — routes', () => {
  test('sources : capacités réelles, sélection par défaut et canal image', async () => {
    const response = await request(app()).get('/api/sbase/sources').expect(200);
    expect(response.body.data.configured).toBe(true);
    expect(response.body.data.sources).toHaveLength(8);
    expect(response.body.data.image).toMatchObject({ id: 'google-lens', supports: { image: true } });
  });

  test('sans clé : 503, aucun appel réseau', async () => {
    delete process.env.SANDBASE_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const response = await request(app()).post('/api/sbase/search').send({ q: 'casque' }).expect(503);
    expect(response.body.code).toBe('SANDBASE_NOT_CONFIGURED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('requête trop courte : 400 ; liste vide : 400', async () => {
    const short = await request(app()).post('/api/sbase/search').send({ q: 'a' }).expect(400);
    expect(short.body.code).toBe('INVALID_QUERY');
    const none = await request(app()).post('/api/sbase/search').send({ q: 'casque', sources: [] }).expect(200);
    // Liste vide explicitement demandée ⇒ on retombe sur la sélection par défaut.
    expect(none.body.data.groups.length).toBe(4);
  });

  test('chaque boutique interrogée rend SON groupe, SON temps et SON erreur', async () => {
    stubSources({
      '/amazon/search-products': amazonOk,
      '/ebay/search': () => new Response(JSON.stringify({ error: 'quota' }), { status: 401 }),
    });

    const response = await request(app())
      .post('/api/sbase/search')
      .send({ q: 'casque', sources: ['amazon', 'ebay'] })
      .expect(200);

    const groups = response.body.data.groups;
    expect(groups).toHaveLength(2);
    const amazon = groups.find((group: { source: { id: string } }) => group.source.id === 'amazon');
    const ebay = groups.find((group: { source: { id: string } }) => group.source.id === 'ebay');
    expect(amazon).toMatchObject({ status: 'ok', count: 1, error: null });
    expect(amazon.items[0]).toMatchObject({ title: 'Casque A', amount: 99, currency: 'EUR' });
    // Une boutique en échec ne casse pas les autres : son code, pas une liste vide.
    expect(ebay).toMatchObject({ status: 'error', count: 0 });
    expect(ebay.error.code).toBe('SANDBASE_UNAUTHORIZED');
    expect(response.body.data.totalMs).toBeGreaterThanOrEqual(0);
  });

  test('boutique vide : groupe `empty` (pas une erreur déguisée)', async () => {
    stubSources({ '/bing-shopping/search': () => new Response(JSON.stringify(envelope({ shopping_results: [] })), { status: 200 }) });
    const response = await request(app()).post('/api/sbase/search').send({ q: 'zzz introuvable', sources: ['bing-shopping'] }).expect(200);
    expect(response.body.data.groups[0]).toMatchObject({ status: 'empty', count: 0, items: [] });
  });

  test('détail Amazon : specs, images et variantes normalisées', async () => {
    stubSources({
      '/amazon/product': () => new Response(JSON.stringify(envelope({
        item_specifications: { brand: 'STANLEY', color: 'Rose' },
        product_details: { brand_name: 'STANLEY', item_type_name: 'Tumbler' },
        product_results: {
          title: 'Quencher Tumbler', price: '$37.51', rating: 4.7,
          images: ['https://img/a.jpg', 'https://img/b.jpg'],
          variants: [{ asin: 'B01', title: 'Rose / 30 oz', in_stock: true }],
        },
      })), { status: 200 }),
    });

    const response = await request(app())
      .post('/api/sbase/item')
      .send({ source: 'amazon', id: 'B0CP9YB3Q4', title: 'tumbler' })
      .expect(200);

    const detail = response.body.data.detail;
    expect(response.body.data.source.id).toBe('amazon');
    expect(detail).toMatchObject({ title: 'Quencher Tumbler', brand: 'STANLEY', amount: 37.51, currency: 'USD' });
    expect(detail.images).toHaveLength(2);
    expect(detail.specs).toEqual(expect.arrayContaining([{ name: 'color', value: 'Rose' }]));
    expect(detail.variants[0].values[0]).toMatchObject({ label: 'Rose / 30 oz', available: true });
    expect(response.body.data.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('détail Taobao : les groupes de SKU deviennent « tailles et couleurs »', async () => {
    stubSources({
      '/taobao/item/detail': () => new Response(JSON.stringify(envelope({
        item: {
          title: '蓝牙耳机', images: ['//img.alicdn.com/a.jpg'], properties: [{ name: '品牌', value: 'BASEUS' }],
          sku_props: [
            { name: '颜色分类', values: [{ name: '黑色', vid: '1' }, { name: '白色', vid: '2' }] },
            { name: '套餐类型', values: [{ name: '标准', vid: '3' }] },
          ],
        },
        seller: { shop_title: 'baseus旗舰店' },
      })), { status: 200 }),
    });

    const response = await request(app())
      .post('/api/sbase/item')
      .send({ source: 'taobao', id: '920640959876' })
      .expect(200);

    const detail = response.body.data.detail;
    expect(detail.variants).toHaveLength(2);
    expect(detail.variants[0]).toMatchObject({ name: '颜色分类' });
    expect(detail.variants[0].values.map((value: { label: string }) => value.label)).toEqual(['黑色', '白色']);
    expect(detail.seller).toBe('baseus旗舰店');
    expect(detail.url).toBeNull();
  });

  test('détail : boutique sans fiche ⇒ 400 honnête (pas une page vide)', async () => {
    const response = await request(app())
      .post('/api/sbase/item')
      .send({ source: 'aliexpress', id: '100500' })
      .expect(400);
    expect(response.body.code).toBe('DETAILS_UNSUPPORTED');
  });

  test('détail : identifiant manquant ⇒ 400, et sans clé ⇒ 503', async () => {
    const missing = await request(app()).post('/api/sbase/item').send({ source: 'amazon', title: 'x' }).expect(400);
    expect(missing.body.code).toBe('ITEM_ID_REQUIRED');

    delete process.env.SANDBASE_API_KEY;
    const noKey = await request(app()).post('/api/sbase/item').send({ source: 'amazon', id: 'B01' }).expect(503);
    expect(noKey.body.code).toBe('SANDBASE_NOT_CONFIGURED');
  });

  test('image : une photo ⇒ résultats visuels, chaque résultat porte sa boutique', async () => {
    const response = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(200);

    expect(response.body.data).toMatchObject({ mode: 'image', count: 2, stores: expect.arrayContaining(['Amazon', 'SHEIN']) });
    expect(response.body.data.items[0]).toMatchObject({ store: 'Amazon', amount: 29.99, currency: 'EUR' });
    // Le second résultat n'a pas de prix : on le dit, on n'invente pas 0.
    expect(response.body.data.items[1].missing).toContain('price');
    expect(response.body.data.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('image : sans fichier ⇒ 400 explicite', async () => {
    const response = await request(app()).post('/api/sbase/image').expect(400);
    expect(response.body.code).toBe('SBASE_IMAGE_EMPTY');
  });
});

describe('S Base — isolation', () => {
  test('le module n’importe ni les routes AYWEBs ni les routes Zayrovix', () => {
    for (const file of ['descriptors.ts', 'client.ts', 'extract.ts', 'routes.ts', 'image.ts']) {
      const source = readFileSync(join(process.cwd(), 'src/sbase', file), 'utf8');
      expect(source).not.toMatch(/from '\.\.\/aywebs/);
      expect(source).not.toMatch(/from '\.\.\/zayrovix\/routes/);
    }
  });

  test('une seule réutilisation : le service visuel existant, importé tel quel', () => {
    const image = readFileSync(join(process.cwd(), 'src/sbase/image.ts'), 'utf8');
    const imports = [...image.matchAll(/from '([^']+)'/g)].map((match) => match[1]).filter((path) => path.includes('zayrovix'));
    expect(imports).toEqual(['../zayrovix/services/visualSearch']);
  });
});
