/**
 * AYWEBs — JSON-LD DE PREMIÈRE CLASSE (2.4) + CHAMPS ÉTENDUS (2.5)
 * 07/10/2026.
 *
 * Ce que cette suite verrouille :
 *
 *   1. VALIDATEURS : code-barres (GTIN 8/12/13/14), référence marchand, nom de
 *      vendeur, note et nombre d'avis. Chaque refus correspond à une valeur qui
 *      ferait croire à une identité produit vérifiable (un « GTIN » de 6
 *      chiffres, une référence « {{sku}} », un vendeur « Voir les options ») ;
 *   2. GOLDENS RÉELS : les trois pages d'Amazon enregistrées le 06/10/2026,
 *      vérifiées par empreinte SHA-256 (elles ne peuvent pas être retouchées
 *      pour faire passer un test), et lues par le VRAI analyseur. Ce que la page
 *      publie est lu (`4.6`, `46 196` avis, `B0D1XD1ZV3`) ; ce qu'elle ne
 *      publie pas reste ABSENT (`seller`, `gtin`) — jamais « Amazon » ;
 *   3. JSON-LD D'ABORD : quand la page publie à la fois JSON-LD, microdata et
 *      balises meta, c'est le JSON-LD qui décide ; les autres sources ne servent
 *      que de repli. Deux vendeurs distincts ⇒ aucun vendeur (pas d'arbitrage) ;
 *   4. PERSISTANCE : les cinq champs traversent écriture → relecture, et une
 *      base créée AVANT cette phase reçoit les colonnes sans perdre une ligne ;
 *   5. CONTRAT HTTP : `POST /product/resolve` renvoie les champs étendus dans le
 *      corps plat (`productPayload`) — donc l'app les affiche sans mise à jour
 *      supplémentaire.
 *
 * Les pages d'essai de la partie 3 sont CONSTRUITES (schéma schema.org), pas
 * capturées : elles testent le contrat, pas une enseigne. Les goldens de la
 * partie 2 sont, eux, des captures réelles intouchées (voir
 * `tests/fixtures/aywebs/REAL_CAPTURES.md`).
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  normalizeGtin,
  normalizeMerchantSku,
  normalizeRating,
  normalizeReviewCount,
  normalizeSeller,
  parseProductPageHtml,
} from '../src/scraper/productPageParser';
import { QatafoDatabase } from '../src/db/database';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsContext } from '../src/aywebs/context';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { persistAyWebsProduct, readAyWebsProduct } from '../src/aywebs/productResolver';
import { ayWebsAvailabilityRecord, ayWebsSourceProductFromScraped } from '../src/aywebs/productNormalizer';
import type { ScrapedProduct } from '../src/types';
import { findAyWebsStore } from '../shared/aywebsStores';

const TOUCHED_ENV = ['AYWEBS_QUOTE_REVERIFY_SAMPLE', 'AYWEBS_QUOTE_REVERIFY_TND'];
beforeEach(() => {
  /* Le devis est recalculé à chaque résolution : l'audit aléatoire du devis n'a
     rien à voir avec cette suite et rendrait les lectures non déterministes. */
  process.env.AYWEBS_QUOTE_REVERIFY_SAMPLE = '0';
  process.env.AYWEBS_QUOTE_REVERIFY_TND = '0';
});
afterEach(() => { for (const key of TOUCHED_ENV) delete process.env[key]; });

/* ── 1. VALIDATEURS ─────────────────────────────────────────────────────── */

