/**
 * AYWEBs — pilotage de la capture par boutique (12/11/2026).
 *
 *  1. compteurs horaires DURABLES et alerte « < 80 % sur 24 h » (échantillon minimal) ;
 *  2. coupe-circuit `paused` : même effet que AYWEBS_<BOUTIQUE>_CAPTURE_ENABLED=false ;
 *  3. retour arrière `core` : la boutique reçoit le cœur partagé complet ;
 *  4. chaque capture jugée par le résolveur est comptée pour SA boutique ;
 *  5. endpoints CRM (santé, contrôle, audit) derrière la permission d'approbation.
 */
import express from 'express';
import request from 'supertest';
import { JSDOM } from 'jsdom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QatafoDatabase } from '../src/db/database';
import {
  ayWebsCaptureControlMode,
  ayWebsCaptureHealth,
  recordAyWebsCaptureOutcome,
  resetAyWebsCaptureControlCache,
  setAyWebsCaptureControl,
} from '../src/aywebs/captureControl';
import { createAyWebsContext, createStoreCaptureGate, ayWebsFeatureFlags } from '../src/aywebs/context';
import { createAyWebsRouter } from '../src/aywebs/routes';
import { AYWEBS_CAPTURE_SCRIPT, describeAyWebsCaptureScript } from '../src/aywebs/captureScript';
import { resolveAyWebsProduct } from '../src/aywebs/productResolver';
import { ayWebsCaptureStoreKey } from '../src/aywebs/webviewCapture';
import { listAyWebsAudit } from '../src/aywebs/events';
import { findAyWebsStore } from '../shared/aywebsStores';

const NOW = new Date('2026-11-12T15:30:00Z');

function fresh(): QatafoDatabase {
  const db = new QatafoDatabase(':memory:');
  resetAyWebsCaptureControlCache(db);
  return db;
}

function record(db: QatafoDatabase, storeKey: string, accepted: number, rejected: number, at = NOW, rejection = 'PRICE_NOT_CORROBORATED') {
  for (let i = 0; i < accepted; i++) recordAyWebsCaptureOutcome(db, { storeKey, accepted: true, at });
  for (let i = 0; i < rejected; i++) recordAyWebsCaptureOutcome(db, { storeKey, accepted: false, rejection, at });
}

describe('compteurs horaires et alerte de santé', () => {
  it('taux par boutique, motifs principaux, alerte sous 80 % avec un échantillon suffisant', () => {
    const db = fresh();
    record(db, 'registre:sephora', 15, 10);           // 60 % sur 25 → alerte
    record(db, 'registre:shein', 45, 5);              // 90 % → saine
    record(db, 'registre:temu', 2, 8);                // 20 % mais 10 captures → pas d'alerte (échantillon)
    record(db, 'registre:sephora', 0, 3, NOW, 'AMBIGUOUS_PRICE');
    const health = ayWebsCaptureHealth(db, { now: NOW });
    const sephora = health.stores.find((row) => row.store_key === 'registre:sephora')!;
    expect(sephora).toMatchObject({ store_id: 'sephora', validated: 28, accepted: 15, rejected: 13, alert: true, control: 'auto' });
    expect(sephora.acceptance_rate).toBeCloseTo(0.536, 3);
    expect(sephora.top_rejections[0]).toEqual({ code: 'PRICE_NOT_CORROBORATED', count: 10 });
    expect(sephora.top_rejections[1]).toEqual({ code: 'AMBIGUOUS_PRICE', count: 3 });
    expect(health.stores.find((row) => row.store_key === 'registre:shein')!.alert).toBe(false);
    expect(health.stores.find((row) => row.store_key === 'registre:temu')!.alert).toBe(false);
    expect(health.alerts.map((row) => row.store_key)).toEqual(['registre:sephora']);
    expect(health.stores[0].store_key).toBe('registre:sephora');
  });

  it('fenêtre glissante : les captures de plus de 24 h sortent du calcul', () => {
    const db = fresh();
    record(db, 'registre:sephora', 0, 30, new Date(NOW.getTime() - 30 * 3_600_000));
    record(db, 'registre:sephora', 20, 2, NOW);
    const row = ayWebsCaptureHealth(db, { now: NOW }).stores[0];
    expect(row).toMatchObject({ validated: 22, accepted: 20, alert: false });
    expect(ayWebsCaptureHealth(db, { now: NOW, windowHours: 48 }).stores[0]).toMatchObject({ validated: 52, alert: true });
  });

  it('clé de boutique hors vocabulaire rangée sous « autres » ; motifs bornés à 12 par heure', () => {
    const db = fresh();
    recordAyWebsCaptureOutcome(db, { storeKey: 'DROP TABLE;--', accepted: true, at: NOW });
    for (let i = 0; i < 20; i++) recordAyWebsCaptureOutcome(db, { storeKey: 'external', accepted: false, rejection: `CODE_${i}`, at: NOW });
    const health = ayWebsCaptureHealth(db, { now: NOW, minSamples: 1 });
    expect(health.stores.map((row) => row.store_key).sort()).toEqual(['autres', 'external']);
    const raw = db.get<{ rejections: string }>("SELECT rejections FROM ayweb_capture_hourly WHERE store_key='external'")!;
    const keys = Object.keys(JSON.parse(raw.rejections));
    expect(keys.length).toBe(13);
    expect(keys).toContain('autres');
  });

  it('la mesure ne casse jamais la capture (base indisponible ou absente)', () => {
    expect(() => recordAyWebsCaptureOutcome(null, { storeKey: 'external', accepted: true })).not.toThrow();
    const broken = { run: () => { throw new Error('disk full'); } } as unknown as QatafoDatabase;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => recordAyWebsCaptureOutcome(broken, { storeKey: 'external', accepted: true })).not.toThrow();
    expect(ayWebsCaptureControlMode(broken, 'sephora')).toBe('auto');
    warn.mockRestore();
  });
});

