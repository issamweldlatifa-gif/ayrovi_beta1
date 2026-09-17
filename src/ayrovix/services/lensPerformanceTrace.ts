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
