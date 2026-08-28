import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { frameSignature, signatureDistance, liveObjectId } from '../client/src/ayrovix/services/liveScanner';
import { iou, trackObjects, adaptiveNextInterval, computeCropRect, LOCK_THRESHOLD, PREDICT_FRAMES } from '../client/src/ayrovix/services/liveVisionRuntime';
import { loadLocalDetector } from '../client/src/ayrovix/services/localDetector';
import { grayToFeatures } from '../client/src/ayrovix/services/liveVisionRuntime';

const liveSource = readFileSync('client/src/ayrovix/components/LiveCamera.tsx', 'utf8');
const launcherSource = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');
const runtimeSource = readFileSync('client/src/ayrovix/services/liveVisionRuntime.ts', 'utf8');

describe('AYROVIX LENS — LIVE multi-product vision (flag-gated, reuses existing engines)', () => {
  it('exposes the LIVE feature flag via commerce-config (env-driven)', async () => {
    const res = await request(app).get('/api/public/commerce-config');
    expect(res.status).toBe(200);
    // NODE_ENV=test !== production → défaut activé ; en prod il faut le flag explicite
    expect(res.body.data.features).toHaveProperty('ayrovixLensLive');
    expect(typeof res.body.data.features.ayrovixLensLive).toBe('boolean');
  });

  it('frame signature helpers are deterministic and distance sane', () => {
    // pas de DOM canvas en Node : on vérifie surtout la distance + id
    expect(signatureDistance('', 'abc')).toBe(1);
    expect(signatureDistance('1010', '1010')).toBe(0);
    expect(signatureDistance('1111', '0000')).toBe(1);
    expect(liveObjectId('Nike Dunk')).toBe(liveObjectId('Nike Dunk'));
    expect(liveObjectId('Nike Dunk')).not.toBe(liveObjectId('Adidas Gazelle'));
  });

  it('Live is wired to the LiveVisionRuntime over the existing architecture (no redesign, no duplicate pricing)', () => {
    // les 5 modes existants restent câblés
    expect(launcherSource).toContain('onQrUrl');
    expect(launcherSource).toContain('onBarcode');
    expect(launcherSource).toContain('onLink');
    expect(launcherSource).toContain('runUrlAnalysis');
    // Live gating + résultats renvoyés vers le flow candidates existant
    expect(launcherSource).toContain('liveEnabled={liveEnabled}');
    expect(launcherSource).toContain('onLiveResults');
    expect(launcherSource).toContain('ayrovixLensLive');
    // La caméra consomme le runtime (start/stop selon le mode), sans re-ouvrir le stream
    expect(liveSource).toContain('LiveVisionRuntime');
    expect(liveSource).toContain('runtime.start()');
    expect(liveSource).toContain('runtime.stop()');
    expect(liveSource).toContain('role="tablist"'); // sélecteur PHOTO|VIDÉO présent
    // Le runtime réutilise le matching backend + graceful degradation
    expect(runtimeSource).toContain('analyzeImage');
    expect(runtimeSource).toContain('ai-unavailable');
    expect(runtimeSource).toContain('getVideo');
    // aucun calcul de prix côté client (le pricing vient du Core Engine via candidates)
    expect(liveSource).not.toContain('rateEUR');
    expect(runtimeSource).not.toContain('rateEUR');
  });

  it('tracker: IoU matching, temporal confidence and loss/recovery', () => {
    const boxA = { x: 0.2, y: 0.2, w: 0.3, h: 0.4 };
    const boxB = { x: 0.21, y: 0.21, w: 0.3, h: 0.4 }; // même objet, léger décalage
    expect(iou(boxA, boxA)).toBeCloseTo(1, 5);
    expect(iou(boxA, boxB)).toBeGreaterThan(0.7);
    expect(iou(boxA, { x: 0.8, y: 0.8, w: 0.1, h: 0.1 })).toBe(0);

    const t0 = Date.now();
    const first = trackObjects([], [{ label: 'Nike', category: 'shoes', confidence: 80, box: boxA, color: [], pattern: null, material: null, brand: null, subcategory: null, visualFeatures: [], candidates: [] }], t0);
    expect(first).toHaveLength(1);
    expect(first[0].status).toBe('locked'); // confidence >= LOCK_THRESHOLD
    const id = first[0].trackingId;

    // même objet frame suivante → garde le même trackingId (pas de doublon)
    const second = trackObjects(first, [{ label: 'Nike', category: 'shoes', confidence: 85, box: boxB, color: [], pattern: null, material: null, brand: null, subcategory: null, visualFeatures: [], candidates: [] }], t0 + 2000);
    expect(second.some((o) => o.trackingId === id)).toBe(true);
    expect(second).toHaveLength(1);

    // PREDICT: عند الغياب المؤقت يبقى tracking (تنبؤ بالحركة) قبل الـ lost
    let cur = second;
    for (let i = 0; i < PREDICT_FRAMES; i++) {
      cur = trackObjects(cur, [], t0 + 3000 + i * 500);
      const o = cur.find((x) => x.trackingId === id);
      expect(o?.status).toBe('tracking');
    }
    // ثم lost (recovery window) ثم إزالة بعد MAX_MISSES
    cur = trackObjects(cur, [], t0 + 5000);
    expect(cur.some((o) => o.trackingId === id && o.status === 'lost')).toBe(true);
    for (let i = 0; i < 5; i++) cur = trackObjects(cur, [], t0 + 6000 + i * 1000);
    expect(cur.some((o) => o.trackingId === id)).toBe(false);
    expect(LOCK_THRESHOLD).toBeGreaterThan(0);
  });

  it('adaptive inference interval slows on latency and speeds on capability', () => {
    expect(adaptiveNextInterval(2200, 3000)).toBeGreaterThan(2200); // بطيء → أبطأ
    expect(adaptiveNextInterval(2200, 200)).toBeLessThan(2200);      // سريع → أسرع
    expect(adaptiveNextInterval(2200, 800)).toBe(2200);              // متوسط → ثابت
    expect(adaptiveNextInterval(4000, 9000)).toBeLessThanOrEqual(4000); // سقف 4000
    expect(adaptiveNextInterval(1200, 10)).toBeGreaterThanOrEqual(1200); // أرضية 1200
  });

  it('computeCropRect clamps the crop inside the canvas with a minimum size', () => {
    const r = computeCropRect(512, 512, { x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(r).toEqual({ x: 128, y: 128, w: 256, h: 256 });
    // خارج الحدود → مقيّد داخل الـ canvas
    const clamped = computeCropRect(100, 100, { x: 0.9, y: 0.9, w: 0.5, h: 0.5 });
    expect(clamped.x).toBeLessThanOrEqual(99);
    expect(clamped.y).toBeLessThanOrEqual(99);
    expect(clamped.x + clamped.w).toBeLessThanOrEqual(100);
    expect(clamped.y + clamped.h).toBeLessThanOrEqual(100);
    // صغير جدًا → حد أدنى 32px
    const tiny = computeCropRect(512, 512, { x: 0.5, y: 0.5, w: 0.01, h: 0.01 });
    expect(tiny.w).toBeGreaterThanOrEqual(32);
    expect(tiny.h).toBeGreaterThanOrEqual(32);
  });

  it('local on-device detector degrades gracefully when unavailable (no DOM/CDN)', async () => {
    // في بيئة بدون window (Node) يجب أن يرفض التحميل بأناقة دون انهيار
    await expect(loadLocalDetector()).rejects.toThrow();
  });

  it('multi-product intelligence: tracks multiple independent product instances in one scene', () => {
    const t0 = Date.now();
    const rawScene = [
      { label: 'T-shirt Graphic Noir', category: 'clothing', subcategory: 't-shirt', brand: 'Zara', confidence: 92, box: { x: 0.2, y: 0.1, w: 0.6, h: 0.3 }, color: ['black'], pattern: 'graphic', material: 'cotton', visualFeatures: [0.1, 0.2], candidates: [] },
      { label: 'Jean Slim Bleu', category: 'clothing', subcategory: 'jeans', brand: 'Levi\'s', confidence: 88, box: { x: 0.2, y: 0.4, w: 0.6, h: 0.35 }, color: ['blue'], pattern: 'denim', material: 'denim', visualFeatures: [0.3, 0.4], candidates: [] },
      { label: 'Sneakers Blanches', category: 'shoes', subcategory: 'sneakers', brand: 'Nike', confidence: 95, box: { x: 0.25, y: 0.75, w: 0.5, h: 0.2 }, color: ['white'], pattern: 'solid', material: 'leather', visualFeatures: [0.5, 0.6], candidates: [] },
      { label: 'Sac Bandoulière', category: 'bags', subcategory: 'crossbody', brand: 'Guess', confidence: 85, box: { x: 0.65, y: 0.25, w: 0.25, h: 0.3 }, color: ['brown'], pattern: 'monogram', material: 'leather', visualFeatures: [0.7, 0.8], candidates: [] },
    ];

    const tracked = trackObjects([], rawScene, t0);
    expect(tracked).toHaveLength(4);

    // كل عنصر له معرف مستقل وبياناته النموذجية كاملة
    const tshirt = tracked.find((o) => o.subcategory === 't-shirt');
    const jeans = tracked.find((o) => o.subcategory === 'jeans');
    const shoes = tracked.find((o) => o.subcategory === 'sneakers');
    const bag = tracked.find((o) => o.subcategory === 'crossbody');

    expect(tshirt).toBeDefined();
    expect(tshirt?.brand).toBe('Zara');
    expect(tshirt?.status).toBe('locked');
    expect(tshirt?.color).toContain('black');

    expect(jeans).toBeDefined();
    expect(jeans?.brand).toBe('Levi\'s');

    expect(shoes).toBeDefined();
    expect(shoes?.brand).toBe('Nike');

    expect(bag).toBeDefined();
    expect(bag?.brand).toBe('Guess');

    // تتبع في الفريم التالي مع تعديل طفيف للمواقع
    const t1 = t0 + 1500;
    const nextFrame = [
      { label: 'T-shirt Graphic Noir', category: 'clothing', subcategory: 't-shirt', brand: 'Zara', confidence: 94, box: { x: 0.21, y: 0.11, w: 0.6, h: 0.3 }, color: ['black'], pattern: 'graphic', material: 'cotton', visualFeatures: [0.1, 0.2], candidates: [] },
      { label: 'Jean Slim Bleu', category: 'clothing', subcategory: 'jeans', brand: 'Levi\'s', confidence: 90, box: { x: 0.21, y: 0.41, w: 0.6, h: 0.35 }, color: ['blue'], pattern: 'denim', material: 'denim', visualFeatures: [0.3, 0.4], candidates: [] },
      { label: 'Sneakers Blanches', category: 'shoes', subcategory: 'sneakers', brand: 'Nike', confidence: 96, box: { x: 0.25, y: 0.76, w: 0.5, h: 0.2 }, color: ['white'], pattern: 'solid', material: 'leather', visualFeatures: [0.5, 0.6], candidates: [] },
      { label: 'Sac Bandoulière', category: 'bags', subcategory: 'crossbody', brand: 'Guess', confidence: 88, box: { x: 0.66, y: 0.26, w: 0.25, h: 0.3 }, color: ['brown'], pattern: 'monogram', material: 'leather', visualFeatures: [0.7, 0.8], candidates: [] },
    ];

    const updated = trackObjects(tracked, nextFrame, t1);
    expect(updated).toHaveLength(4);
    expect(updated.map((o) => o.trackingId)).toEqual(tracked.map((o) => o.trackingId));
  });

  it('grayToFeatures produces a normalized, deterministic visual signature', () => {
    const f = grayToFeatures([0, 64, 128, 255]);
    expect(f[0]).toBe(0);
    expect(f[f.length - 1]).toBe(1);
    expect(grayToFeatures([0, 64, 128, 255])).toEqual(f);
    expect(grayToFeatures([])).toEqual([]);
  });
});
