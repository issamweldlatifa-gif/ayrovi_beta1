/**
 * AYWEBs — CAPTURE DEPUIS LE WebView DU CLIENT (« Phase 2.1 », 06/10/2026).
 *
 * Ce que cette suite verrouille, avec des compteurs et des pages réelles :
 *
 *   1. LECTEUR CLIENT : le script (`captureScript.ts`) extrait des TEXTES de la
 *      page — jamais un prix fourni par l'appelant. Il est exécuté ici sur des
 *      pages fabriquées pour chaque piège connu (prix dupliqué, devise fausse,
 *      bouton désactivé, options de navigation) ;
 *   2. VERDICT SERVEUR : c'est `webviewCapture.ts` qui décide — verdict
 *      d'intégrité de la Phase 0 sur chaque texte, devise prouvée par code ISO,
 *      corroboration exigée (JSON-LD, ou deux sources indépendantes d'accord) ;
 *   3. ZÉRO RÉSEAU : une capture acceptée ne déclenche AUCUNE lecture marchande
 *      (le compteur du scraper reste à zéro), ce qui est tout l'intérêt du
 *      modèle Add-to-Buyee ;
 *   4. HONNÊTETÉ : une capture refusée ne bloque rien — elle retombe sur la
 *      lecture serveur, et le motif est renvoyé au client ;
 *   5. ANTI-FRAUDE : vérification par échantillon déterministe, en arrière-plan,
 *      avec événement d'exploitation en cas d'écart avec une relecture serveur ;
 *   6. BOUTIQUE EXTERNE (« Add-to-Buyee ») : un domaine ABSENT du Store Registry
 *      peut être résolu — mais UNIQUEMENT sur capture corroborée, avec un seuil
 *      plus haut que les boutiques nommées. Sans capture, la réponse reste
 *      `DOMAIN_NOT_ALLOWED` et le chemin « Order with URL » (§23).
 *
 * Les deux URL de la suite sont donc distinctes À DESSEIN :
 *   • `PRODUCT_URL` — domaine HORS registre : chemin client (capture) ;
 *   • `REGISTERED_URL` — boutique du registre : chemin serveur historique.
 */
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import express from 'express';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-capture-')), 'cache');

import { detectAyWebsStore } from '../shared/aywebsStores';
import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { addAyWebsCartItem } from '../src/aywebs/cart';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { AYWEBS_CAPTURE_SCRIPT, AYWEBS_CAPTURE_SCRIPT_PATH } from '../src/aywebs/captureScript';
import { validateAyWebsCapturedPage, shouldVerifyWebviewCaptureInBackground } from '../src/aywebs/webviewCapture';
import { clearAyWebsResolveCache } from '../src/aywebs/resolveCache';
import { clearAyWebsResolveFailureCache } from '../src/aywebs/resolveCache';
import { resetAyWebsReadGate } from '../src/aywebs/readGate';
import { resetProbeState } from '../src/scraper/hostCircuit';

/** Domaine HORS REGISTRE : la page que le client a ouverte dans son WebView. */
const PRODUCT_URL = 'https://shop.example-store.fr/products/casque-bluetooth';
/** Boutique du REGISTRE : garde le chemin serveur historique (lecture réseau). */
const REGISTERED_URL = 'https://www.amazon.com/dp/B0D1XD1ZV3';
const SESSION_ID = 'capture-session-0000000001';

