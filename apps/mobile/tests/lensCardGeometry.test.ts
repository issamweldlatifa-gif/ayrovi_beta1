// Géométrie de la carte résultat : le 2/3 mesuré sur le modèle commerce,
// partagé entre la carte et son squelette pour que la vignette ne saute pas.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { lensCardMediaHeight, LENS_CARD_MEDIA_RATIO } from '@/features/lens/lensCard';

const read = (relative: string) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');

describe('géométrie de la carte résultat', () => {
  it('allonge la vignette au 2/3 mesuré, et non plus au 4/5', () => {
    expect(LENS_CARD_MEDIA_RATIO).toBeCloseTo(2 / 3, 6);
    // Sur un écran de 390 px : 284 px de haut au lieu de 236 px — la carte gagne 20 %.
    expect(lensCardMediaHeight(390)).toBe(284);
    const old = Math.round(((390 - 8 - 4) / 2) * 5 / 4);
    expect(old).toBe(236);
    expect(lensCardMediaHeight(390)).toBeGreaterThan(old);
  });

  it('garde la même vignette à toute largeur (2 colonnes, gouttière de 4)', () => {
    for (const width of [320, 360, 390, 430, 720]) {
      const cardWidth = (width - 8 - 4) / 2;
      expect(lensCardMediaHeight(width)).toBe(Math.round(cardWidth / LENS_CARD_MEDIA_RATIO));
    }
    // Jamais de hauteur nulle ou négative, même sur une largeur absurde.
    expect(lensCardMediaHeight(0)).toBe(1);
  });

  it('alimente la carte et le squelette depuis la même fonction', () => {
    expect(read('../src/features/lens/LensResultCard.tsx')).toContain('aspectRatio: LENS_CARD_MEDIA_RATIO');
    expect(read('../src/features/lens/LensSearchSkeleton.tsx')).toContain('lensCardMediaHeight(width)');
    expect(read('../src/features/lens/LensSearchSkeleton.tsx')).not.toContain('5 / 4');
  });
});
