import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { homeLoadFailed } from '../src/features/home/homeState';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

describe('état hors ligne de l’accueil', () => {
  it('se tait tant qu’une requête a réussi ou attend encore', () => {
    expect(homeLoadFailed([])).toBe(false);
    expect(homeLoadFailed([{ isPending: false, isError: false }, { isPending: false, isError: true }])).toBe(false);
    expect(homeLoadFailed([{ isPending: true, isError: true }, { isPending: false, isError: true }])).toBe(false);
    expect(homeLoadFailed([{ isPending: false, isError: false }])).toBe(false);
  });

  it('parle seulement quand TOUT a échoué', () => {
    expect(homeLoadFailed([{ isPending: false, isError: true }, { isPending: false, isError: true }])).toBe(true);
  });

  it('est branché sur les requêtes réelles de l’accueil', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).toContain('homeLoadFailed([');
    expect(home).toContain('<HomeOfflineBlock');
    // Le bouton « Réessayer » doit relancer l'écran, pas seulement fermer le bloc.
    expect(home).toMatch(/<HomeOfflineBlock onRetry=\{reload\}/);
  });
});

describe('les espaces de section appartiennent aux sections', () => {
  it('l’accueil ne pose plus d’espaceur orphelin', () => {
    const home = read('app/(tabs)/index.tsx');
    expect(home).not.toContain('<SectionBreak');
    expect(home).not.toContain('SectionRule');
  });

  it('chaque section qui peut disparaître porte le sien', () => {
    for (const file of [
      'src/features/home/StoriesSection.tsx',
      'src/features/home/BlackFridaySection.tsx',
      'src/features/home/LensHomeBlock.tsx',
      'src/features/home/ReelsShopSection.tsx',
      'src/features/highlights/HighlightsSection.tsx',
    ]) {
      expect(read(file), file).toContain('<SectionBreak');
    }
  });
});
