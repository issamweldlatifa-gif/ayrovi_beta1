/*
 * MOTEUR DE COMPOSITION D'IMAGE PRODUIT (phase 2, 25/09/2026).
 *
 * Ces tests sont le CONTRAT exécutable du prototype validé : ratio conservé,
 * échelle uniforme, zéro rognage, zéro dimension spécifique à une image.
 * Toute régression future du cadrage casse ici, pas en production.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import {
  CARD_ASPECT_HEIGHT,
  CARD_ASPECT_WIDTH,
  CARD_CANVAS,
  IDEAL_FRAME_WIDTH,
  MAX_UPSCALE,
  acceptComposition,
  alphaBounds,
  alphaCentroid,
  blurAlpha,
  composeOnMockup,
  compositeOver,
  cornerCoverage,
  frameSizeFor,
  paintMockupLayer,
  qualityBoundedWidth,
  smartPlacement,
} from '../src/services/imageComposition';
import { containBox, fillMaskHoles } from '../src/services/segmentation';
import { decontaminateFringe, type RawImage } from '../src/services/imageIsolation';

function rgba(width: number, height: number, paint: (x: number, y: number) => [number, number, number, number]): Buffer {
  const data = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const [r, g, b, a] = paint(x, y);
      data[offset] = r; data[offset + 1] = g; data[offset + 2] = b; data[offset + 3] = a;
    }
  }
  return data;
}

/** Asset synthétique : un rectangle opaque de w×h, entouré de transparence. */
function assetPng(width: number, height: number, padding = 7): Promise<Buffer> {
  const full = { width: width + padding * 2, height: height + padding * 2 };
  const data = rgba(full.width, full.height, (x, y) => (
    x >= padding && x < padding + width && y >= padding && y < padding + height
      ? [200, 40, 40, 255]
      : [0, 0, 0, 0]
  ));
  return sharp(data, { raw: { width: full.width, height: full.height, channels: 4 } }).png().toBuffer();
}

describe('géométrie pure — bbox et barycentre', () => {
  it('trouve la bounding box RÉELLE du produit, sans marge morte', () => {
    const data = rgba(20, 10, (x, y) => (x >= 4 && x <= 9 && y >= 2 && y <= 6 ? [1, 2, 3, 255] : [0, 0, 0, 0]));
    expect(alphaBounds(data, 20, 10)).toMatchObject({ x0: 4, y0: 2, x1: 10, y1: 7, width: 6, height: 5, empty: false });
  });

  it('signale une image sans alpha exploitable au lieu de deviner', () => {
    expect(alphaBounds(rgba(4, 4, () => [0, 0, 0, 0]), 4, 4).empty).toBe(true);
  });

  it('centre sur la MASSE alpha, pas sur la boîte (produit asymétrique)', () => {
    // masse concentrée à gauche : le barycentre doit être à gauche du centre de boîte.
    const data = rgba(100, 10, (x) => (x < 20 ? [0, 0, 0, 255] : x < 90 ? [0, 0, 0, 10] : [0, 0, 0, 0]));
    const centroid = alphaCentroid(data, 100, 10);
    expect(centroid.x).toBeLessThan(50);
  });
});

describe('SMART SCALE — le ratio est conservé par construction', () => {
  const frame = frameSizeFor(900);

  it.each([
    [183, 275], [447, 447], [399, 501], [1200, 300], [300, 1200], [1000, 999],
  ])('conserve le ratio à mieux que 0,5 %% pour un asset %ix%i', (width, height) => {
    const placement = smartPlacement({ width, height }, frame);
    expect(placement.aspectDeltaPercent).toBeLessThan(0.5);
  });

  it('applique UN SEUL facteur (X et Y) — aucun étirement possible', () => {
    const placement = smartPlacement({ width: 400, height: 200 }, frame);
    expect(placement.width / 400).toBeCloseTo(placement.height / 200, 2);
  });

  it('utilise « contain » : le produit entre ENTIER, jamais rogné', () => {
    for (const size of [{ width: 2000, height: 100 }, { width: 100, height: 2000 }, { width: 50, height: 50 }]) {
      const placement = smartPlacement(size, frame);
      expect(placement.cropped).toBe(false);
      expect(placement.x).toBeGreaterThanOrEqual(placement.safeBox.x0);
      expect(placement.y).toBeGreaterThanOrEqual(placement.safeBox.y0);
      expect(placement.x + placement.width).toBeLessThanOrEqual(placement.safeBox.x1);
      expect(placement.y + placement.height).toBeLessThanOrEqual(placement.safeBox.y1);
    }
  });

  it('respecte la zone de sécurité (le produit ne touche jamais le bord du cadre)', () => {
    const placement = smartPlacement({ width: 300, height: 300 }, frame);
    expect(placement.x).toBeGreaterThan(0);
    expect(placement.y).toBeGreaterThan(0);
  });
});

