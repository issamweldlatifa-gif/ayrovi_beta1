/**
 * AYWEBs Mobile — SHEIN v2 : feuille locale, vignettes de couleur, page sœur (-p-<goodsId>.html) et disponibilité (28/10/2026).
 */
import { describe, expect, it } from 'vitest';

import {
  defaultSelectionFromCapture,
  groupsFromCapture,
  localAddReadiness,
  localVariantsFromCapture,
  optionsFromVariants,
  pageAvailabilityFromCapture,
  productFromCapture,
  valueStatesFromCapture,
} from '@/features/aywebs/localProduct';
import { variantPageUrlFor } from '@/features/aywebs/variantPage';
import { imageForSelectedColor } from '@/features/aywebs/variantImage';
import { choiceGroupKind } from '@/features/aywebs/choiceGroup';

const SHEIN_SOURCE_URL = 'https://fr.shein.com/Robe-fleurie-Noir-p-382460229.html';

const SHEIN_CAPTURE = {
  v: 1,
  url: SHEIN_SOURCE_URL,
  title: 'Robe fleurie plissée Noir',
  brand: 'DAZY',
  priceCandidates: [
    { text: '21,40 €', source: 'dom' },
    { text: '21.40 EUR', source: 'embedded_json' },
  ],
  currencyText: 'EUR',
  addToCartText: 'Ajouter au panier',
  availabilityText: null,
  images: ['https://img.ltwebstatic.com/images3_pi/2026/10/28/382460229_main.jpg'],
  selectedVariantTexts: ['Noir'],
  variantTexts: ['Noir', 'Rouge', 'Vert Émeraude', 'S', 'M', 'L', 'XL'],
  shein: {
    readerVersion: 2,
    pageGoodsId: '382460229',
    selectedColor: 'Noir',
    selectedSize: null,
    skuId: 'sw261028382460229',
  },
  variantGroups: [
    {
      name: 'Couleur',
      values: ['Noir', 'Rouge', 'Vert Émeraude'],
      selected: ['Noir'],
      options: [
        {
          value: 'Noir',
          available: true,
          price: null,
          priceFrom: false,
          stock: null,
          image: 'https://img.ltwebstatic.com/images3_pi/2026/10/28/382460229_swatch.jpg',
          goodsId: '382460229',
        },
        {
          value: 'Rouge',
          available: null,
          price: '23,90 €',
          priceFrom: true,
          stock: null,
          image: 'https://img.ltwebstatic.com/images3_pi/2026/10/28/400991122_swatch.jpg',
          goodsId: '400991122',
        },
        {
          value: 'Vert Émeraude',
          available: false,
          price: '21,40 €',
          priceFrom: true,
          stock: null,
          image: 'https://img.ltwebstatic.com/images3_pi/2026/10/28/400991199_swatch.jpg',
          goodsId: '400991199',
        },
      ],
    },
    {
      name: 'Taille',
      values: ['S', 'M', 'L', 'XL'],
      selected: [],
      options: [
        { value: 'S', available: true, price: '21.40 EUR', priceFrom: false, stock: 18 },
        { value: 'M', available: true, price: '21.40 EUR', priceFrom: false, stock: 3 },
        { value: 'L', available: false, price: null, priceFrom: false, stock: null },
        { value: 'XL', available: true, price: '24.90 EUR', priceFrom: false, stock: 9 },
      ],
    },
  ],
};

