/**
 * Cadre « comme Pinterest Lens » (11/11/2026) : arrondi et arcs à la TAILLE du
 * produit — grand produit, grands arcs ; petit produit, petits — bornés.
 */
import { describe, expect, it } from 'vitest';
import { focusGeometry } from '@/features/lens/lensSelection';

describe('focusGeometry', () => {
  it('grand produit → grand arrondi et grands arcs', () => {
    const big = focusGeometry(300, 420);
    expect(big).toEqual({ radius: 20, stroke: 4, gap: 6, arc: 30 });
  });
  it('produit moyen → proportionnel (12 % du petit côté)', () => {
    expect(focusGeometry(120, 150).radius).toBe(14);
    expect(focusGeometry(120, 150).arc).toBe(14 + 6 + 4);
  });
  it('petit produit → petit cadre, trait plus fin, jamais en dessous du minimum', () => {
    const small = focusGeometry(50, 30);
    expect(small).toEqual({ radius: 8, stroke: 3, gap: 4, arc: 15 });
    expect(focusGeometry(0, 0).radius).toBe(8);
  });
  it('l’arc grandit avec le produit (monotone)', () => {
    const sizes = [40, 80, 120, 160, 200, 400];
    const arcs = sizes.map((side) => focusGeometry(side, side).arc);
    for (let index = 1; index < arcs.length; index += 1) expect(arcs[index]).toBeGreaterThanOrEqual(arcs[index - 1]);
  });
});
