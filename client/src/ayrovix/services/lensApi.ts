import type { AyrovixImageResult, AyrovixReviewRequest, AyrovixUrlResult } from '../types';
import { getSessionId } from '../../utils/session';

/** AYROVIX · appels API — la clé IA reste côté serveur, le client n'envoie que l'entrée brute. */

export class AyrovixApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: any = null;
  try { payload = await response.json(); } catch { /* réponse non-JSON : traité ci-dessous */ }
  if (!response.ok || !payload?.success) {
    throw new AyrovixApiError(
      String(payload?.code || 'UNKNOWN'),
      String(payload?.error || 'Une erreur est survenue. Réessayez.'),
      response.status,
    );
  }
  return payload.data as T;
}

export async function analyzeImage(
  file: File,
  signal?: AbortSignal,
  customerIntent?: string | null,
  extra?: { cropMs?: number; uploadMs?: number; roi?: { x:number; y:number; w:number; h:number }; onCard?: (candidate: AyrovixImageResult['candidates'][number]) => void },
): Promise<AyrovixImageResult> {
  const body = new FormData();
  body.append('image', file, file.name || 'ayrovix.jpg');
  if (customerIntent) body.append('customerIntent', String(customerIntent).slice(0,200));
  if (extra?.roi) body.append('roi', JSON.stringify(extra.roi));
  const headers: Record<string, string> = extra?.onCard ? { Accept: 'text/event-stream' } : {};
  if (extra?.cropMs != null) headers['X-Lens-Crop-Ms'] = String(Math.round(extra.cropMs));
  if (extra?.uploadMs != null) headers['X-Lens-Upload-Ms'] = String(Math.round(extra.uploadMs));
  const response = await fetch('/api/ayrovix/analyze-image', { method: 'POST', body, headers, signal });
  const ctype = response.headers.get('content-type') || '';
  if (!ctype.includes('event-stream')) return parseResponse<AyrovixImageResult>(response);
  if (!response.ok || !response.body) {
    throw new AyrovixApiError('IDENTIFICATION_FAILED', "Impossible d'identifier le produit. Essayez une photo plus nette et centrée.", response.status);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const candidates: AyrovixImageResult['candidates'] = [];
  let doneMeta: Partial<AyrovixImageResult> = {};
  const consume = (block: string) => {
    let event = 'message';
    let raw = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) raw += line.slice(5).trim();
    }
    if (!raw) return;
    let payload: any;
    try { payload = JSON.parse(raw); } catch { return; }
    if (event === 'error') {
      throw new AyrovixApiError(String(payload?.code || 'IDENTIFICATION_FAILED'), String(payload?.error || 'IDENTIFICATION_FAILED'), 422);
    }
    if (event === 'card' && payload?.sourceUrl) {
      if (!candidates.some((item) => item.sourceUrl === payload.sourceUrl)) {
        candidates.push(payload);
        extra?.onCard?.(payload);
      }
    }
    if (event === 'done') doneMeta = payload || {};
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const block of parts) consume(block);
  }
  if (buffer.trim()) consume(buffer);
  return {
    identification: doneMeta.identification || { input_kind: 'product_photo', category: '', brand: null, model: null, color: [], visible_text: [], possible_model_codes: [], description: candidates[0]?.title || '', confidence: 0.7, detected_price: { amount: 0, currency: '', label: 'none', confidence: 0 } } as AyrovixImageResult['identification'],
    query: String(doneMeta.query || candidates[0]?.title || ''),
    candidates,
    eventId: String(doneMeta.eventId || ''),
    detectedPrice: null,
    excluded: doneMeta.excluded || null,
  };
}

export async function analyzeUrl(url: string, channel: 'url' | 'qr', signal?: AbortSignal, recordHistory = true): Promise<AyrovixUrlResult> {
  const response = await fetch('/api/ayrovix/analyze-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, channel, recordHistory }),
    signal,
  });
  return parseResponse<AyrovixUrlResult>(response);
}

export async function requestManualReview(input: {
  eventId?: string;
  sourceUrl: string;
  title: string;
  imageUrl?: string;
  source?: string;
  lensPrice?: number | null;
  lensCurrency?: string | null;
  desiredSize?: string;
  desiredColor?: string;
  contact: string;
}, signal?: AbortSignal): Promise<AyrovixReviewRequest> {
  const response = await fetch('/api/ayrovix/review-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
    body: JSON.stringify(input),
    signal,
  });
  return parseResponse<AyrovixReviewRequest>(response);
}

export async function getManualReview(id: string, signal?: AbortSignal): Promise<AyrovixReviewRequest> {
  const response = await fetch(`/api/ayrovix/review-request/${encodeURIComponent(id)}`, {
    headers: { 'x-session-id': getSessionId() },
    signal,
  });
  return parseResponse<AyrovixReviewRequest>(response);
}

/** Stock frais d'un lien produit — la page marchande est relue sans cache. */
export interface LiveStockResult {
  url: string;
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  /** Prix FRAIS lus sur la page marchande, déjà passés par le calculateur (null si non publiés). */
  price: number | null;
  currency: string | null;
  originalPrice: number | null;
  priceTnd: number | null;
  originalPriceTnd: number | null;
  sizes: string[];
  colors: string[];
  images: string[];
  variants: Array<{ value: string; color: string | null; availability: 'available' | 'unavailable' | 'unknown' }>;
  /** Horodatage ISO de la lecture qui fonde ce résultat. */
  checkedAt: string;
  reason: string;
  priceToken?: string | null;
}

/**
 * Relit la page produit pour obtenir stock et tailles FRAIS. Volontairement
 * explicite : le client appuie sur « vérifier », donc la lecture est réelle et
 * le résultat porte sa date. Une page illisible rend `unknown` — jamais une
 * disponibilité inventée.
 */
export async function refreshLiveStock(urls: string[], signal?: AbortSignal, title?: string): Promise<LiveStockResult[]> {
  const response = await fetch('/api/ayrovix/live-stock', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls: urls.slice(0, 8), title: title || undefined }),
    signal,
  });
  const data = await parseResponse<{ results: LiveStockResult[] }>(response);
  return Array.isArray(data?.results) ? data.results : [];
}

export function markChosen(eventId: string): void {
  if (!eventId) return;
  fetch('/api/ayrovix/choose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId }),
    keepalive: true,
  }).catch(() => {});
}

/** Recherche du contenu texte d'un QR via AYROVI Web Search. */
export async function analyzeCode(value: string, signal?: AbortSignal): Promise<{ code: string; candidates: AyrovixImageResult['candidates']; eventId: string }> {
  const response = await fetch('/api/ayrovix/analyze-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
    signal,
  });
  return parseResponse(response);
}

/** Recherche par code-barres (EAN/UPC) lu en direct. */
export async function analyzeBarcode(code: string, signal?: AbortSignal): Promise<{ code: string; candidates: AyrovixImageResult['candidates']; eventId: string }> {
  const response = await fetch('/api/ayrovix/analyze-barcode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    signal,
  });
  return parseResponse(response);
}

/** Recherche par nom de produit (texte libre) via AYROVI Catalog + Web Search. */
export async function analyzeText(query: string, signal?: AbortSignal): Promise<{ query: string; candidates: AyrovixImageResult['candidates']; eventId: string }> {
  const response = await fetch('/api/ayrovix/analyze-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });
  return parseResponse(response);
}
