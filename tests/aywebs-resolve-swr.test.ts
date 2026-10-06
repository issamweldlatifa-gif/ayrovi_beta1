/**
 * AYWEBs — SWR + COUPE-CIRCUIT PAR HÔTE (« Phase 1 », 06/10/2026).
 *
 * Le contrat protégé ici est celui du plan 1.5 : « l'échec de 13–28 s devient
 * 2–4 s ». Deux mécanismes, deux vérités à ne jamais trahir :
 *
 *   1. SWR : une lecture expirée reste SERVIE (le client n'attend pas), mais
 *      elle est étiquetée `servedStale` et une relecture part derrière ;
 *   2. coupe-circuit : après 3 échecs consécutifs, l'hôte se repose 10 min — on
 *      ne paie plus de sondes vouées à l'échec, et on le DIT (STORE_UNAVAILABLE,
 *      réessai autorisé) au lieu d'inventer un produit ou de faire patienter.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-swr-')), 'cache');

import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { ayWebsResolveCacheStats, clearAyWebsResolveCache } from '../src/aywebs/resolveCache';
import { clearAyWebsResolveFailureCache } from '../src/aywebs/resolveCache';
import { probeCooldowns, resetProbeState } from '../src/scraper/hostCircuit';
import { resetAyWebsReadGate } from '../src/aywebs/readGate';

const OK_URL = 'https://www.amazon.com/dp/B0ABCDEFGH';
const KO_URL = 'https://www.amazon.com/dp/B0ZZZZZZZZ';
const SESSION_ID = 'swr-session-000000000001';

const TOUCHED_ENV = [
  'AYWEBS_RESOLVE_CACHE_TTL_MS', 'AYWEBS_RESOLVE_STALE_MS', 'AYWEBS_HOST_CIRCUIT',
  'AYWEBS_RESOLVE_FAILURE_TTL_MS',
];

afterEach(() => {
  for (const key of TOUCHED_ENV) delete process.env[key];
  clearAyWebsResolveCache();
  clearAyWebsResolveFailureCache();
  resetProbeState();
  resetAyWebsReadGate();
});

beforeEach(() => {
  clearAyWebsResolveCache();
  clearAyWebsResolveFailureCache();
  resetProbeState();
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

/**
 * Marchand simulé : `B0ABCDEFGH` répond, `B0ZZZZZZZZ` est bloqué (comme un mur
 * anti-robot). Le compteur d'appels est la mesure — pas une impression.
 */
function harness() {
  const scrapeProduct = vi.fn(async (url: string) => {
    if (url.includes('B0ZZZZZZZZ')) throw new Error('403 bot wall');
    return {
      id: 'scraped_amazon',
      store: 'amazon',
      storeName: 'Amazon',
      url,
      externalId: 'B0ABCDEFGH',
      title: 'Nike Air Max shoes',
      description: 'Produit de test',
      images: ['https://images.example.test/product.jpg'],
      mainImage: 'https://images.example.test/product.jpg',
      sourcePrice: 39.99,
      sourceCurrency: 'USD',
      convertedPriceTND: 0, estimatedShippingTND: 0, serviceFeeTND: 0, totalPriceTND: 0,
      variants: {
        colors: ['Black'],
        sizes: ['41'],
        details: [{ id: 'v-black-41', color: 'Black', size: '41', price: 39.99, stock: true }],
      },
      availability: 'in_stock' as const,
      condition: undefined,
      brand: 'Nike',
      priceVerified: true,
      currencyVerified: true,
      verificationProvider: 'direct',
      verificationMethod: 'json_ld',
      verificationFailureCode: null,
      scrapedAt: new Date().toISOString(),
    };
  });
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const ctx = createAyWebsContext(db, { cleanPastedUrl: (v: string) => String(v).trim(), scrapeProduct } as any);
  return { resolver: ctx.resolver, scrapeProduct };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Attend qu'une condition asynchrone (relecture d'arrière-plan) se réalise. */
async function until(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate() && Date.now() < deadline) await sleep(10);
}

/** Ouvre le coupe-circuit de l'hôte : trois lectures bloquées consécutives. */
async function openCircuit(h: ReturnType<typeof harness>): Promise<number> {
  const before = h.scrapeProduct.mock.calls.length;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await resolveAyWebsProduct(h.resolver, { url: KO_URL, sessionId: SESSION_ID }).catch(() => null);
  }
  expect(h.scrapeProduct.mock.calls.length).toBe(before + 3);
  expect(probeCooldowns().length).toBe(1);
  return h.scrapeProduct.mock.calls.length;
}