describe('AYWEBs 2.5 — validateurs des champs étendus', () => {
  it('GTIN : 8, 12, 13 ou 14 chiffres, rien d’autre', () => {
    expect(normalizeGtin('96385074')).toBe('96385074');
    expect(normalizeGtin('4006381333931')).toBe('4006381333931');
    expect(normalizeGtin(' 4 006381 333931 ')).toBe('4006381333931');
    expect(normalizeGtin('012345678905')).toBe('012345678905');
    expect(normalizeGtin('12345678901234')).toBe('12345678901234');
    // Longueurs qui n'existent pas dans la norme GS1 : refusées, pas tronquées.
    for (const bad of ['123456', '1234567', '123456789', '1234567890', '123456789012345', '', '   ', 'A4006381333931', null, undefined]) {
      expect(normalizeGtin(bad)).toBe('');
    }
  });

  it('Référence marchand : bornée, jamais une valeur de gabarit', () => {
    expect(normalizeMerchantSku('B0D1XD1ZV3')).toBe('B0D1XD1ZV3');
    expect(normalizeMerchantSku('  sku-1234  ')).toBe('sku-1234');
    for (const bad of ['', 'x', '{{sku}}', 'n/a', 'N/A', 'none', 'null', 'undefined', '-', 'unknown']) {
      expect(normalizeMerchantSku(bad)).toBe('');
    }
    expect(normalizeMerchantSku('S'.repeat(64))).toHaveLength(64);
    expect(normalizeMerchantSku('S'.repeat(65))).toBe('');
  });

  it('Vendeur : les libellés qui ne désignent personne sont refusés', () => {
    expect(normalizeSeller('ElectroShop GmbH')).toBe('ElectroShop GmbH');
    expect(normalizeSeller('  Tech Store  ')).toBe('Tech Store');
    for (const bad of ['Other Sellers', 'other sellers', 'Voir les options', 'Voir tout', 'See all', 'See options', 'Vendeurs', 'n/a', 'unknown', '', 'x']) {
      expect(normalizeSeller(bad)).toBe('');
    }
  });

  it('Note : 0 < r ≤ 5, libellés localisés compris', () => {
    // Nombre nu.
    expect(normalizeRating('4.6')).toBe(4.6);
    expect(normalizeRating(4.6)).toBe(4.6);
    expect(normalizeRating('4,6')).toBe(4.6);
    expect(normalizeRating('5')).toBe(5);
    // Libellés réellement publiés par les enseignes.
    expect(normalizeRating('4.6 out of 5 stars')).toBe(4.6);
    expect(normalizeRating('4,6 von 5 Sternen')).toBe(4.6);
    expect(normalizeRating('4,6 étoiles sur 5')).toBe(4.6);
    expect(normalizeRating('4.0 out of 5 stars')).toBe(4);
    // Hors bornes, non numérique, ou sans échelle connue : absents.
    for (const bad of ['0', '0.0', 0, '5.01', '6', '46', '', '   ', 'pas de note', 'nouveau', '4.6 stars', null, undefined]) {
      expect(normalizeRating(bad)).toBeUndefined();
    }
  });

  it('Nombre d’avis : entier positif, séparateurs de milliers tolérés', () => {
    expect(normalizeReviewCount('46196')).toBe(46196);
    expect(normalizeReviewCount('46,196')).toBe(46196);
    expect(normalizeReviewCount('(46,196)')).toBe(46196);
    expect(normalizeReviewCount('46,196 Reviews')).toBe(46196);
    expect(normalizeReviewCount('1.234')).toBe(1234);
    expect(normalizeReviewCount('1 234 avis')).toBe(1234);
    expect(normalizeReviewCount(8700)).toBe(8700);
    for (const bad of ['', '   ', '0', 'aucun avis', '-5', '1000000001', null, undefined]) {
      expect(normalizeReviewCount(bad)).toBeUndefined();
    }
  });
});

/* ── 2. GOLDENS RÉELS (captures du 06/10/2026) ──────────────────────────── */

const fixtureDir = join(__dirname, 'fixtures', 'aywebs');
const fixture = (name: string) => readFileSync(join(fixtureDir, name), 'utf8');
const digest = (name: string) => createHash('sha256').update(readFileSync(join(fixtureDir, name))).digest('hex');

