/**
 * AYWEBs — FEUILLE D'AJOUT : prix en dinars, disponibilité prouvée, ajout réel
 * (23/10/2026).
 *
 * Constat sur l'appareil, capture Amazon à l'appui :
 *   • le prix s'affichait une seconde à l'injection puis disparaissait dès qu'on
 *     changeait de couleur ou de taille ;
 *   • il était écrit en dollars — jamais en dinars ;
 *   • aucune preuve de disponibilité n'était montrée ;
 *   • « Add to Cart » répondait « La demande n'a pas abouti » (409 générique).
 *
 * Ces tests verrouillent le contrat serveur qui rend la feuille honnête :
 *   1. la fiche résolue porte le prix de la combinaison AFFICHÉE en dinars ;
 *   2. chaque valeur publiée porte SON prix en dinars (`variant_quotes`) — la
 *      différence entre deux couleurs vient du marchand, jamais d'une règle de
 *      trois côté application ;
 *   3. la combinaison affichée s'ajoute vraiment ;
 *   4. une combinaison que la page ne prouve pas est REFUSÉE avec un code nommé
 *      (`STOCK_UNKNOWN`) — le client le traduit en phrase claire, il ne promet
 *      pas un stock qu'il n'a pas vu.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-sheet-price-')), 'cache');

import { detectAyWebsStore } from '../shared/aywebsStores';
import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { addAyWebsCartItem } from '../src/aywebs/cart';
import { createAyWebsRouter } from '../src/aywebs/routes';

const PAGE_URL = 'https://www.amazon.com/dp/B0BLUE0001';
const SESSION = 'sheet-price-session-0001';

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

function harness() {
  const scrapeProduct = vi.fn(async (url: string) => ({
    id: 'scraped_amazon', store: detectAyWebsStore(url)?.id || 'generic', storeName: 'Amazon',
    url, externalId: 'B0BLUE0001', title: 'MAGCOMSEN Mens Lightweight Hiking Pants',
    description: '', images: ['https://m.media-amazon.com/img.jpg'], mainImage: 'https://m.media-amazon.com/img.jpg',
    sourcePrice: 19.98, sourceCurrency: 'USD', convertedPriceTND: 0, estimatedShippingTND: 0,
    serviceFeeTND: 0, totalPriceTND: 0, variants: { colors: [], sizes: [], details: [] },
    availability: 'in_stock' as const, condition: undefined, brand: undefined,
    priceVerified: true, currencyVerified: true, verificationProvider: 'direct', verificationMethod: 'json_ld',
    verificationFailureCode: null, scrapedAt: new Date().toISOString(),
  }));
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const scraper = { cleanPastedUrl: (value: string) => String(value).trim(), scrapeProduct };
  const ctx = createAyWebsContext(db, scraper as any);
  return { db, resolver: ctx.resolver, scraper, scrapeProduct };
}

/** Capture Amazon réelle : trois couleurs avec LEUR prix, tailles sans prix. */
const CAPTURE = {
  v: 1,
  url: PAGE_URL,
  canonicalUrl: PAGE_URL,
  title: 'Amazon.com: MAGCOMSEN Mens Lightweight Hiking Pants Quick Dry Workout',
  brand: 'MAGCOMSEN',
  images: ['https://m.media-amazon.com/img.jpg'],
  priceCandidates: [{ text: '$19.98', source: 'json_ld' }, { text: '$19.98', source: 'dom' }],
  currencyText: 'USD',
  availabilityText: 'In Stock',
  addToCartText: 'Add to Cart',
  conditionText: null,
  selectedVariantTexts: ['Color Blue', '38'],
  variantTexts: [],
  diagnostics: [],
  capturedAt: new Date().toISOString(),
  amazon: {
    pageAsin: 'B0BLUE0001',
    selectedAsin: 'B0BLUE0001',
    selectedValues: ['Color Blue', '38'],
    options: [
      { dimension: 'Couleur', value: 'Color Blue', asin: 'B0BLUE0001', selected: true, availabilityEvidence: 'available', price: '$19.98', stock: null },
      { dimension: 'Couleur', value: 'Dark Gray', asin: 'B0GRAY0002', selected: false, availabilityEvidence: 'unknown', price: '$24.98', stock: null },
      { dimension: 'Couleur', value: 'Black', asin: 'B0BLACK003', selected: false, availabilityEvidence: 'unknown', price: '$21.98', stock: null },
      { dimension: 'Taille', value: '38', asin: 'B0BLUE0001', selected: true, availabilityEvidence: 'unknown', price: null, stock: null },
      { dimension: 'Taille', value: '40', asin: 'B0GRAY0002', selected: false, availabilityEvidence: 'unknown', price: null, stock: null },
    ],
    variants: [],
  },
  variantGroups: [],
};

