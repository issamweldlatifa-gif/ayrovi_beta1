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

  /* 23/10/2026 — le twister ne publie pas l'ASIN de la COMBINAISON, seulement
     celui de la couleur à la taille affichée. Exiger les deux dimensions
     rendait toute autre couleur illisible, et l'ajout finissait en
     « stock non confirmé » alors que la page de la couleur existait. */
  it('couleur + taille choisies, ASIN publié pour la couleur ⇒ on lit la page de la couleur', () => {
    const COLOURS = [
      { attributes: { couleur: 'Color Blue', taille: '38' }, sourceVariantId: 'B0PAGE0001' },
      { attributes: { couleur: 'Dark Gray', taille: '38' }, sourceVariantId: 'B0GRAY0002' },
    ];
    expect(variantPageUrlFor({
      sourceUrl: SOURCE, storeId: 'amazon',
      selection: { couleur: 'Dark Gray', taille: '40' }, options: COLOURS,
    })).toBe('https://www.amazon.com/dp/B0GRAY0002');
  });

  it('la page courante ne prend pas la place d’une page qui montre le choix', () => {
    /* Les deux options couvrent UNE dimension ; celle de la page courante ne
       prouve rien de nouveau : on va vers l'autre. */
    const COLOURS = [
      { attributes: { couleur: 'Color Blue', taille: '38' }, sourceVariantId: 'B0PAGE0001' },
      { attributes: { couleur: 'Dark Gray', taille: '40' }, sourceVariantId: 'B0GRAY0002' },
    ];
    expect(variantPageUrlFor({
      sourceUrl: SOURCE, storeId: 'amazon',
      selection: { couleur: 'Dark Gray', taille: '38' }, options: COLOURS,
    })).toBe('https://www.amazon.com/dp/B0GRAY0002');
  });

  it('une valeur qui n’existe dans aucune option ne fabrique pas d’URL', () => {
    const COLOURS = [
      { attributes: { couleur: 'Color Blue', taille: '38' }, sourceVariantId: 'B0PAGE0001' },
      { attributes: { couleur: 'Dark Gray', taille: '38' }, sourceVariantId: 'B0GRAY0002' },
    ];
    expect(variantPageUrlFor({
      sourceUrl: SOURCE, storeId: 'amazon',
      selection: { couleur: 'Mauve', taille: '40' }, options: COLOURS,
    })).toBeNull();
  });
});