describe('AYWEBs Phase 1 — SWR (stale-while-revalidate)', () => {
  it('sert une lecture périmée en le disant, et relance une relecture derrière', async () => {
    process.env.AYWEBS_RESOLVE_CACHE_TTL_MS = '60';
    const h = harness();

    const first = await resolveAyWebsProduct(h.resolver, { url: OK_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(first.servedStale).toBe(false);
    expect(first.cacheKind).toBeNull(); // lecture fraîche

    await sleep(90); // le TTL (60 ms) est dépassé, la fenêtre SWR (30 min) non

    const second = await resolveAyWebsProduct(h.resolver, { url: OK_URL, sessionId: SESSION_ID });
    expect(second.servedStale).toBe(true);       // ← servi tout de suite…
    expect(second.fromCache).toBe(true);
    expect(second.cacheKind).toBe('read');
    expect(second.product.price).toBe(39.99);    // …avec la dernière lecture connue

    await until(() => h.scrapeProduct.mock.calls.length >= 2); // …et relu derrière
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);

    const third = await resolveAyWebsProduct(h.resolver, { url: OK_URL, sessionId: SESSION_ID });
    expect(third.servedStale).toBe(false);       // la relecture a rafraîchi l'entrée
    expect(third.cacheKind).toBe('read');
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
    expect(ayWebsResolveCacheStats().stale_hits).toBeGreaterThan(0);
  });

  it('SWR désactivé (AYWEBS_RESOLVE_STALE_MS=0) : plus aucune fiche périmée servie', async () => {
    process.env.AYWEBS_RESOLVE_CACHE_TTL_MS = '60';
    process.env.AYWEBS_RESOLVE_STALE_MS = '0';
    const h = harness();

    await resolveAyWebsProduct(h.resolver, { url: OK_URL, sessionId: SESSION_ID });
    await sleep(90);
    const second = await resolveAyWebsProduct(h.resolver, { url: OK_URL, sessionId: SESSION_ID });

    expect(second.servedStale).toBe(false);
    expect(second.cacheKind).toBeNull();         // lecture fraîche classique
    expect(h.scrapeProduct).toHaveBeenCalledTimes(2);
  });
});

describe('AYWEBs Phase 1 — coupe-circuit par hôte', () => {
  it('après 3 échecs, la lecture est refusée VITE et honnêtement (aucune sonde de plus)', async () => {
    const h = harness();
    await openCircuit(h);

    const startedAt = Date.now();
    const failure = await resolveAyWebsProduct(h.resolver, { url: KO_URL, sessionId: SESSION_ID })
      .then(() => null, (error) => error);
    const elapsedMs = Date.now() - startedAt;

    expect(failure).not.toBeNull();
    expect(failure.code).toBe('STORE_UNAVAILABLE');
    expect(String(failure.contract?.technicalMessage || failure.message)).toContain('host_circuit_open');
    expect(failure.contract.retryAllowed).toBe(true);
    expect(h.scrapeProduct).toHaveBeenCalledTimes(3); // ← plus aucune sonde payée (3 = l'ouverture)
    expect(elapsedMs).toBeLessThan(1_000);
  });

  it('le coupe-circuit se désactive par configuration (AYWEBS_HOST_CIRCUIT=off)', async () => {
    const h = harness();
    await openCircuit(h);

    process.env.AYWEBS_HOST_CIRCUIT = 'off';
    await resolveAyWebsProduct(h.resolver, { url: KO_URL, sessionId: SESSION_ID }).catch(() => null);
    expect(h.scrapeProduct).toHaveBeenCalledTimes(4); // la sonde est retentée
  });

  it('hôte au repos : la fiche périmée est servie, mais AUCUNE relecture inutile n’est lancée', async () => {
    process.env.AYWEBS_RESOLVE_CACHE_TTL_MS = '60';
    const h = harness();

    const first = await resolveAyWebsProduct(h.resolver, { url: OK_URL, sessionId: SESSION_ID });
    expect(first.servedStale).toBe(false);
    const afterCircuit = await openCircuit(h);   // 3 échecs sur le même hôte
    await sleep(90);                             // l'entrée OK_URL devient périmée

    const { hostAllowsProbe } = await import('../src/scraper/hostCircuit');
    expect(hostAllowsProbe(OK_URL)).toBe(false);          // l'hôte est bien au repos
    const served = await resolveAyWebsProduct(h.resolver, { url: OK_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct.mock.calls.length).toBe(afterCircuit); // rien parti pendant la réponse
    expect(served.servedStale).toBe(true);
    expect(served.product.price).toBe(39.99);

    await sleep(120);                            // le temps qu'une relecture aurait eu lieu
    expect(h.scrapeProduct.mock.calls.length).toBe(afterCircuit); // rien de parti derrière
  });
});
