import { describe, expect, it } from 'vitest';

import { AUTO_BOX_MIN_CONFIDENCE, selectionFromBoxDetection } from '../src/features/lens/lensAutoDetect';
import { FULL_BOX } from '../src/features/lens/lensSelection';

describe('selectionFromBoxDetection — cadre auto vs cadre manuel', () => {
  it("un produit unique fiable présélectionne le produit et épouse sa boîte", () => {
    const box = { x: 0.2, y: 0.15, w: 0.55, h: 0.7 };
    const patch = selectionFromBoxDetection({ box, confidence: 0.9, reason: 'single_object' });
    expect(patch.auto).toBe(true);
    expect(patch.selected).toBe(0);
    expect(patch.selection).toEqual(box);
    expect(patch.products).toHaveLength(1);
    expect(patch.products[0].box).toEqual(box);
  });

  it("l'absence de boîte retombe sur le cadre manuel plein image", () => {
    expect(selectionFromBoxDetection(null)).toEqual({ selection: FULL_BOX, products: [], selected: -1, auto: false });
    expect(selectionFromBoxDetection({ box: null, confidence: 0, reason: 'no_foreground' }))
      .toEqual({ selection: FULL_BOX, products: [], selected: -1, auto: false });
  });

  it('un multi-objet ne déclenche jamais de sélection automatique', () => {
    const patch = selectionFromBoxDetection({
      box: { x: 0.1, y: 0.1, w: 0.4, h: 0.4 },
      confidence: 0.9,
      reason: 'multi_object',
    });
    expect(patch.auto).toBe(false);
    expect(patch.selection).toEqual(FULL_BOX);
    expect(patch.selected).toBe(-1);
  });

  it('une confiance trop juste est refusée', () => {
    const patch = selectionFromBoxDetection({
      box: { x: 0.2, y: 0.2, w: 0.5, h: 0.5 },
      confidence: AUTO_BOX_MIN_CONFIDENCE - 0.01,
      reason: 'single_object',
    });
    expect(patch.auto).toBe(false);
  });

  it('une boîte hors bornes ou dégénérée est refusée', () => {
    const cases = [
      { x: -0.1, y: 0, w: 0.5, h: 0.5 },
      { x: 0.9, y: 0, w: 0.5, h: 0.5 },
      { x: 0, y: 0, w: 0.01, h: 0.5 },
      { x: 0, y: 0, w: 0.5, h: 0 },
    ];
    for (const box of cases) {
      const patch = selectionFromBoxDetection({ box, confidence: 0.95, reason: 'single_object' });
      expect(patch.auto).toBe(false);
      expect(patch.selection).toEqual(FULL_BOX);
    }
  });

  it('une boîte valide est bornée à 0..1 sans être inventée', () => {
    const patch = selectionFromBoxDetection({
      box: { x: 0, y: 0, w: 1, h: 1 },
      confidence: 0.8,
      reason: 'single_object',
    });
    expect(patch.auto).toBe(true);
    expect(patch.selection).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });
});
