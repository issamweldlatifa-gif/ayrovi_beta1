import { readBoundedResponse } from '../services/boundedResponse';

const DHL_ENDPOINT = 'https://api-eu.dhl.com/track/shipments';
const statuses = ['pre-transit', 'transit', 'delivered', 'failure', 'unknown'] as const;
export type DhlSnapshot = { status: typeof statuses[number]; observedAt: string | null };
export type DhlReadResult = { kind: 'verified'; data: DhlSnapshot } | { kind: 'missing' | 'rate-limited' | 'unavailable' };

export function dhlKey() {
  const key = process.env.ZAYROVI_DHL_TRACKING_API_KEY?.trim();
  return process.env.ZAYROVI_DHL_TRACKING_ENABLED === 'true' && key && /^[\x21-\x7e]{8,256}$/.test(key) ? key : null;
}

/** Only the saved reference is sent, to the fixed DHL host. No redirects or payload persistence. */
export async function readDhlStatus(reference: string, key: string, request: typeof fetch = fetch): Promise<DhlReadResult> {
  if (!/^[A-Za-z0-9-]{4,64}$/.test(reference)) return { kind: 'missing' };
  const url = new URL(DHL_ENDPOINT);
  url.searchParams.set('trackingNumber', reference);
  url.searchParams.set('service', 'express');
  try {
    const result = await request(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5_000), headers: { Accept: 'application/json', 'DHL-API-Key': key } });
    if (!result.ok) {
      void result.body?.cancel().catch(() => undefined);
      return { kind: result.status === 404 ? 'missing' : result.status === 429 ? 'rate-limited' : 'unavailable' };
    }
    if (!/^application\/json\b/i.test(result.headers.get('content-type') || '')) {
      void result.body?.cancel().catch(() => undefined);
      return { kind: 'unavailable' };
    }
    const payload: unknown = JSON.parse(await readBoundedResponse(result, 128 * 1024));
    const shipments: unknown = (payload as { shipments?: unknown } | null)?.shipments;
    if (!Array.isArray(shipments)) return { kind: 'unavailable' };
    const match = shipments.find(item => typeof item?.id === 'string' && item.id.toUpperCase() === reference.toUpperCase() && item.service === 'express');
    if (!match?.status) return { kind: 'missing' };
    const code: unknown = match.status.statusCode;
    if (typeof code !== 'string' || !code) return { kind: 'unavailable' };
    const time: unknown = match.status.timestamp;
    const timestamp = typeof time === 'string' && time.length <= 64 && /(?:Z|[+-]\d{2}:\d{2})$/i.test(time) ? Date.parse(time) : NaN;
    return { kind: 'verified', data: { status: statuses.find(status => status === code) ?? 'unknown', observedAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null } };
  } catch {
    return { kind: 'unavailable' };
  }
}
