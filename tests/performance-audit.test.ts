import { expect, it } from 'vitest';
import { buildSync } from 'esbuild';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
it('runs the diagnostic against isolated synthetic data and reports measured, bounded workloads', async () => {
  buildSync({ entryPoints: ['verify/performance-audit.ts'], bundle: true, platform: 'node', format: 'cjs', packages: 'external', outfile: '.cache/performance-test.cjs', logLevel: 'error' });
  await promisify(execFile)(process.execPath, ['.cache/performance-test.cjs', '--quick'], { timeout: 30_000 });
  const report = JSON.parse(fs.readFileSync('.cache/performance-audit-quick.json', 'utf8'));
  expect(report.environment.mode).toContain('in-memory SQLite');
  expect(report.phases.map((phase: any) => phase.syntheticReels)).toEqual([100, 1000]);
  for (const phase of report.phases) {
    expect(phase.cases).toHaveLength(10);
    for (const item of phase.cases) {
      expect(item.p95Ms).toBeGreaterThanOrEqual(0);
      expect(item.requests).toBe(4);
      expect(item.sqlCalls).toBeGreaterThan(0);
    }
    expect(phase.cases.find((item: any) => item.endpoint.endsWith('limit=12')).responseBytes).toBeLessThan(phase.cases.find((item: any) => item.endpoint.endsWith('/reels')).responseBytes);
  }
  expect(report.images.same.fetchCalls).toBe(1);
  expect(report.images.distinct.fetchCalls).toBe(8);
  expect(report.plans.reels[0].detail).toContain('idx_reels_public_page');
}, 40_000);
