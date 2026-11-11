/**
 * Z Lens — détection ML Kit sur le téléphone (11/11/2026, « كيما Google Lens »).
 * Conversion PURE des objets ML Kit en produits encadrés 0..1.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_PRODUCTS, normalizeFrame, toDetectedProducts, toFileUrl, type MlKitObject,
} from '@/features/lens/onDeviceDetectionLogic';

const close = (box: { x: number; y: number; w: number; h: number } | null, expected: { x: number; y: number; w: number; h: number }) => {
  expect(box).not.toBeNull();
  for (const key of ['x', 'y', 'w', 'h'] as const) expect(box![key]).toBeCloseTo(expected[key], 6);
};

const obj = (x: number, y: number, w: number, h: number, label?: string, confidence = 0.8): MlKitObject => ({
  frame: { origin: { x, y }, size: { x: w, y: h } },
  labels: label ? [{ text: label, confidence }] : [],
});

describe('normalizeFrame', () => {
  it('pixels → 0..1', () => {
    close(normalizeFrame(obj(100, 200, 400, 600), 1000, 2000), { x: 0.1, y: 0.1, w: 0.4, h: 0.3 });
  });
  it('borne un cadre qui déborde de l’image', () => {
    close(normalizeFrame(obj(-50, 1800, 300, 400), 1000, 2000), { x: 0, y: 0.9, w: 0.25, h: 0.1 });
  });
  it('rejette l’inexploitable', () => {
    expect(normalizeFrame(obj(0, 0, 0, 10), 100, 100)).toBeNull();
    expect(normalizeFrame({ frame: null }, 100, 100)).toBeNull();
    expect(normalizeFrame(obj(0, 0, 10, 10), 0, 100)).toBeNull();
  });
});

describe('toDetectedProducts', () => {
  it('du plus grand au plus petit, catégories traduites en clés Lens', () => {
    const products = toDetectedProducts([
      obj(0, 0, 300, 300, 'Home good'),
      obj(400, 400, 500, 500, 'Fashion good'),
      obj(100, 700, 200, 250),
    ], 1000, 1000);
    expect(products.map((p) => p.category)).toEqual(['fashion', 'home', 'product']);
    close(products[0].box, { x: 0.4, y: 0.4, w: 0.5, h: 0.5 });
  });
  it('écarte les lieux (pas un produit) et les miettes', () => {
    const products = toDetectedProducts([
      obj(0, 0, 900, 900, 'Place'),
      obj(10, 10, 60, 60, 'Fashion good'), // 0.36 % de l’image
      obj(500, 0, 400, 400, 'Food'),
    ], 1000, 1000);
    expect(products.map((p) => p.category)).toEqual(['food']);
  });
  it('fusionne deux cadres presque superposés (garde le plus grand)', () => {
    const products = toDetectedProducts([obj(100, 100, 500, 500, 'Fashion good'), obj(110, 110, 480, 480, 'Fashion good')], 1000, 1000);
    expect(products).toHaveLength(1);
    expect(products[0].box.w).toBeCloseTo(0.5);
  });
  it('au plus 5 produits', () => {
    const many = Array.from({ length: 8 }, (_, i) => obj((i % 4) * 250, Math.floor(i / 4) * 500, 240, 480));
    expect(toDetectedProducts(many, 1000, 1000)).toHaveLength(MAX_PRODUCTS);
  });
  it('entrée vide ou nulle → aucun produit', () => {
    expect(toDetectedProducts(null, 100, 100)).toEqual([]);
    expect(toDetectedProducts([], 100, 100)).toEqual([]);
  });
  it('libellé le plus sûr retenu', () => {
    const [product] = toDetectedProducts([{ ...obj(0, 0, 500, 500), labels: [{ text: 'Food', confidence: 0.3 }, { text: 'Home good', confidence: 0.9 }] }], 1000, 1000);
    expect(product.category).toBe('home');
  });
});

describe('toFileUrl', () => {
  it('le module natif lit une URL : chemin nu → file://', () => {
    expect(toFileUrl('/data/user/0/x.jpg')).toBe('file:///data/user/0/x.jpg');
    expect(toFileUrl('file:///data/x.jpg')).toBe('file:///data/x.jpg');
    expect(toFileUrl('content://media/1')).toBe('content://media/1');
  });
});

describe('garde-fous du branchement', () => {
  const wrapper = readFileSync(path.resolve(__dirname, '../src/features/lens/onDeviceDetection.ts'), 'utf8');
  const pkg = JSON.parse(readFileSync(path.resolve(__dirname, '../package.json'), 'utf8'));
  it('module natif chargé paresseusement, jamais d’exception qui sort', () => {
    expect(wrapper).toContain("require('@infinitered/react-native-mlkit-object-detection')");
    expect(wrapper).not.toMatch(/^import .*mlkit/m);
    expect(wrapper).toContain('return withTimeout(work, timeoutMs, []);');
  });
  it('dépendance épinglée (version exacte)', () => {
    expect(pkg.dependencies['@infinitered/react-native-mlkit-object-detection']).toBe('5.0.0');
  });
});
