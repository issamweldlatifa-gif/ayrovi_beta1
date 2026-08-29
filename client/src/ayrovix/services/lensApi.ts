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

export async function analyzeImage(file: File, signal?: AbortSignal): Promise<AyrovixImageResult> {
  const body = new FormData();
  body.append('image', file, file.name || 'ayrovix.jpg');
  const response = await fetch('/api/ayrovix/analyze-image', { method: 'POST', body, signal });
  return parseResponse<AyrovixImageResult>(response);
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
