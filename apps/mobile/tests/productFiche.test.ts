/**
 * Grande fiche — règles et contrat (24/10/2026).
 *
 * Ce que ces tests protègent :
 *  • la mécanique de la planche : photo fixe de 430, feuille qui la recouvre de
 *    16, en-tête transparent qui bascule (seuil calculé, pas deviné) ;
 *  • la règle « une donnée absente disparaît » : attribut vide, description
 *    vide ou prix absent ⇒ la ligne / la section n'existe pas ;
 *  • la galerie : photos d'abord, puis la vidéo, sans doublon ;
 *  • la feuille de taille garde l'ordre du serveur et n'invente pas de tailles.
 *
 * Le rendu (React Native) n'est pas monté : la mécanique et les décisions sont
 * pures, donc lisibles ici — même méthode que `reelTray.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  FICHE,
  ficheSections,
  galleryItems,
  headerIsSolid,
  headerProgress,
  selectionReady,
  sheetOffset,
  sizeChoices,
  specRows,
} from '../src/features/product/fiche';

const src = (rel: string) => readFileSync(resolve(__dirname, '..', rel), 'utf8');

describe('fiche — mécanique de la planche', () => {
  it('photo 430 (décision du propriétaire), feuille qui la recouvre de 16', () => {
    expect(FICHE.imageHeight).toBe(430);
    expect(FICHE.overlap).toBe(16);
    expect(sheetOffset()).toBe(430 - 16);
  });

  it('l’en-tête bascule quand la feuille atteint son bas — pas avant', () => {
    const seuil = FICHE.imageHeight - FICHE.headerHeight - FICHE.overlap;
    expect(headerIsSolid(seuil - 1)).toBe(false);
    expect(headerIsSolid(seuil)).toBe(true);
    expect(headerIsSolid(seuil + 200)).toBe(true);
    // Le dégradé couvre les 40 px qui précèdent : aucun saut d'un pixel à l'autre.
    expect(headerProgress(seuil - 40)).toBe(0);
    expect(headerProgress(seuil)).toBe(1);
    expect(headerProgress(seuil - 20)).toBeCloseTo(0.5, 5);
  });
});

describe('fiche — la donnée absente disparaît', () => {
  it('un attribut sans valeur ne produit aucune ligne', () => {
    const rows = specRows([
      { key: 'material', label: 'Matière', type: 'TEXT', value: 'Coton' },
      { key: 'care', label: 'Entretien', type: 'TEXT', value: '   ' },
      { key: 'origin', label: 'Origine', type: 'TEXT', value: '' },
      { key: 'washing', label: 'Lavage', type: 'TEXT', value: '30°' },
    ]);
    expect(rows.map((row) => row.key)).toEqual(['material', 'washing']);
  });

  it('deux attributs qui partagent un libellé restent deux faits distincts', () => {
    const rows = specRows([
      { key: 'a', label: 'Taille', type: 'TEXT', value: 'M' },
      { key: 'b', label: 'Taille', type: 'TEXT', value: 'L' },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.value)).toEqual(['M', 'L']);
  });

  it('les sections vides n’existent pas', () => {
    expect(ficheSections({ attributes: [], description: '  ', hasPrice: false }))
      .toEqual({ specs: false, description: false, priceDetail: false });
    expect(ficheSections({ attributes: [{ key: 'a', label: 'A', type: 'TEXT', value: '1' }], description: 'x', hasPrice: true }))
      .toEqual({ specs: true, description: true, priceDetail: true });
  });
});

describe('fiche — galerie (« photos puis vidéo »)', () => {
  it('photos d’abord, vidéo ensuite, sans doublon ni vide', () => {
    expect(galleryItems(['a.jpg', '', 'a.jpg', 'b.jpg'], ['v.mp4'])).toEqual([
      { kind: 'image', url: 'a.jpg' },
      { kind: 'image', url: 'b.jpg' },
      { kind: 'video', url: 'v.mp4' },
    ]);
  });

  it('sans vidéo, la galerie reste une galerie', () => {
    expect(galleryItems(['a.jpg'])).toEqual([{ kind: 'image', url: 'a.jpg' }]);
    expect(galleryItems([], [])).toEqual([]);
  });
});

describe('fiche — feuille de taille', () => {
  const dimensions = [{ key: 'size', values: [{ value: 'S', available: true, stock: 3 }, { value: 'M', available: false, stock: 0 }] }];

  it('garde l’ordre du serveur et garde les tailles épuisées visibles', () => {
    expect(sizeChoices(dimensions).map((choice) => choice.value)).toEqual(['S', 'M']);
    expect(sizeChoices(dimensions)[1].available).toBe(false);
  });

  it('aucune dimension déclarée ⇒ aucune taille inventée', () => {
    expect(sizeChoices(null)).toEqual([]);
    expect(sizeChoices([])).toEqual([]);
    expect(sizeChoices([{ key: 'color', values: [{ value: 'Noir', available: true, stock: 1 }] }])).toEqual([]);
  });

  it('le CTA n’est armé que si le choix est complet', () => {
    expect(selectionReady(true, false, '', '')).toBe(false);
    expect(selectionReady(true, false, 'M', '')).toBe(true);
    expect(selectionReady(false, true, '', 'Noir')).toBe(true);
    expect(selectionReady(false, true, '', '')).toBe(false);
  });
});

describe('fiche — contrat d’écran', () => {
  it('l’écran monte les pièces de la planche, pas des cartes empilées', () => {
    const screen = src('app/product/[id].tsx');
    for (const piece of ['FicheHeader', 'FicheMedia', 'GalleryViewer', 'SizeSheet', 'BuyBar', 'Accordion']) {
      expect(screen, piece).toContain(piece);
    }
    expect(screen).toContain('sheetOffset()');
    expect(screen).toContain('Animated.ScrollView');
  });

  it('le CTA est NOIR (décision 24/10) et la fiche ne calcule aucun prix', () => {
    const parts = src('src/features/product/ProductFiche.tsx');
    expect(parts).toMatch(/tone="solid"/);
    expect(parts).not.toMatch(/tone="main"/);
    const screen = src('app/product/[id].tsx');
    // Le total est celui du serveur, jamais une somme locale.
    expect(screen).toContain('product.finalPrice.toFixed(2)');
    expect(screen).not.toMatch(/finalPrice\s*\+|customsFee\s*\+/);
  });

  it('la vidéo vient du serveur et la galerie lit bien les deux listes', () => {
    const screen = src('app/product/[id].tsx');
    expect(screen).toContain('sheet?.videos');
    expect(screen).toContain('galleryItems(images');
  });
});
