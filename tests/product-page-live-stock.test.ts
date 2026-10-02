import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { displayProductTitle } from '../client/src/shop/adapter';

describe('fiche produit — lecture marchande à l\'ouverture', () => {
  it('relit le lien via /live-stock dès l\'ouverture de la fiche', () => {
    const screen = readFileSync('client/src/shop/ShopProductScreen.tsx', 'utf8');
    expect(screen).toContain('refreshLiveStock([');
    expect(screen).toContain('setLiveProduct');
  });

  it('n\'exige plus une dispo confirmée pour activer le panier — seule la rupture bloque', () => {
    const page = readFileSync('client/src/shop/ProductPage.tsx', 'utf8');
    expect(page).toContain("purchaseAvailability === 'unavailable'");
    expect(page).not.toContain("purchaseAvailability !== 'available'");
    expect(page).not.toMatch(/v[ée]rification manuelle/i);
  });

  it('nettoie le titre SerpApi (suffixe boutique + liste de coloris)', () => {
    expect(displayProductTitle(
      'Nike Performance ZOOM FLY 6 - Chaussures de running sur route - violet mist/purple dynasty/hot lava - ZALANDO.FR',
    )).toBe('Nike Performance ZOOM FLY 6 - Chaussures de running sur route');
  });
});
