/**
 * AYWEBs — LECTEUR AMAZON DU CLIENT (07/10/2026) — mise à jour n°1.
 *
 * Ce que cette suite verrouille, avec des pages MESURÉES (04 et 06/10/2026) et
 * un test croisé contre le lecteur serveur (`src/scraper/amazonPage.ts`) :
 *
 *   1. LA FICHE RÉELLE : `tests/fixtures/amazon-product-page.html` (relevée sur
 *      /dp/B0GYM3V9H5) → le client lit `$109.00` en reconstruction de spans,
 *      prouve USD par le symbole (Amazon ne publie AUCUN code ISO), lit « In
 *      Stock » et les images produit — et il est D'ACCORD avec le lecteur serveur
 *      (109 / USD / in_stock) ;
 *   2. LES PRIX DE PUBLICITÉ SONT EXCLUS : carrousels sponsorisés, « Similar
 *      items », prix barrés. Le piège Phase 0 (6,99 lu au lieu du prix vendu) ne
 *      peut plus se produire : la lecture est bornée à la zone d'achat ;
 *   3. ABSTENTION : deux montants distincts dans la zone d'achat ⇒ AUCUN prix
 *      publié (le serveur relit) ; un texte collé (« $6.99$6.99 ») n'est jamais
 *      publié tel quel, et le crible serveur le refuse de son côté ;
 *   4. BOUTON DÉSACTIVÉ : aucun libellé d'achat n'est publié (correction du
 *      07/10) — le libellé « Add to Cart » d'un contrôle inutilisable prouverait
 *      un stock qui n'existe pas. La disponibilité vient du texte publié ;
 *   5. DEVISE : la table de symboles est FERMÉE et par boutique — `$` ⇒ USD sur
 *      amazon.com, mais pas sur amazon.ca (dollar canadien) ; `€` ⇒ EUR ; toute
 *      CONTRADICTION avec un code ISO publié retire la preuve (aucun devis) ;
 *   6. `AggregateOffer` REFUSÉ : le prix agrégé de plusieurs vendeurs n'est pas
 *      le prix de la zone d'achat ; le JSON-LD multi-produits est filtré par ASIN ;
 *   7. LES GOLDENS RÉELS DU 06/10 ne publient AUCUN prix (coquille, prix coupé,
 *      page sponsorisée) : le client n'invente rien — les prix d'annonces relevés
 *      (6,99 / 263,86 / 14,80…) n'apparaissent nulle part dans la charge utile ;
 *   8. COMPTEURS : ce qui est jugé/accepté/refusé et comment la devise a été
 *      prouvée, exposés par `/health`.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AYWEBS_CAPTURE_SCRIPT } from '../src/aywebs/captureScript';
import {
  ayWebsWebviewCaptureStats,
  resetAyWebsWebviewCaptureStats,
  validateAyWebsCapturedPage,
} from '../src/aywebs/webviewCapture';
import { createAyWebsContext } from '../src/aywebs/context';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { parseProductPageHtml } from '../src/scraper/productPageParser';

const FIXTURE_DIR = join(__dirname, 'fixtures');
const REAL_DIR = join(FIXTURE_DIR, 'aywebs');

const FIXTURE_URL = 'https://www.amazon.com/dp/B0GYM3V9H5';
const FIXTURE = readFileSync(join(FIXTURE_DIR, 'amazon-product-page.html'), 'utf8');
const REAL_SHELL = readFileSync(join(REAL_DIR, 'amazon-shell.html'), 'utf8');
const REAL_DESKTOP_DE = readFileSync(join(REAL_DIR, 'real-amazon-de-desktop-2026-10-06.html'), 'utf8');
const REAL_SPONSORED_DE = readFileSync(join(REAL_DIR, 'amazon-de-rendered-sponsored-price.html'), 'utf8');
const REAL_MOBILE_CONCAT = readFileSync(join(REAL_DIR, 'amazon-us-mobile-concat-price.html'), 'utf8');

/** Exécute le lecteur client dans une page, exactement comme le WebView. */
function captureFrom(pageHtml: string, url = FIXTURE_URL) {
  const dom = new JSDOM(pageHtml, { url });
  const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
  const payload = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL)));
  return { payload, validation: validateAyWebsCapturedPage(payload, url) };
}

/** Coquille produit minimale : sans elle, le lecteur Amazon ne s'applique pas. */
function amazonPage(inner: string): string {
  return `<!doctype html><html lang="en"><head><title>Fiche Amazon</title></head><body>
  <div id="dp-container"><div id="ppd">
    ${inner}
  </div></div></body></html>`;
}

