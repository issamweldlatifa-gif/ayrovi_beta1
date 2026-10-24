/**
 * GRANDE FICHE — le contrat d'une seule réponse (lot 24/10/2026).
 *
 * La maquette `docs/design/bigcard/index.html` exige, dans le même chargement :
 * la galerie, les choix possibles, la disponibilité de chaque choix et l'état du
 * stock. Ces tests figent ce que le serveur a le droit d'affirmer — et surtout ce
 * qu'il n'a pas le droit d'inventer :
 *
 *  • une variante sans ligne de stock n'a pas `0` en stock : elle a `null` ;
 *  • une variante inactive RESTE dans la réponse (grisée), elle ne disparaît pas ;
 *  • un produit sans variante n'ouvre aucun sélecteur (`dimensions: []`) ;
 *  • `purchasable` est faux dès qu'il manque le prix, le statut ou le stock.
 */
import { describe, expect, test } from 'vitest';
import {
  LOW_STOCK_THRESHOLD,
  MAX_SHEET_IMAGES,
  buildGallery,
  buildProductSheet,
  publishedStockStatus,
  readImageList,
  selectionAvailable,
  type SheetProductInput,
  type SheetStockInput,
  type SheetVariantInput,
} from '../src/services/productSheet';

const product = (over: Partial<SheetProductInput> = {}): SheetProductInput => ({
  id: 'p1',
  image: '/media/main.jpg',
  additionalImages: JSON.stringify(['/media/b.jpg', '/media/c.jpg']),
  status: 'ACTIVE',
  final_price: 149,
  stock_status: 'AVAILABLE',
  ...over,
});

const variant = (over: Partial<SheetVariantInput> = {}): SheetVariantInput => ({
  id: 'v1', sku: 'SKU-1', size: 'M', color: 'Noir', status: 'ACTIVE', sort_order: 10, ...over,
});

const stock = (over: Partial<SheetStockInput> = {}): SheetStockInput => ({ variant_id: 'v1', quantity: 5, reorder_point: 0, ...over });

describe('galerie — une seule liste, sans doublon', () => {
  test('l’image principale passe devant, puis les secondaires dans l’ordre', () => {
    expect(buildGallery(product())).toEqual(['/media/main.jpg', '/media/b.jpg', '/media/c.jpg']);
  });

  test('les doublons, les vides et les blancs sortent', () => {
    const gallery = buildGallery(product({ image: '/media/main.jpg ', additionalImages: ['/media/main.jpg', '', '   ', '/media/d.jpg'] }));
    expect(gallery).toEqual(['/media/main.jpg', '/media/d.jpg']);
  });

  test('un JSON abîmé ne casse pas la fiche : on garde l’image principale', () => {
    expect(buildGallery(product({ additionalImages: '{pas du json' }))).toEqual(['/media/main.jpg']);
    expect(readImageList('{"a":1}')).toEqual([]);
  });

  test('l’ancien format « une URL par ligne » reste lisible', () => {
    expect(readImageList('/a.jpg\n/b.jpg')).toEqual(['/a.jpg', '/b.jpg']);
  });

  test('la galerie est bornée', () => {
    const many = Array.from({ length: 30 }, (_, index) => `/media/${index}.jpg`);
    expect(buildGallery(product({ additionalImages: many }))).toHaveLength(MAX_SHEET_IMAGES);
  });
});

describe('stock publié → état lisible', () => {
  test('les trois valeurs de la base et les inconnues', () => {
    expect(publishedStockStatus('AVAILABLE')).toBe('IN_STOCK');
    expect(publishedStockStatus('limited')).toBe('LOW');
    expect(publishedStockStatus('OUT_OF_STOCK')).toBe('OUT_OF_STOCK');
    expect(publishedStockStatus('')).toBe('UNKNOWN');
    expect(publishedStockStatus(null)).toBe('UNKNOWN');
  });
});

describe('variantes — ce qui est commandable, et pourquoi le reste ne l’est pas', () => {
  test('une variante inactive reste présente, grisée, avec sa raison', () => {
    const sheet = buildProductSheet(product(), [variant({ status: 'INACTIVE' })], [stock()]);
    expect(sheet.variants).toHaveLength(1);
    expect(sheet.variants[0]).toMatchObject({ id: 'v1', available: false, reason: 'INACTIVE', stock: 5 });
  });

  test('sans ligne de stock, le stock est INCONNU (null), pas zéro', () => {
    const sheet = buildProductSheet(product(), [variant()], []);
    expect(sheet.variants[0].stock).toBeNull();
    expect(sheet.variants[0].available).toBe(true); // la fiche publiée dit AVAILABLE
  });

  test('une quantité nulle rend la variante épuisée, avec sa raison', () => {
    const sheet = buildProductSheet(product(), [variant()], [stock({ quantity: 0 })]);
    expect(sheet.variants[0]).toMatchObject({ available: false, reason: 'OUT_OF_STOCK', stock: 0 });
  });

  test('un produit épuisé éteint TOUTES ses variantes, même celles qui ont du stock', () => {
    const sheet = buildProductSheet(product({ stock_status: 'OUT_OF_STOCK' }), [variant(), variant({ id: 'v2', size: 'L' })], [stock(), stock({ variant_id: 'v2', quantity: 4 })]);
    expect(sheet.variants.every((entry) => entry.available === false)).toBe(true);
    expect(sheet.purchasable).toBe(false);
  });

  test('l’ordre est celui du catalogue (sort_order)', () => {
    const sheet = buildProductSheet(product(), [variant({ id: 'v2', size: 'L', sort_order: 20 }), variant({ id: 'v1', sort_order: 10 })], []);
    expect(sheet.variants.map((entry) => entry.id)).toEqual(['v1', 'v2']);
  });

  test('les quantités de deux emplacements s’additionnent', () => {
    const sheet = buildProductSheet(product(), [variant()], [stock({ quantity: 2 }), stock({ quantity: 3 })]);
    expect(sheet.variants[0].stock).toBe(5);
    expect(sheet.stock).toMatchObject({ tracked: true, quantity: 5 });
  });
});

