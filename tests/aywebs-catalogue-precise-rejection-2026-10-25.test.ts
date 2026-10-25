/**
 * AYWEBs — boutique « catalogue » + capture refusée : un code d'erreur PRÉCIS,
 * jamais le fourre-tout PRODUCT_PAGE_REQUIRED (25/10/2026).
 *
 * Constat mobile : sur une fiche Zalando, le client ouvre la feuille d'ajout et
 * reçoit un message générique parce que la chaîne aplatissait tout refus de
 * capture en `PRODUCT_PAGE_REQUIRED`. Une boutique catalogue n'a AUCUNE lecture
 * serveur de secours (CatalogueStoreAdapter rejette toujours) : le motif de
 * refus de la capture est donc la seule réponse honnête.
 *
 * Ces tests verrouillent :
 *   1. la table de traduction rejet → code métier (tous les motifs connus) ;
 *   2. une capture Zalando à prix mono-source (non corroboré) remonte
 *      PRICE_AMBIGUOUS avec le motif technique explicite, sans jamais scraper ;
 *   3. l'absence de capture garde le comportement historique PRODUCT_PAGE_REQUIRED.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import {
  ayWebsCaptureRejectionErrorCode,
  validateAyWebsCapturedPage,
} from '../src/aywebs/webviewCapture';
import { createAyWebsContext } from '../src/aywebs/context';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { AyWebsDomainError } from '../src/aywebs/errors';
import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';

const ZALANDO_URL = 'https://www.zalando.fr/casque-bluetooth-CASQ123.html';
const SESSION_ID = 'catalogue-reject-00000001';

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
  /* Une boutique catalogue ne doit JAMAIS déclencher de lecture marchande :
     si le scraper était appelé, ce mock échouerait le test bruyamment. */
  const scrapeProduct = vi.fn(async () => {
    throw new Error('catalogue store must never scrape');
  });
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const scraper = { cleanPastedUrl: (value: string) => value.trim(), scrapeProduct };
  const ctx = createAyWebsContext(db, scraper as never);
  return { resolver: ctx.resolver, scrapeProduct };
}

function captureFrom(pageHtml: string, url = ZALANDO_URL) {
  const dom = new JSDOM(pageHtml, { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  const payload = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL)));
  return payload;
}

beforeEach(() => {
  process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE = '0';
  process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE = '0';
  process.env.AYWEBS_QUOTE_REVERIFY_TND = '0';
});
afterEach(() => {
  delete process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE;
  delete process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE;
  delete process.env.AYWEBS_QUOTE_REVERIFY_TND;
});

describe('ayWebsCaptureRejectionErrorCode — chaque motif nomme la vraie cause', () => {
  it('prix indisponible / rejeté → PRICE_UNAVAILABLE', () => {
    expect(ayWebsCaptureRejectionErrorCode('NO_PRICE_TEXT')).toBe('PRICE_UNAVAILABLE');
    expect(ayWebsCaptureRejectionErrorCode('PRICE_REJECTED')).toBe('PRICE_UNAVAILABLE');
  });

  it('prix non corroboré / ambigu / mauvaise boîte d’achat → PRICE_AMBIGUOUS', () => {
    expect(ayWebsCaptureRejectionErrorCode('PRICE_NOT_CORROBORATED')).toBe('PRICE_AMBIGUOUS');
    expect(ayWebsCaptureRejectionErrorCode('AMBIGUOUS_PRICE')).toBe('PRICE_AMBIGUOUS');
    expect(ayWebsCaptureRejectionErrorCode('BUYBOX_ASIN_MISMATCH')).toBe('PRICE_AMBIGUOUS');
  });

  it('nature de page et variante gardent leur code métier', () => {
    expect(ayWebsCaptureRejectionErrorCode('NOT_A_PRODUCT_PAGE')).toBe('PRODUCT_PAGE_REQUIRED');
    expect(ayWebsCaptureRejectionErrorCode('VARIANT_NOT_PROVEN')).toBe('VARIANT_UNKNOWN');
    expect(ayWebsCaptureRejectionErrorCode('OUT_OF_STOCK')).toBe('OUT_OF_STOCK');
  });

  it('motifs d’intégrité / null / inconnus → CAPTURE_INCOMPLETE (jamais undefined)', () => {
    for (const reason of ['STALE_CAPTURE', 'FUTURE_CAPTURE', 'URL_HOST_MISMATCH',
      'CANONICAL_HOST_MISMATCH', 'BAD_VERSION', 'NOT_AN_OBJECT', 'TOO_LARGE',
      null, undefined, 'SOMETHING_NEW']) {
      expect(ayWebsCaptureRejectionErrorCode(reason)).toBe('CAPTURE_INCOMPLETE');
    }
  });
});

describe('capture Zalando refusée — intégration résolveur', () => {
  it('prix DOM mono-source : refus de corroboration → PRICE_AMBIGUOUS, motif technique explicite', async () => {
    const page = `<!doctype html><html lang="fr"><head><title>Casque Zalando</title></head>
      <body><h1>Casque Bluetooth</h1>
      <div class="product-price">27,95 €</div>
      <button>Ajouter au panier</button></body></html>`;
    const payload = captureFrom(page);

    /* Le résolveur applique lui-même ces seuils à une boutique catalogue :
       on reproduit la même validation pour nommer le motif exact. */
    const strict = validateAyWebsCapturedPage(payload, ZALANDO_URL, {
      requireCorroboration: true,
      requireProductPage: true,
    });
    expect(strict.ok).toBe(false);
    expect(strict.rejection).toBe('PRICE_NOT_CORROBORATED');

    const h = harness();
    let caught: unknown = null;
    try {
      await resolveAyWebsProduct(h.resolver, { url: ZALANDO_URL, sessionId: SESSION_ID, capture: payload });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AyWebsDomainError);
    const domainError = caught as AyWebsDomainError;
    expect(domainError.code).toBe('PRICE_AMBIGUOUS');
    expect(domainError.contract.technicalMessage).toMatch(/^capture_rejected:PRICE_NOT_CORROBORATED /);
    expect(h.scrapeProduct).not.toHaveBeenCalled();
  });

  it('aucune capture jointe : le comportement historique PRODUCT_PAGE_REQUIRED est préservé', async () => {
    const h = harness();
    let caught: unknown = null;
    try {
      await resolveAyWebsProduct(h.resolver, { url: ZALANDO_URL, sessionId: SESSION_ID });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AyWebsDomainError);
    expect((caught as AyWebsDomainError).code).toBe('PRODUCT_PAGE_REQUIRED');
  });
});