/**
 * Balayage « aucune trace du prix piégé » — SANS l'horodatage.
 *
 * Pourquoi l'exclure (flakiness MESURÉE, 08/10/2026) : `capturedAt` porte des
 * millisecondes, donc « 16.997 » RENFERME la chaîne « 6.99 ». Une fois sur
 * mille environ, ce test sonnait l'alarme SANS AUCUNE régression — et une
 * alarme qui ment coûte plus cher qu'une alarme manquée : la fois suivante,
 * on ne la croit plus, et la vraie régression passe inaperçue.
 *
 * Le balayage garde tout son mordant : tout le reste de la charge utile y
 * passe — prix, titres, variantes, images, URL canonique.
 */
function priceTrace(payload: Record<string, unknown>): string {
  const { capturedAt, ...stable } = payload as { capturedAt?: string };
  void capturedAt;
  return JSON.stringify(stable);
}

const BUYBOX_109 = `<div id="corePriceDisplay_desktop_feature_div">
  <span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> $109.00 </span>
  <span class="a-price priceToPay apex-pricetopay-value">
    <span class="a-offscreen"> </span>
    <span aria-hidden="true">
      <span class="a-price-symbol">$</span>
      <span class="a-price-whole">109<span class="a-price-decimal">.</span></span>
      <span class="a-price-fraction">00</span>
    </span>
  </span>
</div>`;

beforeEach(() => {
  resetAyWebsWebviewCaptureStats();
});

describe('AYWEBs — l’alarme ne doit pas mentir', () => {
  /**
   * Verrou de la correction du 08/10/2026 : un balayage qui inclurait
   * `capturedAt` se déclencherait sur un HORODATAGE (« 16.997 » contient
   * « 6.99 ») une fois sur mille, sans aucune régression. Le garder hors du
   * balayage est un choix de sûreté : une alarme fausse désarme la vraie.
   */
  it('le balayage ignore l’horodatage, mais rien d’autre', () => {
    const poisoned: Record<string, unknown> = {
      capturedAt: '2026-10-08T00:22:16.997Z', // renferme « 6.99 »
      title: 'Article',
      priceCandidates: [{ text: '109.00 USD', source: 'json_ld' }],
    };
    expect(priceTrace(poisoned)).not.toContain('6.99');
    // …et il reste sourd à rien d’autre : un titre piégé passe TOUJOURS.
    expect(priceTrace({ ...poisoned, title: 'Lot à 6.99' })).toContain('6.99');
  });
});

