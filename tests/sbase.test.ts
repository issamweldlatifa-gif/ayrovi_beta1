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
import { randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import {
  SBASE_IMAGE_SOURCE,
  SBASE_SOURCES,
  describeSbaseSources,
  findSbaseSource,
  validateSbaseQuery,
} from '../src/sbase/descriptors';
import { SbaseError, runSandbaseCall, runSandbaseSearch, sandbaseConfigured } from '../src/sbase/client';
import {
  APIFY_DETAIL_COST_USD,
  APIFY_IMAGE_BASE64_BUDGET,
  APIFY_IMAGE_COST_USD,
  APIFY_SEARCH_COST_USD,
  apifyConfigured,
  apifyImageBase64,
  apifyImageEndpoint,
  runApifyDetail,
  runApifySearch,
  searchApifyByImage,
} from '../src/sbase/apify';
import { extractProducts, missingFacets, normalizeProduct, parsePriceText } from '../src/sbase/extract';
import { extractDetail } from '../src/sbase/detail';
import { clearSbaseCache, createSbaseRouter } from '../src/sbase/routes';
import { sbaseImageFailureFrom } from '../src/sbase/image';

const KEY = 'sb_test_key';

// Vraie petite image PNG générée localement : `sharp` la valide sans réseau.
let PHOTO: Buffer = Buffer.alloc(0);
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  PHOTO = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 240, g: 240, b: 240 } } })
    .png()
    .toBuffer();
});

/**
 * Règles de prix RÉELLES du moteur (`services/pricing`) : S Base ne calcule
 * rien lui-même, il lui passe juste de quoi lire ses règles.
 */
const RULES = {
  id: 'test', version: 7,
  rateEUR: 3.4, rateUSD: 3.15, rateGBP: 4.0, rateJPY: 0.021,
  exchangeBufferPercent: 3,
  freightPerKgTND: 12, localDeliveryTND: 7,
  commissionPercent: 12, minimumCommissionTND: 8,
  rpdPercent: 1, rpdMinimumTND: 0.5,
  defaultTvaRate: 0.19, expressFeeTND: 25,
  categories: [],
  // CNY vient du marché (fxRates) ; on le fournit ici comme le ferait le sync.
  extraRates: { CNY: 0.43 },
  fxSource: 'live',
  updatedAt: new Date().toISOString(),
};

