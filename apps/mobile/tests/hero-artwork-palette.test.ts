import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import edges from '../assets/hero/palette.json';

const artwork = { tech: 'tech', modeHomme: 'mode-homme', modeFemme: 'mode-femme', bebe: 'mode-bebe', maison: 'mode-maison', sport: 'sport' } as const;

describe('Hero photograph metadata stays separate from the brand palette', () => {
  it.each(Object.entries(artwork))('%s has a photo and valid top/bottom metadata', (key, slug) => {
    const file = path.resolve(import.meta.dirname, `../assets/hero/hero-${slug}.jpg`);
    const image = fs.readFileSync(file);
    expect(image.readUInt16BE(0)).toBe(0xffd8);
    for (const value of Object.values(edges[key as keyof typeof edges])) expect(value).toMatch(/^#[0-9a-f]{6}$/);
  });
  it('uses separate edge samples instead of the same whole-image average for every edge', () => {
    expect(Object.values(edges).filter(edge => edge.top !== edge.bottom).length).toBeGreaterThanOrEqual(4);
  });
  it('loads content metadata without embedding its brown pixels in the UI token source', () => {
    const tokens = fs.readFileSync(path.resolve(import.meta.dirname, '../src/design/tokens.mobile.ts'), 'utf8');
    expect(tokens).toContain("import HERO_PHOTO_EDGES from '../../assets/hero/palette.json'");
    expect(tokens).toContain('export const HERO_DEMO_EDGES = HERO_PHOTO_EDGES');
  });
});
