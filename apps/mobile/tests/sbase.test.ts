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
  formatItemPrice,
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
