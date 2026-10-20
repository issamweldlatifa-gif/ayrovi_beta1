/**
 * Trust boundary for AYWEBs merchant browsing.
 * A merchant WebView is reachable only from an in-app store selection or a
 * pasted HTTPS URL whose host matches the server-provided store registry.
 */
import { parseAyWebsCapture, type AyWebsCapture, type AyWebsStore } from '@/api/aywebs';

export function normalizeAyWebsUrl(raw: string): string | null {
  const value = String(raw ?? '').trim();
  if (!value || value.length > 2_000) return null;
  // A bare domain pasted from a shop is convenient; explicitly named schemes
  // are never rewritten (so javascript:, file:, and http: stay rejected).
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return null;
    if (url.port && url.port !== '443') return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

export function isAllowedAyWebsMerchantUrl(raw: string, store: AyWebsStore): boolean {
  const normalized = normalizeAyWebsUrl(raw);
  const domains = store.domains ?? [];
  if (!normalized || !store.enabled || !domains.length) return false;
  try {
    const host = new URL(normalized).hostname.toLowerCase().replace(/\.$/, '');
    return domains.some((entry) => {
      const domain = String(entry).trim().toLowerCase().replace(/^\.+|\.+$/g, '');
      return Boolean(domain) && (host === domain || host.endsWith(`.${domain}`));
    });
  } catch {
    return false;
  }
}

export function storeForAyWebsUrl(raw: string, stores: AyWebsStore[]): AyWebsStore | null {
  return stores.find((store) => isAllowedAyWebsMerchantUrl(raw, store)) ?? null;
}

export function safeAyWebsStartUrl(raw: string, store: AyWebsStore): string | null {
  const normalized = normalizeAyWebsUrl(raw);
  return normalized && isAllowedAyWebsMerchantUrl(normalized, store) ? normalized : null;
}

export type AyWebsCaptureMessage =
  | { ok: true; requestId: string; capture: AyWebsCapture }
  | { ok: false; requestId: string; code: 'EMPTY' | 'TOO_LARGE' | 'NOT_JSON' | 'NOT_OBJECT' | 'SCRIPT_ERROR' | 'BAD_CAPTURE' };

/** Decode the WebView bridge message without trusting its shape or origin. */
export function parseAyWebsCaptureMessage(raw: unknown): AyWebsCaptureMessage {
  const message = typeof raw === 'string' ? raw : '';
  if (!message.trim()) return { ok: false, requestId: '', code: 'EMPTY' };
  if (message.length > 80_000) return { ok: false, requestId: '', code: 'TOO_LARGE' };
  let envelope: unknown;
  try { envelope = JSON.parse(message); } catch { return { ok: false, requestId: '', code: 'NOT_JSON' }; }
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
    return { ok: false, requestId: '', code: 'NOT_OBJECT' };
  }
  const value = envelope as Record<string, unknown>;
  const requestId = typeof value.requestId === 'string' ? value.requestId.slice(0, 80) : '';
  if (value.type === 'aywebs_capture_error') return { ok: false, requestId, code: 'SCRIPT_ERROR' };
  if (value.type !== 'aywebs_capture') return { ok: false, requestId, code: 'NOT_OBJECT' };
  let captureValue: unknown = value.payload;
  if (typeof captureValue === 'string') {
    if (!captureValue.trim()) return { ok: false, requestId, code: 'EMPTY' };
    if (captureValue.length > 64_000) return { ok: false, requestId, code: 'TOO_LARGE' };
    try { captureValue = JSON.parse(captureValue); } catch { return { ok: false, requestId, code: 'NOT_JSON' }; }
  }
  if (!captureValue || typeof captureValue !== 'object' || Array.isArray(captureValue)) {
    return { ok: false, requestId, code: 'NOT_OBJECT' };
  }
  try {
    return { ok: true, requestId, capture: parseAyWebsCapture(captureValue) };
  } catch {
    return { ok: false, requestId, code: 'BAD_CAPTURE' };
  }
}