function app(options: { pricingRules?: unknown; photoProbe?: typeof fetch } = {}) {
  const instance = express();
  instance.use(express.json());
  instance.use('/api/sbase', createSbaseRouter({
    getPricingRules: () => (options.pricingRules === undefined ? (RULES as never) : (options.pricingRules as never)),
    /*
     * La sonde de publication est gratuite et locale : on la remplace pour que
     * les stubs `fetch` (qui simulent SandBase) ne soient pas consommés deux fois.
     * Son comportement réel est couvert juste en dessous.
     */
    photoProbe: options.photoProbe ?? (async () => new Response(Buffer.alloc(0), {
      status: 200,
      headers: { 'content-type': 'image/jpeg' },
    })),
  }));
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

/** Réponse 1688 telle que documentée (cross-border : titres traduits + MOQ). */
const devOk = () => new Response(JSON.stringify(envelope({
  items: [{
    item_id: 990347938140, title: 'Coque téléphone', price: '2.10', currency: 'CNY',
    img: 'https://cbu01.alicdn.com/a.jpg',
    product_url: 'https://detail.1688.com/offer/990347938140.html', moq: '1',
    shop_info: { company_name: 'Shenzhen X' },
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
  /*
   * Décision du 26/11/2026 : deux boutiques seulement (1688 + Alibaba.com), et
   * la recherche par image vient de 1688 elle-même — plus de SerpApi du tout.
   */
  test('une seule boutique : 1688 (Alibaba.com retirée)', () => {
    expect(SBASE_SOURCES.map((source) => source.id)).toEqual(['1688']);
    expect(findSbaseSource('alibaba')).toBeNull();
    for (const source of SBASE_SOURCES) {
      expect(source.endpoint.startsWith('/v1/api/')).toBe(true);
      expect(source.supports.keyword).toBe(true);
      expect(source.supports.barcode).toBe(false);
    }
    expect(findSbaseSource('amazon')).toBeNull();
    expect(findSbaseSource('google-lens')).toBeNull();
  });

  test('les capacités suivent la documentation, pas le désir', () => {
    const dev = findSbaseSource('1688')!;
    // 1688 : image, détails, module par URL, MOQ — tout est documenté.
    expect(dev.supports).toMatchObject({ image: true, details: true, url: true, variants: true });
    expect(dev.image?.endpoint).toBe('/v1/api/1688/search/cross-border-by-image');
    expect(dev.detail?.endpoint).toBe('/v1/api/1688/item/detail');
    expect(dev.detail?.byUrl?.endpoint).toBe('/v1/api/1688/item/detail-by-url');
    // Alibaba.com est retirée : aucun endpoint image ni détail n'était publié.
    expect(SBASE_SOURCES.some((source) => source.id === 'alibaba')).toBe(false);
  });

  test('la seule boutique part par défaut, et sa facture est dite', () => {
    expect(SBASE_SOURCES.filter((source) => source.defaultEnabled).map((source) => source.id)).toEqual(['1688']);
    expect(findSbaseSource('1688')).toMatchObject({ billedPerResult: false, costUsd: 0.014286 });
  });

  test('la recherche par image est celle de 1688, pas un service tiers', () => {
    expect(SBASE_IMAGE_SOURCE.id).toBe('1688');
    expect(SBASE_IMAGE_SOURCE.endpoint).toBe('/v1/api/1688/search/cross-border-by-image');
    expect(SBASE_IMAGE_SOURCE.supports.image).toBe(true);
    expect(SBASE_IMAGE_SOURCE.storeFromResults).toBe(false);
  });

  test('les bodies utilisent les paramètres documentés', () => {
    expect(findSbaseSource('1688')?.buildBody('case', null))
      // `page` عدد صحيح: النصّ كان يطيّح كل نداء (400 parameter validation).
      .toMatchObject({ keyword: 'case', language: 'en', page: 1, pageSize: 20 });
    expect(findSbaseSource('1688')?.image?.buildBody('https://x/y.jpg'))
      .toMatchObject({ imgUrl: 'https://x/y.jpg', language: 'en' });
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

  test('1688 cross-border : titre traduit, prix CNY, MOQ conservé', () => {
    const items = extractProducts({
      items: [{
        item_id: 990347938140, title: 'Phone case', title_origin: '手机壳',
        price: '2.10', currency: 'CNY', img: 'https://cbu01.alicdn.com/a.jpg',
        product_url: 'https://detail.1688.com/offer/990347938140.html', moq: '1',
        shop_info: { company_name: 'Shenzhen X' },
      }],
    }, { arrays: [['items']], storeFallback: '1688' });
    expect(items[0]).toMatchObject({
      id: '990347938140', title: 'Phone case', amount: 2.1, currency: 'CNY',
      moq: '1', store: '1688', seller: 'Shenzhen X', image: 'https://cbu01.alicdn.com/a.jpg',
    });
    expect(items[0].url).toBe('https://detail.1688.com/offer/990347938140.html');
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
    const result = await runSandbaseSearch(findSbaseSource('1688')!, 'casque', null);
    expect(result.data).toEqual({ products: [] });
    expect(result.async).toBe(false);
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
    // 1688 est synchrone selon la doc : on force l'hint async pour couvrir le polling.
    const result = await runSandbaseCall('/v1/api/1688/search/cross-border', { keyword: 'iphone' }, { pollIntervalMs: 1, asyncHint: true });
    expect(result.runId).toBe('run_42');
    expect(result.polls).toBe(1);
    expect(calls[1]).toContain('GET https://api.sandbase.ai/v1/run/run_42');
  });

  test('une clé refusée devient une erreur explicite, pas une liste vide', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'bad key' }), { status: 401 })));
    await expect(runSandbaseSearch(findSbaseSource('1688')!, 'x', null)).rejects.toMatchObject({ code: 'SANDBASE_UNAUTHORIZED' });
  });

  test('sans clé, le client refuse AVANT tout appel réseau', async () => {
    delete process.env.SANDBASE_API_KEY;
    expect(sandbaseConfigured()).toBe(false);
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await expect(runSandbaseSearch(findSbaseSource('1688')!, 'x', null)).rejects.toBeInstanceOf(SbaseError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('S Base — routes', () => {
  test('sources : capacités réelles, sélection par défaut et canal image', async () => {
    const response = await request(app()).get('/api/sbase/sources').expect(200);
    expect(response.body.data.configured).toBe(true);
    expect(response.body.data.sources).toHaveLength(1);
    expect(response.body.data.sources.map((source: { id: string }) => source.id)).toEqual(['1688']);
    // La photo part chez 1688 : le canal image n'est plus un service tiers.
    expect(response.body.data.image).toMatchObject({ id: '1688', supports: { image: true } });
  });

  test('sans clé : 503, aucun appel réseau', async () => {
    delete process.env.SANDBASE_API_KEY;
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const response = await request(app()).post('/api/sbase/search').send({ q: 'casque' }).expect(503);
    expect(response.body.code).toBe('SANDBASE_NOT_CONFIGURED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('requête trop courte : 400 ; liste vide ⇒ sélection par défaut', async () => {
    const short = await request(app()).post('/api/sbase/search').send({ q: 'a' }).expect(400);
    expect(short.body.code).toBe('INVALID_QUERY');
    const none = await request(app()).post('/api/sbase/search').send({ q: 'casque', sources: [] }).expect(200);
    // Liste vide explicitement demandée ⇒ on retombe sur la sélection par défaut.
    expect(none.body.data.groups.length).toBe(1);
  });

  test('chaque boutique interrogée rend SON groupe, SON temps et SON erreur', async () => {
    stubSources({ '/1688/search/cross-border': devOk });

    const response = await request(app())
      .post('/api/sbase/search')
      .send({ q: 'coque', sources: ['1688'] })
      .expect(200);

    const groups = response.body.data.groups;
    expect(groups).toHaveLength(1);
    const dev = groups[0];
    expect(dev).toMatchObject({ status: 'ok', count: 1, error: null });
    expect(dev.items[0]).toMatchObject({ title: 'Coque téléphone', amount: 2.1, currency: 'CNY', moq: '1' });
    expect(response.body.data.totalMs).toBeGreaterThanOrEqual(0);
  });

  test('boutique vide : groupe `empty` (pas une erreur déguisée)', async () => {
    stubSources({ '/1688/search/cross-border': () => new Response(JSON.stringify(envelope({ items: [] })), { status: 200 }) });
    const response = await request(app()).post('/api/sbase/search').send({ q: 'zzz introuvable', sources: ['1688'] }).expect(200);
    expect(response.body.data.groups[0]).toMatchObject({ status: 'empty', count: 0, items: [] });
  });

  test('détail 1688 : specs, SKU (tailles/couleurs), vendeur et prix CNY', async () => {
    stubSources({
      '/1688/item/detail': () => new Response(JSON.stringify(envelope({
        item_id: 1046925823679,
        currency: 'CNY',
        is_sold_out: false,
        price_info: { price: '1.20', price_min: '1.20', price_max: '1.60' },
        attribute: { propsList: [{ name: '芯片类型', value: '杰理' }, { name: '蓝牙版本', value: '5.3' }] },
        skus: [{ props_names: '黑色/标准', sale_price: '1.20', stock: 320 }],
        sku_props: [
          { prop_name: '颜色', values: [{ name: '黑色', vid: '1' }, { name: '白色', vid: '2' }] },
          { prop_name: '套餐', values: [{ name: '标准', vid: '3' }] },
        ],
        images: [{ fullPathImageURI: 'https://cbu01.alicdn.com/p1.jpg' }, { fullPathImageURI: 'https://cbu01.alicdn.com/p2.jpg' }],
        item: { title: '蓝牙耳机', companyName: '深圳市聚声源电子商务有限公司' },
      })), { status: 200 }),
    });

    const response = await request(app())
      .post('/api/sbase/item')
      .send({ source: '1688', id: '1046925823679' })
      .expect(200);

    const detail = response.body.data.detail;
    expect(response.body.data.source.id).toBe('1688');
    expect(detail).toMatchObject({
      title: '蓝牙耳机', amount: 1.2, currency: 'CNY', availability: 'in_stock',
      seller: '深圳市聚声源电子商务有限公司',
    });
    expect(detail.specs).toEqual(expect.arrayContaining([{ name: '蓝牙版本', value: '5.3' }]));
    expect(detail.variants).toHaveLength(2);
    expect(detail.variants[0]).toMatchObject({ name: '颜色' });
    expect(detail.variants[0].values.map((value: { label: string }) => value.label)).toEqual(['黑色', '白色']);
    // La fiche donne l'URL canonique du produit, pas le lien CDN d'image.
    expect(detail.url).toBe('https://detail.1688.com/offer/1046925823679.html');
    expect(detail.missing).not.toContain('variants');
  });

  test('détail 1688 par lien : sans identifiant, on utilise detail-by-url', async () => {
    stubSources({
      '/1688/item/detail-by-url': () => new Response(JSON.stringify(envelope({
        item_id: 857511694718, currency: 'CNY', moq: 1,
        price_info: { price_min: '1.20' },
        item: { title: 'Câble USB-C', companyName: 'Guangzhou Y' },
      })), { status: 200 }),
    });

    const response = await request(app())
      .post('/api/sbase/item')
      .send({ source: '1688', url: 'https://detail.1688.com/offer/857511694718.html' })
      .expect(200);

    expect(response.body.data.detail).toMatchObject({ title: 'Câble USB-C', seller: 'Guangzhou Y' });
    expect(response.body.data.detail.amount).toBe(1.2);
  });

  test('détail : boutique retirée ⇒ 404 explicite (pas une page vide)', async () => {
    // Alibaba.com a été retirée le 26/11/2026 : le contrat `DETAILS_UNSUPPORTED`
    // reste dans le code pour la prochaine source sans fiche, mais l'appelant
    // reçoit d'abord un refus clair sur une source qui n'existe plus.
    const response = await request(app())
      .post('/api/sbase/item')
      .send({ source: 'alibaba', id: '100500' })
      .expect(404);
    expect(response.body.code).toBe('UNKNOWN_SOURCE');
  });

  /*
   * 26/11/2026 — le prix TND vient du moteur de prix de la maison, jamais d'une
   * conversion improvisée côté app. Sans règles (ou devise non cotée) : null.
   */
  test('chaque résultat porte une estimation TND issue du moteur de prix', async () => {
    stubSources({ '/1688/search/cross-border': devOk });
    const response = await request(app())
      .post('/api/sbase/search')
      .send({ q: 'coque', sources: ['1688'] })
      .expect(200);

    const estimate = response.body.data.groups[0].items[0].priceEstimate;
    expect(estimate).toMatchObject({ currency: 'CNY', amount: 2.1 });
    // 2,10 CNY à 0,43 TND (×1,03 de marge de change) + fret + douane + TVA + service.
    expect(estimate.totalTND).toBeGreaterThan(estimate.productTND);
    expect(estimate.productTND).toBeCloseTo(2.1 * 0.43 * 1.03, 1);
    expect(estimate.rateTND).toBeCloseTo(0.4429, 3);
    expect(estimate.pricingVersion).toBe(7);
    // Sur une ligne de résultat, la livraison locale n'est pas comptée.
    expect(estimate.localDeliveryTND).toBe(0);
  });

  test('sans moteur de prix, l’estimation reste nulle — on n’invente pas un taux', async () => {
    stubSources({ '/1688/search/cross-border': devOk });
    const response = await request(app({ pricingRules: null }))
      .post('/api/sbase/search')
      .send({ q: 'coque', sources: ['1688'] })
      .expect(200);
    expect(response.body.data.groups[0].items[0].priceEstimate).toBeNull();
  });

  test('la fiche produit inclut la livraison locale dans son estimation', async () => {
    stubSources({
      '/1688/item/detail': () => new Response(JSON.stringify(envelope({
        item_id: 1046925823679, currency: 'CNY', price_info: { price: '10.00' },
        item: { title: 'Écouteurs', companyName: 'Shenzhen Z' },
      })), { status: 200 }),
    });
    const response = await request(app())
      .post('/api/sbase/item')
      .send({ source: '1688', id: '1046925823679' })
      .expect(200);
    const estimate = response.body.data.detail.priceEstimate;
    expect(estimate.currency).toBe('CNY');
    expect(estimate.localDeliveryTND).toBe(7);
    expect(estimate.totalTND).toBeGreaterThan(estimate.productTND + estimate.localDeliveryTND);
  });

  test('détail : identifiant manquant ⇒ 400, et sans clé ⇒ 503', async () => {
    const missing = await request(app()).post('/api/sbase/item').send({ source: '1688', title: 'x' }).expect(400);
    expect(missing.body.code).toBe('ITEM_ID_REQUIRED');

    delete process.env.SANDBASE_API_KEY;
    const noKey = await request(app()).post('/api/sbase/item').send({ source: '1688', id: '1046925823679' }).expect(503);
    expect(noKey.body.code).toBe('SANDBASE_NOT_CONFIGURED');
  });

  test('image : la photo part chez 1688, chaque résultat porte 1688 et son MOQ', async () => {
    let sentBody: Record<string, unknown> | null = null;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/1688/search/cross-border-by-image')) {
        sentBody = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify(envelope({
          items: [
            {
              item_id: 1056868355487, title: 'Mini traceur GPS', price: '22.8', currency: 'CNY', moq: 1,
              img: 'https://cbu01.alicdn.com/t.jpg',
              product_url: 'https://detail.1688.com/offer/1056868355487.html',
              shop_info: { company_name: 'Shenzhen T' },
            },
            {
              item_id: 1056868355488, title: 'Traceur GPS voiture',
              product_url: 'https://detail.1688.com/offer/1056868355488.html',
            },
          ],
        })), { status: 200 });
      }
      return new Response(JSON.stringify(envelope({ items: [] })), { status: 200 });
    }));

    const response = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(200);

    const data = response.body.data;
    expect(data).toMatchObject({ mode: 'image', count: 2, stores: ['1688'] });
    expect(data.items[0].seller).toBe('Shenzhen T');
    expect(data.channel.id).toBe('1688');
    expect(data.items[0]).toMatchObject({ store: '1688', amount: 22.8, currency: 'CNY', moq: '1' });
    // Le second résultat n'a pas de prix : on le dit, on n'invente pas 0.
    expect(data.items[1].missing).toContain('price');
    expect(data.durationMs).toBeGreaterThanOrEqual(0);
    // 1688 reçoit un lien public (pas des octets) : c'est le contrat de l'endpoint.
    expect(String(sentBody?.imgUrl)).toMatch(/^https?:\/\/.+\/api\/sbase\/photo\/[a-f0-9]{48}$/);
    expect(sentBody?.language).toBe('en');

    // Le lien publié ne vit que 10 minutes : il est lisible tout de suite…
    const photoPath = new URL(String(sentBody?.imgUrl)).pathname;
    const served = await request(app()).get(photoPath).expect(200);
    expect(served.headers['content-type']).toMatch(/image\//);
  });

  test('image : sans fichier ⇒ 400 explicite', async () => {
    const response = await request(app()).post('/api/sbase/image').expect(400);
    expect(response.body.code).toBe('SBASE_IMAGE_EMPTY');
  });

  /*
   * 26/11/2026 — l'écran affichait « La recherche a échoué / SBASE_IMAGE_INVALID »
   * alors que la photo était bonne : c'était Lens qui refusait (quota). Un échec
   * du fournisseur ne doit JAMAIS être déguisé en photo invalide.
   */
  /*
   * 26/11/2026 — l'écran affichait « La recherche a échoué / SBASE_IMAGE_INVALID »
   * alors que la photo était bonne : c'était le fournisseur qui refusait. Un échec
   * du fournisseur ne doit JAMAIS être déguisé en photo invalide.
   */
  test('image : un refus de SandBase n’est pas une « photo invalide »', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'quota exceeded' }), { status: 402 })));
    const response = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(402);
    expect(response.body.code).toBe('SBASE_IMAGE_BALANCE');
    expect(response.body.providerCode).toBe('SANDBASE_BALANCE');
  });

  test('image : 429 et timeout gardent chacun leur code et leur statut', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'slow down' }), { status: 429 })));
    const limited = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(429);
    expect(limited.body.code).toBe('SBASE_IMAGE_RATE_LIMITED');

    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timeout', 'TimeoutError'); }));
    const slow = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(504);
    expect(slow.body.code).toBe('SBASE_IMAGE_TIMEOUT');
  });

  test('image : une image rejetée par 1688 est dite comme telle (502, pas 400)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'imgUrl unreachable' }), { status: 422 })));
    const response = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(502);
    expect(response.body.code).toBe('SBASE_IMAGE_URL_REJECTED');
  });

  test('image : une faute de NOTRE requête ne s’affiche pas comme « 1688 n’a pas lu la photo »', async () => {
    // 26/11/2026 — vu en direct : le body partait avec `page: '1'` (texte) et
    // l’écran annonçait « image rejetée ». La cause était chez nous.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      error: 'parameter validation failed: /page: expected integer, but got string',
    }), { status: 400 })));
    const response = await request(app())
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(502);
    expect(response.body.code).toBe('SBASE_IMAGE_REQUEST_INVALID');
  });

  test('image : une vraie image illisible reste 400 SBASE_IMAGE_INVALID', () => {
    const failure = sbaseImageFailureFrom(Object.assign(new Error('Format non supporté'), { code: 'INVALID_IMAGE' }));
    expect(failure.code).toBe('SBASE_IMAGE_INVALID');
    expect(failure.status).toBe(400);
  });
});