const TOUCHED_ENV = [
  'AYWEBS_WEBVIEW_VERIFY_SAMPLE', 'AYWEBS_HOST_CIRCUIT', 'AYWEBS_RESOLVE_CACHE_TTL_MS',
  'AYWEBS_QUOTE_REVERIFY_SAMPLE', 'AYWEBS_QUOTE_REVERIFY_TND',
];
afterEach(() => {
  for (const key of TOUCHED_ENV) delete process.env[key];
  clearAyWebsResolveCache();
  clearAyWebsResolveFailureCache();
  resetAyWebsReadGate();
  resetProbeState();
});
beforeEach(() => {
  // La vérification par échantillon est DÉSACTIVÉE par défaut dans cette suite :
  // les tests qui la concernent l'activent explicitement (sinon un tirage
  // aléatoire ferait varier le nombre de lectures, et le test mentirait).
  process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE = '0';
  /* L'audit du DEVIS (tirage aléatoire sur qid) relancerait une lecture
     marchande dans ~5 % des ajouts : hors sujet ici, et une source de test
     instable. Les tests qui portent sur l'audit l'activent explicitement. */
  process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE = '0';
  process.env.AYWEBS_QUOTE_REVERIFY_TND = '0';
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

/** Exécute le lecteur client sur une page, comme le fait le WebView Android. */
function captureFrom(pageHtml: string, url = PRODUCT_URL) {
  const dom = new JSDOM(pageHtml, { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  const payload = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL)));
  return { payload, validation: validateAyWebsCapturedPage(payload, url) };
}

function harness(options: { price?: number } = {}) {
  const scrapeProduct = vi.fn(async (url: string) => ({
    id: 'scraped_generic',
    // La boutique est celle du DOMAINE : le vrai scraper le fait, et les
    // adaptateurs refusent une capture qui ne vient pas de leur boutique.
    store: detectAyWebsStore(url)?.id || 'generic',
    storeName: 'Boutique',
    url,
    externalId: 'sku-1',
    title: 'Casque Bluetooth (lecture serveur)',
    description: 'Produit de test',
    images: ['https://cdn.example-store.fr/img.jpg'],
    mainImage: 'https://cdn.example-store.fr/img.jpg',
    sourcePrice: options.price ?? 129.99,
    sourceCurrency: 'EUR',
    convertedPriceTND: 0, estimatedShippingTND: 0, serviceFeeTND: 0, totalPriceTND: 0,
    variants: { colors: [], sizes: [], details: [] },
    availability: 'in_stock' as const,
    condition: undefined,
    brand: 'TestBrand',
    priceVerified: true,
    currencyVerified: true,
    verificationProvider: 'direct',
    verificationMethod: 'json_ld',
    verificationFailureCode: null,
    scrapedAt: new Date().toISOString(),
  }));
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const scraper = { cleanPastedUrl: (value: string) => String(value).trim(), scrapeProduct };
  const ctx = createAyWebsContext(db, scraper as any);
  return { db, resolver: ctx.resolver, scraper, scrapeProduct, ctx };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/* ── Pages d'essai : chaque piège mesuré sur de vraies pages le 06/10/2026 ── */

/** Boutique à JSON-LD complet (Shopify/WooCommerce typiques). */
const jsonLdPage = (url: string) => `<!doctype html><html lang="fr"><head>
<title>Casque Bluetooth — TestBrand</title>
<link rel="canonical" href="${url}">
<meta property="og:image" content="https://cdn.example-store.fr/img.jpg">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Casque Bluetooth TestBrand",
 "brand":{"@type":"Brand","name":"TestBrand"},
 "image":["https://cdn.example-store.fr/img.jpg"],
 "offers":{"@type":"Offer","price":"129.99","priceCurrency":"EUR",
   "availability":"https://schema.org/InStock","itemCondition":"https://schema.org/NewCondition"}}
</script></head><body>
<h1>Casque Bluetooth TestBrand</h1><div class="product-price">129,99 €</div>
<button id="add-to-cart">Ajouter au panier</button></body></html>`;

/** Page JSON-LD du domaine hors registre (par défaut dans cette suite). */
const JSON_LD_PAGE = jsonLdPage(PRODUCT_URL);
/** Même page, servie par une boutique DU REGISTRE. */
const REGISTERED_JSON_LD_PAGE = jsonLdPage(REGISTERED_URL);

/** Même page, prix affiché DÉTACHÉ du JSON-LD (le prix « vendu » est ailleurs). */
const CONFLICTING_PRICE_PAGE = `<!doctype html><html><head><title>Casque</title>
<script type="application/ld+json">
{"@type":"Product","name":"Casque Bluetooth","offers":{"@type":"Offer","price":"129.99","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
</script></head><body>
<div class="product-price">89,99 €</div>
<button>Ajouter au panier</button></body></html>`;

/** Page sans JSON-LD : une seule lecture DOM, sans code ISO. */
const DOM_ONLY_PAGE = `<!doctype html><html lang="fr"><head><title>Casque sans données structurées</title></head>
<body><div class="product-price">49,99 €</div><button>Ajouter au panier</button></body></html>`;

/** Page avec méta + DOM d'accord : deux sources indépendantes. */
const CORROBORATED_PAGE = `<!doctype html><html lang="fr"><head><title>Casque méta</title>
<meta property="product:price:amount" content="79.50">
<meta property="product:price:currency" content="EUR">
</head><body><div class="product-price">79,50 €</div>
<button>Ajouter au panier</button></body></html>`;

/** Le piège de la Phase 0 : prix concaténé par la page elle-même. */
const DUPLICATED_PRICE_PAGE = `<!doctype html><html><head><title>Piège</title></head>
<body><div class="product-price">$6.99$6.99</div></body></html>`;

/** Bouton désactivé : on ne peut pas acheter, donc pas de stock prouvé. */
const DISABLED_PAGE = `<!doctype html><html><head><title>Rupture</title>
<script type="application/ld+json">
{"@type":"Product","name":"Casque","offers":{"@type":"Offer","price":"59.00","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
</script></head><body><div class="product-price">59,00 €</div>
<button disabled aria-disabled="true">Ajouter au panier</button></body></html>`;

/** Rupture publiée par la source. */
const OUT_OF_STOCK_PAGE = `<!doctype html><html><head><title>Rupture</title>
<script type="application/ld+json">
{"@type":"Product","name":"Casque","offers":{"@type":"Offer","price":"59.00","priceCurrency":"EUR","availability":"https://schema.org/OutOfStock"}}
</script></head><body><div class="product-price">59,00 €</div><button disabled>Sold out</button></body></html>`;

describe('AYWEBs 2.1 — lecteur client : des TEXTES, jamais des nombres', () => {
  it('JSON-LD complet ⇒ prix, devise prouvée, disponibilité, condition', () => {
    const { payload, validation } = captureFrom(JSON_LD_PAGE);
    expect(payload.priceCandidates[0]).toEqual({ text: '129.99 EUR', source: 'json_ld' });
    expect(payload.currencyText).toBe('EUR');
    expect(payload.addToCartText).toBe('Ajouter au panier');
    expect(validation.ok).toBe(true);
    expect(validation.price).toBe(129.99);
    expect(validation.currency).toBe('EUR');
    expect(validation.priceVerified).toBe(true);
    expect(validation.currencyVerified).toBe(true);
    expect(validation.availability).toBe('AVAILABLE');
    expect(validation.condition).toBe('new');
    expect(validation.priceSource).toBe('json_ld');
    expect(validation.corroborated).toBe(true);
    expect(validation.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it('le client ne peut pas « envoyer un prix » : un champ numérique n’existe pas', () => {
    const { payload } = captureFrom(JSON_LD_PAGE);
    expect(Object.keys(payload)).not.toContain('price');
    expect(Object.keys(payload)).not.toContain('sourcePrice');
    const forged = validateAyWebsCapturedPage({ ...payload, price: 1, sourcePrice: 1 }, PRODUCT_URL);
    // Le champ inventé n'est simplement pas lu : le montant reste celui du texte.
    expect(forged.ok).toBe(true);
    expect(forged.price).toBe(129.99);
  });

  it('prix concaténé par la page (« $6.99$6.99 ») : refusé par le verdict de la Phase 0', () => {
    const { validation } = captureFrom(DUPLICATED_PRICE_PAGE);
    expect(validation.ok).toBe(false);
    expect(validation.rejection).toBe('PRICE_REJECTED');
    expect(validation.notes.join(' ')).toContain('DUPLICATED_TEXT');
  });

  it('lecture DOM unique : acceptée SANS être dite vérifiée (aucun devis possible)', () => {
    const { validation } = captureFrom(DOM_ONLY_PAGE);
    expect(validation.ok).toBe(true);
    expect(validation.price).toBe(49.99);
    expect(validation.priceVerified).toBe(false);   // une seule source
    expect(validation.currencyVerified).toBe(false); // « € » n'est pas un code ISO
    expect(validation.currency).toBe('');
    expect(validation.notes).toContain('single_source');
  });

  it('deux sources indépendantes d’accord ⇒ corroboré, devise prouvée', () => {
    const { validation } = captureFrom(CORROBORATED_PAGE);
    expect(validation.price).toBe(79.5);
    expect(validation.corroborated).toBe(true);
    expect(validation.priceVerified).toBe(true);
    expect(validation.currencyVerified).toBe(true);
    expect(validation.currency).toBe('EUR');
  });

  it('désaccord JSON-LD ↔ affichage : le JSON-LD fait foi, l’écart est noté', () => {
    const { validation } = captureFrom(CONFLICTING_PRICE_PAGE);
    expect(validation.ok).toBe(true);
    expect(validation.price).toBe(129.99);
    expect(validation.priceSource).toBe('json_ld');
    expect(validation.notes.join(' ')).toContain('candidate_ok:dom:89.99');
  });

  it('bouton d’achat DÉSACTIVÉ : jamais « disponible » pour autant', () => {
    const { validation } = captureFrom(DISABLED_PAGE);
    expect(validation.availability).toBe('UNKNOWN');
    expect(validation.availabilityReason).toBe('capture_add_control_disabled');
    expect(validation.notes).toContain('add_control_disabled');
  });

  it('rupture publiée par la source : OUT_OF_STOCK', () => {
    const { validation } = captureFrom(OUT_OF_STOCK_PAGE);
    expect(validation.availability).toBe('OUT_OF_STOCK');
    expect(validation.availabilityReason).toBe('merchant_out_of_stock_capture');
  });

  it('la navigation n’est pas une option de produit (mesuré le 06/10/2026)', () => {
    const page = `<!doctype html><html><head><title>Boutique</title></head><body>
      <header id="navbar"><select><option selected>All Departments</option><option>Search Amazon</option></select></header>
      <main><select id="variant-size"><option>Choisir</option><option selected>41</option><option>42</option></select></main>
    </body></html>`;
    const { payload } = captureFrom(page);
    expect(payload.selectedVariantTexts).toEqual(['41']);
    expect(payload.variantTexts).toEqual(['41', '42']);
    expect(JSON.stringify(payload)).not.toContain('All Departments');
  });

  it('la devise n’est jamais lue dans un widget quelconque (mesuré : « USD » sur amazon.de)', () => {
    const page = `<!doctype html><html><head><title>Page en euros</title></head><body>
      <div class="currency-selector">USD</div>
      <div class="product-price">€14.80</div></body></html>`;
    const { payload } = captureFrom(page);
    expect(payload.currencyText).toBe(null);
  });
});

describe('AYWEBs 2.1 — verdict serveur : bornes et refus explicites', () => {
  const base = () => captureFrom(JSON_LD_PAGE).payload;

  it('hôte différent de l’URL demandée : refusé', () => {
    const payload = { ...base(), url: 'https://autre-boutique.fr/products/x' };
    expect(validateAyWebsCapturedPage(payload, PRODUCT_URL).rejection).toBe('URL_HOST_MISMATCH');
  });

  it('capture vieille de plus de 10 minutes : refusée', () => {
    const payload = { ...base(), capturedAt: new Date(Date.now() - 11 * 60_000).toISOString() };
    expect(validateAyWebsCapturedPage(payload, PRODUCT_URL).rejection).toBe('STALE_CAPTURE');
  });

  it('horodatage dans le futur : refusé', () => {
    const payload = { ...base(), capturedAt: new Date(Date.now() + 5 * 60_000).toISOString() };
    expect(validateAyWebsCapturedPage(payload, PRODUCT_URL).rejection).toBe('FUTURE_CAPTURE');
  });

  it('version inconnue du contrat : refusée (pas de « devinette » inter-versions)', () => {
    expect(validateAyWebsCapturedPage({ ...base(), v: 2 }, PRODUCT_URL).rejection).toBe('BAD_VERSION');
  });

  it('charge utile hors bornes : refusée', () => {
    // 30 libellés × ~2,8 Ko ≈ 84 Ko : au-delà des 64 Ko du contrat, donc refusé
    // AVANT tout traitement (la borne protège la mémoire du serveur).
    const payload = { ...base(), variantTexts: Array.from({ length: 30 }, () => 'pendant-'.repeat(400)) };
    expect(Buffer.byteLength(JSON.stringify(payload), 'utf8')).toBeGreaterThan(64_000);
    expect(validateAyWebsCapturedPage(payload, PRODUCT_URL).rejection).toBe('TOO_LARGE');
  });

  it('canonical d’un autre hôte : refusé', () => {
    const payload = { ...base(), canonicalUrl: 'https://un-autre-site.com/produit' };
    expect(validateAyWebsCapturedPage(payload, PRODUCT_URL).rejection).toBe('CANONICAL_HOST_MISMATCH');
  });

  it('objet absent ou non conforme : refusé, jamais une exception', () => {
    for (const raw of [null, 'texte', 42, [], {}]) {
      const verdict = validateAyWebsCapturedPage(raw, PRODUCT_URL);
      expect(verdict.ok).toBe(false);
      expect(typeof verdict.rejection).toBe('string');
    }
  });
});

describe('AYWEBs 2.1 — boutique du REGISTRE : la capture remplace la lecture serveur', () => {
  it('capture acceptée : AUCUNE lecture marchande, devis signé, panier sans relecture', async () => {
    const h = harness();
    const { payload } = captureFrom(REGISTERED_JSON_LD_PAGE, REGISTERED_URL);

    const resolved = await resolveAyWebsProduct(h.resolver, {
      url: REGISTERED_URL, sessionId: SESSION_ID, capture: payload,
    });

    expect(h.scrapeProduct).not.toHaveBeenCalled();      // ← tout l'intérêt du modèle
    expect(resolved.capture?.used).toBe(true);
    expect(resolved.capture?.priceSource).toBe('json_ld');
    expect(resolved.capture?.corroborated).toBe(true);
    expect(resolved.product.price).toBe(129.99);
    expect(resolved.product.storeId).toBe('amazon');     // la boutique du registre reste LA référence
    expect(resolved.product.integrationType).toBe('PARTIALLY_SUPPORTED');
    expect(resolved.fromCache).toBe(false);
    expect(resolved.cacheKind).toBeNull();
    expect(resolved.quoteToken).toBeTruthy();

    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID,
      accountId: null,
      productId: resolved.productId,
      quantity: 1,
      quoteToken: resolved.quoteToken,
    });
    expect(h.scrapeProduct).not.toHaveBeenCalled();      // toujours zéro
    expect(added.sourceReread).toBe(false);
    expect(added.item.unitPrice).toBe(129.99);
  });

  it('capture refusée (prix ambigu) : retour à la lecture serveur, motif renvoyé', async () => {
    const h = harness();
    const page = `<!doctype html><html><head><title>Ambigu</title></head><body>
      <div class="product-price">19,99 €</div><div class="product-price">24,99 €</div></body></html>`;
    const { payload, validation } = captureFrom(page, REGISTERED_URL);
    expect(validation.rejection).toBe('AMBIGUOUS_PRICE');

    const resolved = await resolveAyWebsProduct(h.resolver, {
      url: REGISTERED_URL, sessionId: SESSION_ID, capture: payload,
    });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);    // la lecture serveur a repris
    expect(resolved.capture?.used).toBe(false);
    expect(resolved.capture?.rejection).toBe('AMBIGUOUS_PRICE');
    expect(resolved.product.price).toBe(129.99);         // prix du serveur, pas du client
    expect(resolved.quoteToken).toBeTruthy();            // la fiche reste utilisable
  });

  it('aucune capture du tout : comportement historique intact (lecture serveur)', async () => {
    const h = harness();
    const resolved = await resolveAyWebsProduct(h.resolver, { url: REGISTERED_URL, sessionId: SESSION_ID });
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(resolved.capture).toBeNull();
  });
});

describe('AYWEBs 2.1 — boutique EXTERNE : le chemin « Add-to-Buyee »', () => {
  it('domaine hors registre + capture CORROBORÉE : produit résolu sans aucun accès marchand', async () => {
    const h = harness();
    const { payload, validation } = captureFrom(JSON_LD_PAGE);
    expect(validation.corroborated).toBe(true);

    const resolved = await resolveAyWebsProduct(h.resolver, {
      url: PRODUCT_URL, sessionId: SESSION_ID, capture: payload,
    });

    expect(h.scrapeProduct).not.toHaveBeenCalled();      // le serveur n'a jamais touché la boutique
    expect(resolved.capture?.used).toBe(true);
    expect(resolved.product.storeId).toBe('generic');
    expect(resolved.product.storeName).toBe('Boutique externe');
    expect(resolved.product.price).toBe(129.99);
    /* Aucune intégration d'achat marchand : la commande part en revue humaine.
       C'est le modèle Buyee/ZenMarket — extraction chez le client, achat
       re-vérifié par un opérateur. */
    expect(resolved.product.integrationType).toBe('PARTIALLY_SUPPORTED');
    expect(resolved.product.purchaseMode).toBe('MANUAL_REVIEW');
    expect(resolved.quoteToken).toBeTruthy();

    const added = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID, accountId: null, productId: resolved.productId, quantity: 1,
      quoteToken: resolved.quoteToken,
    });
    expect(added.item.storeId).toBe('generic');
    expect(added.item.unitPrice).toBe(129.99);
    expect(h.scrapeProduct).not.toHaveBeenCalled();
  });

  it('domaine hors registre SANS capture : « Order with URL » intact, zéro lecture', async () => {
    const h = harness();
    const failure = await resolveAyWebsProduct(h.resolver, { url: PRODUCT_URL, sessionId: SESSION_ID })
      .then(() => null, (error) => error);
    expect(failure.code).toBe('DOMAIN_NOT_ALLOWED');
    expect(h.scrapeProduct).not.toHaveBeenCalled();
  });

  it('domaine hors registre + capture REFUSÉE : refus motivé, et rien n’est deviné', async () => {
    const h = harness();
    const page = `<!doctype html><html><head><title>Ambigu</title></head><body>
      <div class="product-price">19,99 €</div><div class="product-price">24,99 €</div></body></html>`;
    const { payload, validation } = captureFrom(page);
    expect(validation.rejection).toBe('AMBIGUOUS_PRICE');

    const failure = await resolveAyWebsProduct(h.resolver, {
      url: PRODUCT_URL, sessionId: SESSION_ID, capture: payload,
    }).then(() => null, (error) => error);
    expect(failure.code).toBe('DOMAIN_NOT_ALLOWED');
    // Le motif du refus est dans le diagnostic : l'exploitation sait POURQUOI.
    expect(String(failure.contract?.technicalMessage || '')).toContain('AMBIGUOUS_PRICE');
    expect(h.scrapeProduct).not.toHaveBeenCalled();      // aucun moyen serveur de lire ce domaine
  });

  it('domaine hors registre + source unique : seuil plus haut — corroboration exigée', async () => {
    const h = harness();
    // Une seule lecture DOM, aucun code ISO : sur une boutique du registre ce
    // serait « single_source » (accepté, non vérifié). Ici, refusé.
    const page = `<!doctype html><html lang="fr"><head><title>Casque sans données structurées</title></head>
      <body><div class="product-price">49,99 €</div><button>Ajouter au panier</button></body></html>`;
    const { payload, validation } = captureFrom(page);
    // Règle des boutiques DU REGISTRE : la source unique passe (non vérifiée).
    expect(validation.ok).toBe(true);
    expect(validation.corroborated).toBe(false);
    // Règle HORS REGISTRE : même charge utile, refusée — le seuil est plus haut.
    expect(validateAyWebsCapturedPage(payload, PRODUCT_URL, { requireCorroboration: true }).rejection)
      .toBe('PRICE_NOT_CORROBORATED');

    const failure = await resolveAyWebsProduct(h.resolver, {
      url: PRODUCT_URL, sessionId: SESSION_ID, capture: payload,
    }).then(() => null, (error) => error);
    expect(failure.code).toBe('DOMAIN_NOT_ALLOWED');
    expect(String(failure.contract?.technicalMessage || '')).toContain('PRICE_NOT_CORROBORATED');
  });

  it('la boutique externe ne revendique AUCUN domaine : elle n’est jamais devinée', async () => {
    expect(detectAyWebsStore(PRODUCT_URL)).toBeNull();
    expect(detectAyWebsStore(REGISTERED_URL)).toMatchObject({ id: 'amazon' });
  });

  it('sélection demandée absente de la capture : disponibilité UNKNOWN (le panier refuse)', async () => {
    const h = harness();
    const { payload } = captureFrom(JSON_LD_PAGE);
    const resolved = await resolveAyWebsProduct(h.resolver, {
      url: PRODUCT_URL, sessionId: SESSION_ID,
      capture: payload,
      selectedVariant: { color: 'Rouge', size: '42' },   // jamais vue sur la page
    });
    /* La disponibilité PUBLIÉE est celle que la capture a prouvée — pour la
       combinaison affichée. La combinaison demandée n'ayant pas été vue, la
       réponse honnête est UNKNOWN : `sourceProduct.availability` reste le
       constat brut de la page, mais ce n'est pas lui qui décide du panier. */
    expect(resolved.product.availability.state).toBe('UNKNOWN');
    expect(String(resolved.product.availability.reason || '')).toContain('selection_not_verified_by_capture');
    expect(resolved.product.storeId).toBe('generic');    // chemin externe, sans lecture serveur

    /* Sans devis utilisable, l'ajout relit la fiche. Hors registre, la seule
       relecture possible est une capture FRAÎCHE : l'ajout la transporte
       (même contrat que /product/resolve). */
    const failure = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID, accountId: null, productId: resolved.productId, quantity: 1,
      variantAttributes: { color: 'Rouge', size: '42' },
      capture: captureFrom(JSON_LD_PAGE).payload,
    }).then(() => null, (error) => error);
    expect(failure.code).toBe('STOCK_UNKNOWN');
    expect(h.scrapeProduct).not.toHaveBeenCalled();

    /* Et sans capture (ni devis) : refus honnête — « Order with URL ». Le serveur
       n'invente pas une lecture qu'il ne peut pas faire. */
    const bare = await addAyWebsCartItem(h.resolver, {
      sessionId: SESSION_ID, accountId: null, productId: resolved.productId, quantity: 1,
    }).then(() => null, (error) => error);
    expect(bare.code).toBe('DOMAIN_NOT_ALLOWED');
    expect(h.scrapeProduct).not.toHaveBeenCalled();

    /* La MÊME capture, avec la combinaison réellement affichée sur la page,
       passe : la preuve est locale à ce que le client avait sous les yeux. */
    const observed = await resolveAyWebsProduct(h.resolver, {
      url: PRODUCT_URL, sessionId: SESSION_ID, capture: captureFrom(
        JSON_LD_PAGE.replace('<h1>', '<select id="size"><option selected>42</option></select><h1>'),
      ).payload,
      selectedVariant: { size: '42' },
    });
    expect(observed.product.availability.state).toBe('AVAILABLE');
  });

});