describe('coupe-circuit et retour arrière', () => {
  it('« paused » ferme la porte de capture de CETTE boutique seulement, avec audit', () => {
    const db = fresh();
    const gate = createStoreCaptureGate(ayWebsFeatureFlags(), db);
    const sephora = findAyWebsStore('sephora')!;
    const shein = findAyWebsStore('shein')!;
    expect(gate(sephora)).toBe(true);
    setAyWebsCaptureControl(db, { storeId: 'sephora', mode: 'paused', note: 'prix faux depuis la refonte', actorId: 'adm_1' });
    expect(gate(sephora)).toBe(false);
    expect(gate(shein)).toBe(true);
    expect(createAyWebsContext(db, {} as never).storeCaptureEnabled(sephora)).toBe(false);
    const audit = listAyWebsAudit(db, { resourceType: 'store' });
    expect(audit[0]).toMatchObject({ action: 'capture_control.set', resource_id: 'sephora', before_state: 'auto', after_state: 'paused', actor_id: 'adm_1' });
    setAyWebsCaptureControl(db, { storeId: 'sephora', mode: 'auto', actorId: 'adm_1' });
    expect(gate(sephora)).toBe(true);
  });

  it('identifiant ou mode invalide : refusé', () => {
    const db = fresh();
    expect(() => setAyWebsCaptureControl(db, { storeId: '../etc', mode: 'paused' })).toThrow('INVALID_STORE_ID');
    expect(() => setAyWebsCaptureControl(db, { storeId: 'sephora', mode: 'off' as never })).toThrow('INVALID_CAPTURE_MODE');
  });

  it('« core » : le script servi devient le cœur partagé complet (en-têtes compris)', async () => {
    const db = fresh();
    const app = express();
    app.use('/api/v1/aywebs', createAyWebsRouter(db, {} as never));
    const before = await request(app).get('/api/v1/aywebs/capture/script.js?store_id=shein');
    expect(before.headers['x-aywebs-capture-bundle']).toBe('shein');
    expect(before.headers['x-aywebs-capture-control']).toBe('auto');
    setAyWebsCaptureControl(db, { storeId: 'shein', mode: 'core', note: 'lot shein suspect', actorId: 'adm_1' });
    const after = await request(app).get('/api/v1/aywebs/capture/script.js?store_id=shein');
    expect(after.headers['x-aywebs-capture-bundle']).toBe('legacy');
    expect(after.headers['x-aywebs-capture-control']).toBe('core');
    expect(after.text).toBe(describeAyWebsCaptureScript(null).text);
    expect(after.text).toBe(AYWEBS_CAPTURE_SCRIPT);
    const other = await request(app).get('/api/v1/aywebs/capture/script.js?store_id=temu');
    expect(other.headers['x-aywebs-capture-bundle']).toBe('temu');
  });
});

