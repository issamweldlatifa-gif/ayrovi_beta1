/**
 * AYWEBs — parcours d'achat de bout en bout (Master Order, phases 1-5).
 *
 * Ce qui est prouvé ici, dans l'ordre du §54 :
 *   1. détection du produit sur une boutique externe (§11) et normalisation
 *      avec variantes libres (§13) + disponibilité honnête (§14) ;
 *   2. ajout au panier AYWEBs propriétaire (§16-17) avec snapshot de variante
 *      et de prix, jamais un montant fourni par le client (§45) ;
 *   3. re-vérification du panier : un prix changé bloque la ligne et exige une
 *      décision explicite du client (§18, §29) ; une variante disparue n'est
 *      jamais remplacée automatiquement (§30) ;
 *   4. devis de checkout modulaire côté serveur (§19) : payable == somme des
 *      lignes de frais ;
 *   5. commande AYWEBs (§21) : DRAFT → CHECKOUT → PAYMENT_PENDING → PAID →
 *      PURCHASE_PENDING → PURCHASING en PENDING_INTEGRATION (§48 : aucun faux
 *      achat) ;
 *   6. pont vers le panier AYROVI existant (§2/§16) sans détruire le panier
 *      AYWEBs ni écrire deux fois dans `cart_items` ;
 *   7. demande d'achat avec URL pour une boutique non supportée (§23) et
 *      décision Admin avec raison obligatoire au rejet ;
 *   8. contrat d'erreur (§44) sur chaque refus, et NOT_IMPLEMENTED (501) sur
 *      l'entrepôt/l'expédition des phases 6-8.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import request from 'supertest';
import { describe, expect, test, vi } from 'vitest';

process.env.AYROVI_VARIANT_CACHE_DIR = join(mkdtempSync(join(tmpdir(), 'aywebs-journey-')), 'cache');

import { QatafoDatabase } from '../src/db/database';
import { createCustomerSession } from '../src/customer/auth';
import { DEFAULT_CUSTOMS_CATEGORIES, type PricingRules } from '../src/services/pricing';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { createAyWebsContext } from '../src/aywebs/context';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import {
  acceptAyWebsCartPriceChange, addAyWebsCartItem, listAyWebsCartItems, readAyWebsCartView,
  verifyAyWebsCart,
} from '../src/aywebs/cart';
import { computeAyWebsCheckoutPreview } from '../src/aywebs/checkoutFees';
import {
  createAyWebsOrder, readAyWebsOrderById, startAyWebsPurchase, submitAyWebsOrder,
  transitionAyWebsOrder,
} from '../src/aywebs/orders';
import { bridgeAyWebsCartToAyrovi } from '../src/aywebs/ayroviBridge';
import {
  createAyWebsPurchaseRequest, decideAyWebsPurchaseRequest,
  createAyWebsStoreRequest, decideAyWebsStoreRequest,
} from '../src/aywebs/purchaseRequests';
import { AyWebsDomainError } from '../src/aywebs/errors';
import { ayWebsEvidenceByHash, latestAyWebsEvidence } from '../src/aywebs/evidence';

const SESSION_ID = 'aywebs-journey-session-000001';
const AMAZON_URL = 'https://www.amazon.com/dp/B0ABCDEFGH';
const SHEIN_URL = 'https://www.shein.com/example-p-382460229.html';

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
 * Scraper de test à prix pilotable : `prices` simule le marchand qui change ses
 * étiquettes entre deux lectures, ce qui déclenche le vrai chemin
 * PRICE_CHANGED (§18) au lieu d'un UPDATE SQL inventé.
 *
 * `variantMode: 'lists'` ne publie que des listes de couleurs et de tailles :
 * le moteur doit alors rester à UNKNOWN, jamais prétendre qu'une combinaison est
 * en stock (§14).
 */
function fakeScraper(options: {
  availability?: string;
  variantMode?: 'combinations' | 'lists';
  prices?: { amazon?: number; shein?: number };
} = {}) {
  const amazonCombinations = [
    { id: 'v-black-41', color: 'Black', size: '41', stock: true, price: 39.99 },
    { id: 'v-black-42', color: 'Black', size: '42', stock: true, price: 39.99 },
    { id: 'v-white-41', color: 'White', size: '41', stock: true, price: 41.99 },
    { id: 'v-white-42', color: 'White', size: '42', stock: false, price: 41.99 },
  ];
  const scrapeProduct = vi.fn(async (url: string) => {
    const isAmazon = url.includes('amazon.');
    const price = isAmazon ? (options.prices?.amazon ?? 39.99) : (options.prices?.shein ?? 18.5);
    return {
      id: isAmazon ? 'scraped_amazon' : 'scraped_shein',
      store: isAmazon ? 'amazon' : 'shein',
      storeName: isAmazon ? 'Amazon' : 'SHEIN',
      url,
      externalId: isAmazon ? 'B0ABCDEFGH' : '382460229',
      title: isAmazon ? 'Nike Air Max shoes' : 'SHEIN summer dress',
      description: 'Produit de test',
      images: ['https://images.example.test/product.jpg'],
      mainImage: 'https://images.example.test/product.jpg',
      sourcePrice: price,
      sourceCurrency: 'USD',
      convertedPriceTND: 0, estimatedShippingTND: 0, serviceFeeTND: 0, totalPriceTND: 0,
      variants: isAmazon
        ? (options.variantMode === 'lists'
            ? { colors: ['Black', 'White'], sizes: ['41', '42'], details: [] }
            : { colors: ['Black', 'White'], sizes: ['41', '42'], details: amazonCombinations })
        : { colors: ['Beige'], sizes: ['M'], details: [{ id: 'shein-m-beige', color: 'Beige', size: 'M', stock: true, price }] },
      availability: (options.availability ?? 'in_stock') as any,
      brand: isAmazon ? 'Nike' : 'SHEIN',
      priceVerified: true, verificationProvider: 'direct', verificationMethod: 'json_ld',
      verificationFailureCode: null, scrapedAt: new Date().toISOString(),
    };
  });
  return { scraper: { cleanPastedUrl: (value: string) => String(value).trim(), scrapeProduct }, scrapeProduct };
}

