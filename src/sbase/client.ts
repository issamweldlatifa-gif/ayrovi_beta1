/**
 * S Base — عميل SandBase (خادم فقط).
 *
 * المفتاح ما يخرجش من هنا أبداً: التطبيق ما يشوفش لا المفتاح لا الـURL الداخلي.
 *
 * عقد SandBase:
 *   • `POST {base}/v1/api/<plateforme>/<endpoint>` + `Authorization: Bearer $SANDBASE_API_KEY`
 *   • الردّ غلاف: `{ status, id, outputs: [{ data }], error }`
 *   • بعض الـendpoints متزامنة (status=completed في نفس الردّ)، وبعضها **async**:
 *     تعمل POST، تاخو `id`، وتعمل poll على `GET {base}/v1/run/{id}`.
 *
 * الزمن اللي نرجّعوه (`durationMs`) هو الزمن الحقيقي الكامل، بما فيه الـpolling —
 * هذا هو الرقم اللي يظهر في شاشة الاختبار.
 */
import type { SbaseSourceDescriptor } from './descriptors';

export const SANDBASE_DEFAULT_BASE_URL = 'https://api.sandbase.ai';
export const SANDBASE_TOTAL_TIMEOUT_MS = 28_000;
export const SANDBASE_POLL_INTERVAL_MS = 700;

export class SbaseError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status = 502) {
    super(message);
    this.name = 'SbaseError';
    this.code = code;
    this.status = status;
  }
}

export function sandbaseApiKey(): string {
  return String(process.env.SANDBASE_API_KEY ?? '').trim();
}

export function sandbaseConfigured(): boolean {
  return sandbaseApiKey().length > 0;
}

export function sandbaseBaseUrl(): string {
  const raw = String(process.env.SANDBASE_BASE_URL ?? '').trim();
  return (raw || SANDBASE_DEFAULT_BASE_URL).replace(/\/+$/, '');
}

interface SandbaseEnvelope {
  status?: string;
  id?: string;
  outputs?: unknown[];
  error?: unknown;
  message?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function readEnvelope(payload: unknown): SandbaseEnvelope {
  if (!isRecord(payload)) throw new SbaseError('SANDBASE_MALFORMED', 'رد SandBase موش JSON صالح.', 502);
  return payload as SandbaseEnvelope;
}

function envelopeError(envelope: SandbaseEnvelope): string {
  const raw = envelope.error ?? envelope.message;
  if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 300);
  if (isRecord(raw)) {
    const message = raw.message ?? raw.error ?? raw.detail;
    if (typeof message === 'string' && message.trim()) return message.trim().slice(0, 300);
  }
  return '';
}

function dataFrom(envelope: SandbaseEnvelope): unknown {
  const outputs = Array.isArray(envelope.outputs) ? envelope.outputs : [];
  const first = outputs[0];
  if (isRecord(first) && 'data' in first) return (first as Record<string, unknown>).data;
  return first ?? null;
}

async function requestJson(url: string, init: RequestInit, signal: AbortSignal): Promise<{ status: number; body: unknown }> {
  const response = await fetch(url, { ...init, signal });
  const text = await response.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new SbaseError('SANDBASE_MALFORMED', `رد غير مقروء من SandBase (HTTP ${response.status}).`, 502);
  }
  return { status: response.status, body };
}

export interface SandbaseRunResult {
  data: unknown;
  durationMs: number;
  polls: number;
  runId: string | null;
  async: boolean;
}

/**
 * ينفّذ **نداءً واحداً** على endpoint واحد (بحث أو تفاصيل). ما يعاودش المحاولة:
 * كل نداء يتخلّص.
 */