describe('dimensions — un groupe par valeur réellement déclarée', () => {
  test('taille et couleur, avec la disponibilité agrégée', () => {
    const sheet = buildProductSheet(product(), [
      variant({ id: 'v1', size: 'M', color: 'Noir' }),
      variant({ id: 'v2', size: 'L', color: 'Noir' }),
      variant({ id: 'v3', size: 'XL', color: 'Beige', status: 'INACTIVE' }),
    ], [stock({ quantity: 2 }), stock({ variant_id: 'v2', quantity: 0 }), stock({ variant_id: 'v3', quantity: 4 })]);

    const size = sheet.dimensions.find((entry) => entry.key === 'size')!;
    expect(size.values.map((entry) => entry.value)).toEqual(['M', 'L', 'XL']);
    expect(size.values.map((entry) => entry.available)).toEqual([true, false, false]);
    expect(size.values[0].stock).toBe(2);
    expect(size.values[1].stock).toBe(0);

    const color = sheet.dimensions.find((entry) => entry.key === 'color')!;
    expect(color.values.map((entry) => [entry.value, entry.available])).toEqual([['Noir', true], ['Beige', false]]);
  });

  test('un stock inconnu sur une valeur reste inconnu (jamais une somme partielle)', () => {
    const sheet = buildProductSheet(product(), [
      variant({ id: 'v1', size: 'M' }),
      variant({ id: 'v2', size: 'M' }),
    ], [stock({ quantity: 3 })]);
    const size = sheet.dimensions.find((entry) => entry.key === 'size')!;
    expect(size.values[0]).toMatchObject({ value: 'M', stock: null, available: true });
  });

  test('sans variante, aucun sélecteur et aucun choix valide', () => {
    const sheet = buildProductSheet(product(), [], []);
    expect(sheet.dimensions).toEqual([]);
    expect(sheet.variants).toEqual([]);
    expect(selectionAvailable(sheet, { size: 'M' })).toBeNull();
  });
});

describe('purchasable — le droit d’afficher un bouton d’achat', () => {
  test('un produit vendable', () => {
    expect(buildProductSheet(product(), [], []).purchasable).toBe(true);
  });

  test('sans prix publié, inactif ou épuisé : aucun bouton', () => {
    expect(buildProductSheet(product({ final_price: 0 }), [], []).purchasable).toBe(false);
    expect(buildProductSheet(product({ status: 'INACTIVE' }), [], []).purchasable).toBe(false);
    expect(buildProductSheet(product({ stock_status: 'OUT_OF_STOCK' }), [], []).purchasable).toBe(false);
  });

  test('un stock à zéro sur toutes les lignes éteint le bouton', () => {
    expect(buildProductSheet(product(), [variant()], [stock({ quantity: 0 })]).purchasable).toBe(false);
  });
});

describe('état du stock du produit', () => {
  test('aucune ligne : rien n’est affirmé', () => {
    const sheet = buildProductSheet(product(), [], []);
    expect(sheet.stock).toEqual({ tracked: false, quantity: null, status: 'IN_STOCK' });
  });

  test('sous le seuil, ou sous le point de réapprovisionnement : « bas »', () => {
    expect(buildProductSheet(product(), [], [stock({ quantity: LOW_STOCK_THRESHOLD, reorder_point: 0 })]).stock.status).toBe('LOW');
    expect(buildProductSheet(product(), [], [stock({ quantity: 8, reorder_point: 10 })]).stock.status).toBe('LOW');
    expect(buildProductSheet(product(), [], [stock({ quantity: 9, reorder_point: 2 })]).stock.status).toBe('IN_STOCK');
  });

  test('la fiche publiée reste la vérité quand elle dit « épuisé »', () => {
    expect(buildProductSheet(product({ stock_status: 'OUT_OF_STOCK' }), [], [stock({ quantity: 7 })]).stock.status).toBe('OUT_OF_STOCK');
  });
});

describe('choix du client', () => {
  const sheet = buildProductSheet(product(), [
    variant({ id: 'v1', size: 'M', color: 'Noir' }),
    variant({ id: 'v2', size: 'L', color: 'Noir' }),
  ], [stock({ quantity: 3 }), stock({ variant_id: 'v2', quantity: 0 })]);

  test('une combinaison disponible renvoie la variante', () => {
    expect(selectionAvailable(sheet, { size: 'M', color: 'Noir' })?.id).toBe('v1');
  });

  test('une combinaison épuisée ou inexistante est refusée', () => {
    expect(selectionAvailable(sheet, { size: 'L', color: 'Noir' })).toBeNull();
    expect(selectionAvailable(sheet, { size: 'XXL' })).toBeNull();
  });
});