describe('QUALITY-BOUNDED RESOLUTION — une vignette n’est jamais sur-interpolée', () => {
  it('garde la largeur idéale quand la source est assez grande', () => {
    expect(qualityBoundedWidth({ width: 1200, height: 1600 })).toBe(IDEAL_FRAME_WIDTH);
  });

  it('réduit la résolution de rendu plutôt que d’agrandir au-delà de la garde', () => {
    const width = qualityBoundedWidth({ width: 120, height: 180 });
    expect(width).toBeLessThan(IDEAL_FRAME_WIDTH);
    const placement = smartPlacement({ width: 120, height: 180 }, frameSizeFor(width));
    expect(placement.scale).toBeLessThanOrEqual(MAX_UPSCALE + 0.01);
  });

  it('conserve le MÊME équilibre visuel malgré la résolution réduite', () => {
    const big = smartPlacement({ width: 1200, height: 1800 }, frameSizeFor(qualityBoundedWidth({ width: 1200, height: 1800 })));
    const small = smartPlacement({ width: 120, height: 180 }, frameSizeFor(qualityBoundedWidth({ width: 120, height: 180 })));
    expect(small.coverage).toBeCloseTo(big.coverage, 1);
  });
});

describe('COUCHE MOCKUP — contrat visuel officiel', () => {
  it('respecte le ratio 9/13 imposé par lens-product-card.css', () => {
    const frame = frameSizeFor(900);
    expect(frame.width / frame.height).toBeCloseTo(CARD_ASPECT_WIDTH / CARD_ASPECT_HEIGHT, 3);
  });

  it('peint le canvas officiel #F0F2F2 avec des coins arrondis', () => {
    const size = { width: 90, height: 130 };
    const layer = paintMockupLayer(size, 18);
    const centre = ((65 * 90) + 45) * 4;
    expect([layer[centre], layer[centre + 1], layer[centre + 2], layer[centre + 3]])
      .toEqual([CARD_CANVAS.r, CARD_CANVAS.g, CARD_CANVAS.b, 255]);
    expect(layer[3]).toBe(0);                    // coin supérieur gauche : hors du rayon
  });

  it('anticrénèle le coin (couverture partielle entre 0 et 1)', () => {
    // pixel posé SUR l'arc du rayon : couverture partielle attendue
    const partial = cornerCoverage(3, 3, 100, 100, 12);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
  });
});

describe('COUCHES SÉPARÉES — le composite est la DERNIÈRE étape', () => {
  it('compose « source-over » sans toucher les pixels hors de la couche', () => {
    const base = rgba(4, 1, () => [10, 10, 10, 255]);
    const layer = rgba(2, 1, () => [200, 0, 0, 255]);
    compositeOver(base, { width: 4, height: 1 }, layer, { width: 2, height: 1 }, 1, 0);
    expect(base[0]).toBe(10);                    // pixel 0 intact
    expect(base[4]).toBe(200);                   // pixel 1 remplacé
    expect(base[12]).toBe(10);                   // pixel 3 intact
  });

  it('floute l’alpha sans déborder de la couche (ombre de contact)', () => {
    const field = new Float32Array(9 * 9);
    field[4 * 9 + 4] = 1;
    const blurred = blurAlpha(field, 9, 9, 1.2);
    expect(blurred[4 * 9 + 4]).toBeLessThan(1);
    expect(blurred[4 * 9 + 5]).toBeGreaterThan(0);
  });
});

