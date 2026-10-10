/**
 * Upload admin des médias : calcul de réduction des photos (le serveur refuse au-delà de 4 Mo).
 */
import { describe, expect, test } from 'vitest';
import { fitWithin, MAX_IMAGE_SIDE } from '../client/src/admin/mediaUpload';

describe('réduction des photos avant envoi', () => {
  test('une grande photo de téléphone est ramenée au côté max, proportions gardées', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: MAX_IMAGE_SIDE, height: 1200 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1200, height: MAX_IMAGE_SIDE });
  });

  test('une petite image n’est jamais agrandie', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });

  test('dimensions nulles ne plantent pas', () => {
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
  });
});
