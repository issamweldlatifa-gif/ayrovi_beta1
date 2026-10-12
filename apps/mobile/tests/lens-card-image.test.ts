import { describe, expect, it } from 'vitest';
import { LENS_CARD_WIDTH, lensCardPath } from '../src/features/lens/cardImage';

describe('image de carte Lens (carte composée serveur)', () => {
  it('construit le chemin /api/public/media/card avec URL encodée et largeur autorisée', () => {
    const path = lensCardPath('https://img.example.com/a b.jpg?x=1&y=2');
    expect(path).toBe(`/api/public/media/card?u=${encodeURIComponent('https://img.example.com/a b.jpg?x=1&y=2')}&w=${LENS_CARD_WIDTH}`);
    expect(LENS_CARD_WIDTH).toBe(600);
  });

  it('ne compose pas les sources non http(s) : elles restent telles quelles', () => {
    expect(lensCardPath('/media/hero-default.jpg')).toBeNull();
    expect(lensCardPath('data:image/png;base64,AAAA')).toBeNull();
    expect(lensCardPath('')).toBeNull();
    expect(lensCardPath(null)).toBeNull();
    expect(lensCardPath(undefined)).toBeNull();
  });
});
