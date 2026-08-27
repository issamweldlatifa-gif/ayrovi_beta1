import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/server';
import { frameSignature, signatureDistance, liveObjectId } from '../client/src/ayrovix/services/liveScanner';

const liveSource = readFileSync('client/src/ayrovix/components/LiveCamera.tsx', 'utf8');
const launcherSource = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');

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

  it('Live is an added input modality — existing modes untouched, no fake boxes, pricing not duplicated', () => {
    // les 5 modes existants restent câblés
    expect(launcherSource).toContain('onQrUrl');
    expect(launcherSource).toContain('onBarcode');
    expect(launcherSource).toContain('onLink');
    expect(launcherSource).toContain('runUrlAnalysis');
    // Live gating + résultats renvoyés vers le flow candidates existant
    expect(launcherSource).toContain('liveEnabled={liveEnabled}');
    expect(launcherSource).toContain('onLiveResults');
    expect(launcherSource).toContain('ayrovixLensLive');
    // réutilise le matching backend (analyzeImage), pas de moteur indépendant
    expect(liveSource).toContain('analyzeImage');
    // confirmation temporelle (verrou après 2 frames stables), pas de résultat à 1 frame
    expect(liveSource).toContain('confirmRef.current >= 2');
    // annulation / nettoyage (privacy + perf)
    expect(liveSource).toContain('pendingAbortRef.current?.abort()');
    expect(liveSource).toContain('getTracks().forEach((t) => t.stop())');
    // aucun calcul de prix côté client (le pricing vient du Core Engine via candidates)
    expect(liveSource).not.toContain('rateEUR');
    expect(liveSource).not.toContain('exchangeRate *');
  });
});
