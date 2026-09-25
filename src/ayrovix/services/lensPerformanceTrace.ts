/**
 * AYROVIX Lens — Performance Trace (Instrumentation آمن)
 * لا يسجل الصور أو البيانات الشخصية — فقط أزمنة و أحجام و IDs
 * يُستخدم لتشخيص البطء من رفع الصورة إلى عرض النتائج
 *
 * الاستخدام في src/ayrovix/routes.ts:
 *   const trace = startTrace(`ayx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`);
 *   mark(trace, 'normalizeMs', Date.now() - t0);
 *   endTrace(trace); // console.log JSON آمن
 *
 * Frontend يرسل X-Lens-Crop-Ms و X-Lens-Upload-Ms كـ Headers
 */

export interface LensTrace {
  requestId: string;
  startedAt: string;
  endedAt?: string;
  // Frontend (يُرسل كـ Headers ثم يُدمج في Backend)
  uploadMs?: number;
  cropMs?: number;
  imagePrepMs?: number;
  // Backend
  normalizeMs?: number;
  anthropicVisionMs?: number;
  anthropicVisionTokens?: number;
  anthropicVisionModel?: string;
  serpApiUploadMs?: number;
  serpApiSearchMs?: number;
  serpApiTotalMs?: number;
  /** Lecture locale de l'image : OCR et code-barres (aucun appel payant). */
  imageSignalsMs?: number;
  anthropicOptimizeMs?: number;
  searchCandidatesMs?: number;
  anthropicRelevanceMs?: number;
  dedupMs?: number;
  pricingMs?: number;
  totalBackendMs?: number;
  // Frontend render (يُقاس في LensLauncher بعد setCandidatesView)
  frontendRenderMs?: number;
  imagesLoadMs?: number;
  // Meta
  cacheHit?: { vision: boolean; serpApi: boolean; query: boolean; relevance: boolean };
  pipelineCacheHit?: boolean;
  imageBytesIn?: number;
  imageBytesSerpApi?: number;
  candidatesCount?: number;
  model?: string;
}

const traces = new Map<string, LensTrace>();
const MAX_TRACES = 500;

/* ── Persistance DB (24/09/2026) : le Map en mémoire (≤500) disparaît au
 * redémarrage — le rapport admin p50/p95 doit survivre. Le store est
 * injecté par src/db/database.ts (aucune dépendance directe better-sqlite3
 * ici), l'écriture est best-effort : une panne DB n'casse JAMAIS le pipeline
 * Lens. Aucune image, aucun texte produit — uniquement durées/tailles/IDs. */
interface LensTraceStore {
  save: (requestId: string, traceJson: string, totalBackendMs: number | null, createdAt: string) => void;
  loadRecent: (limit: number) => Array<{ trace: string }>;
}
let traceStore: LensTraceStore | null = null;

export function registerLensTracePersistence(store: LensTraceStore): void {
  traceStore = store;
}

export function startTrace(requestId: string): LensTrace {
  const t: LensTrace = { requestId, startedAt: new Date().toISOString() };
  traces.set(requestId, t);
  if (traces.size > MAX_TRACES) traces.delete(traces.keys().next().value as string);
  return t;
}

export function mark<K extends keyof LensTrace>(trace: LensTrace, key: K, value: LensTrace[K]): void {
  (trace as any)[key] = value;
}

export function endTrace(trace: LensTrace): void {
  trace.endedAt = new Date().toISOString();
  trace.totalBackendMs = Date.now() - new Date(trace.startedAt).getTime();
  // سجل آمن — لا صورة، لا IP، لا نص المنتج، فقط أزمنة
  // مثال:
  // [LensTrace ayx_c4d9...] {"requestId":"ayx_c4d9...","normalizeMs":310,"serpApiTotalMs":3300,...}
  console.log(`[LensTrace ${trace.requestId}] ${JSON.stringify(trace)}`);
  // Persistance DB (24/09/2026) — best-effort, jamais bloquante.
  if (traceStore) {
    try {
      traceStore.save(
        trace.requestId,
        JSON.stringify(trace),
        Number.isFinite(trace.totalBackendMs) ? trace.totalBackendMs! : null,
        trace.startedAt,
      );
    } catch (error) {
      console.warn(`[LensTrace ${trace.requestId}] persistance DB ignorée:`, error instanceof Error ? error.message : error);
    }
  }
}

export function getTrace(requestId: string): LensTrace | undefined {
  return traces.get(requestId);
}

export function getRecentTraces(limit = 20): LensTrace[] {
  return Array.from(traces.values()).slice(-limit);
}

/* ── Agrégats ADMIN (24/09/2026) — p50/p95 honnêtes sur l'échantillon vivant ── */
export interface Percentiles {
  count: number;
  p50: number | null;
  p95: number | null;
}

function percentilesOf(values: Array<number | undefined>): Percentiles {
  const clean = values.filter((value): value is number => Number.isFinite(value as number) && (value as number) >= 0).sort((a, b) => a - b);
  if (!clean.length) return { count: 0, p50: null, p95: null };
  return {
    count: clean.length,
    p50: Math.round(clean[Math.floor(clean.length * 0.5)]),
    p95: Math.round(clean[Math.min(clean.length - 1, Math.floor(clean.length * 0.95))]),
  };
}

export interface LensPerformanceReport {
  sampleSize: number;
  totalBackendMs: Percentiles;
  serpApiTotalMs: Percentiles;
  frontendRenderMs: Percentiles;
  imagesLoadMs: Percentiles;
  pipelineCacheHitRate: number | null;
  generatedAt: string;
}

export function lensPerformanceReport(): LensPerformanceReport {
  // 24/09/2026 : échantillon DB (survit aux redémarrages) ∪ Map vivant —
  // dédupliqué par requestId, le vivant fait foi (valeurs plus fraîches).
  const merged = new Map<string, LensTrace>();
  if (traceStore) {
    try {
      for (const row of traceStore.loadRecent(2000)) {
        try {
          const parsed = JSON.parse(row.trace) as LensTrace;
          if (parsed && typeof parsed.requestId === 'string') merged.set(parsed.requestId, parsed);
        } catch { /* ligne corrompue : on l'ignore honnêtement */ }
      }
    } catch (error) {
      console.warn('[LensTrace] lecture DB ignorée:', error instanceof Error ? error.message : error);
    }
  }
  for (const trace of traces.values()) merged.set(trace.requestId, trace);
  const recent = Array.from(merged.values());
  const withPipeline = recent.filter((trace) => typeof trace.pipelineCacheHit === 'boolean');
  return {
    sampleSize: recent.length,
    totalBackendMs: percentilesOf(recent.map((trace) => trace.totalBackendMs)),
    serpApiTotalMs: percentilesOf(recent.map((trace) => trace.serpApiTotalMs)),
    frontendRenderMs: percentilesOf(recent.map((trace) => trace.frontendRenderMs)),
    imagesLoadMs: percentilesOf(recent.map((trace) => trace.imagesLoadMs)),
    pipelineCacheHitRate: withPipeline.length
      ? Math.round((withPipeline.filter((trace) => trace.pipelineCacheHit).length / withPipeline.length) * 100)
      : null,
    generatedAt: new Date().toISOString(),
  };
}