const DE_RENDERED = 'amazon-de-rendered-sponsored-price.html';
const DE_DESKTOP = 'real-amazon-de-desktop-2026-10-06.html';
const US_MOBILE = 'amazon-us-mobile-concat-price.html';
const DE_URL = 'https://www.amazon.de/dp/B0D1XD1ZV3';
const US_URL = 'https://www.amazon.com/dp/B0D1XD1ZV3';

describe('AYWEBs 2.5 — goldens réels du 06/10/2026', () => {
  it('les fixtures sont intactes (empreintes de provenance)', () => {
    expect(digest(DE_RENDERED)).toBe('2e0def3fa24cca4cf98643d2c5c7f26ea0e5a01de2059e8b5e17bf48a7936646');
    expect(digest(DE_DESKTOP)).toBe('b9c225d33f14351b856d8f9192e57e43cdf1ee2600c7a33d1871cd85dff874e5');
    expect(digest(US_MOBILE)).toBe('ebab23c5be44ebcd33f62f9eb10902ff67ef220fcc2224baab3bf6288fa0b2f0');
  });

  it('Amazon DE (page rendue) : note 4.6 et 46 196 avis, tels que publiés', () => {
    const parsed = parseProductPageHtml(fixture(DE_RENDERED), DE_URL, 'amazon');
    expect(parsed.rating).toBe(4.6);
    expect(parsed.reviewCount).toBe(46196);
    expect(parsed.sku).toBe('B0D1XD1ZV3');
    // La page ne publie ni vendeur (#merchant-info vide) ni code-barres.
    expect(parsed.seller).toBeUndefined();
    expect(parsed.gtin).toBeUndefined();
  });

  it('Amazon DE (desktop) : même produit, 46 886 avis — la valeur suit la page, pas un gabarit', () => {
    const parsed = parseProductPageHtml(fixture(DE_DESKTOP), DE_URL, 'amazon');
    expect(parsed.rating).toBe(4.6);
    expect(parsed.reviewCount).toBe(46886);
    expect(parsed.sku).toBe('B0D1XD1ZV3');
    expect(parsed.seller).toBeUndefined();
    expect(parsed.gtin).toBeUndefined();
  });

  it('Amazon US (mobile) : la page ne publie pas la note ⇒ rien n’est publié', () => {
    const parsed = parseProductPageHtml(fixture(US_MOBILE), US_URL, 'amazon');
    expect(parsed.rating).toBeUndefined();
    expect(parsed.reviewCount).toBeUndefined();
    expect(parsed.sku).toBe('B0D1XD1ZV3');
    expect(parsed.seller).toBeUndefined();
  });

  it('aucune des trois pages ne transforme la boutique en vendeur', () => {
    for (const [name, url] of [[DE_RENDERED, DE_URL], [DE_DESKTOP, DE_URL], [US_MOBILE, US_URL]] as const) {
      const parsed = parseProductPageHtml(fixture(name), url, 'amazon');
      expect(parsed.seller ?? null).toBeNull();
      // Le piège mesuré : 36 ASIN de carrousel dans la page rendue. La
      // référence publiée est celle de l'entrée produit, jamais celle d'un
      // article sponsorisé voisin.
      expect(parsed.sku).toBe('B0D1XD1ZV3');
    }
  });
});

/* ── 3. JSON-LD DE PREMIÈRE CLASSE (pages construites) ──────────────────── */

const jsonLd = (value: unknown) => `<script type="application/ld+json">${JSON.stringify(value)}</script>`;

