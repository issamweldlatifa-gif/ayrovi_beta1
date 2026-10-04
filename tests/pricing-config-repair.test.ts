import { afterAll, describe, expect, test } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { QatafoDatabase } from '../src/db/database';
import { calculatePrice } from '../src/services/pricing';

const SEED_RATES = { eur: 3.370911, usd: 2.943498, gbp: 3.929098, jpy: 0.018701 };
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* cleanup best-effort */ }
  }
});

function createDbPath(): { dir: string; file: string } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ayrovi-pricing-repair-'));
  tempDirs.push(dir);
  return { dir, file: path.join(dir, 'pricing.sqlite') };
}

describe('pricing_config startup repair', () => {
  test('repairs only the invalid live currency and leaves other valid rates untouched', () => {
    const { file } = createDbPath();
    const firstBoot = new QatafoDatabase(file);
    firstBoot.run(
      `UPDATE pricing_config
       SET rate_eur=?, rate_usd=?, rate_gbp=?, rate_jpy=?, fx_source='live', fx_updated_at=?
       WHERE id='default'`,
      3.41, 0, 4.02, 0.0191, '2026-10-03T00:00:00.000Z',
    );
    const versionBeforeRestart = firstBoot.getPricingRules().version;
    firstBoot.close();

    const restarted = new QatafoDatabase(file);
    try {
      const rules = restarted.getPricingRules();
      expect(rules.rateEUR).toBe(3.41);
      expect(rules.rateUSD).toBe(SEED_RATES.usd);
      expect(rules.rateGBP).toBe(4.02);
      expect(rules.rateJPY).toBe(0.0191);
      expect(rules.fxSource).toBe('seed');
      expect(rules.fxUpdatedAt).toBe('');
      expect(rules.version).toBe(versionBeforeRestart + 1);

      // The originally failing Amazon.com/USD quote becomes calculable after boot.
      const quote = calculatePrice(rules, 107.98, 'USD');
      expect(quote).not.toBeNull();
      expect(quote!.totalTND).toBeGreaterThan(0);
    } finally {
      restarted.close();
    }
  });

  test('repairs a bad manual field without replacing the other manual rates or clearing its source', () => {
    const { file } = createDbPath();
    const firstBoot = new QatafoDatabase(file);
    firstBoot.run(
      `UPDATE pricing_config
       SET rate_eur=?, rate_usd=?, rate_gbp=?, rate_jpy=?, fx_source='manual', fx_updated_at=?
       WHERE id='default'`,
      3.51, 0, 4.12, 0.0202, 'manual-stamp',
    );
    firstBoot.close();

    const restarted = new QatafoDatabase(file);
    try {
      const rules = restarted.getPricingRules();
      expect(rules.rateEUR).toBe(3.51);
      expect(rules.rateUSD).toBe(SEED_RATES.usd);
      expect(rules.rateGBP).toBe(4.12);
      expect(rules.rateJPY).toBe(0.0202);
      expect(rules.fxSource).toBe('manual');
      expect(rules.fxUpdatedAt).toBe('manual-stamp');
    } finally {
      restarted.close();
    }
  });
});
