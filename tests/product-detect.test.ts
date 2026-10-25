import { describe, expect, it } from 'vitest';
import sharp from 'sharp';

import {
  detectBoxFromRgba,
  detectProductInImage,
  isReliableAutoBox,
  otsuThreshold,
} from '../src/ayrovix/services/productDetect';

async function renderSvg(svg: string): Promise<Buffer> {
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const inBounds = (box: { x: number; y: number; w: number; h: number }) => {
  for (const value of [box.x, box.y, box.w, box.h]) {
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(1);
  }
  expect(box.x + box.w).toBeLessThanOrEqual(1.0001);
  expect(box.y + box.h).toBeLessThanOrEqual(1.0001);
};

describe('otsuThreshold', () => {
  it('sépare deux populations nettes', () => {
    const values = [5, 6, 5, 6, 40, 42, 41, 43];
    const t = otsuThreshold(values, 64);
    expect(t).toBeGreaterThanOrEqual(6);
    expect(t).toBeLessThan(40);
  });
});

describe('detectBoxFromRgba — fonction pure déterministe', () => {
  it('encadre un rectangle sombre unique sur fond clair', () => {
    const width = 10;
    const height = 10;
    const rgba = Buffer.alloc(width * height * 4, 240);
    // Produit : rectangle de x=3..6, y=2..7 (4 de large, 6 de haut).
    for (let y = 2; y <= 7; y += 1) {
      for (let x = 3; x <= 6; x += 1) {
        const i = (y * width + x) * 4;
        rgba[i] = 30;
        rgba[i + 1] = 40;
        rgba[i + 2] = 60;
      }
    }
    const result = detectBoxFromRgba(rgba, width, height);
    expect(result.reason).toBe('single_object');
    expect(result.box).not.toBeNull();
    if (!result.box) return;
    inBounds(result.box);
    expect(isReliableAutoBox(result)).toBe(true);
    // Le rectangle couvre le produit (avec la marge de 4 %).
    expect(result.box.x).toBeLessThanOrEqual(0.34);
    expect(result.box.y).toBeLessThanOrEqual(0.24);
    expect(result.box.x + result.box.w).toBeGreaterThanOrEqual(0.66);
    expect(result.box.y + result.box.h).toBeGreaterThanOrEqual(0.76);
  });

  it('image uniforme : aucun rectangle inventé', () => {
    const rgba = Buffer.alloc(8 * 8 * 4, 200);
    const result = detectBoxFromRgba(rgba, 8, 8);
    expect(result.box).toBeNull();
    expect(['low_contrast', 'no_foreground']).toContain(result.reason);
    expect(isReliableAutoBox(result)).toBe(false);
  });

  it('deux objets comparables : pas de sélection automatique (multi_object)', () => {
    const width = 20;
    const height = 10;
    const rgba = Buffer.alloc(width * height * 4, 245);
    const paint = (x0: number, x1: number) => {
      for (let y = 2; y <= 7; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const i = (y * width + x) * 4;
          rgba[i] = 20;
          rgba[i + 1] = 30;
          rgba[i + 2] = 50;
        }
      }
    };
    paint(1, 6);
    paint(13, 18);
    const result = detectBoxFromRgba(rgba, width, height);
    expect(result.box).toBeNull();
    expect(result.reason).toBe('multi_object');
  });

  it('est déterministe : même entrée, même sortie', () => {
    const rgba = Buffer.alloc(12 * 12 * 4, 230);
    for (let y = 4; y <= 8; y += 1) {
      for (let x = 4; x <= 8; x += 1) {
        const i = (y * 12 + x) * 4;
        rgba[i] = 10;
        rgba[i + 1] = 10;
        rgba[i + 2] = 10;
      }
    }
    const a = detectBoxFromRgba(rgba, 12, 12);
    const b = detectBoxFromRgba(rgba, 12, 12);
    expect(a).toEqual(b);
  });
});

describe('detectProductInImage — chaîne sharp de bout en bout', () => {
  it('repère un produit unique centré et renvoie une boîte normalisée fiable', async () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
        <rect width="200" height="200" fill="#f2f2f2"/>
        <rect x="50" y="40" width="100" height="120" fill="#1f2d4d"/>
      </svg>`;
    const result = await detectProductInImage(await renderSvg(svg));
    expect(result.reason).toBe('single_object');
    expect(result.box).not.toBeNull();
    if (!result.box) return;
    inBounds(result.box);
    expect(isReliableAutoBox(result)).toBe(true);
    // Tolérance généreuse après réduction à 96 px et marge de 4 %.
    expect(result.box.x).toBeLessThan(0.36);
    expect(result.box.y).toBeLessThan(0.30);
    expect(result.box.x + result.box.w).toBeGreaterThan(0.64);
    expect(result.box.y + result.box.h).toBeGreaterThan(0.70);
  });

  it('fond uni sans produit : rien à cadrer', async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160"><rect width="160" height="160" fill="#eaeaea"/></svg>`;
    const result = await detectProductInImage(await renderSvg(svg));
    expect(result.box).toBeNull();
    expect(isReliableAutoBox(result)).toBe(false);
  });

  it('deux produits séparés : aucun cadre unique trompeur', async () => {
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120">
        <rect width="240" height="120" fill="#f5f5f5"/>
        <rect x="20" y="30" width="70" height="70" fill="#222"/>
        <rect x="150" y="30" width="70" height="70" fill="#333"/>
      </svg>`;
    const result = await detectProductInImage(await renderSvg(svg));
    expect(result.box).toBeNull();
    expect(result.reason).toBe('multi_object');
  });
});
