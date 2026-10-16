/**
 * Carte produit « native » — les 8 cas d'acceptation de la commande du 16/10/2026,
 * en simulations locales (aucun réseau, aucune isolation) :
 *
 *   1 chaussure fond blanc · 2 sac fond gris · 3 téléphone fond blanc ·
 *   4 vêtement fond coloré · 5 produit avec décor · 6 produit petit dans un
 *   grand vide blanc · 7 image illisible / analyse en échec · 8 image qui
 *   exige réellement l'isolation.
 *
 * Pour chaque cas : qualité du rendu, aucun rognage du produit, aucun vide
 * ajouté, et AUCUNE opération d'isolation là où elle n'apporte rien.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  colorBounds, containCoverage, getNativeCard, MIN_CONTAIN_COVERAGE, planNativeCard,
  renderNativeCard, WHITE_CANVAS,
} from '../src/services/cardNative';
import { frameSizeFor } from '../src/services/imageComposition';

const FRAME_ASPECT = 9 / 13;

/* ── Fabrique de photos marchandes simulées ────────────────────────────────── */

async function photo(spec: {
  width: number;
  height: number;
  background: string | 'decor' | 'gradient';
  product: { x: number; y: number; w: number; h: number; color: string };
}): Promise<Buffer> {
  const { width, height } = spec;
  const rect = async (w: number, h: number, color: string) => sharp({
    create: { width: Math.max(1, w), height: Math.max(1, h), channels: 3, background: color },
  }).png().toBuffer();
  const layers: Array<{ input: Buffer; left: number; top: number }> = [];
  let base: Buffer;
  if (spec.background === 'decor' || spec.background === 'gradient') {
    // Quatre quadrants très différents : AUCUN côté n'est uniforme ⇒ fond complexe.
    const w2 = Math.round(width / 2);
    const h2 = Math.round(height / 2);
    const colors = ['#20496b', '#b8642e', '#31502e', '#8d86c9'];
    const boxes: Array<[number, number, number, number]> = [
      [w2, h2, 0, 0], [width - w2, h2, w2, 0], [w2, height - h2, 0, h2], [width - w2, height - h2, w2, h2],
    ];
    for (let i = 0; i < 4; i += 1) {
      layers.push({ input: await rect(boxes[i][0], boxes[i][1], colors[i]), left: boxes[i][2], top: boxes[i][3] });
    }
    if (spec.background === 'decor') {
      // Décor supplémentaire : tapis et étagère, toujours complexes.
      layers.push({ input: await rect(Math.round(width * 0.7), Math.round(height * 0.18), '#c9c2a1'), left: 8, top: height - Math.round(height * 0.2) });
      layers.push({ input: await rect(Math.round(width * 0.5), Math.round(height * 0.08), '#40342c'), left: Math.round(width * 0.1), top: Math.round(height * 0.12) });
    }
    base = await rect(width, height, '#ffffff');
  } else {
    base = await rect(width, height, spec.background);
  }
  layers.push({ input: await rect(spec.product.w, spec.product.h, spec.product.color), left: spec.product.x, top: spec.product.y });
  return sharp(base).composite(layers).jpeg({ quality: 92 }).toBuffer();
}

async function rawOf(buffer: Buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: 4 as const };
}

async function pixel(buffer: Buffer, x: number, y: number): Promise<[number, number, number]> {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * info.channels;
  return [data[i], data[i + 1], data[i + 2]];
}

