/**
 * S Base — logique d'affichage (pure).
 *
 * Rien ici ne doit embellir la réalité : une durée absente reste « — », un prix
 * absent n'est pas remplacé par 0, et une capacité non fournie n'apparaît pas.
 */
import { describe, expect, test } from 'vitest';

import {
  CAPABILITY_ORDER,
  buildSbaseCartPayload,
  deriveSimilarQuery,
  formatCallCost,
  formatDuration,
  failureMessageKey,
  formatItemPrice,
  formatItemPriceWithCurrency,
  formatTND,
  isImageProviderFailure,
  missingLabelKey,
  supportedCapabilities,
} from '../src/features/sbase/sbaseLogic';

const NONE = { keyword: false, url: false, image: false, details: false, price: false, variants: false, barcode: false };

describe('S Base — capacités', () => {
  test('seules les capacités réellement fournies sont affichées, dans un ordre stable', () => {
    expect(supportedCapabilities({ ...NONE, keyword: true, price: true })).toEqual(['keyword', 'price']);
    expect(supportedCapabilities({ ...NONE })).toEqual([]);
    expect(supportedCapabilities(null)).toEqual([]);
    expect(CAPABILITY_ORDER.length).toBe(7);
  });

});

describe('S Base — formats honnêtes', () => {
  test('durée : millisecondes sous la seconde, secondes au-delà, « — » si inconnue', () => {
    expect(formatDuration(812)).toBe('812 ms');
    expect(formatDuration(0)).toBe('0 ms');
    expect(formatDuration(1400)).toBe('1,4 s');
    expect(formatDuration(12300)).toBe('12 s');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });

  test('prix : le texte de la source est repris tel quel ; sinon montant + devise', () => {
    expect(formatItemPrice({ priceText: '89,99 €', amount: 89.99, currency: 'EUR' })).toBe('89,99 €');
    expect(formatItemPrice({ priceText: null, amount: 12.5, currency: 'TND' })).toMatch(/12,50 TND/);
    expect(formatItemPrice({ priceText: null, amount: null, currency: null }, 'non fourni')).toBe('non fourni');
  });

  test('coût d’appel : tel que publié, jamais arrondi à zéro', () => {
    expect(formatCallCost(0.014286)).toBe('0,014 $');
    expect(formatCallCost(0)).toBe('0 $');
    expect(formatCallCost(null)).toBeNull();
  });

  test('les champs manquants connus ont un libellé, les autres passent bruts', () => {
    expect(missingLabelKey('price')).toBe('sbase.missing.price');
    expect(missingLabelKey('couleur')).toBeNull();
  });

});

describe('S Base — un échec dit ce qui a échoué', () => {
  test('un refus du fournisseur d’images a sa phrase, pas « photo invalide »', () => {
    expect(failureMessageKey('SBASE_IMAGE_PROVIDER_REFUSED')).toBe('sbase.err.imageProviderRefused');
    expect(failureMessageKey('SBASE_IMAGE_INVALID')).toBe('sbase.err.imageInvalid');
    expect(failureMessageKey('SBASE_IMAGE_RATE_LIMITED')).toBe('sbase.err.imageRateLimited');
    // 26/11/2026 — deux causes qu'on confondait avec « photo invalide ».
    expect(failureMessageKey('SBASE_IMAGE_REQUEST_INVALID')).toBe('sbase.err.imageRequestInvalid');
  });

  test('un quota / une panne fournisseur est reconnu comme tel (jamais la faute de la photo)', () => {
    expect(isImageProviderFailure('SBASE_IMAGE_PROVIDER_REFUSED')).toBe(true);
    expect(isImageProviderFailure('SBASE_IMAGE_RATE_LIMITED')).toBe(true);
    expect(isImageProviderFailure('SBASE_IMAGE_INVALID')).toBe(false);
  });

  test('code inconnu laissé au serveur (traduit côté écran si connu)', () => {
    expect(failureMessageKey(' sb_base_whatever ')).toBeNull();
    expect(failureMessageKey(null)).toBeNull();
  });

  test('codes Apify traduits par les mêmes phrases honnêtes (migration 26/11/2026)', () => {
    expect(failureMessageKey('APIFY_NOT_CONFIGURED')).toBe('sbase.err.notConfigured');
    expect(failureMessageKey('APIFY_UNAUTHORIZED')).toBe('sbase.err.unauthorized');
    expect(failureMessageKey('APIFY_BALANCE')).toBe('sbase.err.balance');
    expect(failureMessageKey('APIFY_RATE_LIMIT')).toBe('sbase.err.rateLimit');
    expect(failureMessageKey('APIFY_TIMEOUT')).toBe('sbase.err.timeout');
    expect(failureMessageKey('APIFY_FAILED')).toBe('sbase.err.failed');
    expect(failureMessageKey('APIFY_EMPTY')).toBe('sbase.err.empty');
    expect(failureMessageKey('APIFY_NETWORK')).toBe('sbase.err.network');
    expect(failureMessageKey('APIFY_MALFORMED')).toBe('sbase.err.malformed');
  });
});

