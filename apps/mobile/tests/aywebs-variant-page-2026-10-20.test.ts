/**
 * AYWEBs — page du choix (variante Amazon) à la confirmation (20/10/2026).
 *  • le choix ≠ page affichée ⇒ on relit la page de l'ASIN choisi ;
 *  • le choix = page affichée, autre boutique, ASIN invalide ⇒ pas de relecture.
 */
import { describe, expect, it } from 'vitest';

import { variantPageUrlFor } from '@/features/aywebs/variantPage';

const SOURCE = 'https://www.amazon.com/dp/B0PAGE0001?ref_=x';
const OPTIONS = [
  { attributes: { size: 'M' }, sourceVariantId: 'B0SIZEMM01' },
  { attributes: { size: 'L' }, sourceVariantId: 'B0SIZELL02' },
  { attributes: { size: 'S' }, sourceVariantId: 'not-an-asin' },
];

describe('page du choix', () => {
  it('Amazon, option avec un autre ASIN ⇒ URL de la variante sur le même hôte', () => {
    expect(variantPageUrlFor({ sourceUrl: SOURCE, storeId: 'amazon', selection: { size: 'L' }, options: OPTIONS }))
      .toBe('https://www.amazon.com/dp/B0SIZELL02');
  });

  it('option qui correspond à la page affichée ⇒ pas de relecture', () => {
    expect(variantPageUrlFor({
      sourceUrl: 'https://www.amazon.com/dp/B0SIZELL02',
      storeId: 'amazon', selection: { size: 'L' }, options: OPTIONS,
    })).toBeNull();
  });

  it('aucun choix ⇒ pas de relecture', () => {
    expect(variantPageUrlFor({ sourceUrl: SOURCE, storeId: 'amazon', selection: {}, options: OPTIONS })).toBeNull();
  });

  it('ASIN invalide sur l\'option ⇒ pas de relecture (on ne devine pas)', () => {
    expect(variantPageUrlFor({ sourceUrl: SOURCE, storeId: 'amazon', selection: { size: 'S' }, options: OPTIONS })).toBeNull();
  });

  it('boutique autre qu\'Amazon ⇒ pas de relecture', () => {
    expect(variantPageUrlFor({ sourceUrl: SOURCE, storeId: 'shein', selection: { size: 'L' }, options: OPTIONS })).toBeNull();
  });

  it('URL source invalide ⇒ pas de relecture', () => {
    expect(variantPageUrlFor({ sourceUrl: 'pas une url', storeId: 'amazon', selection: { size: 'L' }, options: OPTIONS })).toBeNull();
  });
});
