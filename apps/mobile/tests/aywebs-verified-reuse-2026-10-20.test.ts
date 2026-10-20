/**
 * AYWEBs — lecture automatique locale, ouverture immédiate de la feuille et
 * validation serveur à la confirmation (20/10/2026).
 */
import { describe, expect, it } from 'vitest';

import type { AyWebsResolveOutcome, AyWebsResolvedProduct } from '@/api/aywebs';
import {
  AYWEBS_CAPTURE_SAFETY_TIMEOUT_MS,
  AYWEBS_VERIFIED_REUSE_MS,
  canOpenLocalSheetFromCapture,
  canReuseLocalCapture,
  canReuseVerified,
  extractCaptureSheetData,
  validateConfirmResolution,
} from '@/features/aywebs/captureFlow';

const URL_A = 'https://www.amazon.com/dp/B0000224VM';
const URL_B = 'https://www.amazon.com/dp/B00008I8YM';

function makeProduct(overrides: Partial<AyWebsResolvedProduct> = {}): AyWebsResolvedProduct {
  return {
    productId: 'ayw_prod_1',
    storeId: 'amazon',
    storeName: 'Amazon',
    sourceUrl: URL_A,
    sourceDomain: 'www.amazon.com',
    title: 'Pull en laine mérinos',
    brand: 'Stanley',
    images: ['https://m.media-amazon.com/images/I/pull.jpg'],
    price: 109,
    currency: 'USD',
    priceVerified: true,
    currencyVerified: true,
    availability: { state: 'AVAILABLE', reason: 'in_stock', checkedAt: '2026-10-20T12:00:00.000Z', source: 'capture', quantityHint: null },
    purchaseMode: 'ASSISTED_CHECKOUT',
    integrationType: 'SCRAPER',
    ayroviPricing: {
      totalTnd: 394,
      pricingVersion: 1,
      breakdown: {
        convertedSourcePrice: 340,
        shipping: 20,
        customs: 0,
        serviceFee: 34,
        other: 0,
      },
    },
    variantGroups: [],
    variantDetails: [],
    fromCache: false,
    cacheAgeMs: null,
    ...overrides,
  };
}

function makeOutcome(overrides: Partial<AyWebsResolveOutcome> = {}): AyWebsResolveOutcome {
  return {
    product: makeProduct(),
    capture: {
      used: true,
      fingerprint: 'fp_1',
      priceSource: 'client_capture_corroborated',
      corroborated: true,
      rejection: '',
    },
    priceRejection: null,
    missing: [],
    quoteToken: 'aywq1.signed_quote_token',
    ...overrides,
  };
}

describe('fiche vérifiée à l\'ouverture (compatibilité)', () => {
  it('fenêtre = 10 minutes (validité de la facture serveur par défaut)', () => {
    expect(AYWEBS_VERIFIED_REUSE_MS).toBe(10 * 60_000);
  });

  it('filet de sécurité silencieux = 20 secondes', () => {
    expect(AYWEBS_CAPTURE_SAFETY_TIMEOUT_MS).toBe(20_000);
  });

  it('même URL, vérifiée il y a 1 min ⇒ réutilisable', () => {
    const now = 1_000_000;
    expect(canReuseVerified({ url: URL_A, at: now - 60_000 }, URL_A, now)).toBe(true);
  });

  it('vérifiée il y a 10 min ou plus ⇒ pas réutilisable (relance)', () => {
    const now = 1_000_000;
    expect(canReuseVerified({ url: URL_A, at: now - AYWEBS_VERIFIED_REUSE_MS }, URL_A, now)).toBe(false);
  });

  it('autre URL ou rien de vérifié ⇒ jamais réutilisé', () => {
    const now = 1_000_000;
    expect(canReuseVerified({ url: URL_B, at: now - 1_000 }, URL_A, now)).toBe(false);
    expect(canReuseVerified(null, URL_A, now)).toBe(false);
  });
});