describe('S Base — prix rendu en Tunisie', () => {
  test('millimes conservés, séparateurs français, jamais de dinar arrondi', () => {
    expect(formatTND(22.504)).toBe('22,504 TND');
    // Espace fine insécable de `toLocaleString('fr-FR')` : on la normalise.
    expect(formatTND(1234.5)?.replace(/\u202f|\u00a0/g, ' ')).toBe('1 234,500 TND');
    expect(formatTND(null)).toBeNull();
    expect(formatTND(Number.NaN)).toBeNull();
  });
});

describe('بطاقة S Base — السلّة والمشابهة والعملة', () => {
  test('formatItemPriceWithCurrency يفضّل amount+currency، والنص الخام بلا عملة فقط', () => {
    expect(formatItemPriceWithCurrency({ amount: 35, currency: 'CNY', priceText: '35.00' })).toBe('35 CNY');
    expect(formatItemPriceWithCurrency({ amount: 22.8, currency: 'CNY', priceText: '22,80 CNY' })).toBe('22,8 CNY');
    expect(formatItemPriceWithCurrency({ amount: null, currency: null, priceText: 'US$6.88' })).toBe('US$6.88');
    expect(formatItemPriceWithCurrency({ amount: null, currency: null, priceText: null }, '—')).toBe('—');
  });

  test('deriveSimilarQuery: أول 5 كلمات من العنوان، وبلا كلمات ⇒ العنوان كما هو', () => {
    expect(deriveSimilarQuery('American-Style Cleanfit Black Drapey Trousers for Men, New High-Street Fashion'))
      .toBe('american style cleanfit black drapey');
    expect(deriveSimilarQuery('   ')).toBe('');
    expect(deriveSimilarQuery('休闲裤男')).toBe('休闲裤男');
  });

  test('buildSbaseCartPayload: حمولة صادقة بلا quote، وnull عند غياب الأساس', () => {
    const full = { url: 'https://detail.1688.com/1.html', id: 'x1', title: 'Trouser', image: null, amount: 35, currency: 'CNY', store: '1688' };
    const payload = buildSbaseCartPayload(full);
    expect(payload).toMatchObject({
      store: '1688', externalId: 'x1', sourcePrice: 35, sourceCurrency: 'CNY',
      variant: null, requestedSize: null, requestedColor: null, quantity: 1,
    });
    // الصدق: بحث لا يصدر quote موقّعة — الحقلان غائبان تماماً ⇒ الخادم يضع PENDING_MANUAL.
    expect(payload && 'priceToken' in payload).toBe(false);
    expect(payload && 'priceVerificationStatus' in payload).toBe(false);
    expect(buildSbaseCartPayload({ ...full, url: null })).toBeNull();
    expect(buildSbaseCartPayload({ ...full, amount: 0 })).toBeNull();
    expect(buildSbaseCartPayload({ ...full, currency: null })).toBeNull();
    expect(buildSbaseCartPayload({ ...full, title: '  ' })).toBeNull();
  });
});
