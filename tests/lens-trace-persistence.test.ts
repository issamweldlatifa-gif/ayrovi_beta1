// PERSISTANCE LENS PERF TRACES (24/09/2026) : le rapport admin p50/p95 doit
// survivre au redémarrage — le Map en mémoire (≤500) ne suffit plus. Écriture
// best-effort : une panne DB ne casse jamais le pipeline Lens.
import { beforeEach, describe, expect, it } from 'vitest';
import { endTrace, lensPerformanceReport, registerLensTracePersistence, startTrace } from '../src/ayrovix/services/lensPerformanceTrace';

function memoryStore() {
  const rows: Array<{ requestId: string; traceJson: string; totalBackendMs: number | null; createdAt: string }> = [];
  return {
    rows,
    save: (requestId: string, traceJson: string, totalBackendMs: number | null, createdAt: string) => {
      rows.push({ requestId, traceJson, totalBackendMs, createdAt });
    },
    loadRecent: (limit: number) => rows.slice(-limit).map((row) => ({ trace: row.traceJson })),
  };
}

beforeEach(() => {
  registerLensTracePersistence({ save: () => {}, loadRecent: () => [] });
});

describe('lens trace persistence — le rapport survit au redémarrage', () => {
  it('endTrace écrit dans le store ; un rapport frais (Map vidé par un «restart») lit la DB', () => {
    const store = memoryStore();
    registerLensTracePersistence(store);
    const trace = startTrace('ayx_restart_test_1');
    endTrace(trace);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0].totalBackendMs).not.toBeNull();

    // «Redémarrage» : nouveau process = Map vide, DB conservée.
    registerLensTracePersistence({ save: () => {}, loadRecent: () => store.rows.map((row) => ({ trace: row.traceJson })) });
    const report = lensPerformanceReport();
    expect(report.sampleSize).toBeGreaterThanOrEqual(1);
    expect(report.totalBackendMs.count).toBeGreaterThanOrEqual(1);
  });

  it('une panne DB est ignorée — endTrace ne jette jamais', () => {
    registerLensTracePersistence({ save: () => { throw new Error('disk full'); }, loadRecent: () => { throw new Error('boom'); } });
    const trace = startTrace('ayx_db_down_1');
    expect(() => endTrace(trace)).not.toThrow();
    const report = lensPerformanceReport(); // lecture DB en panne → repli Map vivant
    expect(report.sampleSize).toBeGreaterThanOrEqual(1);
  });

  it('déduplique par requestId — le vivant (plus frais) fait foi', () => {
    const shared = memoryStore();
    registerLensTracePersistence(shared);
    const trace = startTrace('ayx_dedup_1');
    endTrace(trace);
    // Échantillon DB vide → compte de référence (Map vivant de ce process).
    registerLensTracePersistence({ save: shared.save, loadRecent: () => [] });
    const baseline = lensPerformanceReport().totalBackendMs.count;
    // Réinjection du MÊME requestId en DB : le total ne doit pas bouger.
    registerLensTracePersistence({ save: shared.save, loadRecent: () => [{ trace: JSON.stringify({ requestId: 'ayx_dedup_1', totalBackendMs: 9999, startedAt: new Date().toISOString() }) }] });
    expect(lensPerformanceReport().totalBackendMs.count).toBe(baseline);
  });
});
