/**
 * AYWEBs — DEVIS SIGNÉ & VITESSE D'AJOUT (« Phase 1 », 06/10/2026).
 *
 * Ce que cette suite verrouille, avec des compteurs et non des impressions :
 *
 *   1. `POST /cart/items` ne relit plus le marchand quand le client renvoie le
 *      devis signé émis par `/product/resolve` — mesuré sur le NOMBRE d'appels
 *      au scraper marchand (2 → 1) ;
 *   2. le client ne peut pas fabriquer un prix : jeton falsifié, périmé, ou ne
 *      correspondant pas à la ligne produit ⇒ relecture marchande complète ;
 *   3. un prix PROPRE À LA VARIANTE ne peut jamais venir d'un devis émis pour le
 *      produit entier ;
 *   4. l'audit reste possible : `AYWEBS_QUOTE_REVERIFY_SAMPLE=1` force la
 *      relecture de tous les ajouts ;
 *   5. une fiche ILLISIBLE est mémorisée 90 s (mémo d'échec) : le réessai ne
 *      repaie pas 13–17 s de sondes, et le résultat reste marqué comme tel ;
 *   6. la porte de lecture borne les lectures simultanées sans jamais refuser.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-quote-')), 'cache');

import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { addAyWebsCartItem, listAyWebsCartItems } from '../src/aywebs/cart';
import { createAyrovixPriceToken } from '../src/ayrovix/priceQuote';
import {
  createAyWebsQuoteToken, inspectAyWebsQuoteToken, shouldReverifyAyWebsQuote,
} from '../src/aywebs/quoteToken';
import {
  ayWebsResolveFailureCacheStats, clearAyWebsResolveCache, clearAyWebsResolveFailureCache,
} from '../src/aywebs/resolveCache';
import { ayWebsReadGateStats, resetAyWebsReadGate, withAyWebsReadSlot } from '../src/aywebs/readGate';

const SESSION_ID = 'quote-session-000000000001';
const AMAZON_URL = 'https://www.amazon.com/dp/B0ABCDEFGH';

const TOUCHED_ENV = [
  'AYWEBS_QUOTE_TTL_MS', 'AYWEBS_QUOTE_FRESH_MS', 'AYWEBS_QUOTE_REVERIFY_TND',
  'AYWEBS_QUOTE_REVERIFY_SAMPLE', 'AYWEBS_RESOLVE_FAILURE_TTL_MS',
  'AYWEBS_READ_CONCURRENCY', 'AYWEBS_READ_GATE_MAX_WAIT_MS',
];

/* L'échantillon d'audit (5 % par défaut) est DÉSACTIVÉ par défaut dans cette
   suite : les tests qui l'activent le font explicitement. Sans cela, un tirage
   aléatoire (qid non déterministe) ferait échouer ces tests environ une fois
   sur vingt — une instabilité, pas une preuve. */
beforeEach(() => {
  process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE = '0';
});

afterEach(() => {
  for (const key of TOUCHED_ENV) delete process.env[key];
  clearAyWebsResolveCache();
  clearAyWebsResolveFailureCache();
  resetAyWebsReadGate();
});

function pricingRules(): PricingRules {
  return {
    id: 'default', version: 3,
    rateEUR: 4, rateUSD: 4, rateGBP: 4.8, rateJPY: 0.0265,
    exchangeBufferPercent: 3, freightPerKgTND: 13, localDeliveryTND: 8,
    commissionPercent: 10, minimumCommissionTND: 0, rpdPercent: 3, rpdMinimumTND: 10,
    defaultTvaRate: 0.19, expressFeeTND: 15,
    categories: DEFAULT_CUSTOMS_CATEGORIES,
    updatedAt: new Date().toISOString(),
  };
}

