import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { variantPageUrlFor } from '@/features/aywebs/variantPage';
import { captureMatchesPageUrl, isFatalMainPageLoadError } from '@/features/aywebs/webNavigation';
import {
  defaultSelectionFromCapture,
  displayPriceForSelection,
  selectionHasPublishedPrice,
} from '@/features/aywebs/localProduct';

describe('AYWEBs Mobile Web — Navigation de variantes, feuille locale m.shein.com & invalidation tactile', () => {
  it('préserve le préfixe de locale sur m.shein.com (/fr/, /us/) tout en conservant /-p-<id>.html à la racine sur fr.shein.com', () => {
    expect(variantPageUrlFor({
      sourceUrl: 'https://m.shein.com/fr/Ensemble-jupe-jean-p-41204567.html',
      storeId: 'shein',
      selection: { Couleur: 'Jean Bleu · 6543', Taille: '4Y (98-104 cm)' },
      options: [
        {
          sourceVariantId: 'shein:41206543',
          attributes: { Couleur: 'Jean Bleu · 6543' },
        },
      ],
    })).toBe('https://m.shein.com/fr/-p-41206543.html');

    expect(variantPageUrlFor({
      sourceUrl: 'https://fr.shein.com/Ensemble-jupe-jean-p-41204567.html',
      storeId: 'shein',
      selection: { Couleur: 'Jean Bleu · 6543' },
      options: [
        {
          sourceVariantId: 'shein:41206543',
          attributes: { Couleur: 'Jean Bleu · 6543' },
        },
      ],
    })).toBe('https://fr.shein.com/-p-41206543.html');
  });

  it('reconnaît les URL mobiles Amazon (/gp/aw/d/<ASIN>, /gp/product/<ASIN>, /d/<slug>/<ASIN>) sans recharger l’ASIN déjà affiché', () => {
    const options = [
      { sourceVariantId: 'B09V3KXJPB', attributes: { color: 'Noir' } },
      { sourceVariantId: 'B09V3KXJPC', attributes: { color: 'Blanc' } },
    ];

    /* Même ASIN sur /gp/aw/d/ ⇒ aucune navigation inutile */
    expect(variantPageUrlFor({
      sourceUrl: 'https://m.amazon.fr/gp/aw/d/B09V3KXJPB?psc=1',
      storeId: 'amazon',
      selection: { color: 'Noir' },
      options,
    })).toBeNull();

    /* Même ASIN sur /d/<slug>/<ASIN> ⇒ aucune navigation inutile */
    expect(variantPageUrlFor({
      sourceUrl: 'https://m.amazon.com/d/Echo-Dot/B09V3KXJPB',
      storeId: 'amazon',
      selection: { color: 'Noir' },
      options,
    })).toBeNull();

    /* Autre ASIN sur m.amazon.fr ⇒ conserve l’hôte mobile m.amazon.fr */
    expect(variantPageUrlFor({
      sourceUrl: 'https://m.amazon.fr/gp/aw/d/B09V3KXJPB?psc=1',
      storeId: 'amazon',
      selection: { color: 'Blanc' },
      options,
    })).toBe('https://m.amazon.fr/dp/B09V3KXJPC');
  });

  it('feuille locale m.shein.com : sélection initiale active (4Y) tarifée, mais aucune extrapolation du prix $28.60 sur une autre taille non prouvée (6Y)', () => {
    const capture = {
      url: 'https://m.shein.com/fr/2pcs-Ensemble-jupe-en-jean-fille-p-41204567.html',
      title: 'Ensemble 2 pièces veste et jupe en jean pour petite fille',
      priceCandidates: [
        { text: '$28.60', source: 'dom' },
        { text: '$28.60 USD', source: 'a11y_label' },
      ],
      shein: {
        readerVersion: 2,
        pageGoodsId: '41204567',
        selectedColor: 'Jean Bleu · 4567',
        selectedSize: '4Y (98-104 cm)',
        skuId: null,
      },
      variantGroups: [
        {
          name: 'Couleur',
          values: ['Jean Bleu · 4567', 'Jean Bleu · 6543', 'Noir', 'Jean Clair'],
          selected: ['Jean Bleu · 4567'],
          options: [
            { value: 'Jean Bleu · 4567', available: true, price: null, priceFrom: false, stock: null, goodsId: '41204567' },
            { value: 'Jean Bleu · 6543', available: null, price: null, priceFrom: false, stock: null, goodsId: '41206543' },
            { value: 'Noir', available: null, price: null, priceFrom: false, stock: null, goodsId: '41207890' },
            { value: 'Jean Clair', available: null, price: null, priceFrom: false, stock: null, goodsId: '41208901' },
          ],
        },
        {
          name: 'Taille',
          values: ['3Y', '4Y (98-104 cm)', '5Y', '6Y', '7Y'],
          selected: ['4Y (98-104 cm)'],
          options: [
            { value: '3Y', available: true, price: null, priceFrom: false, stock: null },
            { value: '4Y (98-104 cm)', available: true, price: '$28.60', priceFrom: false, stock: null },
            { value: '5Y', available: true, price: null, priceFrom: false, stock: null },
            { value: '6Y', available: true, price: null, priceFrom: false, stock: null },
            { value: '7Y', available: true, price: null, priceFrom: false, stock: null },
          ],
        },
      ],
      variantMatrix: [
        {
          variantId: 'shein:41204567:4Y (98-104 cm)',
          variantUrl: 'https://m.shein.com/fr/-p-41204567.html',
          attributes: { Couleur: 'Jean Bleu · 4567', Taille: '4Y (98-104 cm)' },
          price: '$28.60',
          priceFrom: false,
          available: true,
          stock: null,
        },
        {
          variantId: 'shein:41204567:6Y',
          variantUrl: 'https://m.shein.com/fr/-p-41204567.html',
          attributes: { Couleur: 'Jean Bleu · 4567', Taille: '6Y' },
          price: null,
          priceFrom: false,
          available: true,
          stock: null,
        },
      ],
    };

    const groups = [
      { attribute: 'Couleur', values: ['Jean Bleu · 4567', 'Jean Bleu · 6543', 'Noir', 'Jean Clair'] },
      { attribute: 'Taille', values: ['3Y', '4Y (98-104 cm)', '5Y', '6Y', '7Y'] },
    ];

    const initial = defaultSelectionFromCapture(capture, groups);
    expect(initial).toEqual({
      couleur: 'Jean Bleu · 4567',
      taille: '4Y (98-104 cm)',
    });

    expect(displayPriceForSelection(capture, initial)).toEqual({ text: '$28.60', priceFrom: false });
    expect(selectionHasPublishedPrice(capture, initial)).toBe(true);

    /* Changement vers 6Y (prix non prouvé dans le DOM) ⇒ pas d'affichage du vieux prix $28.60 ! */
    const switchedTo6Y = { couleur: 'Jean Bleu · 4567', taille: '6Y' };
    expect(displayPriceForSelection(capture, switchedTo6Y)).toBeNull();
    expect(selectionHasPublishedPrice(capture, switchedTo6Y)).toBe(false);
  });

  it('webNavigation & browser.tsx : identité documentaire mobile SHEIN et invalidation du prefetch même en cours de lecture (`status === "reading"`)', () => {
    expect(captureMatchesPageUrl(
      'https://m.shein.com/fr/Jupe-p-41204567.html?_bg_fs=1&refer_page_id=1001',
      'https://fr.shein.com/Jupe-p-41204567.html',
    )).toBe(true);

    expect(isFatalMainPageLoadError(
      { url: 'https://m2.hm.com/fr_fr/productpage.1234567001.html', code: -2, description: 'ERR_NAME_NOT_RESOLVED', isForMainFrame: true },
      'https://www2.hm.com/fr_fr/productpage.1234567001.html',
    )).toBe(true);

    const browserSource = readFileSync(join(__dirname, '..', 'app', 'aywebs', 'browser.tsx'), 'utf8');
    expect(browserSource).toContain("activePrefetch.status === 'reading'");
    expect(browserSource).toContain('activePrefetch.controller.abort()');
    expect(browserSource).toContain('onTouchStart={invalidatePrefetchOnTouch}');
    expect(browserSource).toContain('onTouchEnd={invalidatePrefetchOnTouch}');
  });
});
