/**
 * AYWEBs — « Pas de devis serveur en dinars » : quand l'application doit
 * demander au serveur de relire la page (26/10/2026).
 *
 * ── Le symptôme ───────────────────────────────────────────────────────────
 * Même article, deux couleurs : une affichait son prix en dinars, l'autre
 * restait sur « Prix en dinars calculé à l'ajout. » puis refusait l'ajout
 * (« Pas de devis serveur en dinars »). Sur le WEB, la même fiche donnait un
 * devis pour les deux couleurs.
 *
 * ── La cause ──────────────────────────────────────────────────────────────
 * Le web demande au SERVEUR de relire la page ; l'application en mode `local`
 * n'envoie que la capture faite dans le navigateur du client. Quand cette
 * capture ne porte pas de prix vérifiable, il n'y a aucun devis — et le refus
 * tombe au moment de l'ajout, sans que l'écran ait jamais tenté la lecture qui
 * fonctionne.
 *
 * ── Ce que ce fichier verrouille ─────────────────────────────────────────
 *   1. devis présent ⇒ AUCUNE relecture (on n'ajoute pas une lecture marchande) ;
 *   2. devis absent ⇒ une relecture, une seule, avec la raison nommée ;
 *   3. la combinaison garde les valeurs nommées par la capture et prend le
 *      devis, le prix, la devise et l'état du serveur ;
 *   4. un serveur sans devis ne remplace jamais un champ prouvé par la capture.
 */
import { describe, expect, it } from 'vitest';

import type { AyWebsResolvedProduct } from '@/api/aywebs';
import { lacksServerQuote, preferServerQuote, serverReadDecision } from '@/features/aywebs/priceFallback';

function product(overrides: Partial<AyWebsResolvedProduct> = {}): AyWebsResolvedProduct {
  return {
    productId: 'aywprd_1',
    storeId: 'zalando',
    storeName: 'Zalando',
    sourceUrl: 'https://www.zalando.fr/hybrid-women-111.html',
    sourceDomain: 'zalando.fr',
    title: 'HYBRID WOMEN',
    brand: 'Nike',
    images: ['https://cdn.test/a.webp'],
    price: 149.95,
    currency: 'EUR',
    priceVerified: true,
    currencyVerified: true,
    availability: { state: 'AVAILABLE', reason: 'capture', checkedAt: '2026-10-26T02:31:00Z', source: 'capture', quantityHint: null },
    purchaseMode: 'BROWSER',
    integrationType: 'CAPTURE',
    ayroviPricing: null,
    variantGroups: [{ attribute: 'Taille', values: ['35.5', '36'] }],
    variantDetails: [],
    variantQuotes: [],
    fromCache: false,
    cacheAgeMs: null,
    ...overrides,
  };
}

describe('devis absent ⇒ une relecture serveur, jamais deux', () => {
  it('devis présent : aucune relecture (la capture a suffi)', () => {
    const withQuote = product({ ayroviPricing: { totalTnd: 838.42 } as AyWebsResolvedProduct['ayroviPricing'] });
    expect(serverReadDecision({ product: withQuote, sessionId: 'sess-1' })).toEqual({ read: false, reason: '' });
  });

  it('devis absent : relecture, avec la raison nommée', () => {
    expect(serverReadDecision({ product: product(), sessionId: 'sess-1' })).toEqual({ read: true, reason: 'NO_QUOTE' });
    expect(serverReadDecision({ product: product({ price: null, currency: '' }), sessionId: 'sess-1' }))
      .toEqual({ read: true, reason: 'NO_PRICE' });
    expect(serverReadDecision({ product: product({ currencyVerified: false, currency: '' }), sessionId: 'sess-1' }))
      .toEqual({ read: true, reason: 'CURRENCY_UNVERIFIED' });
    expect(serverReadDecision({ product: product({ priceVerified: false }), sessionId: 'sess-1' }))
      .toEqual({ read: true, reason: 'PRICE_UNVERIFIED' });
  });

  it('une seule relecture par ouverture, et jamais sans session', () => {
    expect(serverReadDecision({ product: product(), sessionId: 'sess-1', attempted: true }))
      .toEqual({ read: false, reason: '' });
    expect(serverReadDecision({ product: product(), sessionId: '' })).toEqual({ read: false, reason: '' });
  });

  it('un devis nul ou absurde compte comme absent', () => {
    expect(lacksServerQuote(product())).toBe(true);
    expect(lacksServerQuote(product({ ayroviPricing: { totalTnd: 0 } as AyWebsResolvedProduct['ayroviPricing'] }))).toBe(true);
    expect(lacksServerQuote(product({ ayroviPricing: { totalTnd: 599.45 } as AyWebsResolvedProduct['ayroviPricing'] }))).toBe(false);
    expect(lacksServerQuote(null)).toBe(true);
  });
});

describe('la relecture ne casse rien : elle AJOUTE le devis, elle ne remplace pas les choix', () => {
  it('le devis et le prix viennent du serveur, les tailles restent celles de la capture', () => {
    const capture = product();
    const server = product({
      productId: 'aywprd_server',
      price: 139.99,
      ayroviPricing: { totalTnd: 781.52 } as AyWebsResolvedProduct['ayroviPricing'],
      variantGroups: [],
      variantQuotes: [{ group: 'Taille', value: '35.5', totalTnd: 781.52 }] as AyWebsResolvedProduct['variantQuotes'],
    });
    const merged = preferServerQuote(capture, server);
    expect(merged.ayroviPricing?.totalTnd).toBe(781.52);
    expect(merged.price).toBe(139.99);
    expect(merged.currency).toBe('EUR');
    expect(merged.productId).toBe('aywprd_server');
    /* La capture nomme les tailles : le serveur ne les efface pas. */
    expect(merged.variantGroups).toEqual(capture.variantGroups);
    expect(merged.variantQuotes).toEqual(server.variantQuotes);
  });

  it('un serveur SANS devis ne remplace pas un champ prouvé par la capture', () => {
    const capture = product({ ayroviPricing: { totalTnd: 838.42 } as AyWebsResolvedProduct['ayroviPricing'], price: 149.95 });
    const server = product({ price: 139.99, currency: '', priceVerified: false, currencyVerified: false });
    const merged = preferServerQuote(capture, server);
    expect(merged).toBe(capture);
    expect(merged.ayroviPricing?.totalTnd).toBe(838.42);
    expect(merged.price).toBe(149.95);
  });

  it('aucun devis nulle part : on garde la capture, mais un état prouvé par le serveur gagne', () => {
    const capture = product({ availability: { state: 'UNKNOWN', reason: '', checkedAt: '', source: 'capture', quantityHint: null } });
    const server = product({ availability: { state: 'AVAILABLE', reason: 'server', checkedAt: '', source: 'server', quantityHint: 3 } });
    const merged = preferServerQuote(capture, server);
    expect(merged.availability.state).toBe('AVAILABLE');
    expect(merged.price).toBe(capture.price);
  });

  it('sans réponse serveur, la capture est rendue telle quelle', () => {
    const capture = product();
    expect(preferServerQuote(capture, null)).toBe(capture);
  });
});
