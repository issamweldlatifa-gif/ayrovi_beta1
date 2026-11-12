/**
 * AYWEBs — lots de capture spécialisés par boutique (12/11/2026).
 *
 * Contrat : le cœur partagé reste la SOURCE unique, mais une boutique
 * enregistrée ne reçoit plus que son lot (`kernel`, `shein`, `temu`,
 * `aliexpress`) : le code des AUTRES places de marché en est absent. Une retouche
 * SHEIN ne change donc ni le lot de Sephora/Primark (kernel) ni celui de TEMU.
 *
 * L'équivalence comportementale (lot ≡ cœur sur les pages de sa boutique) est
 * prouvée par le mode différentiel : `AYWEBS_BUNDLE_DIFF=1 npx vitest run tests/aywebs-`
 * (étape CI dédiée) — chaque page de la suite de capture est rejouée.
 */
import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  AYWEBS_CAPTURE_BUNDLE_FLAGS,
  buildAyWebsCaptureBundles,
  loadAyWebsCaptureCore,
  renderGeneratedModule,
  specializeAyWebsCaptureCore,
} from '../scripts/build-aywebs-capture-bundles.mjs';
import { AYWEBS_CAPTURE_BUNDLES, AYWEBS_CAPTURE_BUNDLE_SOURCE_SHA256 } from '../src/aywebs/captureBundles.generated';
import { AYWEBS_CAPTURE_SCRIPT, buildAyWebsCaptureScript, describeAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { QatafoDatabase } from '../src/db/database';

const sha = (text: string) => createHash('sha256').update(text).digest('hex');

/** Fonctions propres à une place de marché : leur présence dit quel code un lot embarque. */
const MARKERS = {
  shein: 'function sheinEnsureState(',
  temu: 'function temuEnsureState(',
  aliexpress: 'function aeEnsureState(',
  amazon: 'function collectAmazonEvidence(',
} as const;

describe('génération — une seule source, des lots dérivés et à jour', () => {
  it('le fichier généré correspond EXACTEMENT au cœur actuel (sinon : npm run aywebs:bundles)', async () => {
    expect(AYWEBS_CAPTURE_BUNDLE_SOURCE_SHA256).toBe(sha(AYWEBS_CAPTURE_SCRIPT));
    const fresh = await buildAyWebsCaptureBundles();
    expect(renderGeneratedModule(fresh)).toBe(readFileSync(join(process.cwd(), 'src/aywebs/captureBundles.generated.ts'), 'utf8'));
  }, 60_000);

  it('chaque lot est ES5 pur, sans accent grave, et nettement plus petit que le cœur', () => {
    for (const [id, bundle] of Object.entries(AYWEBS_CAPTURE_BUNDLES)) {
      expect(bundle.text, id).not.toMatch(/\bconst\b|\blet\b|=>/);
      expect(bundle.text, id).not.toContain('`');
      expect(bundle.sha256, id).toBe(sha(bundle.text));
      expect(bundle.bytes, id).toBeLessThan(AYWEBS_CAPTURE_SCRIPT.length * 0.6);
    }
    // Le noyau (Sephora, Primark, boutiques génériques) : moins d'un quart du cœur.
    expect(AYWEBS_CAPTURE_BUNDLES.kernel.bytes).toBeLessThan(AYWEBS_CAPTURE_SCRIPT.length * 0.25);
  });

  it('chaque lot n’embarque QUE le code de sa boutique', () => {
    const presence = (text: string) => Object.fromEntries(Object.entries(MARKERS).map(([id, marker]) => [id, text.includes(marker)]));
    expect(presence(AYWEBS_CAPTURE_SCRIPT)).toEqual({ shein: true, temu: true, aliexpress: true, amazon: true });
    expect(presence(AYWEBS_CAPTURE_BUNDLES.kernel.text)).toEqual({ shein: false, temu: false, aliexpress: false, amazon: false });
    expect(presence(AYWEBS_CAPTURE_BUNDLES.shein.text)).toEqual({ shein: true, temu: false, aliexpress: false, amazon: false });
    expect(presence(AYWEBS_CAPTURE_BUNDLES.temu.text)).toEqual({ shein: false, temu: true, aliexpress: false, amazon: false });
    expect(presence(AYWEBS_CAPTURE_BUNDLES.aliexpress.text)).toEqual({ shein: false, temu: false, aliexpress: true, amazon: false });
  });
});

describe('rayon d’impact — une retouche d’une boutique ne touche pas les autres', () => {
  it('modifier une fonction SHEIN ne change que le lot SHEIN', async () => {
    const core = await loadAyWebsCaptureCore();
    const marker = 'function sheinEnsureState() {';
    expect(core).toContain(marker);
    const touched = core.replace(marker, `${marker}\n    var __sheinOnlyProbe = 1; if (__sheinOnlyProbe > 1) return null;`);
    for (const [id, flags] of Object.entries(AYWEBS_CAPTURE_BUNDLE_FLAGS)) {
      const text = specializeAyWebsCaptureCore(touched, flags);
      if (id === 'shein') expect(text).not.toBe(AYWEBS_CAPTURE_BUNDLES.shein.text);
      else expect(text, id).toBe(AYWEBS_CAPTURE_BUNDLES[id as keyof typeof AYWEBS_CAPTURE_BUNDLES].text);
    }
  }, 60_000);

  it('le générateur refuse un drapeau de boutique réaffecté (il ne peut pas le fixer sans changer le comportement)', () => {
    const source = '(function () { var IS_SHEIN = /shein/.test(location.hostname); IS_SHEIN = true; return IS_SHEIN ? "a" : "b"; })()';
    expect(() => specializeAyWebsCaptureCore(source, ['IS_SHEIN'])).toThrow(/réaffecté/);
  });

  it('ne retire jamais une déclaration encore référencée, même dans une branche vivante', () => {
    const source = '(function () { var IS_TEMU = /temu/.test(location.hostname); function shared() { return 42; } function temuOnly() { return shared() + 1; } var x = IS_TEMU ? temuOnly() : shared(); return String(x); })()';
    const kernel = specializeAyWebsCaptureCore(source, ['IS_TEMU']);
    expect(kernel).not.toContain('temuOnly');
    expect(kernel).toContain('function shared()');
    // eslint-disable-next-line no-new-func
    expect(new Function('location', `return ${kernel}`)({ hostname: 'shop.example' })).toBe('42');
  });
});

describe('service — chaque boutique reçoit son lot, le reste ne bouge pas', () => {
  it.each([
    ['shein', 'shein'], ['temu', 'temu'], ['aliexpress', 'aliexpress'],
    ['sephora', 'kernel'], ['primark', 'kernel'], ['walmart', 'kernel'], ['asos', 'kernel'],
  ])('%s → lot %s, dans l’enveloppe commune', (storeId, bundle) => {
    const served = describeAyWebsCaptureScript(storeId);
    expect(served.bundle).toBe(bundle);
    expect(served.text).toContain(AYWEBS_CAPTURE_BUNDLES[bundle as keyof typeof AYWEBS_CAPTURE_BUNDLES].text);
    expect(served.text).not.toContain(AYWEBS_CAPTURE_SCRIPT.trim().replace(/[\s;]+$/, ''));
    expect(served.text).toContain(`"storeId":"${storeId}"`);
    expect(served.sha256).toBe(sha(served.text));
  });

  it('Amazon et Zalando gardent leur script dédié ; sans boutique, le bundle historique complet', () => {
    expect(describeAyWebsCaptureScript('amazon').bundle).toBe('dedicated:amazon');
    expect(describeAyWebsCaptureScript('zalando').bundle).toBe('dedicated:zalando');
    expect(buildAyWebsCaptureScript()).toBe(AYWEBS_CAPTURE_SCRIPT);
    expect(describeAyWebsCaptureScript('boutique-inconnue').bundle).toBe('legacy');
    expect(describeAyWebsCaptureScript('boutique-inconnue').text).toBe(AYWEBS_CAPTURE_SCRIPT);
  });

  it('GET /capture/script.js annonce le lot et son empreinte', async () => {
    const app = express();
    app.use((req, _res, next) => { (req as any).requestId = 'bundle-headers'; next(); });
    app.use('/api/v1/aywebs', createAyWebsRouter(new QatafoDatabase(':memory:'), {} as any));
    const sephora = await request(app).get('/api/v1/aywebs/capture/script.js?store_id=sephora');
    expect(sephora.status).toBe(200);
    expect(sephora.headers['x-aywebs-capture-bundle']).toBe('kernel');
    expect(sephora.headers['x-aywebs-capture-hash']).toBe(sha(sephora.text).slice(0, 16));
    const shein = await request(app).get('/api/v1/aywebs/capture/script.js?store_id=shein');
    expect(shein.headers['x-aywebs-capture-bundle']).toBe('shein');
    const legacy = await request(app).get('/api/v1/aywebs/capture/script.js');
    expect(legacy.headers['x-aywebs-capture-bundle']).toBe('legacy');
    expect(legacy.text).toBe(AYWEBS_CAPTURE_SCRIPT);
  });
});
