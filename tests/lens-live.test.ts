import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { frameSignature, signatureDistance, liveObjectId } from '../client/src/ayrovix/services/liveScanner';
import { iou, trackObjects, LOCK_THRESHOLD } from '../client/src/ayrovix/services/liveVisionRuntime';

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
    const first = trackObjects([], [{ label: 'Nike', category: 'shoes', confidence: 80, box: boxA, candidates: [] }], t0);
    expect(first).toHaveLength(1);
    expect(first[0].status).toBe('locked'); // confidence >= LOCK_THRESHOLD
    const id = first[0].trackingId;

    // même objet frame suivante → garde le même trackingId (pas de doublon)
    const second = trackObjects(first, [{ label: 'Nike', category: 'shoes', confidence: 85, box: boxB, candidates: [] }], t0 + 2000);
    expect(second.some((o) => o.trackingId === id)).toBe(true);
    expect(second).toHaveLength(1);

    // objet perdu → status lost puis supprimé après MAX_MISSES (recovery)
    let lost = trackObjects(second, [], t0 + 4000);
    expect(lost.some((o) => o.trackingId === id && o.status === 'lost')).toBe(true);
    for (let i = 0; i < 5; i++) lost = trackObjects(lost, [], t0 + 5000 + i * 1000);
    expect(lost.some((o) => o.trackingId === id)).toBe(false);
    expect(LOCK_THRESHOLD).toBeGreaterThan(0);
  });
});
