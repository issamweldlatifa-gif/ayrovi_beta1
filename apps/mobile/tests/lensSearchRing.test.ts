import { describe, expect, it } from 'vitest';

import { ringPoints } from '@/features/lens/lensSelection';

/**
 * Géométrie de la couronne de recherche : les points doivent épouser le cadre
 * du produit, quel que soit son format (carré, très large, très haut).
 */
describe('couronne de recherche Lens', () => {
  it('répartit 8 points sur tout le pourtour du cadre', () => {
    const points = ringPoints(200, 100);
    expect(points).toHaveLength(8);
    points.forEach((point) => {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(200);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(100);
    });
    // Les quatre côtés sont couverts : la couronne entoure vraiment le produit.
    expect(points.some((point) => point.y === 0)).toBe(true);
    expect(points.some((point) => point.y === 100)).toBe(true);
    expect(points.some((point) => point.x === 0)).toBe(true);
    expect(points.some((point) => point.x === 200)).toBe(true);
  });

  it('espace les points régulièrement le long du pourtour', () => {
    const points = ringPoints(300, 40);
    const w = 300;
    const h = 40;
    const perimeter = 2 * (w + h);
    // Position de chaque point le long du pourtour (sens horaire depuis le coin haut-gauche).
    const arc = points.map((point) => (point.y === 0
      ? point.x
      : point.x === w
        ? w + point.y
        : point.y === h
          ? w + h + (w - point.x)
          : 2 * w + h + (h - point.y)));
    const step = perimeter / points.length;
    arc.forEach((position, index) => {
      const gap = (arc[(index + 1) % points.length] - position + perimeter) % perimeter;
      expect(gap).toBeCloseTo(step, 5);
    });
  });

  it('reste stable sur un cadre dégénéré (aucune division par zéro)', () => {
    const points = ringPoints(0, 0);
    expect(points).toHaveLength(8);
    points.forEach((point) => {
      expect(Number.isFinite(point.x)).toBe(true);
      expect(Number.isFinite(point.y)).toBe(true);
    });
  });
});