describe('AYWEBs 2.1 — vérification par échantillon (anti-fraude, non bloquante)', () => {
  it('échantillon actif (boutique du registre) : le serveur relit derrière et signale l’écart', async () => {
    process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE = '1';
    const h = harness({ price: 99.0 });                       // le serveur lit 99, la capture dit 129,99
    const { payload } = captureFrom(REGISTERED_JSON_LD_PAGE, REGISTERED_URL);

    const resolved = await resolveAyWebsProduct(h.resolver, {
      url: REGISTERED_URL, sessionId: SESSION_ID, capture: payload,
    });
    expect(resolved.capture?.used).toBe(true);
    // Le client n'attend pas la relecture : la réponse est déjà partie.
    expect(h.scrapeProduct.mock.calls.length).toBeLessThanOrEqual(1);

    /* On attend l'ÉVÉNEMENT, pas l'appel : l'appel est enregistré au DÉBUT de
       la lecture, l'événement seulement après comparaison. */
    const deadLine = Date.now() + 5_000;
    const eventsOf = () => h.db.all(`SELECT event_name, payload FROM ayweb_domain_events WHERE event_name = 'AYWEB_WEBVIEW_PRICE_MISMATCH'`) as Array<{ event_name: string; payload: string }>;
    while (eventsOf().length < 1 && Date.now() < deadLine) await sleep(15);
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);

    const events = eventsOf();
    expect(events).toHaveLength(1);
    const payloadEvent = JSON.parse(events[0].payload);
    expect(payloadEvent.reason).toBe('PRICE_DIVERGED');
    expect(payloadEvent.capture_price).toBe(129.99);
    expect(payloadEvent.server_price).toBe(99);
  });

  it('échantillon éteint : aucune lecture d’arrière-plan', async () => {
    const h = harness();
    const { payload } = captureFrom(REGISTERED_JSON_LD_PAGE, REGISTERED_URL);
    await resolveAyWebsProduct(h.resolver, { url: REGISTERED_URL, sessionId: SESSION_ID, capture: payload });
    await sleep(120);
    expect(h.scrapeProduct).not.toHaveBeenCalled();
  });

  it('boutique EXTERNE : tirage à 100 % et toujours aucune relecture — c’est la revue humaine qui vérifie', async () => {
    process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE = '1';
    const h = harness();
    const { payload } = captureFrom(JSON_LD_PAGE);
    await resolveAyWebsProduct(h.resolver, { url: PRODUCT_URL, sessionId: SESSION_ID, capture: payload });
    await sleep(150);
    /* Le serveur ne PEUT pas relire ce domaine (c'est la raison d'être du chemin
       client) : le tirage d'audit serait un échec garanti. Il est donc explicitement
       écarté, et la vérification a lieu à la revue de la commande. */
    expect(h.scrapeProduct).not.toHaveBeenCalled();
  });

  it('le tirage est déterministe : même empreinte ⇒ même verdict', () => {
    process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE = '0.5';
    const fingerprint = 'a'.repeat(64);
    const first = shouldVerifyWebviewCaptureInBackground(fingerprint, SESSION_ID);
    for (let i = 0; i < 5; i += 1) {
      expect(shouldVerifyWebviewCaptureInBackground(fingerprint, SESSION_ID)).toBe(first);
    }
    expect(shouldVerifyWebviewCaptureInBackground('b'.repeat(64), SESSION_ID)).toBe(
      shouldVerifyWebviewCaptureInBackground('b'.repeat(64), SESSION_ID),
    );
  });
});

