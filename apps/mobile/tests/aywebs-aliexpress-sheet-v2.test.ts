/**
 * AYWEBs Mobile — AliExpress v2 : matrice SKU multi-axes dans la feuille locale,
 * devis TND instantané par combinaison (`selectionQuote`), limite de stock et `?sku_id=` (28/10/2026).
 */
import { describe, expect, it } from 'vitest';

import {
  defaultSelectionFromCapture,
  displayPriceForSelection,
  groupsFromCapture,
  localAddReadiness,
  localVariantsFromCapture,
  optionsFromVariants,
  productFromCapture,
  selectionHasPublishedPrice,
  selectionIsShown,
  valueStatesFromCapture,
} from '@/features/aywebs/localProduct';
import { quantityLimit, selectionQuote } from '@/features/aywebs/selectionQuote';
import { variantPageUrlFor } from '@/features/aywebs/variantPage';
import { imageForSelectedColor } from '@/features/aywebs/variantImage';
import { choiceGroupKind } from '@/features/aywebs/choiceGroup';

const AE_URL = 'https://fr.aliexpress.com/item/1005008811223344.html';

const AE_MULTI_AXIS_CAPTURE = {
  v: 1,
  url: AE_URL,
  title: 'Chargeur GaN 65W Rapide USB-C',
  brand: 'BASEUS',
  priceCandidates: [
    { text: '24,90 €', source: 'dom' },
    { text: '24.90 EUR', source: 'embedded_json' },
  ],
  currencyText: 'EUR',
  addToCartText: 'Ajouter au panier',
  availabilityText: '15 pieces available',
  images: ['https://ae01.alicdn.com/kf/Smain01charger.jpg'],
  selectedVariantTexts: ['Noir', 'EU Plug'],
  variantTexts: ['Noir', 'Rouge', 'EU Plug', 'US Plug'],
  aliexpress: {
    readerVersion: 2,
    pageItemId: '1005008811223344',
    selectedSkuId: '12000039001',
    skus: [
      {
        skuId: '12000039001',
        attributes: { Couleur: 'Noir', Prise: 'EU Plug' },
        price: '24.90 EUR',
        available: true,
        stock: 15,
        image: 'https://ae01.alicdn.com/kf/S111111black.jpg',
      },
      {
        skuId: '12000039002',
        attributes: { Couleur: 'Noir', Prise: 'US Plug' },
        price: '18.90 EUR',
        available: true,
        stock: 10,
        image: 'https://ae01.alicdn.com/kf/S111111black.jpg',
      },
      {
        skuId: '12000039003',
        attributes: { Couleur: 'Rouge', Prise: 'EU Plug' },
        price: '26.50 EUR',
        available: true,
        stock: 3,
        image: 'https://ae01.alicdn.com/kf/S222222red.jpg',
      },
      {
        skuId: '12000039004',
        attributes: { Couleur: 'Rouge', Prise: 'US Plug' },
        price: null,
        available: false,
        stock: null,
        image: 'https://ae01.alicdn.com/kf/S222222red.jpg',
      },
    ],
  },
  variantGroups: [
    {
      name: 'Couleur',
      values: ['Noir', 'Rouge'],
      selected: ['Noir'],
      options: [
        {
          value: 'Noir',
          available: true,
          price: '18.90 EUR',
          priceFrom: true,
          stock: null,
          image: 'https://ae01.alicdn.com/kf/S111111black.jpg',
        },
        {
          value: 'Rouge',
          available: null,
          price: '26.50 EUR',
          priceFrom: false,
          stock: null,
          image: 'https://ae01.alicdn.com/kf/S222222red.jpg',
        },
      ],
    },
    {
      name: 'Prise',
      values: ['EU Plug', 'US Plug'],
      selected: ['EU Plug'],
      options: [
        { value: 'EU Plug', available: true, price: '24.90 EUR', priceFrom: true, stock: null },
        { value: 'US Plug', available: null, price: '18.90 EUR', priceFrom: false, stock: null },
      ],
    },
  ],
};