describe('AYWEBs — lecteur Amazon : la fiche mesurée du 04/10/2026', () => {
  it('lit le prix (spans), la devise (symbole) et le stock — en accord avec le lecteur serveur', () => {
    const { payload, validation } = captureFrom(FIXTURE);

    expect(payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
    expect(payload.currencyText).toBeNull();
    expect(payload.availabilityText).toBe('In Stock');
    expect(payload.addToCartText).toBeNull(); // la fiche ne publie pas de bouton

    expect(validation.ok).toBe(true);
    expect(validation.price).toBe(109);
    expect(validation.currency).toBe('USD');
    expect(validation.currencyVerified).toBe(true);
    expect(validation.availability).toBe('AVAILABLE');
    expect(validation.priceSource).toBe('dom');
    expect(validation.notes.join(' ')).toContain('currency_symbol_registered_store:USD');

    /* TEST CROISÉ : le lecteur SERVEUR, sur la même page, dit la même chose.
       (Une seule source ⇒ `priceVerified=false`, donc aucun devis signé : la
       conséquence est documentée, pas cachée.) */
    const parsed = parseProductPageHtml(FIXTURE, FIXTURE_URL, 'amazon');
    expect(parsed.price).toBe(validation.price);
    expect(parsed.currency).toBe(validation.currency);
    expect(parsed.currencyVerified).toBe(true);
    expect(parsed.availability).toBe('in_stock');
  });

  it('images PRODUIT d’abord (data-old-hires), jamais les sprites de navigation', () => {
    const { payload } = captureFrom(FIXTURE);
    expect(payload.images[0]).toBe('https://m.media-amazon.com/images/I/71QK1MOCKUP._AC_UL1500_.jpg');
    expect(payload.images.join(' ')).not.toContain('nav-sprite');
  });

  it('canonical vers un AUTRE domaine Amazon ⇒ non transmis (mesuré : amazon.de → amazon.com)', () => {
    const crossHost = FIXTURE.replace(
      '</head>',
      '<link rel="canonical" href="https://www.amazon.com/clp/B0GYM3V9H5"></head>',
    );
    const { payload, validation } = captureFrom(crossHost, 'https://www.amazon.de/dp/B0GYM3V9H5');
    expect(payload.canonicalUrl).toBeNull();
    expect(validation.ok).toBe(true); // la capture reste utilisable : l'identité, c'est l'ASIN
  });

  it('canonical du MÊME hôte ⇒ transmis', () => {
    const sameHost = FIXTURE.replace(
      '</head>',
      `<link rel="canonical" href="${FIXTURE_URL}"></head>`,
    );
    const { payload } = captureFrom(sameHost);
    expect(payload.canonicalUrl).toBe(FIXTURE_URL);
  });
});

describe('AYWEBs — lecteur Amazon : la zone d’achat seulement', () => {
  it('ignore un prix de publicité (carrousel sponsorisé) et un prix barré', () => {
    const page = amazonPage(`
      ${BUYBOX_109}
      <div data-component-type="sp-sponsored-result">
        <div class="a-price"><span class="a-offscreen">$6.99</span></div>
      </div>
      <div class="a-carousel"><div class="a-price"><span class="a-offscreen">$263.86</span></div></div>
      <div id="corePriceDisplay_desktop_feature_div">
        <span class="a-price a-text-price" data-a-strike="true"><span class="a-offscreen">$149.00</span></span>
      </div>`);
    const { payload, validation } = captureFrom(page);
    expect(payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
    expect(priceTrace(payload)).not.toContain('6.99');
    expect(priceTrace(payload)).not.toContain('263.86');
    expect(priceTrace(payload)).not.toContain('149.00');
    expect(validation.price).toBe(109);
  });

  it('deux montants DISTINCTS dans la zone d’achat ⇒ abstention totale', () => {
    const page = amazonPage(`
      <span id="apex-pricetopay-accessibility-label" class="aok-offscreen"> $109.00 </span>
      <div id="corePriceDisplay_desktop_feature_div">
        <span class="a-price priceToPay"><span class="a-offscreen">$119.00</span></span>
      </div>`);
    const { payload, validation } = captureFrom(page);
    expect(payload.priceCandidates).toEqual([]);
    expect(validation.ok).toBe(false);
    expect(validation.rejection).toBe('NO_PRICE_TEXT');
  });

  it('un texte collé (« $6.99$6.99 ») n’est jamais publié — et le serveur le refuse aussi', () => {
    const page = amazonPage('<span id="apex-pricetopay-accessibility-label" class="aok-offscreen">$6.99$6.99</span>');
    const { payload, validation } = captureFrom(page);
    expect(payload.priceCandidates).toEqual([]);
    expect(validation.rejection).toBe('NO_PRICE_TEXT');

    /* Même texte, envoyé tel quel par un client : le verdict de la Phase 0 le
       refuse (il ne deviendrait jamais 6996.99). */
    const forged = validateAyWebsCapturedPage({
      v: 1, url: FIXTURE_URL, priceCandidates: [{ text: '$6.99$6.99', source: 'dom' }],
      capturedAt: new Date().toISOString(),
    }, FIXTURE_URL);
    expect(forged.ok).toBe(false);
    expect(forged.rejection).toBe('PRICE_REJECTED');
    expect(forged.notes.join(' ')).toContain('DUPLICATED_TEXT');
  });
});

describe('AYWEBs — lecteur Amazon : bouton d’achat', () => {
  it('contrôle DÉSACTIVÉ : aucun libellé publié — la disponibilité vient du texte', () => {
    const page = amazonPage(`
      ${BUYBOX_109}
      <div id="availability"><span class="primary-availability-message">Currently unavailable.</span></div>
      <a id="nav-assist-add-to-cart">Add to Cart</a>
      <input id="add-to-cart-button" type="submit" value="Add to Cart" disabled aria-disabled="true">`);
    const { payload, validation } = captureFrom(page);
    expect(payload.addToCartText).toBeNull();
    expect(payload.availabilityText).toBe('Currently unavailable.');
    expect(validation.availability).toBe('OUT_OF_STOCK');
  });

  it('contrôle ACTIF : le libellé est publié (et rien d’un contrôle de navigation)', () => {
    const page = amazonPage(`
      ${BUYBOX_109}
      <div id="availability">In Stock</div>
      <a id="nav-assist-add-to-cart">Add to Cart</a>
      <input id="add-to-cart-button" type="submit" value="Add to Cart">`);
    const { payload, validation } = captureFrom(page);
    expect(payload.addToCartText).toBe('Add to Cart');
    expect(validation.availability).toBe('AVAILABLE');
  });
});

describe('AYWEBs — lecteur Amazon : preuve de devise', () => {
  it('`€` sur amazon.fr ⇒ EUR (table fermée, boutique du registre)', () => {
    const page = amazonPage('<span id="apex-pricetopay-accessibility-label" class="aok-offscreen">109,00 €</span>');
    const { validation } = captureFrom(page, 'https://www.amazon.fr/dp/B0GYM3V9H5');
    expect(validation.currency).toBe('EUR');
    expect(validation.currencyVerified).toBe(true);
  });

  it('`$` sur amazon.ca ⇒ AUCUNE preuve (dollar canadien) — le serveur relira', () => {
    const page = amazonPage('<span id="apex-pricetopay-accessibility-label" class="aok-offscreen">$109.00</span>');
    const { validation } = captureFrom(page, 'https://www.amazon.ca/dp/B0GYM3V9H5');
    expect(validation.currency).toBe('');
    expect(validation.currencyVerified).toBe(false);
    expect(validation.notes.join(' ')).toContain('currency_symbol_host_ambiguous:USD');
  });

  it('symbole `$` et code publié EUR : CONTRADICTION ⇒ aucune devise (aucun devis)', () => {
    const page = amazonPage(`
      ${BUYBOX_109}
      <meta property="og:price:currency" content="EUR">`);
    const { payload, validation } = captureFrom(page);
    expect(payload.currencyText).toBe('EUR');
    expect(validation.currency).toBe('');
    expect(validation.currencyVerified).toBe(false);
    expect(validation.notes.join(' ')).toContain('currency_symbol_contradicts_published:EUR');
  });

  it('domaine HORS registre : un symbole ne prouve jamais la devise', () => {
    const page = `<!doctype html><html><head><title>Boutique inconnue</title></head><body>
      <div class="product-price">109,00 €</div></body></html>`;
    const { validation } = captureFrom(page, 'https://boutique-inconnue.example/products/x');
    expect(validation.currencyVerified).toBe(false);
    expect(validation.currency).toBe('');
  });
});

describe('AYWEBs — lecteur Amazon : JSON-LD', () => {
  const aggregatePage = amazonPage(`
    ${BUYBOX_109}
    <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"Product","sku":"B0GYM3V9H5","name":"Article",
     "offers":{"@type":"AggregateOffer","lowPrice":"89.00","highPrice":"120.00","priceCurrency":"USD"}}
    </script>`);

  it('`AggregateOffer` refusé : le prix agrégé n’est pas le prix vendu', () => {
    const { payload, validation } = captureFrom(aggregatePage);
    expect(payload.priceCandidates.some((candidate: { source: string }) => candidate.source === 'json_ld')).toBe(false);
    expect(validation.price).toBe(109);
    expect(validation.currency).toBe('USD');
  });

  it('plusieurs produits publiés : on choisit celui de l’ASIN, et deux sources concordantes corroborent', () => {
    const multiPage = amazonPage(`
      ${BUYBOX_109}
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","sku":"B0ACCESSOIR","name":"Accessoire",
       "offers":{"@type":"Offer","price":"6.99","priceCurrency":"USD"}}
      </script>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","sku":"B0GYM3V9H5","name":"Article",
       "offers":{"@type":"Offer","price":"109.00","priceCurrency":"USD"}}
      </script>`);
    const { payload, validation } = captureFrom(multiPage);
    expect(payload.priceCandidates[0]).toEqual({ text: '109.00 USD', source: 'json_ld' });
    expect(priceTrace(payload)).not.toContain('6.99');
    expect(validation.price).toBe(109);
    expect(validation.priceVerified).toBe(true); // JSON-LD (ASIN) + DOM d'accord
    expect(validation.corroborated).toBe(true);
  });

  it('aucun produit ne porte l’ASIN affiché ⇒ le JSON-LD est écarté (pas de choix au hasard)', () => {
    const multiPage = amazonPage(`
      ${BUYBOX_109}
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","sku":"B0ACCESSOIR","name":"Accessoire",
       "offers":{"@type":"Offer","price":"6.99","priceCurrency":"USD"}}
      </script>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@type":"Product","sku":"B0AUTREPRO","name":"Autre",
       "offers":{"@type":"Offer","price":"42.00","priceCurrency":"USD"}}
      </script>`);
    const { payload } = captureFrom(multiPage);
    expect(payload.priceCandidates).toEqual([{ text: '$109.00', source: 'dom' }]);
  });
});

describe('AYWEBs — lecteur Amazon : les captures réelles du 06/10/2026', () => {
  it('coquille Amazon (3,7 ko) : aucune lecture, aucun prix inventé', () => {
    const { payload, validation } = captureFrom(REAL_SHELL, 'https://www.amazon.com/dp/B0D1XD1ZV3');
    expect(payload.priceCandidates).toEqual([]);
    expect(validation.rejection).toBe('NO_PRICE_TEXT');
  });

  it('desktop amazon.de : pas de bloc de prix rendu ⇒ abstention (et canonical croisé écarté)', () => {
    const { payload, validation } = captureFrom(REAL_DESKTOP_DE, 'https://www.amazon.de/dp/B0D1XD1ZV3');
    expect(payload.priceCandidates).toEqual([]);
    expect(payload.canonicalUrl).toBeNull(); // mesuré : canonical → amazon.com
    expect(validation.rejection).toBe('NO_PRICE_TEXT');
  });

  it('page SPONSORISÉE amazon.de : les prix d’annonces (14,80 / 24,14 / 18,74) ne sortent JAMAIS', () => {
    const { payload, validation } = captureFrom(REAL_SPONSORED_DE, 'https://www.amazon.de/dp/B0D1XD1ZV3');
    expect(payload.priceCandidates).toEqual([]);
    const serialized = priceTrace(payload);
    for (const adPrice of ['14.80', '24.14', '18.74', '117.88', '201.82']) {
      expect(serialized).not.toContain(adPrice);
    }
    expect(payload.availabilityText).toBe('Currently unavailable.');
    expect(validation.rejection).toBe('NO_PRICE_TEXT');
  });

  it('mobile amazon.com : le prix coupé (6,99 / 263,86) n’est pas publié', () => {
    const { payload, validation } = captureFrom(REAL_MOBILE_CONCAT, 'https://www.amazon.com/dp/B0D1XD1ZV3');
    expect(payload.priceCandidates).toEqual([]);
    const serialized = priceTrace(payload);
    expect(serialized).not.toContain('6.99');
    expect(serialized).not.toContain('263.86');
    expect(validation.rejection).toBe('NO_PRICE_TEXT');
  });
});

describe('AYWEBs — lecteur Amazon : compteurs d’exploitation', () => {
  it('compte ce qui est jugé, accepté, refusé — et comment la devise est prouvée', () => {
    captureFrom(FIXTURE); // acceptée (symbole USD)
    captureFrom(amazonPage('<span id="apex-pricetopay-accessibility-label">$109.00</span><span id="apex-pricetopay-accessibility-label">$119.00</span>'));

    const stats = ayWebsWebviewCaptureStats();
    expect(stats.validated).toBe(2);
    expect(stats.accepted).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.rejections.NO_PRICE_TEXT).toBe(1);
    expect(stats.price_sources.dom).toBe(1);
    expect(stats.currency_symbol).toBe(1);
    expect(stats.single_source).toBe(1);
  });

  it('/health expose les compteurs (aucun contenu, seulement des nombres)', async () => {
    captureFrom(FIXTURE);
    const db = new QatafoDatabase(':memory:');
    const rules: PricingRules = {
      id: 'default', version: 3,
      rateEUR: 4, rateUSD: 4, rateGBP: 4.8, rateJPY: 0.0265,
      exchangeBufferPercent: 3, freightPerKgTND: 13, localDeliveryTND: 8,
      commissionPercent: 10, minimumCommissionTND: 0, rpdPercent: 3, rpdMinimumTND: 10,
      defaultTvaRate: 0.19, expressFeeTND: 15,
      categories: DEFAULT_CUSTOMS_CATEGORIES,
      updatedAt: new Date().toISOString(),
    };
    vi.spyOn(db, 'getPricingRules').mockImplementation(() => rules);
    const scraper = { cleanPastedUrl: (value: string) => String(value).trim(), scrapeProduct: vi.fn() };
    const instance = express();
    instance.use(express.json({ limit: '256kb' }));
    instance.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as any));

    const health = await request(instance).get('/api/v1/aywebs/health');
    expect(health.status).toBe(200);
    expect(health.body.data.webview_capture.stats.accepted).toBe(1);
    expect(health.body.data.webview_capture.stats.currency_symbol).toBe(1);
  });
});
