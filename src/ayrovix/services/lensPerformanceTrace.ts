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
  // اختياري: حفظ في DB للتحليل (بدون صورة)
  // db.run('INSERT INTO ayrovix_lens_traces (request_id, trace, created_at) VALUES (?,?,?)', trace.requestId, JSON.stringify(trace), new Date().toISOString());
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
  const recent = Array.from(traces.values());
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