/** Boîte englobante des pixels sombres (le produit simulé) dans un rendu. */
async function darkBounds(buffer: Buffer, threshold = 120) {
  const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
  let x0 = info.width, y0 = info.height, x1 = -1, y1 = -1;
  for (let y = 0; y < info.height; y += 1) {
    for (let x = 0; x < info.width; x += 1) {
      const i = (y * info.width + x) * info.channels;
      if (Math.max(data[i], data[i + 1], data[i + 2]) > threshold) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

let cacheDir = '';
beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'native-card-'));
  process.env.AYROVI_NATIVE_CARD_CACHE_DIR = cacheDir;
});
afterEach(() => {
  delete process.env.AYROVI_NATIVE_CARD_CACHE_DIR;
  delete process.env.AYROVI_NATIVE_CARD;
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

const fetcherOf = (buffer: Buffer) => {
  const calls = { count: 0 };
  return { calls, fetcher: async () => { calls.count += 1; return buffer; } };
};

describe('plan — quelle voie pour quelle photo (pur)', () => {
  it('fond blanc ⇒ trim sur canvas blanc ; fond uniforme ⇒ trim sur la couleur du bord', () => {
    expect(planNativeCard('white', { r: 250, g: 250, b: 250 }, 0.8, FRAME_ASPECT))
      .toEqual({ mode: 'trim', canvas: { ...WHITE_CANVAS } });
    expect(planNativeCard('uniform', { r: 217, g: 217, b: 217 }, 0.8, FRAME_ASPECT))
      .toEqual({ mode: 'trim', canvas: { r: 217, g: 217, b: 217 } });
  });

  it('fond complexe proche du ratio ⇒ photo entière sur ses bords (extend)', () => {
    expect(planNativeCard('complex', { r: 90, g: 60, b: 40 }, 0.8, FRAME_ASPECT))
      .toEqual({ mode: 'extend', canvas: { r: 90, g: 60, b: 40 } });
  });

  it('fond complexe très loin du ratio ⇒ null : cas D, l’isolation reste meilleure', () => {
    expect(planNativeCard('complex', { r: 90, g: 60, b: 40 }, 2.6, FRAME_ASPECT)).toBeNull();
    expect(containCoverage(2.6, FRAME_ASPECT)).toBeLessThan(MIN_CONTAIN_COVERAGE);
    expect(containCoverage(0.8, FRAME_ASPECT)).toBeGreaterThan(MIN_CONTAIN_COVERAGE);
    expect(containCoverage(1, FRAME_ASPECT)).toBeCloseTo(FRAME_ASPECT, 3);
  });

  it('trim couleur : la boîte du contenu ignore le fond uni (vide interne retiré)', async () => {
    const buffer = await photo({
      width: 400, height: 400, background: '#ffffff',
      product: { x: 180, y: 180, w: 40, h: 40, color: '#202020' },
    });
    const raw = await rawOf(buffer);
    const bounds = colorBounds(raw, WHITE_CANVAS);
    expect(bounds.empty).toBe(false);
    expect(bounds.width).toBeGreaterThanOrEqual(38);
    expect(bounds.width).toBeLessThanOrEqual(44); // le vide blanc n'est pas compté
  });
});

describe('les 8 cas d’acceptation (simulations rendues)', () => {
  it('cas 1 — chaussure fond blanc : trim, canvas blanc, produit grand, rien de rogné', async () => {
    const buffer = await photo({
      width: 300, height: 400, background: '#ffffff',
      product: { x: 90, y: 250, w: 120, h: 60, color: '#2b2b2b' },
    });
    const plan = planNativeCard('white', WHITE_CANVAS, 300 / 400, FRAME_ASPECT)!;
    const rendered = await renderNativeCard(buffer, 600, plan);
    expect(rendered).not.toBeNull();
    expect(rendered!.mode).toBe('trim');
    expect(rendered!.checks.no_crop).toBe(true);
    const frame = frameSizeFor(600);
    const corner = await pixel(rendered!.body, 4, 4);
    expect(corner).toEqual([255, 255, 255]);
    const product = await darkBounds(rendered!.body);
    // 120 px de contenu × facteur borné (≤ 3.2) → le produit occupe ~384 px de large.
    expect(product.width).toBeGreaterThanOrEqual(365);
    expect(product.width).toBeLessThanOrEqual(410);
    expect(product.x0).toBeGreaterThan(0);
    expect(product.x1).toBeLessThan(frame.width - 1);
  });

  it('cas 2 — sac fond gris : trim, canvas = le gris de la photo (pas de rectangle)', async () => {
    const buffer = await photo({
      width: 320, height: 400, background: '#d9d9d9',
      product: { x: 100, y: 140, w: 120, h: 130, color: '#5b3a21' },
    });
    const plan = planNativeCard('uniform', { r: 0xd9, g: 0xd9, b: 0xd9 }, 320 / 400, FRAME_ASPECT)!;
    const rendered = await renderNativeCard(buffer, 600, plan);
    expect(rendered!.mode).toBe('trim');
    const corner = await pixel(rendered!.body, 4, 4);
    for (const channel of corner) expect(Math.abs(channel - 0xd9)).toBeLessThanOrEqual(2);
  });

  it('cas 3 — téléphone fond blanc : même voie que la chaussure, cadrage recentré', async () => {
    const buffer = await photo({
      width: 300, height: 400, background: '#fdfdfd',
      product: { x: 120, y: 90, w: 60, h: 200, color: '#101010' },
    });
    const rendered = await renderNativeCard(buffer, 600, planNativeCard('white', WHITE_CANVAS, 0.75, FRAME_ASPECT)!);
    const product = await darkBounds(rendered!.body);
    expect(product.height).toBeGreaterThan(product.width); // portrait conservé
    expect(product.height).toBeLessThanOrEqual(Math.round(frameSizeFor(600).height * 0.84) + 2);
  });

  it('cas 4 — vêtement fond coloré : extend, photo ENTIÈRE, fond raccord (ni #F0F2F2 ni rectangle)', async () => {
    const buffer = await photo({
      width: 320, height: 400, background: 'gradient',
      product: { x: 110, y: 120, w: 100, h: 160, color: '#e8e3d8' },
    });
    const plan = planNativeCard('complex', { r: 0x20, g: 0x49, b: 0x6b }, 0.8, FRAME_ASPECT)!;
    expect(plan.mode).toBe('extend');
    const rendered = await renderNativeCard(buffer, 600, plan);
    expect(rendered!.checks.no_crop).toBe(true);
    const frame = frameSizeFor(600);
    const corner = await pixel(rendered!.body, 3, 3);
    // Le fond n'est NI le gris studio NI un aplat : ce sont les bords floutés de la photo.
    expect(Math.abs(corner[0] - 0xf0) + Math.abs(corner[1] - 0xf2) + Math.abs(corner[2] - 0xf2)).toBeGreaterThan(30);
    const center = await pixel(rendered!.body, frame.width >> 1, frame.height >> 1);
    const source = await pixel(buffer, 160, 200); // cœur du produit simulé
    for (let i = 0; i < 3; i += 1) expect(Math.abs(center[i] - source[i])).toBeLessThanOrEqual(14);
  });

  it('cas 5 — produit avec décor : extend, aucun rognage, checks cohérents', async () => {
    const buffer = await photo({
      width: 360, height: 520, background: 'decor',
      product: { x: 130, y: 200, w: 100, h: 140, color: '#1c1c1c' },
    });
    const plan = planNativeCard('complex', { r: 0x7a, g: 0x4a, b: 0x2b }, 360 / 520, FRAME_ASPECT)!;
    expect(plan.mode).toBe('extend');
    const rendered = await renderNativeCard(buffer, 600, plan);
    expect(rendered).not.toBeNull();
    expect(rendered!.checks).toMatchObject({ no_crop: true, full_image: true });
  });

  it('cas 6 — produit minuscule dans un grand vide blanc : le vide disparaît, sans sur-agrandissement', async () => {
    const buffer = await photo({
      width: 400, height: 400, background: '#ffffff',
      product: { x: 180, y: 180, w: 40, h: 40, color: '#202020' },
    });
    const rendered = await renderNativeCard(buffer, 600, planNativeCard('white', WHITE_CANVAS, 1, FRAME_ASPECT)!);
    const product = await darkBounds(rendered!.body);
    // 40 px × MAX_UPSCALE 3.2 = 128 px : pas plus (qualité), pas le cadre entier (vide retiré).
    expect(product.width).toBeGreaterThanOrEqual(118);
    expect(product.width).toBeLessThanOrEqual(148);
    expect(rendered!.checks.no_over_upscale).toBe(true);
  });

  it('cas 7 — image illisible ou fetch en échec : { file: null }, la route retombe', async () => {
    const broken = fetcherOf(Buffer.from('pas une image du tout'));
    const meta = await getNativeCard('https://cdn.shop.example/broken.jpg', 600, broken);
    expect(meta.file).toBeNull();
    expect(meta.kind).toBe('unreadable');
    const offline = { calls: { count: 0 }, fetcher: async () => { throw new Error('ECONNREFUSED'); } };
    expect((await getNativeCard('https://cdn.shop.example/off.jpg', 600, offline)).file).toBeNull();
  });

  it('cas 8 — bannière complexe très large : décliné (cas D), la composition prend la main', async () => {
    const buffer = await photo({
      width: 800, height: 333, background: 'decor',
      product: { x: 350, y: 100, w: 100, h: 130, color: '#111111' },
    });
    const meta = await getNativeCard('https://cdn.shop.example/banner.jpg', 600, fetcherOf(buffer));
    expect(meta.file).toBeNull();
    expect(meta.kind).toBe('complex');
  });
});

describe('aucune isolation, cache, interrupteur', () => {
  it('contrat : ce module ne connaît ni segmentation ni PhotoRoom', () => {
    const source = fs.readFileSync(path.resolve('src/services/cardNative.ts'), 'utf8');
    expect(source).not.toContain('segmentBuffer');
    expect(source).not.toContain('isolateBuffer');
    expect(source).not.toContain('photoroom');
    const routes = fs.readFileSync(path.resolve('src/public/routes.ts'), 'utf8');
    const block = routes.split("router.get('/media/card'")[1]!.split("router.get('/media/img'")[0]!;
    expect(block.indexOf('getNativeCard(')).toBeLessThan(block.indexOf('getComposedCard('));
    expect(block).not.toContain('res.redirect');
  });

  it('comptage : 6 isolations évitées sur les 8 cas (l’ancien système isolait les 8)', async () => {
    const cases: Array<[string, Buffer]> = [
      ['shoe', await photo({ width: 300, height: 400, background: '#ffffff', product: { x: 90, y: 250, w: 120, h: 60, color: '#2b2b2b' } })],
      ['bag', await photo({ width: 320, height: 400, background: '#d9d9d9', product: { x: 100, y: 140, w: 120, h: 130, color: '#5b3a21' } })],
      ['phone', await photo({ width: 300, height: 400, background: '#fdfdfd', product: { x: 120, y: 90, w: 60, h: 200, color: '#101010' } })],
      ['cloth', await photo({ width: 320, height: 400, background: 'gradient', product: { x: 110, y: 120, w: 100, h: 160, color: '#e8e3d8' } })],
      ['decor', await photo({ width: 360, height: 520, background: 'decor', product: { x: 130, y: 200, w: 100, h: 140, color: '#1c1c1c' } })],
      ['tiny', await photo({ width: 400, height: 400, background: '#ffffff', product: { x: 180, y: 180, w: 40, h: 40, color: '#202020' } })],
      ['broken', Buffer.from('nope')],
      ['banner', await photo({ width: 800, height: 333, background: 'decor', product: { x: 350, y: 100, w: 100, h: 130, color: '#111111' } })],
    ];
    let native = 0;
    for (const [name, buffer] of cases) {
      const { fetcher } = fetcherOf(buffer);
      const meta = await getNativeCard(`https://cdn.shop.example/${name}.jpg`, 600, { fetcher });
      if (meta.file) native += 1;
    }
    expect(native).toBe(6); // 8 cas − illisible − cas D ⇒ 6 isolations évitées
  });

  it('cache : le verdict et le rendu ne se recalculent pas (un seul fetch pour deux lectures)', async () => {
    const buffer = await photo({
      width: 300, height: 400, background: '#ffffff',
      product: { x: 90, y: 250, w: 120, h: 60, color: '#2b2b2b' },
    });
    const stub = fetcherOf(buffer);
    const first = await getNativeCard('https://cdn.shop.example/cached.jpg', 600, stub);
    const second = await getNativeCard('https://cdn.shop.example/cached.jpg', 600, stub);
    expect(first.file).toBe(second.file);
    expect(first.mode).toBe('trim');
    expect(stub.calls.count).toBe(1);
    // Une autre largeur = une autre entrée (le rendu dépend du cadre).
    const other = await getNativeCard('https://cdn.shop.example/cached.jpg', 900, stub);
    expect(other.file).not.toBe(first.file);
    expect(stub.calls.count).toBe(2);
  });

  it('interrupteur AYROVI_NATIVE_CARD=false : retour intégral à l’ancien comportement', async () => {
    process.env.AYROVI_NATIVE_CARD = 'false';
    const buffer = await photo({
      width: 300, height: 400, background: '#ffffff',
      product: { x: 90, y: 250, w: 120, h: 60, color: '#2b2b2b' },
    });
    const meta = await getNativeCard('https://cdn.shop.example/off.jpg', 600, fetcherOf(buffer));
    expect(meta.file).toBeNull();
  });

  it('le rendu existe dans les deux tailles de carte (grille 600 et grande carte 900)', async () => {
    const buffer = await photo({
      width: 300, height: 400, background: '#ffffff',
      product: { x: 90, y: 250, w: 120, h: 60, color: '#2b2b2b' },
    });
    for (const width of [600, 900, 1080]) {
      const meta = await getNativeCard(`https://cdn.shop.example/sizes.jpg`, width, fetcherOf(buffer));
      expect(meta.file).not.toBeNull();
      const body = fs.readFileSync(path.join(cacheDir, meta.file!));
      const meta2 = await sharp(body).metadata();
      const frame = frameSizeFor(width);
      expect(meta2.width).toBe(frame.width);
      expect(meta2.height).toBe(frame.height);
    }
  });
});