function harness(options: Parameters<typeof fakeScraper>[0] = {}) {
  const { scraper, scrapeProduct } = fakeScraper(options);
  const db = new QatafoDatabase(':memory:');
  vi.spyOn(db, 'getPricingRules').mockImplementation(() => pricingRules());
  const ctx = createAyWebsContext(db, scraper as any);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as any).requestId = 'journey-request'; next(); });
  app.use('/api/v1/aywebs', createAyWebsRouter(db, scraper as any));
  return { db, ctx, app, resolver: ctx.resolver, scrapeProduct };
}

/** Compte client réel + session réelle (cookie + CSRF), comme en production. */
function signIn(db: QatafoDatabase) {
  const accountId = 'acct_journey_0001';
  const now = new Date().toISOString();
  db.run(
    `INSERT INTO customer_accounts (id,display_name,email,phone,email_verified_at,phone_verified_at,status,locale,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    accountId, 'Client AyWebs', 'client@ayrovi.tn', '22334455', now, now, 'ACTIVE', 'fr-TN', now, now,
  );
  const session = createCustomerSession(db, accountId, { ip: '127.0.0.1', headers: {} } as any);
  return {
    accountId,
    headers: {
      'x-session-id': SESSION_ID,
      cookie: `ayrovi_customer_session=${encodeURIComponent(session.token)}`,
      'x-csrf-token': session.csrfToken,
    },
  };
}

const ANONYMOUS = { 'x-session-id': SESSION_ID };

/** Une ligne de panier prête au checkout, via le chemin serveur réel. */
async function addToCart(
  h: ReturnType<typeof harness>,
  options: { url?: string; quantity?: number; variant?: Record<string, string> } = {},
) {
  return addAyWebsCartItem(h.resolver, {
    sessionId: SESSION_ID,
    accountId: null,
    sourceUrl: options.url ?? AMAZON_URL,
    variantAttributes: options.variant ?? { color: 'Black', size: '42' },
    quantity: options.quantity ?? 1,
  });
}

function cartItemsOf(h: ReturnType<typeof harness>) {
  const view = readAyWebsCartView(h.db, SESSION_ID, null);
  return { view, items: listAyWebsCartItems(h.db, view.cart!.id) };
}

describe('AYWEBs — détection produit et normalisation (§11, §13, §14)', () => {
  test('résout un produit externe en identité AYROVI + identité source distinctes', async () => {
    const h = harness();
    const result = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });

    expect(h.scrapeProduct).toHaveBeenCalledTimes(1);
    expect(result.product.storeId).toBe('amazon');
    // §53 : l'identité marchand n'est jamais écrasée par l'identité AYROVI.
    expect(result.product.sourceProductId).toBe('B0ABCDEFGH');
    expect(result.productId.startsWith('aywprd_')).toBe(true);
    expect(result.product.title).toBe('Nike Air Max shoes');
    expect(result.product.price).toBe(39.99);
    expect(result.product.currency).toBe('USD');
    expect(result.pricing?.totalTND).toBeGreaterThan(0);
    // §13 : options plates pour les sélecteurs, combinaisons pour le contrat.
    expect(new Set(result.product.variants.map((option) => option.attribute))).toEqual(new Set(['size', 'color']));
    const combination = result.sourceProduct.variants
      .find((variant) => variant.attributes.color === 'Black' && variant.attributes.size === '42');
    expect(combination?.availability).toBe('AVAILABLE');
    expect(combination?.sourceVariantId).toBe('v-black-42');
    // §14 : la disponibilité lue est conservée telle quelle.
    expect(result.product.availability.state).toBe('AVAILABLE');
  });

  test('des listes de variantes sans stock publié restent UNKNOWN, jamais AVAILABLE (§14)', async () => {
    const h = harness({ variantMode: 'lists' });
    const result = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(result.product.availability.state).toBe('AVAILABLE');
    expect(result.sourceProduct.variants.length).toBeGreaterThan(0);
    for (const variant of result.sourceProduct.variants) {
      expect(variant.availability).toBe('UNKNOWN');
      expect(variant.availabilityReason).toBe('merchant_option_lists_without_combination_stock');
    }
  });

  test('écrit une preuve vérifiable par son empreinte (§28)', async () => {
    const h = harness();
    const result = await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });
    expect(result.evidenceHash).toMatch(/^[a-f0-9]{64}$/);

    const evidence = ayWebsEvidenceByHash(h.db, result.evidenceHash);
    expect(evidence).not.toBeNull();
    expect(evidence?.sourceProductId).toBe('B0ABCDEFGH');
    expect(evidence?.price).toBe(39.99);
    expect(evidence?.currency).toBe('USD');
    expect(latestAyWebsEvidence(h.db, result.productId)?.evidenceHash).toBe(result.evidenceHash);
  });

  test('classe une page recherche comme non-produit, avant tout fetch (§10)', async () => {
    const h = harness();
    const listing = await request(h.app).post('/api/v1/aywebs/page/analyze').set(ANONYMOUS)
      .send({ url: 'https://www.amazon.com/s?k=nike' });
    expect(listing.status).toBe(200);
    expect(listing.body.data.page_type).toBe('SEARCH');
    expect(listing.body.data.is_product_page).toBe(false);
    expect(listing.body.data.product_detected).toBe(false);
    expect(listing.body.data.registered).toBe(true);
    expect(h.scrapeProduct).not.toHaveBeenCalled();
  });

  test('un domaine hors registre renvoie vers la demande d’achat avec URL (§23)', async () => {
    const h = harness();
    const analyzed = await request(h.app).post('/api/v1/aywebs/page/analyze').set(ANONYMOUS)
      .send({ url: 'https://www.mercadona.es/produit-12345' });
    expect(analyzed.status).toBe(200);
    expect(analyzed.body.data.registered).toBe(false);
    expect(analyzed.body.data.capture_allowed).toBe(false);
    expect(String(analyzed.body.data.fallback)).toContain('purchase_request');

    const captured = await request(h.app).post('/api/v1/aywebs/capture').set(ANONYMOUS)
      .send({ url: 'https://www.mercadona.es/produit-12345' });
    expect(captured.status).toBe(400);
    expect(captured.body.code).toBe('DOMAIN_NOT_ALLOWED');
    expect(captured.body.error_contract.requiredAction).toBe('SUBMIT_PURCHASE_REQUEST');
    expect(h.scrapeProduct).not.toHaveBeenCalled();
  });

  test('un produit épuisé est annoncé, jamais ajouté (§14)', async () => {
    const h = harness({ availability: 'out_of_stock' });
    const captured = await request(h.app).post('/api/v1/aywebs/capture').set(ANONYMOUS)
      .send({ store: 'amazon', url: AMAZON_URL });
    expect(captured.status).toBe(409);
    expect(captured.body.code).toBe('PRODUCT_UNAVAILABLE');
    expect(captured.body.error_contract.requiredAction).toBeTruthy();
  });
});

describe('AYWEBs — panier propriétaire (§16, §17)', () => {
  test('ajoute une ligne avec snapshot de variante et de prix, sans montant client', async () => {
    const h = harness();
    const added = await addToCart(h, { quantity: 2 });

    expect(added.duplicate).toBe(false);
    expect(added.item.itemNumber).toMatch(/^AYWITEM-\d{6}$/);
    expect(added.item.variantSnapshot?.attributes).toEqual({ color: 'Black', size: '42' });
    expect(added.item.status).toBe('ACTIVE');
    expect(added.item.checkoutReady).toBe(true);
    // Le prix vient du moteur tarifaire serveur, jamais du client.
    expect(added.item.unitPrice).toBe(39.99);
    expect(added.item.currency).toBe('USD');
    expect(added.item.evidenceHash).toMatch(/^[a-f0-9]{64}$/);
    // La preuve conserve la disponibilité réellement lue (§28).
    expect(added.item.availability).toBe('AVAILABLE');
    expect(added.item.priceSnapshot?.availability).toBe('AVAILABLE');
    expect(added.view.groups).toHaveLength(1);
    expect(added.view.totals.units).toBe(2);
    expect(listAyWebsCartItems(h.db, added.cart.id)).toHaveLength(1);
    // La preuve de la ligne est retrouvée par son empreinte.
    expect(ayWebsEvidenceByHash(h.db, added.item.evidenceHash)?.cartItemId).toBe(added.item.id);
  });

  test('même produit + même variante = quantité incrémentée, pas une ligne dupliquée', async () => {
    const h = harness();
    const first = await addToCart(h, { quantity: 1 });
    const second = await addToCart(h, { quantity: 2 });
    expect(second.duplicate).toBe(true);
    expect(second.item.id).toBe(first.item.id);
    expect(second.item.quantity).toBe(3);
  });

  test('une variante différente crée une ligne différente (§13)', async () => {
    const h = harness();
    const black = await addToCart(h, { variant: { color: 'Black', size: '42' } });
    const white = await addToCart(h, { variant: { color: 'White', size: '41' } });
    expect(white.item.id).not.toBe(black.item.id);
    expect(white.view.totals.units).toBe(2);
    expect(white.view.groups[0].items).toHaveLength(2);
  });

  test('une variante épuisée est refusée, jamais remplacée par une proche (§30)', async () => {
    const h = harness();
    try {
      await addToCart(h, { variant: { color: 'White', size: '42' } });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AyWebsDomainError);
      expect((error as AyWebsDomainError).code).toBe('VARIANT_UNAVAILABLE');
    }
    // Aucune ligne n'a été créée en douce.
    expect(readAyWebsCartView(h.db, SESSION_ID, null).items).toHaveLength(0);
  });

  test('une combinaison inconnue du marchand est refusée sans deviner (§13)', async () => {
    const h = harness();
    await expect(addToCart(h, { variant: { color: 'Red', size: '45' } }))
      .rejects.toMatchObject({ code: 'VARIANT_UNKNOWN' });
  });

  test('le panier survit à la connexion : la session est rattachée au compte (§26)', async () => {
    const h = harness();
    await addToCart(h);
    const { accountId, headers } = signIn(h.db);

    // Une requête authentifiée suffit : le contexte d'achat suit le compte.
    const cart = await request(h.app).get('/api/v1/aywebs/cart').set(headers);
    expect(cart.status).toBe(200);
    expect(cart.body.data.items).toHaveLength(1);

    const view = readAyWebsCartView(h.db, SESSION_ID, accountId);
    expect(view.cart?.accountId).toBe(accountId);
    expect(view.items).toHaveLength(1);
    // Un seul panier : la session anonyme n'a pas laissé de doublon.
    expect(h.db.all<any>('SELECT * FROM ayweb_carts')).toHaveLength(1);
  });
});

describe('AYWEBs — prix changé et re-vérification du panier (§18, §29)', () => {
  test('une hausse du marchand bloque la ligne : aucun achat silencieux', async () => {
    const h = harness();
    const added = await addToCart(h);
    expect(added.item.unitPrice).toBe(39.99);

    // Le marchand a augmenté le prix depuis la capture.
    const { scraper } = fakeScraper({ prices: { amazon: 59.99 } });
    const verification = await verifyAyWebsCart(
      { db: h.db, scraper: scraper as any, flags: h.ctx.resolver.flags },
      { sessionId: SESSION_ID, accountId: null, recheckSource: true },
    );

    expect(verification.changes.map((change) => change.code)).toContain('PRICE_CHANGED');
    const view = readAyWebsCartView(h.db, SESSION_ID, null);
    expect(view.totals.checkoutReady).toBe(false);
    expect(view.items[0].status).toBe('PRICE_CHANGED');
    expect(view.blockers.map((blocker) => blocker.code)).toContain('PRICE_CHANGED');

    const preview = computeAyWebsCheckoutPreview(h.db, cartItemsOf(h).items);
    expect(preview.blockers.map((blocker) => blocker.code)).toContain('PRICE_CHANGED');

    // Et la commande est refusée tant que le client n'a pas tranché.
    expect(() => createAyWebsOrder(h.db, { sessionId: SESSION_ID, accountId: null }))
      .toThrow(AyWebsDomainError);
  });

  test('accepter le nouveau prix réarme la ligne avec la nouvelle preuve (§29)', async () => {
    const h = harness();
    const added = await addToCart(h);
    const { scraper } = fakeScraper({ prices: { amazon: 59.99 } });
    await verifyAyWebsCart(
      { db: h.db, scraper: scraper as any, flags: h.ctx.resolver.flags },
      { sessionId: SESSION_ID, accountId: null, recheckSource: true },
    );

    const accepted = acceptAyWebsCartPriceChange(h.db, {
      itemId: added.item.id, sessionId: SESSION_ID, accountId: null,
    });
    expect(accepted.item.status).toBe('ACTIVE');
    expect(accepted.item.checkoutReady).toBe(true);
    expect(accepted.item.unitPrice).toBe(59.99);
    expect(accepted.item.priceSnapshot?.price).toBe(59.99);
    expect(accepted.item.evidenceHash).not.toBe(added.item.evidenceHash);
    expect(accepted.view.totals.checkoutReady).toBe(true);
  });

  test('une variante retirée par le marchand bloque la ligne, sans substitution (§30)', async () => {
    const h = harness();
    const added = await addToCart(h, { variant: { color: 'Black', size: '42' } });
    h.db.run(
      `UPDATE ayweb_products SET variants=? WHERE id=?`,
      JSON.stringify([{ sourceVariantId: 'v-black-41', attributes: { color: 'Black', size: '41' }, label: 'Black · 41', price: null, currency: null, available: true, availability: 'AVAILABLE', availabilityReason: 'merchant_in_stock', image: null, sortOrder: 0 }]),
      added.item.productId,
    );

    const verification = await verifyAyWebsCart(h.resolver, { sessionId: SESSION_ID, accountId: null });
    expect(verification.changes.map((change) => change.code)).toContain('VARIANT_UNAVAILABLE');
    const view = readAyWebsCartView(h.db, SESSION_ID, null);
    expect(view.items[0].status).toBe('VARIANT_UNAVAILABLE');
    expect(view.items[0].variantSnapshot?.attributes).toEqual({ color: 'Black', size: '42' });
    expect(view.totals.checkoutReady).toBe(false);
  });
});

describe('AYWEBs — checkout et commande (§19, §21, §48)', () => {
  test('le devis est modulaire : payable == somme des lignes de frais', async () => {
    const h = harness();
    await addToCart(h, { quantity: 2 });
    const preview = computeAyWebsCheckoutPreview(h.db, cartItemsOf(h).items);

    expect(preview.blockers).toHaveLength(0);
    expect(preview.lines).toHaveLength(1);
    expect(preview.fees.length).toBeGreaterThan(1);
    const feeSum = Math.round(preview.fees.reduce((sum, fee) => sum + fee.amountTnd, 0) * 100) / 100;
    expect(feeSum).toBe(preview.totals.payableTnd);
    expect(preview.totals.payableTnd).toBeGreaterThan(0);
    expect(preview.currency).toBe('TND');
    expect(preview.pricingVersion).toBe(3);
    // Chaque ligne de frais est bilingue et lisible par une machine (§19).
    for (const fee of preview.fees) {
      expect(fee.code).toBeTruthy();
      expect(fee.labelFr).toBeTruthy();
      expect(fee.labelAr).toBeTruthy();
    }
  });

  test('DRAFT → CHECKOUT → PAYMENT_PENDING → PAID → PURCHASE_PENDING → PURCHASING', async () => {
    const h = harness();
    await addToCart(h, { quantity: 2 });

    const { order, preview } = createAyWebsOrder(h.db, { sessionId: SESSION_ID, accountId: null });
    expect(order.orderNumber).toMatch(/^AYW-\d{6}$/);
    expect(order.status).toBe('DRAFT');
    expect(order.masterStage).toBe('CHECKOUT');
    expect(order.totals.payableTnd).toBe(preview.totals.payableTnd);
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(2);
    expect(order.items[0].variantSnapshot).toBeTruthy();
    expect(order.items[0].evidenceHash).toMatch(/^[a-f0-9]{64}$/);

    const submitted = submitAyWebsOrder(h.db, { orderId: order.id, accountId: null });
    expect(submitted.status).toBe('PAYMENT_PENDING');
    expect(submitted.submittedAt).toBeTruthy();

    const paid = transitionAyWebsOrder(h.db, {
      orderId: order.id, to: 'PAID', actorType: 'system', actorId: null,
      patch: { paymentStatus: 'PAID', paidAt: new Date().toISOString() },
    });
    expect(paid.status).toBe('PAID');
    const purchasePending = transitionAyWebsOrder(h.db, { orderId: order.id, to: 'PURCHASE_PENDING', actorType: 'system' });
    expect(purchasePending.status).toBe('PURCHASE_PENDING');

    // §48 : pas d'automate d'achat branché → l'état le dit, il ne ment pas.
    const purchasing = startAyWebsPurchase(h.db, { orderId: order.id, actorType: 'system', actorId: 'test' });
    expect(purchasing.status).toBe('PURCHASING');
    expect(purchasing.exceptionState).toBe('PENDING_INTEGRATION');
    expect(purchasing.items.every((item) => item.purchaseStatus === 'PENDING_INTEGRATION')).toBe(true);
    expect(purchasing.items[0].purchaseReason).toBeTruthy();

    const reloaded = readAyWebsOrderById(h.db, order.id);
    expect(reloaded?.timeline.some((step) => step.state === 'current')).toBe(true);
  });

  test('une transition hors machine à états est refusée (§54)', async () => {
    const h = harness();
    await addToCart(h);
    const { order } = createAyWebsOrder(h.db, { sessionId: SESSION_ID, accountId: null });
    expect(() => transitionAyWebsOrder(h.db, { orderId: order.id, to: 'DELIVERED', actorType: 'customer' }))
      .toThrow(AyWebsDomainError);
  });

  test('un panier vide est refusé avec le contrat d’erreur complet (§44)', () => {
    const h = harness();
    try {
      createAyWebsOrder(h.db, { sessionId: SESSION_ID, accountId: null });
      throw new Error('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AyWebsDomainError);
      const contract = (error as AyWebsDomainError).contract;
      expect(contract.errorCode).toBe('CART_EMPTY');
      expect(contract.userMessage.length).toBeGreaterThan(0);
      expect(contract.recoverable).toBe(true);
      expect(contract.requiredAction).toBeTruthy();
    }
  });

  test('HTTP : devis en anonyme, commande refusée sans compte (§45)', async () => {
    const h = harness();
    await addToCart(h);

    const preview = await request(h.app).post('/api/v1/aywebs/checkout/preview').set(ANONYMOUS).send({});
    expect(preview.status).toBe(200);
    expect(preview.body.data.totals.payable_tnd).toBeGreaterThan(0);
    expect(Array.isArray(preview.body.data.fees)).toBe(true);

    const order = await request(h.app).post('/api/v1/aywebs/orders').set(ANONYMOUS).send({});
    expect(order.status).toBe(401);
    expect(order.body.code).toBe('AUTH_REQUIRED');
  });

  test('HTTP : commande authentifiée complète jusqu’au PAYMENT_PENDING', async () => {
    const h = harness();
    const { headers } = signIn(h.db);
    await addToCart(h);

    const created = await request(h.app).post('/api/v1/aywebs/orders').set(headers).send({ notes: 'Livrer avant vendredi' });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data.order_number).toMatch(/^AYW-\d{6}$/);
    // §48 annoncé au client dès la création.
    expect(created.body.purchase_integration).toBe('PENDING_INTEGRATION');

    const submitted = await request(h.app).post(`/api/v1/aywebs/orders/${created.body.data.id}/submit`).set(headers).send({});
    expect(submitted.status, JSON.stringify(submitted.body)).toBe(200);
    expect(submitted.body.data.status).toBe('PAYMENT_PENDING');

    const methods = await request(h.app).get('/api/v1/aywebs/payments/methods').set(headers);
    expect(methods.status).toBe(200);
    expect(methods.body.data.methods.length).toBeGreaterThan(0);
    expect(typeof methods.body.data.card_gateway_available).toBe('boolean');

    const listed = await request(h.app).get('/api/v1/aywebs/orders').set(headers);
    expect(listed.body.data).toHaveLength(1);

    const detail = await request(h.app).get(`/api/v1/aywebs/orders/${created.body.data.id}`).set(headers);
    expect(detail.status).toBe(200);
    expect(detail.body.data.items).toHaveLength(1);
    expect(Array.isArray(detail.body.data.timeline)).toBe(true);
  });

  test('HTTP : une écriture authentifiée sans jeton CSRF est refusée', async () => {
    const h = harness();
    const { accountId } = signIn(h.db);
    const session = createCustomerSession(h.db, accountId, { ip: '127.0.0.1', headers: {} } as any);
    const cookieOnly = {
      'x-session-id': SESSION_ID,
      cookie: `ayrovi_customer_session=${encodeURIComponent(session.token)}`,
    };
    const added = await request(h.app).post('/api/v1/aywebs/cart/items').set(cookieOnly).send({
      source_url: AMAZON_URL, variant_attributes: { color: 'Black', size: '42' }, quantity: 1,
    });
    expect(added.status).toBe(403);
    expect(added.body.code).toBe('INVALID_CSRF');
  });

  test('HTTP : ajouter au panier, vérifier, puis voir le panier bloqué', async () => {
    const h = harness();
    const added = await request(h.app).post('/api/v1/aywebs/cart/items').set(ANONYMOUS).send({
      source_url: AMAZON_URL, variant_attributes: { color: 'Black', size: '42' }, quantity: 1,
    });
    expect(added.status, JSON.stringify(added.body)).toBe(201);
    expect(added.body.data.item.item_number).toMatch(/^AYWITEM-\d{6}$/);
    expect(added.body.cart.totals.checkout_ready).toBe(true);

    const verified = await request(h.app).post('/api/v1/aywebs/cart/verify').set(ANONYMOUS).send({});
    expect(verified.status).toBe(200);
    expect(Array.isArray(verified.body.data.changes)).toBe(true);
    expect(verified.body.cart.totals.checkout_ready).toBe(true);

    const cart = await request(h.app).get('/api/v1/aywebs/cart').set(ANONYMOUS);
    expect(cart.body.data.items).toHaveLength(1);
  });
});

describe('AYWEBs — pont vers le panier AYROVI existant (§2, §16)', () => {
  test('déplace les lignes prêtes dans cart_items sans détruire le panier AYWEBs', async () => {
    const h = harness();
    const added = await addToCart(h, { quantity: 2 });

    const bridge = bridgeAyWebsCartToAyrovi(h.db, { sessionId: SESSION_ID, accountId: null });
    expect(bridge.moved).toHaveLength(1);
    expect(bridge.moved[0].aywebsItemNumber).toBe(added.item.itemNumber);
    expect(bridge.totalItemsCount).toBe(2);
    expect(bridge.totalTnd).toBeGreaterThan(0);

    const ayroviLines = h.db.all<any>('SELECT * FROM cart_items WHERE session_id=?', SESSION_ID);
    expect(ayroviLines).toHaveLength(1);
    expect(ayroviLines[0].store).toBe('amazon');
    expect(Number(ayroviLines[0].quantity)).toBe(2);
    expect(Number(ayroviLines[0].price_tnd)).toBeGreaterThan(0);
    // La ligne AYROVI garde un prix vérifié : le checkout existant fonctionne.
    expect(String(ayroviLines[0].price_verification_status)).toBe('VERIFIED');
    // La traçabilité AYWEBs suit la ligne dans le panier AYROVI.
    expect(String(ayroviLines[0].customer_note)).toContain(added.item.itemNumber);

    // Rien n'est détruit côté AYWEBs.
    expect(readAyWebsCartView(h.db, SESSION_ID, null).items).toHaveLength(1);

    // Idempotence : un second pont ne facture pas deux fois.
    const again = bridgeAyWebsCartToAyrovi(h.db, { sessionId: SESSION_ID, accountId: null });
    expect(again.moved[0].duplicate).toBe(true);
    expect(h.db.all<any>('SELECT * FROM cart_items WHERE session_id=?', SESSION_ID)).toHaveLength(1);
  });

  test('une ligne bloquée reste à quai et est signalée avec sa raison', async () => {
    const h = harness();
    await addToCart(h, { url: AMAZON_URL, variant: { color: 'Black', size: '42' } });
    const shein = await addToCart(h, { url: SHEIN_URL, variant: { color: 'Beige', size: 'M' } });

    // La ligne SHEIN devient épuisée chez le marchand.
    h.db.run(`UPDATE ayweb_cart_items SET status='OUT_OF_STOCK', status_reason='merchant_out_of_stock' WHERE id=?`, shein.item.id);

    const bridge = bridgeAyWebsCartToAyrovi(h.db, { sessionId: SESSION_ID, accountId: null });
    expect(bridge.moved).toHaveLength(1);
    expect(bridge.moved[0].store).toBe('Amazon');
    expect(bridge.skipped).toHaveLength(1);
    expect(bridge.skipped[0].aywebsItemId).toBe(shein.item.id);
    expect(bridge.skipped[0].code).toBe('OUT_OF_STOCK');
    expect(bridge.skipped[0].message).toContain(shein.item.title);
    expect(bridge.message).toContain('retenue');

    const ayroviLines = h.db.all<any>('SELECT * FROM cart_items WHERE session_id=?', SESSION_ID);
    expect(ayroviLines).toHaveLength(1);
    expect(String(ayroviLines[0].store)).toBe('amazon');
  });

  test('un panier sans ligne transférable est refusé, jamais un succès vide', async () => {
    const h = harness();
    const added = await addToCart(h);
    h.db.run(`UPDATE ayweb_cart_items SET status='PRICE_CHANGED', status_reason='39.99 → 59.99 USD' WHERE id=?`, added.item.id);
    expect(() => bridgeAyWebsCartToAyrovi(h.db, { sessionId: SESSION_ID, accountId: null }))
      .toThrow(AyWebsDomainError);
    expect(h.db.all<any>('SELECT * FROM cart_items WHERE session_id=?', SESSION_ID)).toHaveLength(0);
  });
});

describe('AYWEBs — boutiques non supportées : demande d’achat avec URL (§23)', () => {
  test('crée une demande SUBMITTED avec numéro AYWREQ et attributs libres', async () => {
    const h = harness();
    const created = createAyWebsPurchaseRequest(h.db, {
      sessionId: SESSION_ID, accountId: null,
      productUrl: 'https://www.mercadona.es/produit-12345',
      quantity: 2, productName: 'Huile d’olive 1L',
      variantAttributes: { format: '1L', pack: '3' },
      requirements: 'Sans alcool', customerNotes: 'Merci de vérifier la date',
    });
    expect(created.requestNumber).toMatch(/^AYWREQ-\d{6}$/);
    expect(created.status).toBe('SUBMITTED');
    expect(created.variantAttributes).toEqual({ format: '1L', pack: '3' });
    // Boutique hors registre : aucune identité de boutique n'est inventée.
    expect(created.registeredStore).toBe(false);
    expect(created.storeId).toBeFalsy();
    expect(created.sourceDomain).toBe('mercadona.es');
    expect(created.nextAction).toBe('WAIT_FOR_REVIEW');
  });

  test('exige de quoi identifier le produit, et refuse un lien non-HTTPS ou privé (§45)', () => {
    const h = harness();
    expect(() => createAyWebsPurchaseRequest(h.db, {
      sessionId: SESSION_ID, accountId: null, productUrl: 'https://www.mercadona.es/p-1',
    })).toThrow(AyWebsDomainError);
    expect(() => createAyWebsPurchaseRequest(h.db, {
      sessionId: SESSION_ID, accountId: null, productUrl: 'http://www.mercadona.es/p-1', productName: 'Huile',
    })).toThrow(AyWebsDomainError);
    expect(() => createAyWebsPurchaseRequest(h.db, {
      sessionId: SESSION_ID, accountId: null, productUrl: 'https://127.0.0.1/admin', productName: 'Huile',
    })).toThrow(AyWebsDomainError);
  });

  test('le rejet exige une raison du catalogue, la décision est tracée', () => {
    const h = harness();
    const created = createAyWebsPurchaseRequest(h.db, {
      sessionId: SESSION_ID, accountId: null,
      productUrl: 'https://www.mercadona.es/produit-12345', quantity: 1, productName: 'Huile d’olive',
    });
    expect(() => decideAyWebsPurchaseRequest(h.db, {
      id: created.id, to: 'REJECTED', adminId: 'admin_1', reason: null,
    })).toThrow(AyWebsDomainError);

    const rejected = decideAyWebsPurchaseRequest(h.db, {
      id: created.id, to: 'REJECTED', adminId: 'admin_1', reason: 'PROHIBITED_ITEM',
      decisionNote: 'Produit non importable en Tunisie',
    });
    expect(rejected.status).toBe('REJECTED');
    expect(rejected.reason).toBe('PROHIBITED_ITEM');
    expect(rejected.decisionNote).toContain('non importable');
    expect(rejected.decidedAt).toBeTruthy();

    // Une demande rejetée ne peut pas être ré-approuvée en douce.
    expect(() => decideAyWebsPurchaseRequest(h.db, {
      id: created.id, to: 'APPROVED', adminId: 'admin_1',
    })).toThrow(AyWebsDomainError);
  });

  test('une demande de boutique ne peut être PROMOTED sans boutique du registre (§38)', () => {
    const h = harness();
    const created = createAyWebsStoreRequest(h.db, {
      sessionId: SESSION_ID, accountId: null, storeName: 'Mercadona',
      storeUrl: 'https://www.mercadona.es', intent: 'Acheter de l’huile d’olive',
    });
    expect(created.status).toBe('SUBMITTED');
    expect(() => decideAyWebsStoreRequest(h.db, {
      id: created.id, to: 'PROMOTED', adminId: 'admin_1', promotedStoreId: null,
    })).toThrow(AyWebsDomainError);
    // Le flux est ordonné : SUBMITTED → UNDER_REVIEW → APPROVED → PROMOTED.
    expect(() => decideAyWebsStoreRequest(h.db, {
      id: created.id, to: 'PROMOTED', adminId: 'admin_1', promotedStoreId: 'amazon',
    })).toThrow(AyWebsDomainError);
    decideAyWebsStoreRequest(h.db, { id: created.id, to: 'UNDER_REVIEW', adminId: 'admin_1' });
    decideAyWebsStoreRequest(h.db, { id: created.id, to: 'APPROVED', adminId: 'admin_1', decisionNote: 'Boutique acceptable' });
    const promoted = decideAyWebsStoreRequest(h.db, {
      id: created.id, to: 'PROMOTED', adminId: 'admin_1', promotedStoreId: 'amazon',
    });
    expect(promoted.status).toBe('PROMOTED');
  });

  test('HTTP : la demande passe par l’API et reste lisible par son auteur', async () => {
    const h = harness();
    const created = await request(h.app).post('/api/v1/aywebs/purchase-requests').set(ANONYMOUS).send({
      product_url: 'https://www.mercadona.es/produit-12345', quantity: 1, product_name: 'Huile d’olive',
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(created.body.data.request_number).toMatch(/^AYWREQ-\d{6}$/);

    const listed = await request(h.app).get('/api/v1/aywebs/purchase-requests').set(ANONYMOUS);
    expect(listed.body.data).toHaveLength(1);

    const invalid = await request(h.app).post('/api/v1/aywebs/purchase-requests').set(ANONYMOUS).send({ product_url: '' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.code).toBe('PURCHASE_REQUEST_INVALID');
  });
});

describe('AYWEBs — honnêteté des phases 6-8 et surface API (§43, §48)', () => {
  test('entrepôt et expédition répondent NOT_IMPLEMENTED, jamais un faux succès', async () => {
    const h = harness();
    const warehouse = await request(h.app).get('/api/v1/aywebs/warehouse').set(ANONYMOUS);
    expect(warehouse.status).toBe(501);
    expect(warehouse.body.code).toBe('NOT_IMPLEMENTED');
    expect(warehouse.body.error_contract.requiredAction).toBe('WAIT_FOR_REVIEW');

    const shipping = await request(h.app).post('/api/v1/aywebs/shipping/quote').set(ANONYMOUS).send({});
    expect(shipping.status).toBe(501);
    expect(shipping.body.code).toBe('NOT_IMPLEMENTED');
  });

  test('publie la Home AYWEBs : populaires, catégories, récents, panier (§6)', async () => {
    const h = harness();
    await request(h.app).post('/api/v1/aywebs/page/analyze').set(ANONYMOUS).send({ url: AMAZON_URL });
    await resolveAyWebsProduct(h.resolver, { url: AMAZON_URL, sessionId: SESSION_ID });

    const home = await request(h.app).get('/api/v1/aywebs/home').set(ANONYMOUS);
    expect(home.status).toBe(200);
    expect(home.body.data.stores.length).toBeGreaterThan(0);
    expect(home.body.data.popular_stores.length).toBeGreaterThan(0);
    expect(home.body.data.categories.length).toBeGreaterThan(0);
    expect(home.body.data.recent_stores.map((store: any) => store.storeId)).toContain('amazon');
    expect(home.body.data.recent_products).toHaveLength(1);
    expect(home.body.data.recent_products[0].store_id).toBe('amazon');
    expect(home.body.data.cart.items_count).toBe(0);
    expect(home.body.data.cart.checkout_ready).toBe(false);
    expect(home.body.data.request_store_supported).toBe(true);
    expect(home.body.data.request_purchase_supported).toBe(true);
    expect(home.body.features.capture_enabled).toBe(true);
  });

  test('expose les capacités d’une boutique depuis le registre centralisé (§7)', async () => {
    const h = harness();
    const capabilities = await request(h.app).get('/api/v1/aywebs/stores/amazon/capabilities').set(ANONYMOUS);
    expect(capabilities.status).toBe(200);
    expect(capabilities.body.data.integration_type).toBe('SUPPORTED');
    expect(capabilities.body.data.capabilities).toEqual(
      expect.arrayContaining(['browse', 'product', 'variants', 'availability']),
    );
    expect(capabilities.body.data.purchase_mode).toBeTruthy();
    expect(capabilities.body.data.granted.product).toBe(true);

    const unknown = await request(h.app).get('/api/v1/aywebs/stores/nope/capabilities').set(ANONYMOUS);
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('STORE_UNKNOWN');
  });

  test('une requête sans identifiant de session est refusée par le contrat (§26, §44)', async () => {
    const h = harness();
    const response = await request(h.app).get('/api/v1/aywebs/cart');
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('SESSION_REQUIRED');
    expect(response.body.error_contract.retryAllowed).toBe(true);
  });
});
