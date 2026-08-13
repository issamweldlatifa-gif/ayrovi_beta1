import type { AyrovixImageResult, AyrovixUrlResult } from '../types';

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

export async function analyzeImage(file: File): Promise<AyrovixImageResult> {
  const body = new FormData();
  body.append('image', file, file.name || 'ayrovix.jpg');
  const response = await fetch('/api/ayrovix/analyze-image', { method: 'POST', body });
  return parseResponse<AyrovixImageResult>(response);
}

export async function analyzeUrl(url: string, channel: 'url' | 'qr'): Promise<AyrovixUrlResult> {
  const response = await fetch('/api/ayrovix/analyze-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, channel }),
  });
  return parseResponse<AyrovixUrlResult>(response);
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
