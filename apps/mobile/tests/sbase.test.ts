/**
 * S Base — logique d'affichage (pure).
 *
 * Rien ici ne doit embellir la réalité : une durée absente reste « — », un prix
 * absent n'est pas remplacé par 0, et une capacité non fournie n'apparaît pas.
 */
import { describe, expect, test } from 'vitest';

import {
  CAPABILITY_ORDER,
  formatCallCost,
  formatDuration,
  failureMessageKey,
  formatItemPrice,
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
  });

  test('un quota / une panne fournisseur est reconnu comme tel (jamais la faute de la photo)', () => {
    expect(isImageProviderFailure('SBASE_IMAGE_PROVIDER_REFUSED')).toBe(true);
    expect(isImageProviderFailure('SBASE_IMAGE_RATE_LIMITED')).toBe(true);
    expect(isImageProviderFailure('SBASE_IMAGE_INVALID')).toBe(false);
  });

  test('codes SandBase connus traduits, code inconnu laissé au serveur', () => {
    expect(failureMessageKey('SANDBASE_NOT_CONFIGURED')).toBe('sbase.err.notConfigured');
    expect(failureMessageKey(' sb_base_whatever ')).toBeNull();
    expect(failureMessageKey(null)).toBeNull();
  });
});
