import { describe, expect, it } from 'vitest';
import { LENS_SEARCHING, lensSearchingCard } from '../src/features/lens/lensSearchingLayout';

const SCREEN = { width: 400, height: 860 };

describe('Z Lens — carte de l’écran d’attente (19/11)', () => {
  it('photo entière inconnue : carte carrée à 72 % de la largeur, sans recadrage', () => {
    const card = lensSearchingCard(SCREEN, null, null);
    expect(card).toEqual({ width: 288, height: 288 });
  });

  it('zone repérée : la carte prend sa forme (bornée) et la zone remplit la carte', () => {
    const photo = { width: 1200, height: 1600 };
    const selection = { x: 0.25, y: 0.3, w: 0.3, h: 0.3 };
    const card = lensSearchingCard(SCREEN, photo, selection);
    expect(card.width).toBeLessThanOrEqual(LENS_SEARCHING.maxWidth);
    expect(card.height).toBeLessThanOrEqual(SCREEN.height * LENS_SEARCHING.maxHeightShare);
    const image = card.image!;
    // l'image couvre toujours la carte (aucune bande vide)
    expect(image.left).toBeLessThanOrEqual(0);
    expect(image.top).toBeLessThanOrEqual(0);
    expect(image.left + image.width).toBeGreaterThanOrEqual(card.width - 0.5);
    expect(image.top + image.height).toBeGreaterThanOrEqual(card.height - 0.5);
    // le centre de la zone repérée tombe au centre de la carte
    const cx = image.left + (selection.x + selection.w / 2) * image.width;
    const cy = image.top + (selection.y + selection.h / 2) * image.height;
    expect(cx).toBeCloseTo(card.width / 2, 0);
    expect(cy).toBeCloseTo(card.height / 2, 0);
  });

  it('photo entière (pas de zone) : rapport borné, jamais une bande trop haute', () => {
    const card = lensSearchingCard(SCREEN, { width: 1000, height: 3000 }, { x: 0, y: 0, w: 1, h: 1 });
    expect(card.width / card.height).toBeCloseTo(LENS_SEARCHING.minAspect, 1);
  });
});