describe('AYWEBs Mobile — AliExpress v2 AddToCartSheet & matrice SKU', () => {
  it('extrait AE-<itemId>, les groupes Couleur + Prise, la sélection active et les vignettes alicdn', () => {
    const product = productFromCapture(AE_MULTI_AXIS_CAPTURE, AE_URL, 'aliexpress', 'AliExpress');
    expect(product.productId).toBe('AE-1005008811223344');
    expect(product.brand).toBe('BASEUS');

    const variants = localVariantsFromCapture(AE_MULTI_AXIS_CAPTURE);
    expect(variants).toHaveLength(4);
    const groups = groupsFromCapture(AE_MULTI_AXIS_CAPTURE, variants);
    expect(groups).toEqual([
      { attribute: 'Couleur', values: ['Noir', 'Rouge'] },
      { attribute: 'Prise', values: ['EU Plug', 'US Plug'] },
    ]);
    expect(choiceGroupKind(groups[0].attribute)).toBe('color');
    expect(defaultSelectionFromCapture(AE_MULTI_AXIS_CAPTURE, groups)).toEqual({
      couleur: 'Noir',
      prise: 'EU Plug',
    });
    expect(selectionIsShown(AE_MULTI_AXIS_CAPTURE, { couleur: 'Noir', prise: 'EU Plug' })).toBe(true);
    expect(selectionIsShown(AE_MULTI_AXIS_CAPTURE, { couleur: 'Rouge', prise: 'EU Plug' })).toBe(false);

    const valueStates = valueStatesFromCapture(AE_MULTI_AXIS_CAPTURE);
    const fields = groups.map((g) => ({
      key: g.attribute.toLowerCase(),
      kind: choiceGroupKind(g.attribute),
      values: g.values.map((v) => ({
        value: v,
        image: valueStates[g.attribute.toLowerCase()]?.[v.toLowerCase()]?.image || undefined,
      })),
    }));
    expect(imageForSelectedColor(fields, { couleur: 'Noir', prise: 'EU Plug' })).toBe(
      'https://ae01.alicdn.com/kf/S111111black.jpg',
    );
    expect(imageForSelectedColor(fields, { couleur: 'Rouge', prise: 'EU Plug' })).toBe(
      'https://ae01.alicdn.com/kf/S222222red.jpg',
    );
  });

  it('prouve localement le prix et le stock exacts de chaque combinaison SKU (et bloque Rouge + US Plug épuisé)', () => {
    const variants = localVariantsFromCapture(AE_MULTI_AXIS_CAPTURE);
    const groups = groupsFromCapture(AE_MULTI_AXIS_CAPTURE, variants);
    const valueStates = valueStatesFromCapture(AE_MULTI_AXIS_CAPTURE);

    /* Même si Noir et EU Plug portent chacun priceFrom: true au niveau marginal, la combinaison a un prix ferme */
    expect(selectionHasPublishedPrice(AE_MULTI_AXIS_CAPTURE, { couleur: 'Noir', prise: 'EU Plug' })).toBe(true);
    expect(selectionHasPublishedPrice(AE_MULTI_AXIS_CAPTURE, { couleur: 'Rouge', prise: 'EU Plug' })).toBe(true);
    expect(selectionHasPublishedPrice(AE_MULTI_AXIS_CAPTURE, { couleur: 'Rouge', prise: 'US Plug' })).toBe(false);

    expect(displayPriceForSelection(AE_MULTI_AXIS_CAPTURE, { couleur: 'Rouge', prise: 'EU Plug' })).toEqual({
      text: '26.50 EUR',
      priceFrom: false,
    });

    const readyRedEu = localAddReadiness({
      groups,
      variants,
      selection: { couleur: 'Rouge', prise: 'EU Plug' },
      pageInStockText: true,
      valueStates,
      pageAvailability: 'AVAILABLE',
      pageShowsSelection: false,
    });
    expect(readyRedEu).toEqual({
      ready: true,
      code: '',
      missingAttributes: [],
      availability: 'LOW_STOCK',
    });

    /* Rouge + US Plug est indisponible dans la matrice cartésienne alors que ni Rouge ni US Plug n'est globalement épuisé */
    const blockedRedUs = localAddReadiness({
      groups,
      variants,
      selection: { couleur: 'Rouge', prise: 'US Plug' },
      pageInStockText: true,
      valueStates,
      pageAvailability: 'AVAILABLE',
      pageShowsSelection: false,
    });
    expect(blockedRedUs).toEqual({
      ready: false,
      code: 'VARIANT_UNAVAILABLE',
      missingAttributes: [],
      availability: 'OUT_OF_STOCK',
    });
  });

  it('selectionQuote chiffre instantanément en TND chaque combinaison AliExpress depuis variant_details sans attendre de relecture réseau', () => {
    const pageQuote = {
      selection: { couleur: 'Noir', prise: 'EU Plug' },
      unitTnd: 132.45,
      availability: 'AVAILABLE' as const,
      stock: 15,
      sourcePrice: 24.9,
      sourceCurrency: 'EUR',
    };
    const marginalQuotes = [
      { group: 'Couleur', value: 'Noir', availability: 'AVAILABLE' as const, stock: null, priceFrom: true, sourcePrice: 18.9, currency: 'EUR', totalTnd: null, pricingVersion: null },
      { group: 'Couleur', value: 'Rouge', availability: 'UNKNOWN' as const, stock: null, priceFrom: false, sourcePrice: 26.5, currency: 'EUR', totalTnd: 139.2, pricingVersion: 3 },
      { group: 'Prise', value: 'EU Plug', availability: 'AVAILABLE' as const, stock: null, priceFrom: true, sourcePrice: 24.9, currency: 'EUR', totalTnd: null, pricingVersion: null },
      { group: 'Prise', value: 'US Plug', availability: 'UNKNOWN' as const, stock: null, priceFrom: false, sourcePrice: 18.9, currency: 'EUR', totalTnd: 109.1, pricingVersion: 3 },
    ];
    const combinations = [
      { attributes: { Couleur: 'Noir', Prise: 'EU Plug' }, totalTnd: 132.45, quotedPrice: 24.9, quotedCurrency: 'EUR', availability: 'AVAILABLE', availabilityReason: 'sku_in_stock_capture:15' },
      { attributes: { Couleur: 'Noir', Prise: 'US Plug' }, totalTnd: 109.1, quotedPrice: 18.9, quotedCurrency: 'EUR', availability: 'AVAILABLE', availabilityReason: 'sku_in_stock_capture:10' },
      { attributes: { Couleur: 'Rouge', Prise: 'EU Plug' }, totalTnd: 139.2, quotedPrice: 26.5, quotedCurrency: 'EUR', availability: 'LOW_STOCK', availabilityReason: 'sku_low_stock_capture:3' },
      { attributes: { Couleur: 'Rouge', Prise: 'US Plug' }, totalTnd: null, quotedPrice: null, quotedCurrency: '', availability: 'OUT_OF_STOCK', availabilityReason: 'sku_out_of_stock_capture' },
    ];

    /* Bascule vers Rouge + EU Plug : devis TND exact 139.2, sourcePrice 26.5 EUR, LOW_STOCK et plafond quantité = 3 */
    const redEu = selectionQuote({
      page: pageQuote,
      quotes: marginalQuotes,
      combinations,
      selection: { couleur: 'Rouge', prise: 'EU Plug' },
    });
    expect(redEu).toEqual({
      unitTnd: 139.2,
      sourcePrice: 26.5,
      sourceCurrency: 'EUR',
      priceFrom: false,
      availability: 'LOW_STOCK',
      stock: 3,
      fromValue: false,
    });
    expect(quantityLimit({ stock: redEu.stock })).toBe(3);

    /* Bascule vers Rouge + US Plug : OUT_OF_STOCK et aucun prix TND trompeur */
    const redUs = selectionQuote({
      page: pageQuote,
      quotes: marginalQuotes,
      combinations,
      selection: { couleur: 'Rouge', prise: 'US Plug' },
    });
    expect(redUs.availability).toBe('OUT_OF_STOCK');
    expect(redUs.unitTnd).toBeNull();
    expect(redUs.sourcePrice).toBeNull();
  });

  it('construit l’URL ?sku_id=<id> sur le même sous-domaine régional quand une relecture WebView est requise', () => {
    const options = optionsFromVariants(localVariantsFromCapture(AE_MULTI_AXIS_CAPTURE));
    const url = variantPageUrlFor({
      sourceUrl: 'https://fr.aliexpress.com/item/1005008811223344.html?spm=a2g0o.detail',
      storeId: 'aliexpress',
      selection: { couleur: 'Rouge', prise: 'EU Plug' },
      options,
    });
    expect(url).toBe('https://fr.aliexpress.com/item/1005008811223344.html?sku_id=12000039003');
  });
});
