/**
 * AYWEBs — CACHE DE RÉSOLUTION (05/10/2026).
 *
 * Le contrat protégé ici est un contrat de LATENCE ET D'HONNÊTETÉ :
 *  1. une fiche déjà lue n'est pas relue chez le marchand (le client n'attend
 *     plus vingt secondes pour revoir le même produit) ;
 *  2. le prix AYROVI est TOUJOURS recalculé par le serveur — le cache ne mémorise
 *     qu'une lecture, jamais un montant (§45) ;
 *  3. une relecture peut toujours être exigée (`refresh`), et la re-vérification
 *     du panier l'exige : un changement de prix marchand n'est jamais masqué
 *     (§18, §29) ;
 *  4. une lecture sans prix n'est jamais mémorisée comme un SUCCÈS ; Phase 1
 *     (06/10/2026) : elle entre dans un mémo d'échec séparé, à TTL court (90 s),
 *     qui rend le réessai immédiat sans rien cacher — l'incident reste visible
 *     (`cache_kind: "failure_memo"`, prix toujours manquant) ;
 *  5. deux résolutions simultanées du même produit ne déclenchent qu'UNE
 *     lecture marchande (single-flight).
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-resolve-cache-')), 'cache');

import { QatafoDatabase } from '../src/db/database';
import { createAyWebsContext } from '../src/aywebs/context';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { addAyWebsCartItem } from '../src/aywebs/cart';
import { verifyAyWebsCart } from '../src/aywebs/cart';
import {
  ayWebsResolveCacheKey,
  ayWebsResolveCacheStats,
  ayWebsResolveFailureCacheStats,
  clearAyWebsResolveCache,
  clearAyWebsResolveFailureCache,
} from '../src/aywebs/resolveCache';

const AMAZON_URL = 'https://www.amazon.com/dp/B0ABCDEFGH';
const SHEIN_URL = 'https://www.shein.com/example-p-382460229.html';
const SESSION_ID = 'aywebs-cache-session-000001';

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

/** Scraper de test à prix et latence pilotables : le marchand est isolé. */
function fakeScraper(options: { price?: number; delayMs?: number } = {}) {
  const price = options.price ?? 39.99;
  const scrapeProduct = vi.fn(async (url: string) => {
    if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    const store = url.includes('amazon.') ? 'amazon' : 'shein';
    return {
      id: `scraped_${store}`,
      store,
      storeName: store === 'amazon' ? 'Amazon' : 'SHEIN',
      url,
      externalId: store === 'amazon' ? 'B0ABCDEFGH' : '382460229',
      title: store === 'amazon' ? 'Nike Air Max shoes' : 'SHEIN summer dress',
      description: 'Produit de test',
      images: ['https://images.example.test/product.jpg'],
      mainImage: 'https://images.example.test/product.jpg',
      sourcePrice: price,
      sourceCurrency: 'USD',
      convertedPriceTND: 0, estimatedShippingTND: 0, serviceFeeTND: 0, totalPriceTND: 0,
      // Publish one exact source combination: the selected Black / 41 in the
      // revalidation test is known and in stock, not inferred from option lists.
      variants: store === 'amazon'
        ? {
            colors: ['Black', 'White'], sizes: ['41', '42'],
            details: [{ id: 'v-black-41', color: 'Black', size: '41', stock: true, price }],
          }
        : { colors: [], sizes: [], details: [] },
      availability: 'in_stock' as const,
      brand: store === 'amazon' ? 'Nike' : 'SHEIN',
      priceVerified: price > 0, currencyVerified: true, verificationProvider: 'direct', verificationMethod: 'json_ld',
      verificationFailureCode: price > 0 ? null : 'PRICE_NOT_FOUND',
      scrapedAt: new Date().toISOString(),
    };
  });
  return { scraper: { cleanPastedUrl: (value: string) => String(value).trim(), scrapeProduct }, scrapeProduct };
}

function harness(options: { price?: number; delayMs?: number } = {}) {
  const { scraper, scrapeProduct } = fakeScraper(options);
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const ctx = createAyWebsContext(db, scraper as any);
  return { db, ctx, resolver: ctx.resolver, scraper, scrapeProduct };
}

const originalTtl = process.env.AYWEBS_RESOLVE_CACHE_TTL_MS;

beforeEach(() => {
  clearAyWebsResolveCache();
});

afterEach(() => {
  if (originalTtl === undefined) delete process.env.AYWEBS_RESOLVE_CACHE_TTL_MS;
  else process.env.AYWEBS_RESOLVE_CACHE_TTL_MS = originalTtl;
  delete process.env.AYWEBS_RESOLVE_FAILURE_TTL_MS;
  clearAyWebsResolveCache();
  clearAyWebsResolveFailureCache();
});