describe('S Base — corps de requête 1688', () => {
  test('`page` et `pageSize` partent en nombres, jamais en texte', () => {
    // SandBase : « /page: expected integer, but got string » ⇒ 400 sur CHAQUE
    // recherche. Le type est le contrat, pas le rendu JSON.
    for (const source of SBASE_SOURCES) {
      const keyword = source.buildBody('nike tn', null);
      expect(typeof keyword.page).toBe('number');
      expect(typeof keyword.pageSize).toBe('number');
      if (source.image) {
        const image = source.image.buildBody('https://example.com/a.jpg');
        expect(typeof image.page).toBe('number');
        expect(typeof image.pageSize).toBe('number');
        expect(typeof image.imgUrl).toBe('string');
      }
    }
  });

  test('le corps réel de la recherche par image est sérialisable avec des entiers', () => {
    const source = SBASE_SOURCES.find((entry) => entry.id === '1688');
    expect(source?.image).toBeTruthy();
    const body = JSON.parse(JSON.stringify(source!.image!.buildBody('https://example.com/a.jpg')));
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(20);
    expect(body.language).toBe('en');
  });
});

describe('S Base — sonde de publication de la photo', () => {
  test('rétrograde en SBASE_PHOTO_UNREACHABLE sans appeler SandBase quand notre lien ne répond pas', async () => {
    const sandbase = vi.fn();
    vi.stubGlobal('fetch', sandbase);
    const failure = app({
      photoProbe: async () => new Response('nope', { status: 404, headers: { 'content-type': 'text/plain' } }),
    });
    const response = await request(failure)
      .post('/api/sbase/image')
      .attach('image', PHOTO, { filename: 'photo.png', contentType: 'image/png' })
      .expect(503);
    expect(response.body.code).toBe('SBASE_PHOTO_UNREACHABLE');
    // Aucun appel payant : le lien était mort avant d'atteindre 1688.
    expect(sandbase).not.toHaveBeenCalled();
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

  test('la recherche par image ne touche plus SerpApi du tout', () => {
    for (const file of ['image.ts', 'routes.ts', 'descriptors.ts']) {
      const source = readFileSync(join(process.cwd(), 'src/sbase', file), 'utf8');
      expect(source).not.toMatch(/SERPAPI_KEY|serpapi\.com|serpApiVisualSearch|zayrovix\//);
      expect(source).not.toMatch(/zayrovix\/services\/visualSearch/);
    }
  });
});

/*
 * ── مزوّد Apify (2026-11-26) ─────────────────────────────────────────────────
 * قرار المالك: نحذفو SandBase نهائياً ونعوّضو بـApify. المرحلة الأولى: المزوّد
 * يُبنى **جانب** القديم بلا تفعيل — التفعيل بمتغيّر البيئة يأتي بعده، والحذف
 * بعد التحقيق الحيّ. كل الحقول هنا مأخوذة من أمثلة الردود المنشورة على صفحات
 * Apify (قُرأت 2026-11-26) — ما فماش حقل مخترَع.
 */
describe('S Base — مزوّد Apify', () => {
  const APIFY_KEY = 'test_apify_token';

  beforeEach(() => {
    process.env.APIFY_TOKEN = APIFY_KEY;
    delete process.env.APIFY_1688_ACTOR;
    delete process.env.APIFY_IMAGE_ACTOR;
  });

  afterEach(() => {
    delete process.env.APIFY_TOKEN;
    vi.unstubAllGlobals();
  });

  /** جدولة النداءات: POST runs → GET actor-runs → GET datasets/items. */
  function stubApify(handlers: Array<(url: string, init?: RequestInit) => Response | null>) {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      for (const handler of handlers) {
        const response = handler(String(url), init);
        if (response) return response;
      }
      return new Response(JSON.stringify({ error: { type: 'unexpected-url' } }), { status: 500 });
    }));
    return calls;
  }

  const runQueued = () => new Response(JSON.stringify({
    data: { id: 'run_9', actId: 'act_1', status: 'READY', defaultDatasetId: 'ds_1' },
  }), { status: 200 });

  const runSucceeded = () => new Response(JSON.stringify({
    data: { id: 'run_9', status: 'SUCCEEDED', defaultDatasetId: 'ds_1' },
  }), { status: 200 });

  /** صفّ بحث حقيقي كما ينشره الـREADME (2026-11-26). */
  const searchRow = {
    offerId: '1089329678023',
    title: 'New macaron bowl lid insulated tumbler - large capacity water bottle',
    priceUsd: 2.38,
    priceCny: 15.5,
    minOrderQuantity: 1,
    sales: '500+ sold',
    salesCount: 500,
    supplierName: '义乌市乌桨五金制品厂',
    supplierYearsOnPlatform: 1,
    starLevel: 5,
    sellingPoints: ['Ships within 5h'],
    isAd: false,
    url: 'https://detail.1688.com/offer/1089329678023.html',
    images: ['https://cbu01.alicdn.com/img/ibank/a.jpg'],
  };

  test('الأثمنة المنشورة تُحسب من الموثّق: بحث 0.0848$ · تفاصيل 0.00899$ · صورة 0.004$', () => {
    expect(APIFY_SEARCH_COST_USD).toBeCloseTo(0.005 + 20 * 3.99 / 1000, 5);
    expect(APIFY_DETAIL_COST_USD).toBeCloseTo(0.005 + 3.99 / 1000, 5);
    expect(APIFY_IMAGE_COST_USD).toBeCloseTo(20 * 0.2 / 1000, 5);
  });

  test('بدون مفتاح: رفض APIFY_NOT_CONFIGURED قبل أي نداء شبكي', async () => {
    delete process.env.APIFY_TOKEN;
    expect(apifyConfigured()).toBe(false);
    const calls = stubApify([]);
    await expect(runApifySearch('case')).rejects.toMatchObject({ code: 'APIFY_NOT_CONFIGURED', status: 503 });
    await expect(searchApifyByImage('QUJD')).rejects.toMatchObject({ code: 'APIFY_NOT_CONFIGURED' });
    expect(calls).toHaveLength(0);
  });

  test('بحث بالكلمة: POST runs ثم poll حتى SUCCEEDED ثم dataset — والحقول تُترجم للشكل الداخلي', async () => {
    const calls = stubApify([
      (url, init) => {
        if (!url.includes('/v2/acts/sourabhbgp~1688-scraper/runs')) return null;
        expect(init?.method).toBe('POST');
        return runQueued();
      },
      (url) => {
        if (!url.includes('/v2/actor-runs/run_9')) return null;
        return runSucceeded();
      },
      (url) => {
        if (!url.includes('/v2/datasets/ds_1/items')) return null;
        return new Response(JSON.stringify([searchRow]), { status: 200 });
      },
    ]);

    const result = await runApifySearch('water bottle', { pollIntervalMs: 1 });
    expect(calls).toHaveLength(3);
    // المفتاح في ترويسة Bearer فقط — لا token في الرابط ولا في الجسم.
    for (const call of calls) {
      expect(call.url).not.toContain(APIFY_KEY);
      expect((call.init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${APIFY_KEY}`);
    }
    const runInput = JSON.parse(String(calls[0].init?.body));
    expect(runInput).toMatchObject({ mode: 'search', keywords: ['water bottle'], sortType: 'normal', maxItems: 20 });

    expect(result.runId).toBe('run_9');
    expect(result.costUsd).toBe(APIFY_SEARCH_COST_USD);
    expect(result.async).toBe(true);
    // الشكل الداخلي المعروف: نفس مسار استخراج 1688، بلا أي حقل مخترَع.
    expect(result.data.items[0]).toMatchObject({
      item_id: '1089329678023',
      title: 'New macaron bowl lid insulated tumbler - large capacity water bottle',
      price: '15.5',
      currency: 'CNY',
      moq: '1',
      product_url: 'https://detail.1688.com/offer/1089329678023.html',
      img: 'https://cbu01.alicdn.com/img/ibank/a.jpg',
      shop_info: { company_name: '义乌市乌桨五金制品厂' },
    });
    // وطبقة الاستخراج الموجودة تُكمل الباقي كما هي.
    const products = extractProducts(result.data, { arrays: [['items']], limit: 20, storeFallback: '1688' });
    expect(products[0]).toMatchObject({ id: '1089329678023', amount: 15.5, currency: 'CNY', seller: '义乌市乌桨五金制品厂', moq: '1' });
  });

  test('تفاصيل المنتج: proxy موثّق + offerIds، والوزن/المواصفات/الـSKU تصل extractDetail', async () => {
    const calls = stubApify([
      (url) => (url.includes('/v2/acts/sourabhbgp~1688-scraper/runs') ? runQueued() : null),
      (url) => (url.includes('/v2/actor-runs/run_9') ? runSucceeded() : null),
      (url) => {
        if (!url.includes('/v2/datasets/ds_1/items')) return null;
        return new Response(JSON.stringify([{
          offerId: '928596422357',
          title: 'Magnetic Phone Case Matte Version',
          priceCny: 4.5,
          priceRangeCny: '3.00-4.50',
          priceTiers: [{ minQuantity: 1, priceCny: 4.5 }, { minQuantity: 300, priceCny: 4 }],
          currency: 'CNY',
          minOrderQuantity: 1,
          stock: 730371,
          specs: { Brand: 'Hong xing', Material: 'Silicone' },
          supplierName: '深圳市罗湖区洪星电子商行',
          url: 'https://detail.1688.com/offer/928596422357.html',
          variants: [{
            skuId: '6090121414768',
            specAttributes: 'Pink1 > iPhone17',
            priceCny: 4.5,
            stock: 5217,
            imageUrl: 'https://cbu01.alicdn.com/img/ibank/v.jpg',
            weightGrams: 45,
          }],
        }]), { status: 200 });
      },
    ]);

    const result = await runApifyDetail({ id: '928596422357', url: null }, { pollIntervalMs: 1 });
    const runInput = JSON.parse(String(calls[0].init?.body));
    // صفحة 1688 ما تتقراش بلا proxy — حدّ منشور على الـactor نفسه.
    expect(runInput).toMatchObject({
      mode: 'product_detail',
      offerIds: ['928596422357'],
      includeSkuDetails: true,
      proxyConfiguration: { useApifyProxy: true },
    });
    expect(result.costUsd).toBe(APIFY_DETAIL_COST_USD);

    // الجذر الداخلي: نفس الشكل اللي يفهمه extractDetail من 1688.
    expect(result.data).toMatchObject({
      item_id: '928596422357',
      currency: 'CNY',
      is_sold_out: false,
      weightGrams: 45,
    });
    expect(result.data.price_info).toMatchObject({ price: '4.5' });

    const detail = extractDetail(result.data);
    expect(detail).toMatchObject({
      amount: 4.5, currency: 'CNY', availability: 'in_stock', seller: '深圳市罗湖区洪星电子商行',
      url: 'https://detail.1688.com/offer/928596422357.html',
    });
    expect(detail.specs).toEqual(expect.arrayContaining([{ name: 'Brand', value: 'Hong xing' }]));
    // أسماء الأبعاد غير منشورة عند المصدر ⇒ مجموعة «options» كالـgeneric، بلا اختراع أسماء.
    expect(detail.variants[0]).toMatchObject({ name: 'options' });
    expect(detail.variants[0].values[0]).toMatchObject({ label: 'Pink1 > iPhone17', available: true, image: 'https://cbu01.alicdn.com/img/ibank/v.jpg' });
    expect(detail.images).toContain('https://cbu01.alicdn.com/img/ibank/v.jpg');
  });

  test('الرابط يكفي بلا معرّف: offerIds يقبل الرابط (موثّق)', async () => {
    const calls = stubApify([
      (url) => (url.includes('/v2/acts/sourabhbgp~1688-scraper/runs') ? runQueued() : null),
      (url) => (url.includes('/v2/actor-runs/run_9') ? runSucceeded() : null),
      (url) => (url.includes('/v2/datasets/ds_1/items')
        ? new Response(JSON.stringify([{ offerId: '857511694718', title: 'Cable USB-C', priceCny: 1.2, currency: 'CNY' }]), { status: 200 })
        : null),
    ]);
    const result = await runApifyDetail({ id: null, url: 'https://detail.1688.com/offer/857511694718.html' }, { pollIntervalMs: 1 });
    const runInput = JSON.parse(String(calls[0].init?.body));
    expect(runInput.offerIds).toEqual(['https://detail.1688.com/offer/857511694718.html']);
    expect(result.data).toMatchObject({ item_id: '857511694718' });
  });

  test('كل فشل بكوده الحقيقي: 401 · 429 · run FAILED · timeout — وما يتلبسش «لا نتائج»', async () => {
    // 401 على إنشاء الـrun.
    stubApify([() => new Response(JSON.stringify({ error: { type: 'unauthorized' } }), { status: 401 })]);
    await expect(runApifySearch('case')).rejects.toMatchObject({ code: 'APIFY_UNAUTHORIZED' });

    // 429.
    stubApify([() => new Response(JSON.stringify({ error: { type: 'rate-limit' } }), { status: 429 })]);
    await expect(runApifySearch('case')).rejects.toMatchObject({ code: 'APIFY_RATE_LIMIT', status: 429 });

    // الـrun فشل عند المزوّد (poll أرجع FAILED).
    stubApify([
      (url) => (url.includes('/v2/acts/') ? runQueued() : null),
      (url) => (url.includes('/v2/actor-runs/run_9') ? new Response(JSON.stringify({ data: { id: 'run_9', status: 'FAILED' } }), { status: 200 }) : null),
    ]);
    await expect(runApifySearch('case')).rejects.toMatchObject({ code: 'APIFY_FAILED', status: 502 });

    // الوقت تجاوز: الـpoll يبقى RUNNING.
    stubApify([
      (url) => (url.includes('/v2/acts/') ? runQueued() : null),
      (url) => (url.includes('/v2/actor-runs/run_9') ? new Response(JSON.stringify({ data: { id: 'run_9', status: 'RUNNING' } }), { status: 200 }) : null),
    ]);
    await expect(runApifySearch('case', { timeoutMs: 30, pollIntervalMs: 5 }))
      .rejects.toMatchObject({ code: 'APIFY_TIMEOUT', status: 504 });

    // HTTP غير معروف: الكود يحمل الحالة.
    stubApify([() => new Response(JSON.stringify({ error: { type: 'boom' } }), { status: 503 })]);
    await expect(runApifySearch('case')).rejects.toMatchObject({ code: 'APIFY_HTTP' });
  });

  test('dataset بلا صفوف للتفاصيل ⇒ APIFY_EMPTY صريح (404)، موش فيش فارغة', async () => {
    stubApify([
      (url) => (url.includes('/v2/acts/') ? runQueued() : null),
      (url) => (url.includes('/v2/actor-runs/run_9') ? runSucceeded() : null),
      (url) => (url.includes('/v2/datasets/ds_1/items') ? new Response(JSON.stringify([]), { status: 200 }) : null),
    ]);
    await expect(runApifyDetail({ id: '928596422357', url: null }, { pollIntervalMs: 1 }))
      .rejects.toMatchObject({ code: 'APIFY_EMPTY', status: 404 });
  });

  test('صورة: POST واحد بbase64 خام + excludeAds إلى نقطة الـServer actor — والنتائج تُترجم', async () => {
    expect(apifyImageEndpoint()).toBe('https://topapi--image-search-1688-api.apify.actor/search');
    const calls = stubApify([
      (url, init) => {
        if (!url.includes('topapi--image-search-1688-api.apify.actor/search')) return null;
        expect(init?.method).toBe('POST');
        return new Response(JSON.stringify({
          ok: true,
          count: 2,
          items: [
            {
              rank: 1,
              similarityScore: 0.3453,
              offerId: '927875250705',
              title: '跨境适用苹果18promax手机壳',
              titleEn: 'Cross-border Apple 18promax phone case',
              detailUrl: 'https://detail.1688.com/offer/927875250705.html',
              image: 'https://cbu01.alicdn.com/img/ibank/m.jpg',
              price: 7.5,
              priceUsd: 1.1228,
              currency: 'CNY',
              minOrderQuantity: 50,
              isAd: true,
              supplier: { companyName: '佛山市南海区三丰手机配件有限公司', yearsOnPlatform: 11 },
            },
            { offerId: '927875250706', title: '手机壳', titleEn: 'Plain phone case', detailUrl: 'https://detail.1688.com/offer/927875250706.html' },
          ],
          meta: { totalMatches: 698, nextOffset: 2, charged: { match: 2 } },
        }), { status: 200 });
      },
    ]);

    const result = await searchApifyByImage('QUJDREVG');
    expect(calls).toHaveLength(1);
    const sent = JSON.parse(String(calls[0].init?.body));
    // base64 خام كما يوثّقه الـactor، والحدّ الأقصى للنتائج + استبعاد الإعلانات.
    expect(sent).toEqual({ imageBase64: 'QUJDREVG', maxResults: 20, excludeAds: true });
    expect(calls[0].url).not.toContain(APIFY_KEY);
    // المفتاح في الترويسة فقط.
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${APIFY_KEY}`);

    expect(result.count).toBe(2);
    expect(result.costUsd).toBe(APIFY_IMAGE_COST_USD);
    expect(result.data.items[0]).toMatchObject({
      item_id: '927875250705',
      // titleEn يتقدّم على العنوان الصيني — قاعدة الشاشة المعروفة.
      title: 'Cross-border Apple 18promax phone case',
      price: '7.5',
      currency: 'CNY',
      moq: '50',
      product_url: 'https://detail.1688.com/offer/927875250705.html',
      img: 'https://cbu01.alicdn.com/img/ibank/m.jpg',
      shop_info: { company_name: '佛山市南海区三丰手机配件有限公司' },
    });
    // النتيجة الثانية بلا سعر: «ما عطاناش» تُسجّل، ما يُخترعش صفر.
    const products = extractProducts(result.data, { arrays: [['items']], limit: 20, storeFallback: '1688' });
    expect(products[1].missing).toContain('price');
  });

  test('صورة: ok=false ⇒ APIFY_FAILED (فشل معلن، ما يتفوترش «لا نتائج»)', async () => {
    stubApify([() => new Response(JSON.stringify({ ok: false, error: { type: 'image_search_failed' } }), { status: 200 })]);
    await expect(searchApifyByImage('QUJDREVG')).rejects.toMatchObject({ code: 'APIFY_FAILED', status: 502 });
  });

  test('صورة: رفض HTTP من الـactor يحمل كوده الحقيقي (401 · 429 · HTTP_x)', async () => {
    stubApify([() => new Response(JSON.stringify({ error: { type: 'unauthorized' } }), { status: 401 })]);
    await expect(searchApifyByImage('QUJDREVG')).rejects.toMatchObject({ code: 'APIFY_UNAUTHORIZED' });
    stubApify([() => new Response(JSON.stringify({ error: { type: 'slow-down' } }), { status: 429 })]);
    await expect(searchApifyByImage('QUJDREVG')).rejects.toMatchObject({ code: 'APIFY_RATE_LIMIT' });
    stubApify([() => new Response(JSON.stringify({ error: { type: 'boom' } }), { status: 500 })]);
    await expect(searchApifyByImage('QUJDREVG')).rejects.toMatchObject({ code: 'APIFY_HTTP' });
  });

  test('صورة: 0 نتيجة = حالة عادية مجانية، موش خطأ', async () => {
    stubApify([() => new Response(JSON.stringify({ ok: true, count: 0, items: [], meta: { totalMatches: 0, nextOffset: null, charged: { match: 0 } } }), { status: 200 })]);
    const result = await searchApifyByImage('QUJDREVG');
    expect(result.count).toBe(0);
    expect(result.data.items).toEqual([]);
  });

  test('صورة: جسم يتجاوز حدّ 1MB الموثّق يُرفض محلياً (413) قبل أي نداء مدفوع', async () => {
    const calls = stubApify([]);
    await expect(searchApifyByImage('A'.repeat(1_100_000))).rejects.toMatchObject({ code: 'SBASE_IMAGE_TOO_LARGE', status: 413 });
    expect(calls).toHaveLength(0);
  });

  test('صورة كبيرة تتضغط تدرّجياً تحت الميزانية قبل الإرسال (حدّ موثّق: 1,000,000 بايت)', async () => {
    // PNG ضجيج عشوائي حقيقي 1024×1024 — يفوق الميزانية ولا يفوق سقف التطبيع (5MB).
    const sharp = (await import('sharp')).default;
    const noise = randomBytes(1024 * 1024 * 3);
    const png = await sharp(noise, { raw: { width: 1024, height: 1024, channels: 3 } })
      .png({ compressionLevel: 1 })
      .toBuffer();
    expect(png.length).toBeLessThan(5 * 1024 * 1024);

    const base64 = await apifyImageBase64(png, 'image/png');
    expect(base64.length).toBeLessThanOrEqual(APIFY_IMAGE_BASE64_BUDGET);
    // بعد الضغط يبقى JPEG صالحاً (بداية FFD8).
    const bytes = Buffer.from(base64, 'base64');
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  });
});