const SHOWN = { couleur: 'Color Blue', taille: '38' };
const OTHER = { couleur: 'Dark Gray', taille: '40' };

describe('feuille d’ajout — la fiche porte le prix en dinars', () => {
  it('la combinaison affichée a un prix en dinars et une disponibilité prouvée', async () => {
    const h = harness();
    const resolved = await resolveAyWebsProduct(h.resolver, {
      url: PAGE_URL, sessionId: SESSION, capture: CAPTURE, refresh: true, selectedVariant: SHOWN,
    });
    expect(resolved.product.availability.state).toBe('AVAILABLE');
    expect(resolved.product.ayroviPricing?.totalTnd).toBeGreaterThan(0);
  });

  it('chaque couleur publie SON prix en dinars (variant_quotes)', async () => {
    const h = harness();
    const app = express();
    app.use(express.json({ limit: '256kb' }));
    app.use((req, _res, next) => { (req as any).requestId = 'sheet-price'; next(); });
    app.use('/api/v1/aywebs', createAyWebsRouter(h.db, h.scraper as any));
    const response = await request(app).post('/api/v1/aywebs/product/resolve')
      .set({ 'x-session-id': SESSION })
      .send({ url: PAGE_URL, capture: CAPTURE, refresh: true, variant: SHOWN });
    expect(response.status).toBe(201);
    const quotes = response.body.data.variant_quotes as Array<Record<string, unknown>>;
    const byValue = (value: string) => quotes.find((entry) => entry.value === value)!;
    expect(byValue('Color Blue').total_tnd).toBeCloseTo(response.body.data.ayrovi_pricing.total_tnd, 3);
    expect(byValue('Dark Gray').source_price).toBe(24.98);
    expect(byValue('Dark Gray').total_tnd as number).toBeGreaterThan(byValue('Color Blue').total_tnd as number);
    /* La taille ne publie pas de prix : aucun montant n'est inventé. */
    expect(byValue('40')).toMatchObject({ source_price: null, total_tnd: null });
  });
});

describe('feuille d’ajout — l’ajout réel', () => {
  it('la combinaison affichée s’ajoute au panier', async () => {
    const h = harness();
    const resolved = await resolveAyWebsProduct(h.resolver, {
      url: PAGE_URL, sessionId: SESSION, capture: CAPTURE, refresh: true, selectedVariant: SHOWN,
    });
    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION, accountId: null, productId: resolved.productId, sourceUrl: PAGE_URL,
      variantAttributes: SHOWN, quantity: 1, quoteToken: resolved.quoteToken,
      capture: CAPTURE, requestId: 'sheet-price-1',
    });
    expect(added.item.productId).toBe(resolved.productId);
    expect(added.item.lineTotalTnd).toBeGreaterThan(0);
  });

  it('une combinaison que la page ne prouve pas est refusée — code nommé, pas un échec muet', async () => {
    const h = harness();
    const resolved = await resolveAyWebsProduct(h.resolver, {
      url: PAGE_URL, sessionId: SESSION, capture: CAPTURE, refresh: true, selectedVariant: OTHER,
    });
    await expect(addAyWebsCartItem(h.resolver, {
      sessionId: SESSION, accountId: null, productId: resolved.productId, sourceUrl: PAGE_URL,
      variantAttributes: OTHER, quantity: 1, quoteToken: resolved.quoteToken,
      capture: CAPTURE, requestId: 'sheet-price-2',
    })).rejects.toMatchObject({ code: 'STOCK_UNKNOWN' });
  });
});
