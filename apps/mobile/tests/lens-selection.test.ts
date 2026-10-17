import { describe, expect, it } from 'vitest';

import type { LensDetectedProduct } from '../src/api/lens';
import {
  FULL_BOX, MIN_SELECTION, biggestProductIndex, boxToRect, clampRectToArea, containRect, cornerAt, coverRect,
  isFullFrame, keepSelection, moveSelection, padBox, pointInImage, productIndexAt, resizeSelection, selectionKey,
  toRoi, zoneAround,
} from '../src/features/lens/lensSelection';
import {
  LIVE_MIN_INTERVAL_MS, LIVE_SESSION_BUDGET, MOTION_MOVE_THRESHOLD, initialMotion, isSteady, nextMotion, shouldDetect,
} from '../src/features/lens/lensLive';

const product = (name: string, x: number, y: number, w: number, h: number): LensDetectedProduct => ({
  name, category: 'clothing', box: { x, y, w, h },
});

// La tenue de l'aperçu : sweat (le plus grand), jogging, baskets (posées sur le jogging).
const OUTFIT = [
  product('Sweat à capuche jaune', 0.12, 0.17, 0.74, 0.29),
  product('Jogging jaune', 0.34, 0.43, 0.4, 0.3),
  product('Baskets blanches', 0.33, 0.62, 0.4, 0.21),
];

