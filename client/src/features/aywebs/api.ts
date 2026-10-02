import { AYWEBS_STORES } from '../../../../shared/aywebsStores';
import type { ScrapedProduct } from '../../types';
import { getSessionId } from '../../utils/session';

export interface AyWebsStore {
  id: string;
  name: string;
  domains: string[];
  enabled: boolean;
  capture_supported: boolean;
  adapter: string;
  status: 'active' | 'beta' | 'planned';
  browser_mode: 'embedded' | 'external';
  home_url: string;
  search_url_template: string;
  phase: 1 | 2;
}

export interface AyWebsFeatures {
  enabled: boolean;
  capture_enabled: boolean;
  ocr_fallback_enabled: boolean;
  ai_extraction_enabled: boolean;
}

export interface AyWebsCaptureResponse {
  success: true;
  capture_id: string;
  status: 'READY';
  product: ScrapedProduct;
  normalized_product: Record<string, unknown>;
}

export class AyWebsApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: string,
    readonly missing: string[] = [],
  ) {
    super(message);
    this.name = 'AyWebsApiError';
  }
}

const fallbackStores: AyWebsStore[] = AYWEBS_STORES.filter((store) => store.enabled).map((store) => ({
  id: store.id,
  name: store.name,
  domains: [...store.domains],
  enabled: store.enabled,
  capture_supported: store.captureSupported,
  adapter: store.adapter,
  status: store.status,
  browser_mode: store.browserMode,
  home_url: store.homeUrl,
  search_url_template: store.searchUrlTemplate,
  phase: store.phase,
}));

export async function getAyWebsStores(signal?: AbortSignal): Promise<{ stores: AyWebsStore[]; features: AyWebsFeatures; offline: boolean }> {
  try {
    const response = await fetch('/api/v1/aywebs/stores', { credentials: 'same-origin', signal });
    const payload = await response.json();
    if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
      throw new Error(String(payload?.error || 'AYWEBS_STORES_UNAVAILABLE'));
    }
    return {
      stores: payload.data,
      features: payload.features,
      offline: false,
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    return {
      stores: fallbackStores,
      features: {
        enabled: true,
        capture_enabled: true,
        ocr_fallback_enabled: true,
        ai_extraction_enabled: false,
      },
      offline: true,
    };
  }
}

export type AyWebsEvent =
  | 'aywebs_open'
  | 'store_selected'
  | 'product_page_detected'
  | 'capture_started'
  | 'capture_succeeded'
  | 'capture_failed'
  | 'add_to_cart_clicked'
  | 'add_to_cart_succeeded';

export function trackAyWebsEvent(event: AyWebsEvent, detail: { store?: string; capture_id?: string; code?: string } = {}): void {
  void fetch('/api/v1/aywebs/events', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
    body: JSON.stringify({ event, ...detail }),
  }).catch(() => undefined);
}

export async function captureAyWebsProduct(url: string, store: string, signal?: AbortSignal): Promise<AyWebsCaptureResponse> {
  const response = await fetch('/api/v1/aywebs/capture', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
    body: JSON.stringify({ url, store }),
    signal,
  });
  let payload: any = null;
  try { payload = await response.json(); } catch { /* mapped below */ }
  if (!response.ok || !payload?.success) {
    throw new AyWebsApiError(
      String(payload?.error || 'Impossible de capturer ce produit.'),
      String(payload?.code || 'CAPTURE_FAILED'),
      String(payload?.status || 'FAILED'),
      Array.isArray(payload?.missing) ? payload.missing.map(String) : [],
    );
  }
  return payload as AyWebsCaptureResponse;
}