/** Scraper marchand compté : chaque appel réseau simulé est visible dans les tests. */
function countedScraper(options: {
  price?: number;
  variantPrices?: Array<{ id: string; color: string; size: string; price: number; stock: boolean }>;
} = {}) {
  const price = options.price ?? 39.99;
  const scrapeProduct = vi.fn(async (url: string) => ({
    id: 'scraped_amazon',
    store: 'amazon',
    storeName: 'Amazon',
    url,
    externalId: 'B0ABCDEFGH',
    title: 'Nike Air Max shoes',
    description: 'Produit de test',
    images: ['https://images.example.test/product.jpg'],
    mainImage: 'https://images.example.test/product.jpg',
    sourcePrice: price,
    sourceCurrency: 'USD',
    convertedPriceTND: 0, estimatedShippingTND: 0, serviceFeeTND: 0, totalPriceTND: 0,
    variants: (() => {
      const details = options.variantPrices || [
        { id: 'v-black-41', color: 'Black', size: '41', price, stock: true },
        { id: 'v-black-42', color: 'Black', size: '42', price, stock: true },
        { id: 'v-white-41', color: 'White', size: '41', price: Math.round((price + 2) * 100) / 100, stock: true },
        { id: 'v-white-42', color: 'White', size: '42', price: Math.round((price + 2) * 100) / 100, stock: false },
      ];
      return {
        colors: [...new Set(details.map((v) => v.color))],
        sizes: [...new Set(details.map((v) => v.size))],
        details,
      };
    })(),
    availability: 'in_stock' as const,
    condition: undefined,
    brand: 'Nike',
    priceVerified: price > 0,
    currencyVerified: true,
    verificationProvider: 'direct',
    verificationMethod: 'json_ld',
    verificationFailureCode: null,
    scrapedAt: new Date().toISOString(),
  }));
  return { scraper: { cleanPastedUrl: (value: string) => String(value).trim(), scrapeProduct }, scrapeProduct };
}

function harness(options: Parameters<typeof countedScraper>[0] = {}) {
  const { scraper, scrapeProduct } = countedScraper(options);
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const ctx = createAyWebsContext(db, scraper as any);
  return { db, resolver: ctx.resolver, scrapeProduct };
}