describe('AYWEBs Mobile — SHEIN v2 dans la feuille de choix', () => {
  it('extrait productId SHEIN, groupes Couleur + Taille, vignettes et présélectionne la couleur active', () => {
    const product = productFromCapture(SHEIN_CAPTURE, SHEIN_SOURCE_URL, 'shein', 'SHEIN');
    expect(product.productId).toBe('SHEIN-382460229');

    const variants = localVariantsFromCapture(SHEIN_CAPTURE);
    const groups = groupsFromCapture(SHEIN_CAPTURE, variants);
    expect(groups).toEqual([
      { attribute: 'Couleur', values: ['Noir', 'Rouge', 'Vert Émeraude'] },
      { attribute: 'Taille', values: ['S', 'M', 'L', 'XL'] },
    ]);

    const initialSelection = defaultSelectionFromCapture(SHEIN_CAPTURE, groups);
    expect(initialSelection).toEqual({ couleur: 'Noir' });

    const options = optionsFromVariants(variants);
    const rougeOption = options.find((o) => o.attributes.Couleur === 'Rouge');
    expect(rougeOption?.sourceVariantId).toBe('shein:400991122');
    expect(rougeOption?.image).toBe('https://img.ltwebstatic.com/images3_pi/2026/10/28/400991122_swatch.jpg');

    const fields = groups.map((g) => ({
      key: g.attribute.toLowerCase(),
      kind: choiceGroupKind(g.attribute),
      values: g.values.map((val) => ({
        value: val,
        image: options.find((o) => o.attributes[g.attribute] === val)?.image || undefined,
      })),
    }));
    expect(imageForSelectedColor(fields, { couleur: 'Rouge', taille: 'M' }))
      .toBe('https://img.ltwebstatic.com/images3_pi/2026/10/28/400991122_swatch.jpg');
  });

  it('résout l’URL de la fiche couleur sœur SHEIN (-p-<goodsId>.html) uniquement quand la couleur change de goods_id', () => {
    const options = optionsFromVariants(localVariantsFromCapture(SHEIN_CAPTURE));

    /* Même couleur que la fiche courante (382460229) ⇒ aucune relecture */
    expect(variantPageUrlFor({
      sourceUrl: SHEIN_SOURCE_URL,
      storeId: 'shein',
      selection: { couleur: 'Noir', taille: 'M' },
      options,
    })).toBeNull();

    /* Couleur sœur Rouge (400991122) ⇒ URL de sa propre fiche sur le même sous-domaine */
    expect(variantPageUrlFor({
      sourceUrl: SHEIN_SOURCE_URL,
      storeId: 'shein',
      selection: { couleur: 'Rouge', taille: 'M' },
      options,
    })).toBe('https://fr.shein.com/-p-400991122.html');
  });

  it('valide localement la disponibilité SHEIN : taille manquante, taille épuisée, et taille disponible en stock faible', () => {
    expect(pageAvailabilityFromCapture(SHEIN_CAPTURE)).toBe('AVAILABLE');

    const variants = localVariantsFromCapture(SHEIN_CAPTURE);
    const groups = groupsFromCapture(SHEIN_CAPTURE, variants);
    const valueStates = valueStatesFromCapture(SHEIN_CAPTURE);

    /* Taille non encore choisie ⇒ VARIANT_REQUIRED */
    expect(localAddReadiness({
      groups,
      variants,
      selection: { couleur: 'Noir' },
      pageInStockText: true,
      valueStates,
      pageAvailability: 'AVAILABLE',
      pageShowsSelection: false,
    })).toMatchObject({ ready: false, code: 'VARIANT_REQUIRED', missingAttributes: ['Taille'] });

    /* Taille L épuisée ⇒ VARIANT_UNAVAILABLE */
    expect(localAddReadiness({
      groups,
      variants,
      selection: { couleur: 'Noir', taille: 'L' },
      pageInStockText: true,
      valueStates,
      pageAvailability: 'AVAILABLE',
      pageShowsSelection: false,
    })).toMatchObject({ ready: false, code: 'VARIANT_UNAVAILABLE', availability: 'OUT_OF_STOCK' });

    /* Noir + M (stock=3) ⇒ prêt avec LOW_STOCK */
    expect(localAddReadiness({
      groups,
      variants,
      selection: { couleur: 'Noir', taille: 'M' },
      pageInStockText: true,
      valueStates,
      pageAvailability: 'AVAILABLE',
      pageShowsSelection: false,
    })).toMatchObject({ ready: true, code: '', availability: 'LOW_STOCK' });
  });
});
