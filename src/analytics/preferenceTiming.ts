/** Bounded, process-local timings. No payloads, URLs, identities, tokens or error messages. */
import { performance } from 'node:perf_hooks';
import type { RequestHandler } from 'express';
const operations = ['publication_preference_write', 'publisher_follow_write'] as const;
type Operation = typeof operations[number];
type Totals = { completed: number; aborted: number; http4xx: number; http5xx: number; totalMs: number; maxMs: number };
export function createPreferenceTiming(options: { now?: () => number; log?: (line: string) => void; enabled?: () => boolean } = {}) {
  const now = options.now ?? (() => performance.now());
  const log = options.log ?? ((line: string) => console.info(line));
  const enabled = options.enabled ?? (() => process.env.ZAYROVI_PREFERENCE_TIMING_LOGS === 'true');
  const totals = new Map<Operation, Totals>();
  function observe(operation: Operation): RequestHandler {
    if (!operations.includes(operation)) throw new Error('Unsupported timing operation');
    return (_req, res, next) => {
      const start = now();
      let recorded = false;
      const record = (aborted: boolean) => {
        if (recorded) return;
        recorded = true;
        const durationMs = Math.max(0, Math.round((now()-start)*100)/100);
        const count = totals.get(operation) ?? { completed: 0, aborted: 0, http4xx: 0, http5xx: 0, totalMs: 0, maxMs: 0 };
        if (aborted) count.aborted++; else {
          count.completed++;
          if (res.statusCode >= 400 && res.statusCode < 500) count.http4xx++;
          if (res.statusCode >= 500) count.http5xx++;
        }
        count.totalMs += durationMs; count.maxMs = Math.max(count.maxMs,durationMs); totals.set(operation,count);
        try {
          if (enabled()) log(JSON.stringify({ event: 'preference_timing', operation, outcome: aborted ? 'aborted' : 'completed', status: aborted ? null : res.statusCode, durationMs }));
        } catch { /* Diagnostics must never fail a preference write or leak an error message. */ }
      };
      res.once('finish', () => record(false));
      res.once('close', () => record(!res.writableFinished));
      next();
    };
  }
  return { observe, snapshot: () => Object.fromEntries([...totals].map(([key,value]) => [key,{...value}])) };
}
export const preferenceTiming = createPreferenceTiming();