describe('AYWEBs Phase 1 — jeton de devis signé (unitaire)', () => {
  const base = {
    productId: 'aywprd_test_0001',
    storeId: 'amazon',
    variantKey: '',
    price: 39.99,
    currency: 'USD',
    evidenceHash: 'ev_hash_0001',
    availability: 'AVAILABLE',
  };

  it('émet puis relit un jeton intact', () => {
    const token = createAyWebsQuoteToken(base)!;
    const claims = inspectAyWebsQuoteToken(token)!;
    expect(claims.productId).toBe(base.productId);
    expect(claims.storeId).toBe('amazon');
    expect(claims.price).toBe(39.99);
    expect(claims.currency).toBe('USD');
    expect(claims.availability).toBe('AVAILABLE');
    expect(claims.expiresAt).toBeGreaterThan(Date.now());
  });

  it('refuse un jeton falsifié (prix modifié ou signature modifiée)', () => {
    const token = createAyWebsQuoteToken(base)!;
    const [version, payload, signature] = token.split('.');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    decoded.price = 1;
    const forgedPayload = Buffer.from(JSON.stringify(decoded), 'utf8').toString('base64url');
    expect(inspectAyWebsQuoteToken(`${version}.${forgedPayload}.${signature}`)).toBeNull();

    const tamperedSignature = `${signature.slice(0, -1)}${signature.slice(-1) === 'A' ? 'B' : 'A'}`;
    expect(inspectAyWebsQuoteToken(`${version}.${payload}.${tamperedSignature}`)).toBeNull();
  });

  it('refuse un jeton expiré', () => {
    const token = createAyWebsQuoteToken(base, -1_000)!;
    expect(inspectAyWebsQuoteToken(token)).toBeNull();
  });

  it('n’émet rien sans prix positif ni devise ISO vérifiée', () => {
    expect(createAyWebsQuoteToken({ ...base, price: 0 })).toBeNull();
    expect(createAyWebsQuoteToken({ ...base, currency: 'usd' })).toBeNull();
    expect(createAyWebsQuoteToken({ ...base, productId: '' })).toBeNull();
  });

  it('un jeton de cotation AYROVIX ne vaut pas comme devis AYWEBs (domaines séparés)', () => {
    const ayrovixToken = createAyrovixPriceToken({
      price: 39.99, currency: 'USD', title: 'Nike Air Max shoes', status: 'VERIFIED',
    })!;
    expect(ayrovixToken.length).toBeGreaterThan(10);
    expect(inspectAyWebsQuoteToken(ayrovixToken)).toBeNull();
  });

  it('un devis qui vieillit passe en relecture (STALE)', () => {
    // La fraîcheur a un plancher volontaire (30 s) : on fait vieillir l'horloge
    // plutôt que de tordre la configuration.
    vi.useFakeTimers();
    try {
      const token = createAyWebsQuoteToken(base)!;
      const claims = inspectAyWebsQuoteToken(token)!;
      expect(shouldReverifyAyWebsQuote(claims, {})).toEqual({ reverify: false, reason: 'FRESH' });
      vi.advanceTimersByTime(6 * 60_000); // > AYWEBS_QUOTE_FRESH_MS (défaut 5 min)
      expect(shouldReverifyAyWebsQuote(claims, {})).toEqual({ reverify: true, reason: 'STALE' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('un panier à montant élevé passe en relecture (HIGH_VALUE)', () => {
    const token = createAyWebsQuoteToken(base)!;
    const claims = inspectAyWebsQuoteToken(token)!;
    process.env.AYWEBS_QUOTE_REVERIFY_TND = '10';
    // Sans cela, l'échantillon d'audit (5 %) peut décider à la place du motif
    // testé : le qid est aléatoire par jeton, donc ce test serait instable.
    process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE = '0';
    expect(shouldReverifyAyWebsQuote(claims, { totalTND: 50 })).toEqual({ reverify: true, reason: 'HIGH_VALUE' });
    expect(shouldReverifyAyWebsQuote(claims, { totalTND: 5 })).toEqual({ reverify: false, reason: 'FRESH' });
  });

  it('échantillon d’audit déterministe (SAMPLE)', () => {
    const token = createAyWebsQuoteToken(base)!;
    const claims = inspectAyWebsQuoteToken(token)!;
    process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE = '1';
    expect(shouldReverifyAyWebsQuote(claims, {})).toEqual({ reverify: true, reason: 'SAMPLE' });
    process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE = '0';
    expect(shouldReverifyAyWebsQuote(claims, {})).toEqual({ reverify: false, reason: 'FRESH' });
  });
});

describe('AYWEBs Phase 1 — l’ajout au panier ne relit plus le marchand (intégration)', () => {
  it('resolved → add avec devis : UNE seule lecture marchande pour tout le parcours', async () => {
    const h = harness();
    const resolved = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(resolved.quoteToken).toBeTruthy();

    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      accountId: null,
      productId: resolved.productId,
      variantAttributes: { color: 'Black', size: '41' },
      quantity: 1,
      quoteToken: resolved.quoteToken,
    });

    expect(h.scrapeProduct).toHaveBeenCalledTimes(1); // ← le gain de Phase 1
    expect(added.quoteUsed).toBe(true);
    expect(added.sourceReread).toBe(false);
    expect(added.rereadReason).toBeNull();
    expect(added.item.unitPrice).toBe(39.99);
  });

  it('sans devis (client ancien) : relecture marchande complète, comportement d’avant intact', async () => {
    const h = harness();
    const resolved = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      accountId: null,
      productId: resolved.productId,
      variantAttributes: { color: 'Black', size: '41' },
      quantity: 1,
    });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
    expect(added.quoteUsed).toBe(false);
    expect(added.sourceReread).toBe(true);
    expect(added.rereadReason).toBe('NO_QUOTE');
  });

  it('devis falsifié : jamais utilisé, relecture — et le prix reste celui du serveur', async () => {
    const h = harness();
    const resolved = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    const forged = `${resolved.quoteToken!.split('.').slice(0, 2).join('.')}.AAAA`;
    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      accountId: null,
      productId: resolved.productId,
      variantAttributes: { color: 'Black', size: '41' },
      quantity: 1,
      quoteToken: forged,
    });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
    expect(added.quoteUsed).toBe(false);
    expect(added.item.unitPrice).toBe(39.99);
  });

  it('un prix propre à la variante ne peut pas venir d’un devis « produit entier »', async () => {
    const h = harness({
      variantPrices: [
        { id: 'v-black-41', color: 'Black', size: '41', price: 39.99, stock: true },
        { id: 'v-white-41', color: 'White', size: '41', price: 49.99, stock: true },
      ],
    });
    const resolved = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(resolved.quoteToken).toBeTruthy();

    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      accountId: null,
      productId: resolved.productId,
      variantAttributes: { color: 'White', size: '41' },
      quantity: 1,
      quoteToken: resolved.quoteToken,
    });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2); // relecture exigée
    expect(added.quoteUsed).toBe(false);
    expect(added.item.unitPrice).toBe(49.99); // le prix RÉEL de la variante
  });

  it('mode audit : AYWEBS_QUOTE_REVERIFY_SAMPLE=1 relit tous les ajouts', async () => {
    process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE = '1';
    const h = harness();
    const resolved = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      accountId: null,
      productId: resolved.productId,
      variantAttributes: { color: 'Black', size: '41' },
      quantity: 1,
      quoteToken: resolved.quoteToken,
    });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
    expect(added.sourceReread).toBe(true);
    expect(added.rereadReason).toBe('SAMPLE');
  });
});