describe('AYWEBs — cache de résolution : la fiche n’est pas relue pour rien', () => {
  test('la deuxième résolution du même produit ne relit pas le marchand', async () => {
    const h = harness();
    const first = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(first.fromCache).toBe(false);
    expect(first.cacheAgeMs).toBeNull();

    const second = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(second.fromCache).toBe(true);
    expect(second.cacheAgeMs).toBeGreaterThanOrEqual(0);
    // Même produit, même prix source, même preuve : c'est LA même lecture.
    expect(second.productId).toBe(first.productId);
    expect(second.product.price).toBe(first.product.price);
    expect(second.evidenceHash).toBe(first.evidenceHash);
    // …et le devis AYROVI reste recalculé côté serveur, jamais servi par le cache.
    expect(second.pricing?.totalTND).toBeGreaterThan(0);
    expect(second.pricing?.totalTND).toBe(first.pricing?.totalTND);
  });

  test('les paramètres de suivi ne créent pas une seconde lecture pour le même article', async () => {
    const h = harness();
    await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    const tracked = `${AMAZON_URL}?ref_=nav_custrec_signin&th=1&utm_source=ayrovi`;
    const second = await resolveAyWebsProduct(h.resolver, { url: tracked, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(second.fromCache).toBe(true);
  });

  test('`refresh: true` force une relecture fraîche : rien n’est masqué', async () => {
    const h = harness();
    await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    const refreshed = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID, refresh: true });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
    expect(refreshed.fromCache).toBe(false);
    expect(refreshed.cacheAgeMs).toBeNull();
  });

  test('une lecture sans prix n’est jamais servie comme un succès (incident dit, réessai court)', async () => {
    const h = harness({ price: 0 });
    const first = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(first.missing).toContain('price');
    expect(first.cacheKind).toBeNull(); // lecture fraîche, rien de mémorisé

    /* Phase 1 (06/10/2026) — le réessai immédiat est servi par le mémo d'échec
       (90 s) : on ne repaie pas 13–17 s de sondes vouées à l'échec, MAIS
       l'incident reste DIT (prix toujours manquant, origine `failure_memo`) :
       jamais un prix inventé, jamais un faux « produit prêt ». */
    const second = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(second.cacheKind).toBe('failure_memo');
    expect(second.fromCache).toBe(true);
    expect(second.missing).toContain('price');
    expect(ayWebsResolveFailureCacheStats().hits).toBeGreaterThan(0);

    // Mémo désactivé ⇒ comportement historique : chaque appel resonde le marchand.
    process.env.AYWEBS_RESOLVE_FAILURE_TTL_MS = '0';
    clearAyWebsResolveCache();
    clearAyWebsResolveFailureCache();
    await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
  });

  test('deux résolutions simultanées = UNE seule lecture marchande', async () => {
    const h = harness({ delayMs: 60 });
    const [a, b] = await Promise.all([
      resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID }),
      resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID }),
    ]);
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(a.productId).toBe(b.productId);
  });

  test('le cache se désactive par configuration (TTL = 0)', async () => {
    process.env.AYWEBS_RESOLVE_CACHE_TTL_MS = '0';
    const h = harness();
    await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
  });

  test('le suivi du cache est réel, pas estimé (§46)', async () => {
    const h = harness();
    clearAyWebsResolveCache();
    await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    const stats = ayWebsResolveCacheStats();
    expect(stats.enabled).toBe(true);
    expect(stats.writes).toBe(1);
    expect(stats.hits).toBe(1);
    expect(stats.entries).toBe(1);
  });
});

describe('AYWEBs — le cache ne sert jamais une vérification', () => {
  test('un Add avec product_id revalide le prix marchand avant de créer la ligne', async () => {
    const h = harness();
    const initial = await resolveAyWebsProduct(h.resolver, { url: SHEIN_URL, sessionId: SESSION_ID });
    expect(initial.product.price).toBe(39.99);

    // Le prix change entre l'affichage de la fiche et le nouvel Add.
    const currentSource = fakeScraper({ price: 59.99 });
    h.scrapeProduct.mockResolvedValue(await currentSource.scrapeProduct(SHEIN_URL));
    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID, accountId: null,
      productId: initial.productId, sourceUrl: SHEIN_URL, storeId: 'shein', quantity: 1,
    });

    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
    expect(added.item.unitPrice).toBe(59.99);
    expect(added.item.priceSnapshot?.price).toBe(59.99);
  });

  test('la re-vérification du panier relit la source et voit le prix changé', async () => {
    const h = harness();
    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID, accountId: null, sourceUrl: AMAZON_URL,
      variantAttributes: { color: 'Black', size: '41' }, quantity: 1,
    });
    expect(added.item.unitPrice).toBe(39.99);

    // Le marchand a augmenté son prix ; le cache détient encore l'ancienne lecture.
    const pricier = fakeScraper({ price: 59.99 });
    h.scrapeProduct.mockResolvedValue(await pricier.scrapeProduct(AMAZON_URL));
    const verification = await verifyAyWebsCart(
      h.resolver,
      { sessionId: SESSION_ID, accountId: null, recheckSource: true },
    );
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
    expect(verification.changes.map((change) => change.code)).toContain('PRICE_CHANGED');
  });
});

describe('AYWEBs — clé de cache', () => {
  test('normalise l’hôte, le fragment et le suivi, sans toucher à l’identité produit', () => {
    const base = ayWebsResolveCacheKey('amazon', 'https://www.amazon.com/dp/B0ABCDEFGH');
    const same = ayWebsResolveCacheKey('amazon', 'https://WWW.AMAZON.COM/dp/B0ABCDEFGH?ref_=abc#reviews');
    const other = ayWebsResolveCacheKey('amazon', 'https://www.amazon.com/dp/B0ZZZZZZZZZ');
    const otherStore = ayWebsResolveCacheKey('shein', 'https://www.amazon.com/dp/B0ABCDEFGH');
    expect(same).toBe(base);
    expect(other).not.toBe(base);
    expect(otherStore).not.toBe(base);
  });
});
