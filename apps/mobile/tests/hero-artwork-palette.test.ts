import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import edges from '../assets/hero/palette.json';
import manifest from '../assets/hero/manifest.json';

function luminance(hex: string) {
  const [r, g, b] = hex.slice(1).match(/../g)!.map(x => parseInt(x, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * r + .7152 * g + .0722 * b;
}

describe('Hero photograph metadata stays separate from the brand palette', () => {
  it.each(manifest)('$slug has its supplied photo and high contrast title', item => {
    const image = fs.readFileSync(path.resolve(import.meta.dirname, '../assets/hero', item.file));
    expect(image.readUInt16BE(0)).toBe(0xffd8);
    const edge = edges[item.slug as keyof typeof edges];
    expect(edge.top).toMatch(/^#[0-9a-f]{6}$/);
    expect(edge.bottom).toMatch(/^#[0-9a-f]{6}$/);
    const lum = luminance(edge.top);
    const contrast = item.textTone === 'dark' ? (lum + .05) / .05 : 1.05 / (lum + .05);
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
  it('keeps only the thirteen selected photos, without superseded artwork', () => {
    expect(manifest).toHaveLength(13);
    const files = fs.readdirSync(path.resolve(import.meta.dirname, '../assets/hero')).filter(file => file.endsWith('.jpg')).sort();
    expect(files).toEqual(manifest.map(item => item.file).sort());
    expect(new Set(manifest.map(item => item.slug)).size).toBe(13);
  });
  it('loads photo metadata without embedding content colours in the UI token source', () => {
    const tokens = fs.readFileSync(path.resolve(import.meta.dirname, '../src/design/tokens.mobile.ts'), 'utf8');
    expect(tokens).toContain("import HERO_PHOTO_EDGES from '../../assets/hero/palette.json'");
    expect(tokens).toContain('export const HERO_DEMO_EDGES = HERO_PHOTO_EDGES');
  });
});
