/**
 * AYWEBs — la photo n'est pas une preuve de prix (19/10/2026).
 *
 * Avant : `missing` contenait `image` et le serveur répondait CAPTURE_INCOMPLETE
 * (422) même quand titre, prix et devise étaient vérifiés. Désormais `missing`
 * ne liste que les champs bloquants ; `missingFields` garde tout, pour le journal.
 */
import { describe, expect, it } from 'vitest';

import { AYWEBS_OPTIONAL_FIELDS, blockingMissingFields } from '../src/aywebs/productResolver';

describe('champs bloquants vs champs informatifs', () => {
  it('la photo seule ne bloque jamais', () => {
    expect(AYWEBS_OPTIONAL_FIELDS).toContain('image');
    expect(blockingMissingFields(['image'])).toEqual([]);
  });

  it('un prix manquant bloque toujours, la photo ignorée', () => {
    expect(blockingMissingFields(['price', 'image'])).toEqual(['price']);
    expect(blockingMissingFields(['title', 'verified_price', 'image'])).toEqual(['title', 'verified_price']);
  });

  it('aucun champ manquant ⇒ rien à signaler', () => {
    expect(blockingMissingFields([])).toEqual([]);
  });
});