describe('PIPELINE COMPLET — sur des assets de ratios très différents', () => {
  it.each([
    ['paysage', 400, 150],
    ['portrait', 150, 400],
    ['carré', 300, 300],
    ['vignette', 60, 90],
  ])('compose un asset %s sans déformation ni rognage', async (_label, width, height) => {
    const composed = await composeOnMockup(await assetPng(width, height));
    expect(composed).not.toBeNull();
    const result = composed!;
    const verdict = acceptComposition(result);
    expect(verdict.checks).toMatchObject({
      aspect_ratio_preserved: true,
      no_crop: true,
      inside_safe_area: true,
      frame_ratio_official: true,
    });
    expect(verdict.pass).toBe(true);
    // le ratio du produit POSÉ correspond bien au ratio d'origine
    expect(result.placement.width / result.placement.height).toBeCloseTo(width / height, 1);
    const meta = await sharp(result.png).metadata();
    expect(meta.width! / meta.height!).toBeCloseTo(CARD_ASPECT_WIDTH / CARD_ASPECT_HEIGHT, 2);
  });

  it('refuse une image SANS transparence plutôt que de coller un rectangle marchand', async () => {
    const opaque = await sharp(rgba(120, 120, () => [255, 255, 255, 255]), { raw: { width: 120, height: 120, channels: 4 } }).png().toBuffer();
    expect(await composeOnMockup(opaque)).toBeNull();
  });

  it('applique le MÊME code à toutes les images (aucune règle par fichier)', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '..', 'src', 'services', 'imageComposition.ts'), 'utf8');
    expect(source).not.toMatch(/\.(jpe?g|png|webp)['"]/i);        // aucun nom de fichier de test
    expect(source).not.toMatch(/jacket|sneaker|handbag|iphone|laptop/i);
  });
});

describe('ISOLATION — correctifs issus du prototype', () => {
  it('containBox retrouve la zone utile du carré padé (masque aligné au produit)', () => {
    expect(containBox(400, 200, 320)).toMatchObject({ left: 0, top: 80, width: 320, height: 160 });
    expect(containBox(200, 400, 320)).toMatchObject({ left: 80, top: 0, width: 160, height: 320 });
    expect(containBox(500, 500, 320)).toMatchObject({ left: 0, top: 0, width: 320, height: 320 });
  });

  it('rebouche le bruit mais GARDE les vraies ouvertures (anse de sac)', () => {
    const side = 80;
    const alpha = new Uint8ClampedArray(side * side);
    for (let y = 10; y < 70; y++) for (let x = 10; x < 70; x++) alpha[y * side + x] = 255;
    for (let y = 20; y < 50; y++) for (let x = 20; x < 50; x++) alpha[y * side + x] = 0;   // grande ouverture
    alpha[60 * side + 60] = 0;                                                             // trou de bruit (1 px)
    fillMaskHoles(alpha, side, side);
    expect(alpha[35 * side + 35]).toBe(0);      // l'ouverture reste transparente
    expect(alpha[60 * side + 60]).toBe(255);    // le bruit est rebouché
  });

  it('retire la teinte du fond des pixels de frange (plus de liseré blanc)', () => {
    // pixel de frange : produit NOIR mélangé 50/50 avec un fond BLANC → C = 128.
    // Après décontamination, on doit retrouver la couleur pure du produit (≈ 0).
    const image: RawImage = { data: Buffer.from([128, 128, 128, 128, 10, 20, 30, 255]), width: 2, height: 1, channels: 4 };
    decontaminateFringe(image, { r: 255, g: 255, b: 255 });
    expect(image.data[0]).toBeLessThan(40);     // frange nettoyée (le blanc du studio est retiré)
    expect(image.data[4]).toBe(10);             // pixel plein : JAMAIS touché
    expect(image.data[3]).toBe(128);            // l'alpha n'est pas modifié
  });
});
