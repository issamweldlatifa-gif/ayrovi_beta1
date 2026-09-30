import { getSessionId } from '../../../utils/session';
import type { ScrapedProduct } from '../../../types';
import type { OcerexCode, OcerexExtraction } from '../types';

export class OcerexRequestError extends Error {
  readonly code: OcerexCode;
  readonly payload: Partial<OcerexExtraction> | null;

  constructor(code: OcerexCode, message: string, payload: Partial<OcerexExtraction> | null = null) {
    super(message);
    this.code = code;
    this.payload = payload;
  }
}

function headers(csrfToken: string, json = false): HeadersInit {
  return {
    'x-session-id': getSessionId(),
    ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  };
}

async function readJson(response: Response): Promise<any> {
  try { return await response.json(); } catch { return {}; }
}

export async function trackOcerex(event: string, csrfToken = '', extra: { type?: string; confidenceLevel?: string } = {}): Promise<void> {
  try {
    await fetch('/api/ocerex/events', {
      method: 'POST',
      headers: headers(csrfToken, true),
      body: JSON.stringify({ event, ...extra }),
    });
  } catch { /* analytics must not block the tool */ }
}

export async function analyzeOcerexImage(file: File, capture: boolean, csrfToken: string): Promise<OcerexExtraction> {
  const body = new FormData();
  body.set('image', file);
  body.set('capture', capture ? '1' : '0');
  const response = await fetch('/api/ocerex/analyze', { method: 'POST', headers: headers(csrfToken), body });
  const data = await readJson(response);
  if (!response.ok) throw new OcerexRequestError(data.code || 'PROCESSING_ERROR', data.error || 'Analyse impossible.', data);
  return data as OcerexExtraction;
}

export async function calculateOcerexPrice(extractionId: string, csrfToken: string, currency?: string): Promise<OcerexExtraction> {
  const response = await fetch('/api/ocerex/calculate', {
    method: 'POST',
    headers: headers(csrfToken, true),
    body: JSON.stringify({ extractionId, ...(currency ? { currency } : {}) }),
  });
  const data = await readJson(response);
  if (!response.ok || !data.success) throw new OcerexRequestError(data.code || 'PROCESSING_ERROR', data.error || 'Calcul impossible.', data);
  return data as OcerexExtraction;
}

export async function resolveOcerexLink(extractionId: string, url: string, csrfToken: string): Promise<OcerexExtraction> {
  const response = await fetch('/api/ocerex/resolve', {
    method: 'POST',
    headers: headers(csrfToken, true),
    body: JSON.stringify({ extractionId, url }),
  });
  const data = await readJson(response);
  if (!response.ok || !data.success) throw new OcerexRequestError(data.code || 'INVALID_URL', data.error || 'Lien invalide.', data);
  return data as OcerexExtraction;
}

export async function commitOcerexOrder(extractionId: string, csrfToken: string): Promise<OcerexExtraction> {
  const response = await fetch('/api/ocerex/commit', {
    method: 'POST',
    headers: headers(csrfToken, true),
    body: JSON.stringify({ extractionId }),
  });
  const data = await readJson(response);
  if (!response.ok || !data.success) throw new OcerexRequestError(data.code || 'PROCESSING_ERROR', data.error || 'Commande impossible.', data);
  return data as OcerexExtraction;
}

/** Hands a link to the existing product pipeline. OCEREX does not price this path. */
export async function scrapeExistingProduct(url: string): Promise<ScrapedProduct> {
  const response = await fetch('/api/scrape', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  const data = await readJson(response);
  if (!response.ok || !data.success || !data.product) {
    throw new OcerexRequestError('INVALID_URL', data.error || 'Lien invalide.');
  }
  return data.product as ScrapedProduct;
}

export async function readImageFile(file: File): Promise<{ width: number; height: number }> {
  const type = file.type.toLowerCase();
  const extensionOk = /\.(jpe?g|png|webp)$/i.test(file.name);
  const typeOk = ['image/jpeg', 'image/jpg', 'image/pjpeg', 'image/png', 'image/webp'].includes(type) || ((!type || type === 'application/octet-stream') && extensionOk);
  if (!typeOk) {
    throw new OcerexRequestError('INVALID_IMAGE', 'Format non supporté.');
  }
  if (file.size <= 0 || file.size > 8 * 1024 * 1024) {
    throw new OcerexRequestError('INVALID_IMAGE', 'Image trop volumineuse.');
  }
  const bitmap = await createImageBitmap(file);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close();
  if (size.width < 40 || size.height < 40) throw new OcerexRequestError('INVALID_IMAGE', 'Image trop petite.');
  return size;
}