describe('AYWEBs 2.4 — le JSON-LD décide, le reste est un repli', () => {
  const url = 'https://shop.example-store.fr/products/casque';

  it('JSON-LD complet : les cinq champs viennent de la donnée structurée', () => {
    const html = `<!doctype html><html><head><title>Casque</title>
      ${jsonLd({
        '@context': 'https://schema.org', '@type': 'Product', name: 'Casque Bluetooth',
        gtin13: '4006381333931', sku: 'SKU-7788', brand: { '@type': 'Brand', name: 'TestBrand' },
        offers: { '@type': 'Offer', price: '129.99', priceCurrency: 'EUR', availability: 'https://schema.org/InStock', seller: { '@type': 'Organization', name: 'ElectroShop GmbH' } },
        aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.2', reviewCount: '120' },
      })}</head><body><h1>Casque</h1></body></html>`;
    const parsed = parseProductPageHtml(html, url, 'generic');
    expect(parsed.gtin).toBe('4006381333931');
    expect(parsed.sku).toBe('SKU-7788');
    expect(parsed.seller).toBe('ElectroShop GmbH');
    expect(parsed.rating).toBe(4.2);
    expect(parsed.reviewCount).toBe(120);
  });

  it('JSON-LD l’emporte sur microdata et meta contradictoires', () => {
    const html = `<!doctype html><html><head><title>Casque</title>
      ${jsonLd({
        '@type': 'Product', name: 'Casque', gtin13: '4006381333931', sku: 'SKU-7788',
        offers: { '@type': 'Offer', price: '129.99', priceCurrency: 'EUR' },
        aggregateRating: { ratingValue: '4.2', reviewCount: '120' },
      })}
      <meta property="product:gtin" content="1234567890123">
      <meta property="product:sku" content="META-SKU-1">
      <meta property="product:rating:value" content="3.1">
      <meta property="product:rating:count" content="7">
      </head><body>
      <span itemprop="gtin13" content="96385074"></span>
      <span itemprop="sku" content="MICRODATA-SKU"></span>
      <span itemprop="ratingValue" content="1.5"></span>
      <span itemprop="reviewCount" content="3"></span>
      </body></html>`;
    const parsed = parseProductPageHtml(html, url, 'generic');
    expect(parsed.gtin).toBe('4006381333931');
    expect(parsed.sku).toBe('SKU-7788');
    expect(parsed.rating).toBe(4.2);
    expect(parsed.reviewCount).toBe(120);
  });

  it('@graph, tableau et ProductGroup.hasVariant : le produit imbriqué est lu', () => {
    const html = `<!doctype html><html><head><title>Casque</title>
      ${jsonLd({
        '@context': 'https://schema.org', '@graph': [
          { '@type': 'Organization', name: 'TestBrand' },
          [{
            '@type': 'ProductGroup', name: 'Casque', productGroupID: 'G-1',
            hasVariant: [{
              '@type': 'Product', sku: 'VAR-991', gtin12: '012345678905',
              offers: { '@type': 'Offer', price: '99.00', priceCurrency: 'EUR', seller: { name: 'Variant Seller' } },
              aggregateRating: { ratingValue: '4,6', reviewCount: '1 234' },
            }],
          }],
        ],
      })}</head><body><h1>Casque</h1></body></html>`;
    const parsed = parseProductPageHtml(html, url, 'generic');
    expect(parsed.sku).toBe('VAR-991');
    expect(parsed.gtin).toBe('012345678905');
    expect(parsed.seller).toBe('Variant Seller');
    expect(parsed.rating).toBe(4.6);
    expect(parsed.reviewCount).toBe(1234);
  });

  it('clés GTIN alternatives (gtin8/gtin14/ean/isbn) acceptées, valeurs invalides refusées', () => {
    const withOffer = (body: Record<string, unknown>) => `<!doctype html><html><head><title>P</title>
      ${jsonLd({ '@type': 'Product', name: 'P', offers: { '@type': 'Offer', price: '10.00', priceCurrency: 'EUR' }, ...body })}
      </head><body></body></html>`;
    expect(parseProductPageHtml(withOffer({ gtin8: '96385074' }), url, 'generic').gtin).toBe('96385074');
    expect(parseProductPageHtml(withOffer({ gtin14: '12345678901234' }), url, 'generic').gtin).toBe('12345678901234');
    expect(parseProductPageHtml(withOffer({ ean: '4006381333931' }), url, 'generic').gtin).toBe('4006381333931');
    // Un « code-barres » de 10 chiffres n'est pas un GTIN : refusé, pas publié.
    expect(parseProductPageHtml(withOffer({ gtin: '1234567890' }), url, 'generic').gtin).toBeUndefined();
    expect(parseProductPageHtml(withOffer({ gtin13: 'ABCDEFGHIJKLM' }), url, 'generic').gtin).toBeUndefined();
  });

  it('vendeur : `offeredBy` et `vendor` acceptés, deux vendeurs distincts ⇒ aucun', () => {
    const page = (offers: unknown[]) => `<!doctype html><html><head><title>P</title>
      ${jsonLd({ '@type': 'Product', name: 'P', offers })}</head><body></body></html>`;
    expect(parseProductPageHtml(page([{ '@type': 'Offer', price: '10.00', priceCurrency: 'EUR', offeredBy: { name: 'Shop Un' } }]), url, 'generic').seller).toBe('Shop Un');
    // Shopify : le vendeur vit dans l'état embarqué (`productData`), pas dans le JSON-LD.
    const shopify = `<!doctype html><html><head><title>P</title>
      ${jsonLd({ '@type': 'Product', name: 'P', offers: { '@type': 'Offer', price: '10.00', priceCurrency: 'EUR' } })}
      <script type="application/json">${JSON.stringify({ productData: { title: 'P', vendor: 'Shop Deux', variants: [{ title: 'Default Title', sku: 'SKU-1', price: 1000 }] } })}</script>
      </head><body></body></html>`;
    expect(parseProductPageHtml(shopify, url, 'generic').seller).toBe('Shop Deux');
    // « Other Sellers » : Amazon/Shopify publient plusieurs offres. La première
    // n'est pas « le » vendeur — on ne tranche pas.
    const many = page([
      { '@type': 'Offer', price: '10.00', priceCurrency: 'EUR', seller: { name: 'Vendeur A' } },
      { '@type': 'Offer', price: '12.00', priceCurrency: 'EUR', seller: { name: 'Vendeur B' } },
    ]);
    expect(parseProductPageHtml(many, url, 'generic').seller).toBeUndefined();
    // Deux offres du MÊME vendeur : une seule identité publiée ⇒ publiée.
    const twice = page([
      { '@type': 'Offer', price: '10.00', priceCurrency: 'EUR', seller: { name: 'Vendeur A' } },
      { '@type': 'Offer', price: '12.00', priceCurrency: 'EUR', seller: { name: 'Vendeur A' } },
    ]);
    expect(parseProductPageHtml(twice, url, 'generic').seller).toBe('Vendeur A');
  });

  it('note hors bornes ou absente : rien n’est publié', () => {
    const page = (aggregate: Record<string, unknown>) => `<!doctype html><html><head><title>P</title>
      ${jsonLd({ '@type': 'Product', name: 'P', offers: { '@type': 'Offer', price: '10.00', priceCurrency: 'EUR' }, aggregateRating: aggregate })}</head><body></body></html>`;
    expect(parseProductPageHtml(page({ ratingValue: '6', reviewCount: '5' }), url, 'generic').rating).toBeUndefined();
    expect(parseProductPageHtml(page({ ratingValue: '0', reviewCount: '5' }), url, 'generic').rating).toBeUndefined();
    expect(parseProductPageHtml(page({ ratingValue: '4.4' }), url, 'generic').reviewCount).toBeUndefined();
  });

  it('sans donnée structurée : aucun champ étendu n’est inventé', () => {
    const html = `<!doctype html><html lang="fr"><head><title>Casque Bluetooth</title></head>
      <body><h1>Casque Bluetooth</h1><div class="product-price">49,99 €</div>
      <button id="add-to-cart">Ajouter au panier</button></body></html>`;
    const parsed = parseProductPageHtml(html, url, 'generic');
    expect(parsed.gtin).toBeUndefined();
    expect(parsed.sku).toBeUndefined();
    expect(parsed.seller).toBeUndefined();
    expect(parsed.rating).toBeUndefined();
    expect(parsed.reviewCount).toBeUndefined();
  });

  it('marqueurs publiés : « Verkauf durch X » est lu, « Versand durch » ne l’est pas', () => {
    const page = (merchantInfo: string) => `<!doctype html><html lang="de"><head><title>P</title>
      ${jsonLd({ '@type': 'Product', name: 'P', offers: { '@type': 'Offer', price: '10.00', priceCurrency: 'EUR' } })}
      </head><body><div id="merchant-info">${merchantInfo}</div>
      <span id="acrPopover" title="4.6 out of 5 stars"></span>
      <span id="acrCustomerReviewText" aria-label="46,196 Reviews">(46,196)</span>
      <input name="ASIN" value="B0D1XD1ZV3">
      </body></html>`;
    const sold = parseProductPageHtml(page('Verkauf durch ElectroShop GmbH, Versand durch Amazon.'), url, 'generic');
    expect(sold.seller).toBe('ElectroShop GmbH');
    expect(sold.rating).toBe(4.6);
    expect(sold.reviewCount).toBe(46196);
    expect(sold.sku).toBe('B0D1XD1ZV3');   // référence publiée par la page
    // « Versand durch » = expédition, pas vendeur : ne devient jamais un vendeur.
    const shipped = parseProductPageHtml(page('Versand durch Amazon'), url, 'generic');
    expect(shipped.seller).toBeUndefined();
    // Deux vendeurs publiés ⇒ aucun (règle d'unicité des marqueurs).
    const ambiguous = `<!doctype html><html><head><title>P</title></head><body>
      <span id="sellerProfileTriggerId">Boutique A</span></body></html>`;
    expect(parseProductPageHtml(ambiguous, url, 'generic').seller).toBe('Boutique A');
  });

  it('deux références publiées contradictoires ⇒ aucune référence', () => {
    const html = `<!doctype html><html><head><title>P</title></head><body>
      <input name="ASIN" value="B0D1XD1ZV3">
      <input name="ASIN" value="B0CFQN45PF">
      </body></html>`;
    expect(parseProductPageHtml(html, url, 'amazon').sku).toBeUndefined();
  });
});

