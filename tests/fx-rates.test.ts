import { afterAll, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QatafoDatabase } from '../src/db/database';
import { parseFxSnapshot, refreshFxRates } from '../src/services/fxRates';

/**
 * Taux de change LIVE (audit pricing 23/09/2026) — hermétique : aucun appel réseau,
 * le fetcher est injecté. Vérifie : parsing + dérivation des taux, bandes de sanité,
 * application versionnée, re-tarification des produits et respect de la saisie manuelle.
 */

const sampleApiPayload = (tnd = 3.370911) => ({
  result: 'success',
  provider: 'https://www.exchangerate-api.com',
  base_code: 'EUR',
  rates: { EUR: 1, TND: tnd, USD: 1.145206, GBP: 0.857935, JPY: 180.257717 },
  time_last_update_utc: 'Wed, 23 Sep 2026 00:02:31 +0000',
});

const tmpDirs: string[] = [];
afterAll(() => { for (const dir of tmpDirs) { try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } } });

function freshDb(): QatafoDatabase {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-fx-'));
  tmpDirs.push(dir);
  return new QatafoDatabase(path.join(dir, 'fx.sqlite'));
}

describe('FX live rates service', () => {
  test('parseFxSnapshot derives TND-per-currency rates from a base-EUR payload', () => {
    const snapshot = parseFxSnapshot(sampleApiPayload());
    expect(snapshot).not.toBeNull();
    expect(snapshot!.rateEUR).toBe(3.370911);
    expect(snapshot!.rateUSD).toBeCloseTo(2.943498, 6);
    expect(snapshot!.rateGBP).toBeCloseTo(3.929098, 6);
    expect(snapshot!.rateJPY).toBeCloseTo(0.018701, 6);
    expect(snapshot!.provider).toContain('exchangerate-api');
  });

  test('parseFxSnapshot rejects malformed or insane payloads', () => {
    expect(parseFxSnapshot(null)).toBeNull();
    expect(parseFxSnapshot({ rates: {} })).toBeNull();
    expect(parseFxSnapshot({ rates: { TND: 3.37 } })).toBeNull(); // USD/GBP/JPY absents
    expect(parseFxSnapshot(sampleApiPayload(50))).toBeNull();     // TND aberrant → bande de sanité
    expect(parseFxSnapshot(sampleApiPayload(0.1))).toBeNull();    // trop faible
  });

  test('refreshFxRates applies live rates, bumps the version and re-prices products', async () => {
    const db = freshDb();
    const before = db.getPricingRules();
    expect(before.fxSource).toBe('seed');
    db.run(`INSERT INTO products (id,name,original_price,currency,converted_price,customs_fee,shipping_fee,service_fee,final_price,created_at,updated_at)
      VALUES ('fx_prod_1','Sneakers marque X',50,'EUR',0,0,0,0,0,'2026-09-23T00:00:00.000Z','2026-09-23T00:00:00.000Z')`);
    const outcome = await refreshFxRates(db, { fetcher: async () => sampleApiPayload() });
    expect(outcome.applied).toBe(true);
    // La base fraîche embarque une fiche démo + la nôtre : tout est re-tarifié.
    const productCount = db.all<any>('SELECT id FROM products').length;
    expect(outcome.repriced).toBe(productCount);
    expect(outcome.repriced).toBeGreaterThanOrEqual(1);
    const after = db.getPricingRules();
    expect(after.version).toBe(before.version + 1);
    expect(after.fxSource).toBe('live');
    expect(after.fxUpdatedAt).not.toBe('');
    expect(after.rateEUR).toBeCloseTo(3.370911, 6);
    // 50 € × (3.370911 × 1.03) — le produit est recalculé au taux marché.
    expect(db.get<any>('SELECT converted_price FROM products WHERE id=?', 'fx_prod_1').converted_price).toBeCloseTo(173.602, 2);
    // Une trace d'audit ERP existe pour cette mise à jour automatique.
    expect(db.get<any>("SELECT COUNT(*) n FROM audit_logs WHERE module='PRICING'").n).toBeGreaterThan(0);
  });

  test('manual rate entry suspends automatic sync until an explicit refresh', async () => {
    const db = freshDb();
    db.run("UPDATE pricing_config SET fx_source='manual', fx_updated_at=? WHERE id='default'", new Date().toISOString());
    const suspended = await refreshFxRates(db, { fetcher: async () => sampleApiPayload() });
    expect(suspended.applied).toBe(false);
    expect(suspended.reason).toBe('manual');
    expect(db.getPricingRules().fxSource).toBe('manual'); // rien n'a bougé

    const forced = await refreshFxRates(db, { force: true, fetcher: async () => sampleApiPayload() });
    expect(forced.applied).toBe(true);
    expect(db.getPricingRules().fxSource).toBe('live');
  });

  test('fresh live rates are not re-fetched within the interval', async () => {
    const db = freshDb();
    const first = await refreshFxRates(db, { fetcher: async () => sampleApiPayload() });
    expect(first.applied).toBe(true);
    let calls = 0;
    const second = await refreshFxRates(db, { fetcher: async () => { calls += 1; return sampleApiPayload(); } });
    expect(second.applied).toBe(false);
    expect(second.reason).toBe('fresh');
    expect(calls).toBe(0); // pas même un appel réseau : la garde est avant le fetch
  });

  test('an insane API response keeps the current rates in place', async () => {
    const db = freshDb();
    const before = db.getPricingRules();
    const outcome = await refreshFxRates(db, { fetcher: async () => sampleApiPayload(50) });
    expect(outcome.applied).toBe(false);
    expect(outcome.reason).toBe('invalid');
    const after = db.getPricingRules();
    expect(after.rateEUR).toBe(before.rateEUR);
    expect(after.version).toBe(before.version);
  });
});
