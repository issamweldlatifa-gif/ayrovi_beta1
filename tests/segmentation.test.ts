// SEGMENTATION LOCALE (24/09/2026) : post-traitement PUR du masque u2netp —
// normalisation, seuil/feather, anti-îlots, garde de couverture, application alpha.
// Le modèle/runtime eux-mêmes sont optionnels à l'exécution (dégradation douce).
import { describe, expect, it } from 'vitest';
import { cleanMask, foregroundShare, normalizeMask, applyMask } from '../src/services/segmentation';

function maskOf(side: number, paint: (x: number, y: number) => number): Float32Array {
  const mask = new Float32Array(side * side);
  for (let y = 0; y < side; y++) for (let x = 0; x < side; x++) mask[y * side + x] = paint(x, y);
  return mask;
}

describe('normalizeMask', () => {
  it('borne le masque cru du modèle sur 0..1', () => {
    const raw = new Float32Array([0.3, 0.3, 0.5, 0.9, 0.1]);
    const normalized = normalizeMask(raw);
    expect(Math.min(...normalized)).toBe(0);
    expect(Math.max(...normalized)).toBeCloseTo(1);
  });
  it('rend un masque plat entièrement nul (jamais de NaN)', () => {
    const normalized = normalizeMask(new Float32Array([0.42, 0.42, 0.42]));
    expect([...normalized].every((v) => v === 0)).toBe(true);
  });
});

describe('cleanMask — seuil + anti-îlots', () => {
  it('garde le sujet (grande composante) et supprime les petits îlots de bruit', () => {
    const side = 100;
    const mask = maskOf(side, (x, y) => {
      const inSubject = x > 40 && x < 60 && y > 20 && y < 80;   // 400 px
      const inNoise = x > 90 && x < 94 && y > 90 && y < 93;     // 12 px (îlot)
      return inSubject || inNoise ? 1 : 0;
    });
    const alpha = cleanMask(mask, side, side);
    expect(alpha[50 * side + 50]).toBe(255);        // sujet conservé
    expect(alpha[91 * side + 92]).toBe(0);          // îlot supprimé
    expect(alpha[0]).toBe(0);                       // fond nul
  });

  it('produit une bordure adoucie (feather) entre fond et sujet', () => {
    const side = 60;
    const mask = maskOf(side, (x) => (x > 30 ? 1 : x === 30 ? 0.7 : 0.2)); // colonne frontière intermédiaire
    const alpha = cleanMask(mask, side, side, { hardThreshold: 0.6, feather: 0.2 });
    const edge = alpha[30 * side + 30]; // pixel intermédiaire (0.7 entre 0.4 et 0.8)
    expect(edge).toBeGreaterThan(0);
    expect(edge).toBeLessThan(255);
  });
});

describe('foregroundShare + applyMask', () => {
  it('mesure la part du premier plan et la garde anti-âneries s’y applique', () => {
    const side = 10;
    const alpha = new Uint8ClampedArray(side * side);
    for (let i = 20; i < 60; i++) alpha[i] = 255;
    expect(foregroundShare(alpha)).toBeCloseTo(0.4);
  });

  it('ne fait que RÉDUIRE l’alpha existant (multiplie, jamais opaque)', () => {
    const data = Buffer.from([1, 2, 3, 255, 4, 5, 6, 128]);
    applyMask({ data, width: 2, height: 1 }, new Uint8ClampedArray([128, 0]));
    expect(data[3]).toBe(Math.round(255 * 128 / 255));
    expect(data[7]).toBe(0);
  });
});