describe('Z Lens — le cadre choisit le produit', () => {
  it('un seul produit → lui ; plusieurs → le plus grand ; aucun → -1', () => {
    expect(biggestProductIndex([OUTFIT[1]])).toBe(0);
    expect(biggestProductIndex(OUTFIT)).toBe(0);
    expect(biggestProductIndex([OUTFIT[2], OUTFIT[1]])).toBe(1);
    expect(biggestProductIndex([])).toBe(-1);
  });

  it('toucher un produit voisin le sélectionne ; deux boîtes superposées → la plus petite', () => {
    expect(productIndexAt(OUTFIT, { x: 0.62, y: 0.5 })).toBe(1);
    // Point commun au jogging et aux baskets : les baskets (plus petites) restent atteignables.
    expect(productIndexAt(OUTFIT, { x: 0.4, y: 0.66 })).toBe(2);
    expect(productIndexAt(OUTFIT, { x: 0.02, y: 0.95 })).toBe(-1);
  });

  it('toucher hors produit : zone carrée de 30 % autour du doigt, toujours dans l’image', () => {
    expect(zoneAround({ x: 0.5, y: 0.5 })).toEqual({ x: 0.35, y: 0.35, w: 0.3, h: 0.3 });
    expect(zoneAround({ x: 0.02, y: 0.98 })).toEqual({ x: 0, y: 0.7, w: 0.3, h: 0.3 });
  });

  it('le cadre posé sur un produit garde sa forme (rectangle ou carré) avec un léger débord', () => {
    const padded = padBox(OUTFIT[0].box);
    expect(padded.x).toBeCloseTo(0.105);
    expect(padded.w).toBeCloseTo(0.77);
    expect(padBox({ x: 0, y: 0, w: 1, h: 1 })).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('les coins agrandissent le cadre, le coin opposé reste fixe, jamais sous la taille minimale', () => {
    const box = { x: 0.2, y: 0.2, w: 0.4, h: 0.4 };
    expect(resizeSelection(box, 'se', 0.1, 0.05)).toEqual({ x: 0.2, y: 0.2, w: 0.5, h: 0.45 });
    const nw = resizeSelection(box, 'nw', -0.1, -0.3);
    expect(nw.x).toBeCloseTo(0.1);
    expect(nw.y).toBe(0);
    expect(nw.x + nw.w).toBeCloseTo(0.6);
    const tiny = resizeSelection(box, 'ne', -0.9, 0.9);
    expect(tiny.w).toBe(MIN_SELECTION);
    expect(tiny.y + tiny.h).toBeCloseTo(0.6);
  });

  it('le cadre se déplace sans sortir de l’image', () => {
    expect(moveSelection({ x: 0.5, y: 0.5, w: 0.4, h: 0.4 }, 0.5, -0.9)).toEqual({ x: 0.6, y: 0, w: 0.4, h: 0.4 });
  });

  it('roi en pourcentages pour /analyze-image ; image entière → aucune roi ; clé de cache stable', () => {
    expect(toRoi({ x: 0.123, y: 0.456, w: 0.3, h: 0.25 })).toEqual({ x: 12.3, y: 45.6, w: 30, h: 25 });
    expect(toRoi(FULL_BOX)).toBeUndefined();
    expect(isFullFrame({ x: 0.02, y: 0.01, w: 0.96, h: 0.97 })).toBe(true);
    expect(selectionKey('p1', FULL_BOX)).toBe('p1|full');
    expect(selectionKey('p1', { x: 0.1, y: 0.2, w: 0.3, h: 0.4 })).toBe(selectionKey('p1', { x: 0.1001, y: 0.2, w: 0.3, h: 0.4 }));
  });

  it('géométrie écran : contain pour la photo, cover pour l’aperçu caméra, coins pris au pouce', () => {
    expect(containRect(390, 400, 1000, 500)).toEqual({ x: 0, y: 102.5, w: 390, h: 195 });
    const cover = coverRect(390, 844, 480, 640);
    expect(cover.h).toBeCloseTo(844);
    expect(cover.x).toBeLessThan(0);
    const image = { x: 10, y: 20, w: 200, h: 100 };
    expect(boxToRect({ x: 0.5, y: 0.5, w: 0.25, h: 0.5 }, image)).toEqual({ x: 110, y: 70, w: 50, h: 50 });
    expect(pointInImage(110, 70, image)).toEqual({ x: 0.5, y: 0.5 });
    const frame = { x: 100, y: 100, w: 120, h: 80 };
    expect(cornerAt(frame, 104, 96)).toBe('nw');
    expect(cornerAt(frame, 222, 183)).toBe('se');
    expect(cornerAt(frame, 160, 140)).toBeNull();
  });

  it('Live : le produit choisi reste choisi d’un repérage à l’autre, sinon retour au plus grand', () => {
    const moved = OUTFIT.map((item) => ({ ...item, box: { ...item.box, x: item.box.x + 0.02 } }));
    expect(keepSelection(OUTFIT[2], moved)).toBe(2);
    expect(keepSelection(null, moved)).toBe(0);
    expect(keepSelection(product('Sac', 0.8, 0.8, 0.1, 0.1), moved)).toBe(0);
  });

  it('Live : le cadre reste dans la bande visible (sous l’en-tête, au-dessus du panneau)', () => {
    const rect = clampRectToArea({ x: -20, y: 10, w: 200, h: 900 }, { left: 8, top: 90, right: 382, bottom: 600 });
    expect(rect).toEqual({ x: 8, y: 90, w: 172, h: 510 });
  });
});

describe('Z Lens Live — quand interroger la caméra', () => {
  const base = { now: 100_000, lastDetectAt: 0, detections: 0, failures: 0, sensor: true, steady: true, movedSinceDetect: false, hasResult: false };

  it('repère dès que le téléphone est stable, puis seulement après un nouveau mouvement', () => {
    expect(shouldDetect(base)).toBe(true);
    expect(shouldDetect({ ...base, steady: false })).toBe(false);
    expect(shouldDetect({ ...base, hasResult: true })).toBe(false);
    expect(shouldDetect({ ...base, hasResult: true, movedSinceDetect: true })).toBe(true);
  });

  it('respecte un délai minimal, s’espace après des échecs et s’arrête au plafond de la séance', () => {
    expect(shouldDetect({ ...base, lastDetectAt: base.now - LIVE_MIN_INTERVAL_MS + 100 })).toBe(false);
    expect(shouldDetect({ ...base, lastDetectAt: base.now - LIVE_MIN_INTERVAL_MS - 1 })).toBe(true);
    expect(shouldDetect({ ...base, failures: 3, lastDetectAt: base.now - 10_000 })).toBe(false);
    expect(shouldDetect({ ...base, failures: 3, lastDetectAt: base.now - 31_000 })).toBe(true);
    expect(shouldDetect({ ...base, detections: LIVE_SESSION_BUDGET })).toBe(false);
  });

  it('sans capteur : rythme lent et borné', () => {
    expect(shouldDetect({ ...base, sensor: false, steady: false })).toBe(true);
    expect(shouldDetect({ ...base, sensor: false, hasResult: true, lastDetectAt: base.now - 5_000 })).toBe(false);
    expect(shouldDetect({ ...base, sensor: false, hasResult: true, lastDetectAt: base.now - 25_000 })).toBe(true);
  });

  it('l’accéléromètre distingue un geste franc d’un téléphone tenu immobile', () => {
    let state = initialMotion(0);
    state = nextMotion(state, { x: 0, y: 0, z: 1 }, 0);
    for (let t = 100; t <= 800; t += 100) state = nextMotion(state, { x: 0.004, y: 0, z: 1 }, t);
    expect(isSteady(state, 800)).toBe(true);
    state = nextMotion(state, { x: 0.4, y: 0.2, z: 0.8 }, 900);
    expect(state.level).toBeGreaterThan(MOTION_MOVE_THRESHOLD);
    expect(state.steadySince).toBeNull();
    expect(state.movedAt).toBe(900);
    expect(isSteady(state, 950)).toBe(false);
  });
});
