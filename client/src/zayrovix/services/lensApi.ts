import type { ZayrovixImageResult, ZayrovixReviewRequest, ZayrovixUrlResult } from '../types';
import { getSessionId } from '../../utils/session';
import { parseLensSseBlock, type LensProgress } from './lensStream';

/** ZAYROVIX · appels API — la clé IA reste côté serveur, le client n'envoie que l'entrée brute. */

export class ZayrovixApiError extends Error {
  constructor(public code: string, message: string, public status: number) { super(message); }
}

async function parseResponse<T>(response: Response): Promise<T> {
  let payload: any = null;
  try { payload = await response.json(); } catch { /* réponse non-JSON : traité ci-dessous */ }
  if (!response.ok || !payload?.success) {
    throw new ZayrovixApiError(
      String(payload?.code || 'UNKNOWN'),
      String(payload?.error || 'Une erreur est survenue. Réessayez.'),
      response.status,
    );
  }
  return payload.data as T;
}

/** Pas de nouvel événement pendant ce délai : le flux est considéré bloqué. */
export const LENS_STREAM_IDLE_MS = 40_000;
/** Délai total côté client pour la réponse JSON (filet de sécurité, le serveur répond avant). */
export const LENS_JSON_TIMEOUT_MS = 60_000;

export async function analyzeImage(
  file: File,
  signal?: AbortSignal,
  customerIntent?: string | null,
  extra?: {
    cropMs?: number;
    uploadMs?: number;
    roi?: { x:number; y:number; w:number; h:number };
    onCard?: (candidate: ZayrovixImageResult['candidates'][number]) => void;
    onProgress?: (progress: LensProgress) => void;
  },
): Promise<ZayrovixImageResult> {
  const body = new FormData();
  body.append('image', file, file.name || 'zayrovix.jpg');
  if (customerIntent) body.append('customerIntent', String(customerIntent).slice(0,200));
  if (extra?.roi) body.append('roi', JSON.stringify(extra.roi));
  const streaming = Boolean(extra?.onCard || extra?.onProgress);
  const headers: Record<string, string> = streaming ? { Accept: 'text/event-stream' } : {};
  if (extra?.cropMs != null) headers['X-Lens-Crop-Ms'] = String(Math.round(extra.cropMs));
  if (extra?.uploadMs != null) headers['X-Lens-Upload-Ms'] = String(Math.round(extra.uploadMs));

  // Un seul contrôleur : annulation utilisateur (signal) OU délai client dépassé.
  const controller = new AbortController();
  let timedOut = false;
  const onUserAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onUserAbort, { once: true });
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  const armTimer = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, streaming ? LENS_STREAM_IDLE_MS : LENS_JSON_TIMEOUT_MS);
  };
  const timeoutError = () => new ZayrovixApiError(
    'ANALYZE_TIMEOUT',
    "L'analyse a pris trop de temps. Réessayez avec une photo plus nette ou dans un instant.",
    504,
  );

  armTimer();
  try {
    let response: Response;
    try {
      response = await fetch('/api/zayrovix/analyze-image', { method: 'POST', body, headers, signal: controller.signal });
    } catch (err: any) {
      if (timedOut) throw timeoutError();
      throw err;
    }
    const ctype = response.headers.get('content-type') || '';
    if (!ctype.includes('event-stream')) return await parseResponse<ZayrovixImageResult>(response);
    if (!response.ok || !response.body) {
      throw new ZayrovixApiError('IDENTIFICATION_FAILED', "Impossible d'identifier le produit. Essayez une photo plus nette et centrée.", response.status);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const candidates: ZayrovixImageResult['candidates'] = [];
    let doneMeta: Partial<ZayrovixImageResult> | null = null;
    const consume = (block: string) => {
      const item = parseLensSseBlock(block);
      if (!item) return;
      armTimer(); // chaque événement prouve que le flux avance
      if (item.type === 'error') throw new ZayrovixApiError(item.code, item.message, 422);
      if (item.type === 'progress') { extra?.onProgress?.(item.progress); return; }
      if (item.type === 'card') {
        const candidate = item.candidate;
        if (!candidates.some((entry) => entry.sourceUrl === candidate.sourceUrl)) {
          candidates.push(candidate);
          extra?.onCard?.(candidate);
        }
        return;
      }
      doneMeta = item.meta || {};
    };
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() || '';
        for (const block of parts) consume(block);
      }
      if (buffer.trim()) consume(buffer);
    } catch (err: any) {
      if (timedOut) throw timeoutError();
      throw err;
    }
    // Flux fermé sans « done » ni « error » : jamais de résultat vide silencieux.
    if (!doneMeta) {
      throw new ZayrovixApiError(
        'STREAM_INCOMPLETE',
        "La connexion a été interrompue avant la fin de l'analyse. Réessayez.",
        502,
      );
    }
    const meta: Partial<ZayrovixImageResult> = doneMeta;
    return {
      identification: meta.identification || { input_kind: 'product_photo', category: '', brand: null, model: null, color: [], visible_text: [], possible_model_codes: [], description: candidates[0]?.title || '', confidence: 0.7, detected_price: { amount: 0, currency: '', label: 'none', confidence: 0 } } as ZayrovixImageResult['identification'],
      query: String(meta.query || candidates[0]?.title || ''),
      candidates,
      eventId: String(meta.eventId || ''),
      detectedPrice: null,
      excluded: meta.excluded || null,
    };
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener('abort', onUserAbort);
  }
}

export async function analyzeUrl(url: string, channel: 'url' | 'qr', signal?: AbortSignal, recordHistory = true): Promise<ZayrovixUrlResult> {
  const response = await fetch('/api/zayrovix/analyze-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, channel, recordHistory }),
    signal,
  });
  return parseResponse<ZayrovixUrlResult>(response);
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
}, signal?: AbortSignal): Promise<ZayrovixReviewRequest> {
  const response = await fetch('/api/zayrovix/review-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
    body: JSON.stringify(input),
    signal,
  });
  return parseResponse<ZayrovixReviewRequest>(response);
}

export async function getManualReview(id: string, signal?: AbortSignal): Promise<ZayrovixReviewRequest> {
  const response = await fetch(`/api/zayrovix/review-request/${encodeURIComponent(id)}`, {
    headers: { 'x-session-id': getSessionId() },
    signal,
  });
  return parseResponse<ZayrovixReviewRequest>(response);
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
  const response = await fetch('/api/zayrovix/live-stock', {
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
  fetch('/api/zayrovix/choose', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId }),
    keepalive: true,
  }).catch(() => {});
}

/** Recherche du contenu texte d'un QR via ZAYROVI Web Search. */
export async function analyzeCode(value: string, signal?: AbortSignal): Promise<{ code: string; candidates: ZayrovixImageResult['candidates']; eventId: string }> {
  const response = await fetch('/api/zayrovix/analyze-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
    signal,
  });
  return parseResponse(response);
}

/** Recherche par code-barres (EAN/UPC) lu en direct. */
export async function analyzeBarcode(code: string, signal?: AbortSignal): Promise<{ code: string; candidates: ZayrovixImageResult['candidates']; eventId: string }> {
  const response = await fetch('/api/zayrovix/analyze-barcode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
    signal,
  });
  return parseResponse(response);
}

/** Recherche par nom de produit (texte libre) via ZAYROVI Catalog + Web Search. */
export async function analyzeText(query: string, signal?: AbortSignal): Promise<{ query: string; candidates: ZayrovixImageResult['candidates']; eventId: string }> {
  const response = await fetch('/api/zayrovix/analyze-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
    signal,
  });
  return parseResponse(response);
}