describe('chaque capture jugée par le résolveur est comptée pour sa boutique', () => {
  beforeEach(() => { process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE = '0'; });
  afterEach(() => { delete process.env.AYWEBS_WEBVIEW_VERIFY_SAMPLE; });

  it('capture refusée (prix mono-source) ⇒ une ligne horaire rejetée avec son motif', async () => {
    const url = 'https://www.otto.de/p/bluetooth-kopfhoerer-123456789';
    const dom = new JSDOM('<!doctype html><html lang="de"><head><title>Kopfhörer | OTTO</title></head><body><h1>Kopfhörer</h1><div class="product-price">27,95 €</div><button>In den Warenkorb</button></body></html>', { url });
    const evaluate = new Function('document', 'location', 'URL', `return ${AYWEBS_CAPTURE_SCRIPT}`);
    const capture = JSON.parse(String(evaluate(dom.window.document, dom.window.location, URL)));
    const db = fresh();
    const scraper = { cleanPastedUrl: (value: string) => value.trim(), scrapeProduct: vi.fn(async () => { throw new Error('no scrape'); }) };
    const ctx = createAyWebsContext(db, scraper as never);
    await resolveAyWebsProduct(ctx.resolver, { url, sessionId: 'capture-control-0001', capture }).catch(() => undefined);
    const health = ayWebsCaptureHealth(db, { minSamples: 1 });
    expect(health.stores).toHaveLength(1);
    expect(health.stores[0]).toMatchObject({ store_key: ayWebsCaptureStoreKey(url), validated: 1, accepted: 0 });
    expect(health.stores[0].top_rejections[0].code).toBe('PRICE_NOT_CORROBORATED');
  });
});

describe('endpoints CRM', () => {
  it('santé, contrôle (note obligatoire), boutique inconnue, permission', async () => {
    const { app, db } = await import('../src/server');
    const agent = request.agent(app);
    const login = await agent.post('/api/admin/auth/login').send({ email: 'admin@ayrovi.tn', password: 'AyroviBeta2026!' });
    expect(login.status).toBe(200);
    const csrf = login.body.data.csrfToken as string;
    resetAyWebsCaptureControlCache(db);

    // L'endpoint lit l'horloge réelle (fenêtre glissante de 24 h) : enregistrer à l'heure courante, pas à NOW (fixe),
    // sinon le test expire 24 h après le 12/11/2026 15:30 UTC.
    record(db, 'registre:primark', 5, 20, new Date());
    const health = await agent.get('/api/admin/aywebs/capture/health');
    expect(health.status, JSON.stringify(health.body)).toBe(200);
    expect(health.body.data.alerts.map((row: { store_key: string }) => row.store_key)).toContain('registre:primark');
    expect(health.body.data.modes).toEqual(['auto', 'core', 'paused']);
    const sheinScript = health.body.data.scripts.find((row: { store_id: string }) => row.store_id === 'shein');
    expect(sheinScript).toMatchObject({ control: 'auto', bundle: 'shein' });

    const noNote = await agent.put('/api/admin/aywebs/capture/controls/primark').set('x-csrf-token', csrf).send({ mode: 'paused' });
    expect(noNote.status).toBe(400);
    expect(noNote.body.code).toBe('NOTE_REQUIRED');
    const badMode = await agent.put('/api/admin/aywebs/capture/controls/primark').set('x-csrf-token', csrf).send({ mode: 'off', note: 'x x x' });
    expect(badMode.body.code).toBe('INVALID_CAPTURE_MODE');
    const unknown = await agent.put('/api/admin/aywebs/capture/controls/nope-store').set('x-csrf-token', csrf).send({ mode: 'paused', note: 'test' });
    expect(unknown.status).toBe(404);

    const paused = await agent.put('/api/admin/aywebs/capture/controls/primark').set('x-csrf-token', csrf).send({ mode: 'paused', note: '75 % de refus depuis hier' });
    expect(paused.status, JSON.stringify(paused.body)).toBe(200);
    expect(paused.body.data).toMatchObject({ store_id: 'primark', mode: 'paused' });
    const after = await agent.get('/api/admin/aywebs/capture/health');
    expect(after.body.data.controls).toEqual(expect.arrayContaining([expect.objectContaining({ storeId: 'primark', mode: 'paused' })]));
    expect(after.body.data.alerts.find((row: { store_key: string }) => row.store_key === 'registre:primark').control).toBe('paused');
    const overview = await agent.get('/api/admin/aywebs/overview');
    expect(overview.body.data.capture_alerts.map((row: { store_key: string }) => row.store_key)).toContain('registre:primark');

    const restored = await agent.put('/api/admin/aywebs/capture/controls/primark').set('x-csrf-token', csrf).send({ mode: 'auto' });
    expect(restored.status).toBe(200);

    const anonymous = await request(app).put('/api/admin/aywebs/capture/controls/primark').send({ mode: 'paused', note: 'pirate' });
    expect([401, 403]).toContain(anonymous.status);
  });
});