describe('AYWEBs 2.1 — contrat HTTP : la boutique externe passe par le même guichet', () => {
  function app(h: ReturnType<typeof harness>) {
    const instance = express();
    instance.use(express.json({ limit: '256kb' }));
    instance.use((req, _res, next) => { (req as any).requestId = 'capture-http-request'; next(); });
    instance.use('/api/v1/aywebs', createAyWebsRouter(h.db, h.scraper as any));
    return instance;
  }
  const SESSION = { 'x-session-id': SESSION_ID };

  it('/page/analyze : annonce le chemin externe sans le confondre avec une boutique du registre', async () => {
    const h = harness();
    const external = await request(app(h)).post('/api/v1/aywebs/page/analyze').set(SESSION)
      .send({ url: PRODUCT_URL });
    expect(external.status).toBe(200);
    expect(external.body.data.registered).toBe(false);
    expect(external.body.data.capture_allowed).toBe(false);          // aucune lecture serveur
    expect(external.body.data.external_capture_allowed).toBe(true);  // …mais la capture cliente, oui
    expect(String(external.body.data.fallback)).toContain('purchase_request');
    expect(h.scrapeProduct).not.toHaveBeenCalled();

    const registered = await request(app(h)).post('/api/v1/aywebs/page/analyze').set(SESSION)
      .send({ url: REGISTERED_URL });
    expect(registered.body.data.registered).toBe(true);
    expect(registered.body.data.capture_allowed).toBe(true);
    expect(registered.body.data.external_capture_allowed).toBe(false);
  });

  it('POST /product/resolve : capture corroborée acceptée, zéro requête marchande', async () => {
    const h = harness();
    const { payload } = captureFrom(JSON_LD_PAGE);
    const resolved = await request(app(h)).post('/api/v1/aywebs/product/resolve').set(SESSION)
      .send({ url: PRODUCT_URL, capture: payload });

    expect(resolved.status).toBe(201);
    expect(h.scrapeProduct).not.toHaveBeenCalled();
    expect(resolved.body.capture).toMatchObject({ used: true, price_source: 'json_ld', corroborated: true });
    // Le corps est PLAT (`productPayload`) : mêmes clés que les autres fiches.
    expect(resolved.body.data.store_id).toBe('generic');
    expect(resolved.body.data.store_name).toBe('Boutique externe');
    expect(resolved.body.data.purchase_mode).toBe('MANUAL_REVIEW');
    expect(resolved.body.data.integration_type).toBe('PARTIALLY_SUPPORTED');
    expect(resolved.body.data.availability.state).toBe('AVAILABLE');
    expect(resolved.body.quote_token).toBeTruthy();
  });

  it('POST /product/resolve : sans capture, le refus garde « Order with URL » et son action', async () => {
    const h = harness();
    const refused = await request(app(h)).post('/api/v1/aywebs/product/resolve').set(SESSION)
      .send({ url: PRODUCT_URL });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('DOMAIN_NOT_ALLOWED');
    expect(refused.body.error_contract.requiredAction).toBe('SUBMIT_PURCHASE_REQUEST');
    expect(refused.body.fallback).toContain('purchase_request');
    expect(h.scrapeProduct).not.toHaveBeenCalled();
  });

  it('/health : la boutique externe est décrite, avec ZÉRO domaine', async () => {
    const h = harness();
    const health = await request(app(h)).get('/api/v1/aywebs/health');
    expect(health.status).toBe(200);
    const capture = health.body.data.webview_capture;
    expect(capture.contract_version).toBe(1);
    expect(capture.external_store).toMatchObject({
      id: 'generic', enabled: true, domains: 0, integration_type: 'PARTIALLY_SUPPORTED', capture_supported: true,
    });
  });
});