describe('AYWEBs Phase 1 — mémo « fiche illisible »', () => {
  it('un réessai sur une fiche illisible ne repaie pas les sondes (et reste marqué)', async () => {
    const h = harness({ price: 0 });
    const first = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(first.missing).toContain('price');
    expect(first.cacheKind).toBeNull();

    const second = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1); // ← aucune nouvelle sonde
    expect(second.cacheKind).toBe('failure_memo');
    expect(second.fromCache).toBe(true);
    expect(ayWebsResolveFailureCacheStats().hits).toBeGreaterThan(0);
  });

  it('mémo désactivable : AYWEBS_RESOLVE_FAILURE_TTL_MS=0 rend la relecture systématique', async () => {
    process.env.AYWEBS_RESOLVE_FAILURE_TTL_MS = '0';
    const h = harness({ price: 0 });
    await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
  });

  it('un succès n’entre jamais dans le mémo d’échec', async () => {
    const h = harness();
    const resolved = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(resolved.missing).toEqual([]);
    expect(ayWebsResolveFailureCacheStats().entries).toBe(0);
  });
});

describe('AYWEBs Phase 1 — porte de lecture', () => {
  it('borne les lectures simultanées (file d’attente respectée)', async () => {
    process.env.AYWEBS_READ_CONCURRENCY = '1';
    const order: string[] = [];
    const task = (name: string) => withAyWebsReadSlot(async () => {
      order.push(`${name}:start`);
      await new Promise((resolve) => setTimeout(resolve, 30));
      order.push(`${name}:end`);
      return name;
    });
    await Promise.all([task('a'), task('b'), task('c')]);
    // Avec un seul créneau, les trois tâches s'exécutent strictement en série.
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
    const stats = ayWebsReadGateStats();
    expect(stats.limit).toBe(1);
    expect(stats.completed).toBe(3);
    expect(stats.bypassed).toBe(0);
  });

  it('ne refuse jamais : au-delà du délai d’attente, la lecture passe quand même', async () => {
    process.env.AYWEBS_READ_CONCURRENCY = '1';
    process.env.AYWEBS_READ_GATE_MAX_WAIT_MS = '5';
    const slow = withAyWebsReadSlot(() => new Promise((resolve) => setTimeout(() => resolve('slow'), 60)));
    const fast = await withAyWebsReadSlot(async () => 'fast');
    expect(fast).toBe('fast');
    expect(ayWebsReadGateStats().bypassed).toBeGreaterThan(0);
    await slow;
  });
});