export async function runSandbaseCall(
  endpoint: string,
  body: unknown,
  options: { timeoutMs?: number; pollIntervalMs?: number; now?: () => number; asyncHint?: boolean } = {},
): Promise<SandbaseRunResult> {
  if (!sandbaseConfigured()) {
    throw new SbaseError('SANDBASE_NOT_CONFIGURED', 'مفتاح SandBase غير مضبوط على الخادم.', 503);
  }
  const headers = {
    Authorization: `Bearer ${sandbaseApiKey()}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const timeoutMs = options.timeoutMs ?? SANDBASE_TOTAL_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? SANDBASE_POLL_INTERVAL_MS;
  const now = options.now ?? Date.now;
  const controller = new AbortController();
  const started = now();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let polls = 0;

  try {
    const first = await requestJson(
      `${sandbaseBaseUrl()}${endpoint}`,
      { method: 'POST', headers, body: JSON.stringify(body) },
      controller.signal,
    );

    if (first.status === 401 || first.status === 403) {
      throw new SbaseError('SANDBASE_UNAUTHORIZED', 'SandBase رفضت المفتاح (401/403).', 502);
    }
    if (first.status === 402) {
      throw new SbaseError('SANDBASE_BALANCE', 'رصيد SandBase غير كافٍ لهذا النداء.', 502);
    }
    if (first.status === 429) {
      throw new SbaseError('SANDBASE_RATE_LIMIT', 'SandBase طلبت تخفيف النداءات (429).', 429);
    }
    if (first.status >= 400) {
      const envelope = isRecord(first.body) ? readEnvelope(first.body) : null;
      const detail = envelope ? envelopeError(envelope) : '';
      throw new SbaseError('SANDBASE_HTTP', detail || `SandBase رجّعت HTTP ${first.status}.`, 502);
    }

    let envelope = readEnvelope(first.body);
    const runId = typeof envelope.id === 'string' ? envelope.id : null;

    while (envelope.status !== 'completed') {
      if (envelope.status === 'failed' || envelope.status === 'error') {
        throw new SbaseError('SANDBASE_FAILED', envelopeError(envelope) || 'SandBase ما كمّلتش النداء.', 502);
      }
      if (!runId) {
        // ردّ بلا status وبلا id: نعتبره payload مباشراً.
        if (envelope.outputs) break;
        throw new SbaseError('SANDBASE_MALFORMED', 'رد SandBase بلا حالة وبلا معرّف تشغيل.', 502);
      }
      if (now() - started > timeoutMs) {
        throw new SbaseError('SANDBASE_TIMEOUT', `SandBase ما جاوبتش في ${Math.round(timeoutMs / 1000)} ثانية.`, 504);
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
      polls += 1;
      const poll = await requestJson(
        `${sandbaseBaseUrl()}/v1/run/${encodeURIComponent(runId)}`,
        { method: 'GET', headers },
        controller.signal,
      );
      if (poll.status >= 400) {
        throw new SbaseError('SANDBASE_HTTP', `تعذّر متابعة التشغيل ${runId} (HTTP ${poll.status}).`, 502);
      }
      envelope = readEnvelope(poll.body);
    }

    return {
      data: dataFrom(envelope),
      durationMs: Math.max(0, now() - started),
      polls,
      runId,
      async: polls > 0 || Boolean(options.asyncHint),
    };
  } catch (error) {
    if (error instanceof SbaseError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new SbaseError('SANDBASE_TIMEOUT', `تجاوزنا ${Math.round(timeoutMs / 1000)} ثانية بلا رد.`, 504);
    }
    throw new SbaseError('SANDBASE_NETWORK', 'تعذّر الوصول إلى SandBase.', 502);
  } finally {
    clearTimeout(timer);
  }
}

/** بحث بكلمة على مصدر واحد (يغلّف `runSandbaseCall`). */
export async function runSandbaseSearch(
  source: SbaseSourceDescriptor,
  query: string,
  market: string | null,
  options: { timeoutMs?: number; pollIntervalMs?: number; now?: () => number } = {},
): Promise<SandbaseRunResult> {
  return runSandbaseCall(source.endpoint, source.buildBody(query, market), { ...options, asyncHint: source.async });
}
