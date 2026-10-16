/**
 * Feuille de résultats de Z Lens — crans et propriété du geste (logique pure).
 * Demande du client (16/10/2026) : fluide ; levée = plein écran ; au repos,
 * basse pour que la photo se voie.
 */
import { describe, expect, it } from 'vitest';

import {
  LENS_SHEET_FLICK, LENS_SHEET_REST_RATIO, clampLensSheet, lensSheetGeometry, lensSheetOwnsPan,
  snapLensSheet, toggleLensSheet,
} from '../src/features/lens/lensSheet';

const PHONE = { screenHeight: 800, topInset: 24, bottomInset: 16 };

describe('lensSheetGeometry — trois crans avec une photo', () => {
  const withPhoto = lensSheetGeometry({ ...PHONE, withPhoto: true, busy: false });

  it('levée : plein écran, juste sous la barre d’état', () => {
    expect(withPhoto.expandedTop).toBe(24);
    expect(withPhoto.stops[0]).toBe(0);
  });

  it('au repos : basse, à 69 % de l’écran — la photo se voit au-dessus', () => {
    expect(LENS_SHEET_REST_RATIO).toBe(0.69);
    expect(withPhoto.restTop).toBe(552);
    expect(withPhoto.rest).toBe(552 - 24);
    expect(withPhoto.stops).toContain(withPhoto.rest);
  });

  it('baissée : seul le titre dépasse (cran d’aperçu sous le repos)', () => {
    expect(withPhoto.stops).toHaveLength(3);
    const peek = withPhoto.stops[2];
    expect(peek).toBeGreaterThan(withPhoto.rest);
    // haut de la feuille au cran le plus bas : 800 − 16 − 112 = 672
    expect(peek + withPhoto.expandedTop).toBe(672);
  });

  it('sans photo : deux crans (plein écran, repos), comme avant', () => {
    const busy = lensSheetGeometry({ ...PHONE, withPhoto: false, busy: true });
    expect(busy.restTop).toBe(Math.round(Math.max(210, 800 * 0.34)));
    expect(busy.stops).toEqual([0, busy.rest]);
    const results = lensSheetGeometry({ ...PHONE, withPhoto: false, busy: false });
    expect(results.restTop).toBe(Math.round(Math.max(150, 800 * 0.24)));
  });
});

describe('snapLensSheet — un lancer passe au cran suivant, sinon le plus proche', () => {
  const stops = [0, 528, 648];

  it('lancer vers le haut depuis le repos ⇒ plein écran', () => {
    expect(snapLensSheet(520, -LENS_SHEET_FLICK - 0.1, stops)).toBe(0);
  });

  it('lancer vers le bas depuis le plein écran ⇒ repos (un seul cran, pas tout en bas)', () => {
    expect(snapLensSheet(40, LENS_SHEET_FLICK + 0.5, stops)).toBe(528);
  });

  it('lancer vers le bas depuis le repos ⇒ aperçu', () => {
    expect(snapLensSheet(536, 1.2, stops)).toBe(648);
  });

  it('lâcher lent ⇒ le cran le plus proche de la position projetée', () => {
    expect(snapLensSheet(200, 0, stops)).toBe(0);
    expect(snapLensSheet(400, 0, stops)).toBe(528);
    expect(snapLensSheet(600, 0.2, stops)).toBe(648);
  });

  it('bornes : jamais au-dessus du plein écran ni sous le dernier cran', () => {
    expect(clampLensSheet(-50, stops)).toBe(0);
    expect(clampLensSheet(900, stops)).toBe(648);
    expect(clampLensSheet(300, stops)).toBe(300);
  });
});

describe('lensSheetOwnsPan — saisie de n’importe où, la liste défile quand la feuille est pleine page', () => {
  it('feuille pas encore pleine page : tout glissement vertical la déplace, vers le haut ou le bas', () => {
    expect(lensSheetOwnsPan(528, 0, 0, -20)).toBe(true);
    expect(lensSheetOwnsPan(528, 0, 0, 20)).toBe(true);
  });

  it('pleine page : vers le haut, la liste défile', () => {
    expect(lensSheetOwnsPan(0, 0, 0, -20)).toBe(false);
  });

  it('pleine page : vers le bas, la feuille redescend seulement si la liste est tout en haut', () => {
    expect(lensSheetOwnsPan(0, 0, 0, 20)).toBe(true);
    expect(lensSheetOwnsPan(0, 120, 0, 20)).toBe(false);
  });

  it('un toucher ou un glissement horizontal ne vole jamais le geste', () => {
    expect(lensSheetOwnsPan(528, 0, 0, 3)).toBe(false);
    expect(lensSheetOwnsPan(528, 0, 40, 20)).toBe(false);
  });

  it('toucher la poignée : plein écran ⇄ repos', () => {
    expect(toggleLensSheet(0, 528)).toBe(528);
    expect(toggleLensSheet(528, 528)).toBe(0);
    expect(toggleLensSheet(648, 528)).toBe(0);
  });
});