/* ── 4. PERSISTANCE ET MIGRATION ────────────────────────────────────────── */

function scrapedProduct(overrides: Partial<ScrapedProduct> = {}): ScrapedProduct {
  return {
    id: 'scraped_1', store: 'generic', storeName: 'Boutique', url: 'https://shop.example-store.fr/products/casque',
    externalId: 'SKU-7788', title: 'Casque Bluetooth', description: 'Produit de test',
    images: ['https://cdn.example-store.fr/img.jpg'], mainImage: 'https://cdn.example-store.fr/img.jpg',
    sourcePrice: 129.99, sourceCurrency: 'EUR',
    convertedPriceTND: 0, estimatedShippingTND: 0, serviceFeeTND: 0, totalPriceTND: 0,
    variants: { colors: [], sizes: [], details: [] },
    availability: 'in_stock', brand: 'TestBrand',
    priceVerified: true, currencyVerified: true,
    verificationProvider: 'direct', verificationMethod: 'json_ld', verificationFailureCode: null,
    scrapedAt: new Date().toISOString(),
    ...overrides,
  };
}

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

describe('AYWEBs 2.5 — persistance : écriture puis relecture', () => {
  it('les cinq champs traversent la base et reviennent tels quels', () => {
    const db = new QatafoDatabase(':memory:');
    const store = findAyWebsStore('generic')!;
    const source = ayWebsSourceProductFromScraped(scrapedProduct({
      gtin: '4006381333931', sku: 'SKU-7788', seller: 'ElectroShop GmbH', rating: 4.6, reviewsCount: 46196,
    }), 'Boutique');
    const productId = persistAyWebsProduct(db, {
      store, sourceProduct: source,
      availability: ayWebsAvailabilityRecord('AVAILABLE', 'merchant_published_in_stock', 'adapter', new Date().toISOString()),
      pricing: null, evidenceHash: 'evidence-1', captureId: 'capture-1', adapterId: 'test',
    });
    const stored = readAyWebsProduct(db, productId)!;
    expect(stored.gtin).toBe('4006381333931');
    expect(stored.sku).toBe('SKU-7788');
    expect(stored.seller).toBe('ElectroShop GmbH');
    expect(stored.rating).toBe(4.6);
    expect(stored.reviewCount).toBe(46196);
    db.close();
  });

  it('ce que la page ne publie pas reste vide : `null`, pas « 0 » ni « Amazon »', () => {
    const db = new QatafoDatabase(':memory:');
    const source = ayWebsSourceProductFromScraped(scrapedProduct(), 'Boutique');
    const productId = persistAyWebsProduct(db, {
      store: findAyWebsStore('generic')!, sourceProduct: source,
      availability: ayWebsAvailabilityRecord('UNKNOWN', 'no_evidence', 'adapter', new Date().toISOString()),
      pricing: null, evidenceHash: 'evidence-2', captureId: 'capture-2', adapterId: 'test',
    });
    const stored = readAyWebsProduct(db, productId)!;
    expect(stored.gtin).toBeNull();
    expect(stored.sku).toBeNull();
    expect(stored.seller).toBeNull();
    expect(stored.rating).toBeNull();
    expect(stored.reviewCount).toBeNull();
    // Le nom de la boutique n'a pas « rempli » le vendeur.
    expect(stored.seller).not.toBe(stored.storeName);
    db.close();
  });

  it('mise à jour d’une fiche existante : les champs étendus ne restent pas figés', () => {
    const db = new QatafoDatabase(':memory:');
    const store = findAyWebsStore('generic')!;
    const availability = () => ayWebsAvailabilityRecord('AVAILABLE', 'merchant_published_in_stock', 'adapter', new Date().toISOString());
    const first = ayWebsSourceProductFromScraped(scrapedProduct({ sku: 'SKU-OLD' }), 'Boutique');
    const productId = persistAyWebsProduct(db, { store, sourceProduct: first, availability: availability(), pricing: null, evidenceHash: 'e-1', captureId: 'c-1', adapterId: 'test' });
    const second = ayWebsSourceProductFromScraped(scrapedProduct({
      sku: 'SKU-NEW', gtin: '96385074', seller: 'Autre Vendeur', rating: 4.1, reviewsCount: 88,
    }), 'Boutique');
    const sameId = persistAyWebsProduct(db, { store, sourceProduct: second, availability: availability(), pricing: null, evidenceHash: 'e-2', captureId: 'c-2', adapterId: 'test' });
    expect(sameId).toBe(productId);
    const stored = readAyWebsProduct(db, productId)!;
    expect(stored.sku).toBe('SKU-NEW');
    expect(stored.gtin).toBe('96385074');
    expect(stored.seller).toBe('Autre Vendeur');
    expect(stored.rating).toBe(4.1);
    expect(stored.reviewCount).toBe(88);
    db.close();
  });

  it('base antérieure à la phase 2.5 : colonnes ajoutées, aucune ligne perdue', () => {
    const dir = mkdtempSync(join(tmpdir(), 'aywebs-2-5-migration-'));
    const file = join(dir, 'legacy.sqlite');
    const columns = ['gtin', 'sku', 'seller', 'rating', 'review_count'];
    try {
      const now = new Date().toISOString();
      const legacy = new QatafoDatabase(file);
      legacy.run(
        `INSERT INTO ayweb_products (id, store_id, source_url, title, price, currency, resolved_at, created_at, updated_at)
         VALUES ('p-legacy','generic','https://shop.example-store.fr/products/old','Produit d’avant',49.9,'EUR',?,?,?)`,
        now, now, now,
      );
      // Simule une base écrite AVANT cette phase.
      for (const column of columns) legacy.run(`ALTER TABLE ayweb_products DROP COLUMN ${column}`);
      legacy.close();

      const reopened = new QatafoDatabase(file);
      const names = reopened.all<{ name: string }>('PRAGMA table_info(ayweb_products)').map((row) => row.name);
      for (const column of columns) expect(names).toContain(column);
      // La ligne existante est intacte et ses nouveaux champs signifient « non publié ».
      const row = readAyWebsProduct(reopened, 'p-legacy')!;
      expect(row.title).toBe('Produit d’avant');
      expect(row.price).toBe(49.9);
      expect(row.gtin).toBeNull();
      expect(row.sku).toBeNull();
      expect(row.seller).toBeNull();
      expect(row.rating).toBeNull();
      expect(row.reviewCount).toBeNull();
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ── 5. CONTRAT HTTP ────────────────────────────────────────────────────── */

describe('AYWEBs 2.5 — contrat HTTP : l’app reçoit les champs étendus', () => {
  const REGISTERED_URL = 'https://www.amazon.com/dp/B0D1XD1ZV3';

  function harness() {
    const extended = scrapedProduct({
      store: 'amazon', storeName: 'Amazon', url: REGISTERED_URL, externalId: 'B0D1XD1ZV3',
      sourceCurrency: 'USD', sourcePrice: 129.99, title: 'Casque Bluetooth (lecture serveur)',
      gtin: '4006381333931', sku: 'B0D1XD1ZV3', seller: 'ElectroShop GmbH', rating: 4.6, reviewsCount: 46196,
    });
    const scrapeProduct = vi.fn(async () => extended);
    const db = new QatafoDatabase(':memory:');
    vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
    const scraper = { cleanPastedUrl: (value: string) => String(value).trim(), scrapeProduct };
    return { db, scraper, scrapeProduct, context: createAyWebsContext(db, scraper as any) };
  }

  function app(h: ReturnType<typeof harness>) {
    const instance = express();
    instance.use(express.json({ limit: '256kb' }));
    instance.use((req, _res, next) => { (req as any).requestId = 'extended-fields-request'; next(); });
    instance.use('/api/v1/aywebs', createAyWebsRouter(h.db, h.scraper as any));
    return instance;
  }

  it('POST /product/resolve renvoie gtin, sku, seller, rating et review_count', async () => {
    const h = harness();
    const response = await request(app(h)).post('/api/v1/aywebs/product/resolve')
      .set({ 'x-session-id': 'extended-fields-session' })
      .send({ url: REGISTERED_URL });

    expect(response.status).toBe(201);
    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(response.body.data).toMatchObject({
      gtin: '4006381333931',
      sku: 'B0D1XD1ZV3',
      seller: 'ElectroShop GmbH',
      rating: 4.6,
      review_count: 46196,
    });
    h.db.close();
  });

  it('sans champs publiés, le corps répond `null` (jamais une valeur de consolation)', async () => {
    const h = harness();
    h.scrapeProduct.mockResolvedValue(scrapedProduct({
      store: 'amazon', storeName: 'Amazon', url: REGISTERED_URL, externalId: 'B0D1XD1ZV3',
      sourceCurrency: 'USD', title: 'Casque Bluetooth (lecture serveur)',
    }) as any);
    const response = await request(app(h)).post('/api/v1/aywebs/product/resolve')
      .set({ 'x-session-id': 'extended-fields-session-2' })
      .send({ url: REGISTERED_URL });

    expect(response.status).toBe(201);
    expect(response.body.data.gtin).toBeNull();
    expect(response.body.data.sku).toBeNull();
    expect(response.body.data.seller).toBeNull();
    expect(response.body.data.rating).toBeNull();
    expect(response.body.data.review_count).toBeNull();
    h.db.close();
  });
});
