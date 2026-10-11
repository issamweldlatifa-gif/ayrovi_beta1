/**
 * OCEREX — prix de référence en dinars (`referenceTnd`).
 * Le serveur convertit le prix de référence au taux du devis; le client ne convertit rien.
 * `referenceTnd` absent ⇒ null (l'écran dit « pas de prix de référence », jamais 0 DT).
 */
import { describe, expect, it } from 'vitest';

import { parseOcerexExtraction } from '../src/api/ocerex';

const EXTRACTION = {
  extractionId: 'ex-1',
  type: 'PRODUCT',
  referencePrice: 129,
  currency: 'EUR',
  confidence: 0.92,
  confidenceLevel: 'HIGH',
};

describe('parseOcerexExtraction — referenceTnd', () => {
  it('lit le prix de référence en dinars', () => {
    expect(parseOcerexExtraction({ ...EXTRACTION, referenceTnd: 410.5 }).referenceTnd).toBe(410.5);
  });

  it('absent ⇒ null (pas 0)', () => {
    expect(parseOcerexExtraction(EXTRACTION).referenceTnd).toBeNull();
  });
});