describe('AYWEBs 2.1 — la coque Android transporte la capture', () => {
  const activity = () => readFileSync('android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java', 'utf8');

  it('récupère le lecteur DU SERVEUR, l’exécute dans la WebView et joint le résultat', () => {
    const code = activity();
    // Un seul point de vérité : le script est téléchargé, jamais embarqué dans l'APK.
    expect(code).toContain('/api/v1/aywebs/capture/script.js');
    expect(code).toContain('evaluateJavascript(script');
    expect(code).toContain('body.put("capture", capture)');
    expect(code).toContain('external_capture_allowed');
  });

  it('n’envoie jamais la page marchande : la capture remplace le HTML, pas le serveur', () => {
    const code = activity();
    expect(code).not.toMatch(/page_html/);              // le HTML client est refusé côté serveur
    expect(code).toContain('capturePayload');           // décodage du retour JS
    expect(code).toContain('withPageCapture');          // résolution ET ajout
  });
});

describe('AYWEBs 2.1 — le script est servi par le serveur (pas de version d’application)', () => {
  it('GET /capture/script.js : JavaScript public, sans session ni secret', async () => {
    const h = harness();
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { (req as any).requestId = 'capture-script-request'; next(); });
    app.use('/api/v1/aywebs', createAyWebsRouter(h.db, h.scraper as any));

    const response = await request(app).get(`/api/v1/aywebs${AYWEBS_CAPTURE_SCRIPT_PATH.replace('/api/v1/aywebs', '')}`);
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('javascript');
    expect(response.text).toContain('priceCandidates');
    expect(response.text).not.toMatch(/token|secret|password/i);
  });
});