describe('capture locale WebView et extraction pour la feuille', () => {
  const CAPTURE_WITH_VARIANTS = {
    url: URL_A,
    title: 'Pull en laine mérinos',
    priceCandidates: [{ text: '$109.00', source: 'corePrice' }],
    amazon: {
      pageAsin: 'B0000224VM',
      selectedAsin: 'B0000224VM',
      options: [
        { dimension: 'color', value: 'Vert', asin: 'B0000224VM', selected: true, availabilityEvidence: 'available' },
        { dimension: 'color', value: 'Noir', asin: 'B00008I8YM', selected: false, availabilityEvidence: 'available' },
        { dimension: 'color', value: 'Rouge', asin: 'B000099999', selected: false, availabilityEvidence: 'unavailable' },
        { dimension: 'size', value: 'M', asin: 'B0000224VM', selected: true, availabilityEvidence: 'available' },
        { dimension: 'size', value: 'L', asin: 'B00008I8YM', selected: false, availabilityEvidence: 'available' },
      ],
      variants: [
        { asin: 'B0000224VM', selected: true, dimensions: [{ name: 'color', value: 'Vert' }, { name: 'size', value: 'M' }] },
        { asin: 'B00008I8YM', selected: false, dimensions: [{ name: 'color', value: 'Noir' }, { name: 'size', value: 'L' }] },
      ],
    },
  };

  it('réutilise la capture locale si elle est prête pour la même URL avec titre et candidat-prix', () => {
    expect(canOpenLocalSheetFromCapture(CAPTURE_WITH_VARIANTS)).toBe(true);
    expect(canReuseLocalCapture({ url: URL_A, status: 'ok', capture: CAPTURE_WITH_VARIANTS }, URL_A)).toBe(true);
    expect(canReuseLocalCapture({ url: URL_B, status: 'ok', capture: CAPTURE_WITH_VARIANTS }, URL_A)).toBe(false);
    expect(canReuseLocalCapture({ url: URL_A, status: 'pending', capture: CAPTURE_WITH_VARIANTS }, URL_A)).toBe(false);
    expect(canOpenLocalSheetFromCapture({ url: URL_A, title: '', priceCandidates: [] })).toBe(false);
  });

  it('extrait le titre, les tailles, les couleurs et la sélection initiale depuis la capture sans serveur', () => {
    const data = extractCaptureSheetData(CAPTURE_WITH_VARIANTS);
    expect(data.title).toBe('Pull en laine mérinos');
    expect(data.url).toBe(URL_A);
    expect(data.groups).toEqual([
      { attribute: 'color', values: ['Vert', 'Noir', 'Rouge'] },
      { attribute: 'size', values: ['M', 'L'] },
    ]);
    expect(data.initialSelection).toEqual({ color: 'Vert', size: 'M' });
    const rougeOption = data.options.find((opt) => opt.attributes.color === 'Rouge');
    expect(rougeOption?.availability).toBe('OUT_OF_STOCK');
  });
});

describe('validation serveur à la confirmation dans la feuille', () => {
  it('accepte une fiche disponible avec devis signé valide', () => {
    const verdict = validateConfirmResolution(makeOutcome(), { color: 'Vert', size: 'M' });
    expect(verdict).toEqual({ ok: true });
  });

  it('refuse OUT_OF_STOCK (rejet capture ou état produit)', () => {
    const rejectedCapture = makeOutcome({
      capture: { used: false, fingerprint: 'fp', priceSource: 'none', corroborated: false, rejection: 'OUT_OF_STOCK' },
    });
    expect(validateConfirmResolution(rejectedCapture, null)).toEqual({ ok: false, code: 'OUT_OF_STOCK' });

    const outOfStockProduct = makeOutcome({
      product: makeProduct({
        availability: { state: 'OUT_OF_STOCK', reason: 'out_of_stock', checkedAt: '', source: 'capture', quantityHint: null },
      }),
    });
    expect(validateConfirmResolution(outOfStockProduct, null)).toEqual({ ok: false, code: 'OUT_OF_STOCK' });
  });

  it('refuse VARIANT_NOT_PROVEN quand la variante choisie n\'est pas prouvée par le serveur', () => {
    const rejectedVariant = makeOutcome({
      capture: { used: false, fingerprint: 'fp', priceSource: 'none', corroborated: false, rejection: 'VARIANT_NOT_PROVEN' },
    });
    expect(validateConfirmResolution(rejectedVariant, { color: 'Noir' })).toEqual({
      ok: false,
      code: 'VARIANT_NOT_PROVEN',
    });

    const unverifiedSelection = makeOutcome({
      product: makeProduct({
        availability: {
          state: 'UNKNOWN',
          reason: 'selection_not_verified_by_capture:color:noir',
          checkedAt: '',
          source: 'capture',
          quantityHint: null,
        },
      }),
    });
    expect(validateConfirmResolution(unverifiedSelection, { color: 'Noir' })).toEqual({
      ok: false,
      code: 'VARIANT_NOT_PROVEN',
    });
  });

  it('refuse PRICE_CHANGED quand le serveur signale un rejet ou changement de prix', () => {
    const priceRejected = makeOutcome({ priceRejection: 'AMBIGUOUS_PRICE' });
    expect(validateConfirmResolution(priceRejected, null)).toEqual({
      ok: false,
      code: 'PRICE_CHANGED',
    });
  });

  it('refuse CAPTURE_INCOMPLETE quand la capture est rejetée avec champs manquants', () => {
    const incomplete = makeOutcome({
      capture: { used: false, fingerprint: 'fp', priceSource: 'none', corroborated: false, rejection: 'NO_PRICE_TEXT' },
      missing: ['price', 'verified_price'],
    });
    expect(validateConfirmResolution(incomplete, null)).toEqual({
      ok: false,
      code: 'CAPTURE_INCOMPLETE',
      missingFields: ['price', 'verified_price'],
    });
  });

  it('refuse l\'ajout sans devis signé valide (jamais d\'ajout sans quoteToken)', () => {
    const noQuote = makeOutcome({ quoteToken: '' });
    expect(validateConfirmResolution(noQuote, null)).toEqual({
      ok: false,
      code: 'PRICE_UNAVAILABLE',
    });
  });
});
