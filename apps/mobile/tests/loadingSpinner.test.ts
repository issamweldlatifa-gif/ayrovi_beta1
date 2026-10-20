/**
 * Cercle d'attente en pointillés (référence Zalando) — géométrie pure.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  SPINNER_PATTERN, SPINNER_SIZES, SPINNER_TURN_MS, spinnerDashes,
} from '../src/design/spinnerGeometry';

const ROOT = path.resolve(__dirname, '..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('LoadingSpinner — un cercle fin en pointillés qui tourne', () => {
  it('la découpe fait exactement un tour, en paires trait / vide', () => {
    const total = SPINNER_PATTERN.reduce((sum, part) => sum + part, 0);
    expect(total).toBeCloseTo(1, 6);
    expect(SPINNER_PATTERN.length % 2).toBe(0);
    expect(SPINNER_PATTERN.every((part) => part > 0)).toBe(true);
  });

  it('un long arc plein (plus de la moitié du cercle), puis des tirets de plus en plus courts jusqu’à un point', () => {
    const strokes = SPINNER_PATTERN.filter((_, index) => index % 2 === 0);
    expect(Math.max(...strokes)).toBeGreaterThan(0.5);
    // Dans le sens de la rotation : point → tirets croissants → arc plein en tête.
    expect([...strokes]).toEqual([...strokes].sort((a, b) => a - b));
    expect(strokes[0]).toBeLessThan(0.01);
  });

  it('les vides restent visibles malgré les bouts arrondis, dans les deux tailles', () => {
    for (const { box, stroke } of Object.values(SPINNER_SIZES)) {
      const dashes = spinnerDashes((box - stroke) / 2);
      const gaps = dashes.filter((_, index) => index % 2 === 1);
      // Un bout arrondi mange stroke / 2 de chaque côté du vide.
      for (const gap of gaps) expect(gap - stroke).toBeGreaterThan(1);
    }
  });

  it('trait fin, vitesse constante d’un tour par 0,9 s', () => {
    expect(SPINNER_SIZES.sm.stroke).toBeLessThanOrEqual(2);
    expect(SPINNER_SIZES.md.stroke).toBeLessThanOrEqual(3);
    expect(SPINNER_TURN_MS).toBe(900);
    const source = read('src/design/LoadingSpinner.tsx');
    expect(source).toContain('Easing.linear');
    expect(source).toContain('useNativeDriver: true');
    expect(source).toContain('strokeLinecap="round"');
  });

  it('les cinq barres violettes ont disparu de l’application', () => {
    expect(fs.existsSync(path.join(ROOT, 'src/design/WaitingBars.tsx'))).toBe(false);
    for (const rel of ['src/design/ui.tsx', 'src/design/states.tsx', 'app/sign-in.tsx',
      'src/features/lens/LensProductView.tsx', 'src/features/social/Comments.tsx']) {
      const source = read(rel);
      expect(source).not.toContain('WaitingBars');
      expect(source).toContain('LoadingSpinner');
    }
  });
});
