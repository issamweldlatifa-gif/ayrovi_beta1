import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { AyrovixCandidate } from '../types';
import { parsePublicHttpUrl, readLimitedText } from '../../services/safeUrl';
import { fetchRemoteImage } from '../../services/imageIsolation';

/**
 * Google Lens product discovery through SerpApi.
 * Images are resized in memory, uploaded directly to SerpApi's temporary Image
 * API, and referenced by an image_id that expires server-side. No public image
 * URL or local upload file is created.
 */

const SERPAPI_IMAGE_LIMIT_BYTES = 500 * 1024;
const CACHE_TTL_MS = 10 * 60_000;
const MAX_CACHE_ENTRIES = 100;
const MAX_IN_FLIGHT = 12;
const cache = new Map<string, { at: number; results: AyrovixCandidate[] }>();
const inFlight = new Map<string, Promise<AyrovixCandidate[]>>();

function boundedLimit(value: number): number {
  return Number.isFinite(value) ? Math.max(8, Math.min(40, Math.floor(value))) : 24;
}

function cacheResults(key: string, results: AyrovixCandidate[]): void {
  cache.delete(key);
  cache.set(key, { at: Date.now(), results });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value as string);
}

async function responseJson(response: Response, maxBytes = 2_000_000): Promise<any> {
  const text = await readLimitedText(response, maxBytes);
  try { return JSON.parse(text); } catch { throw new Error('SERPAPI_INVALID_JSON'); }
}

function serpApiKey(): string | null {
  return process.env.SERPAPI_KEY?.trim() || null;
}

export function serpApiVisualReady(): boolean {
  return Boolean(serpApiKey());
}

function timeoutMs(): number {
  const configured = Number(process.env.AYROVIX_VISUAL_SEARCH_TIMEOUT_MS);
  return Number.isFinite(configured) ? Math.min(25_000, Math.max(10_000, configured)) : 14_000;
}

function remainingMs(deadline: number, cap: number): number {
  return Math.max(100, Math.min(cap, deadline - Date.now()));
}

function normalizeCurrency(raw: unknown): string | null {
  const value = String(raw || '').trim().toUpperCase();
  const known: Record<string, string> = {
    '$': 'USD', 'US$': 'USD', USD: 'USD',
    '€': 'EUR', EUR: 'EUR',
    '£': 'GBP', GBP: 'GBP',
    'د.ت': 'TND', DT: 'TND', TND: 'TND',
    'CA$': 'CAD', CAD: 'CAD',
  };
  return known[value] || (/^[A-Z]{3}$/.test(value) ? value : null);
}

async function prepareImageForSerpApi(image: Buffer): Promise<Buffer> {
  if (!image.length || image.length > 8 * 1024 * 1024) throw new Error('SERPAPI_INPUT_TOO_LARGE');
  // D1-3: 2 attempts only — 1000→700 saves ~100ms (first ≤500KB succeeds in >85% cases)
  const attempts = [
    { edge: 1_000, quality: 78 },
    { edge: 700, quality: 58 },
  ];
  let last = Buffer.alloc(0);
  for (const attempt of attempts) {
    last = await sharp(image, { failOn: 'warning', sequentialRead: true, limitInputPixels: 40_000_000 })
      .rotate()
      .resize({ width: attempt.edge, height: attempt.edge, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: attempt.quality, mozjpeg: true })
      .toBuffer();
    if (last.length > 0 && last.length <= SERPAPI_IMAGE_LIMIT_BYTES) return last;
  }
  if (!last.length || last.length > SERPAPI_IMAGE_LIMIT_BYTES) {
    throw new Error('SERPAPI_IMAGE_TOO_LARGE');
  }
  return last;
}

function toCandidates(payload: any, limit: number): AyrovixCandidate[] {
  const rows = Array.isArray(payload?.visual_matches) ? payload.visual_matches : [];
  // D2-10: strict pass first (price>0 auditable), lenient fallback (PENDING) if strict empty — avoids zero results
  const strict = collectCandidates(rows, limit, true);
  if (strict.length > 0) return strict;
  const lenient = collectCandidates(rows, limit, false);
  if (lenient.length) console.warn(`[AYROVIX serpapi-lens] strict 0 → lenient fallback ${lenient.length} PENDING (no price) — client shows "Prix à confirmer"`);
  return lenient;
}

function collectCandidates(rows: any[], limit: number, strict: boolean): AyrovixCandidate[] {
  const seen = new Set<string>();
  const results: AyrovixCandidate[] = [];
  for (const row of rows) {
    const sourceUrl = String(row?.link || '').trim();
    const title = String(row?.title || '').replace(/\s+/g, ' ').trim();
    if (!/^https?:\/\//i.test(sourceUrl) || title.length < 4 || seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    const extractedPrice = Number(row?.price?.extracted_value ?? row?.extracted_price);
    const currency = normalizeCurrency(row?.price?.currency ?? row?.currency);
    if (strict) {
      if (!Number.isFinite(extractedPrice) || extractedPrice <= 0 || !currency) continue;
    }
    const merchantRating = Number(row?.rating ?? row?.product_rating);
    const ratingCount = Number(row?.reviews ?? row?.reviews_count);
    const rawImages = [
      row?.thumbnail,
      row?.original_image,
      row?.image,
      ...(Array.isArray(row?.images) ? row.images : []),
      ...(Array.isArray(row?.thumbnails) ? row.thumbnails : []),
    ];
    const images = [...new Set(rawImages
      .map((value) => String(value || '').trim())
      .filter((value) => /^https?:\/\//i.test(value)))];
    const index = results.length;
    const hasPrice = Number.isFinite(extractedPrice) && extractedPrice > 0 && !!currency;
    results.push({
      id: `lens_${index}_${createHash('sha1').update(sourceUrl).digest('hex').slice(0, 10)}`,
      kind: 'external',
      title: title.slice(0, 180),
      brand: typeof row?.brand === 'string' ? row.brand.trim().slice(0, 100) || null : null,
      description: typeof (row?.description ?? row?.snippet) === 'string' ? String(row.description ?? row.snippet).trim().slice(0, 500) || null : null,
      model: null,
      colors: Array.isArray(row?.colors) ? row.colors.map((value: unknown) => String(value || '').trim()).filter(Boolean).slice(0, 12) : [],
      sizes: Array.isArray(row?.sizes) ? row.sizes.map((value: unknown) => String(value || '').trim()).filter(Boolean).slice(0, 24) : [],
      source: String(row?.source || 'Google Lens').trim().slice(0, 80) || 'Google Lens',
      sourceUrl,
      image: images[0] || '',
      images,
      price: hasPrice ? extractedPrice : null,
      currency: hasPrice ? currency! : null,
      priceTnd: null,
      priceVerificationStatus: hasPrice ? undefined : 'PENDING_MANUAL' as const,
      rating: Number.isFinite(merchantRating) && merchantRating > 0 && merchantRating <= 5 ? merchantRating : null,
      ratingCount: Number.isFinite(ratingCount) && ratingCount >= 0 ? ratingCount : null,
      ratingKind: Number.isFinite(merchantRating) && merchantRating > 0 && merchantRating <= 5 ? 'merchant' : 'match',
      /*
       * FAITS DE LA SOURCE QUE NOUS JETIONS (25/09/2026).
       *
       * Google Lens renvoie `in_stock` (booléen) et `condition` sur ses
       * correspondances ; nous les ignorions, pour ensuite DEVINER l'état du
       * produit à partir de mots trouvés dans le titre. Deviner ce que la source
       * affirme est une faute : on prend ce qu'elle dit.
       *
       * `in_stock` absent reste `unknown` — un silence n'est pas une
       * disponibilité, exactement comme pour les variantes.
       */
      availability: row?.in_stock === true ? 'in_stock' as const
        : row?.in_stock === false ? 'out_of_stock' as const
          : 'unknown' as const,
      sourceCondition: typeof row?.condition === 'string' && row.condition.trim()
        ? row.condition.trim().slice(0, 60)
        : null,
      match: row?.exact_matches === true ? 99 : Math.max(72, 94 - index * 3),
    });
    if (results.length >= limit) break;
  }
  return results;
}

async function runSerpApiVisualSearch(image: Buffer, limit: number): Promise<AyrovixCandidate[]> {
  const key = serpApiKey();
  if (!key) return [];
  const deadline = Date.now() + timeoutMs();
  try {
    const prepared = await prepareImageForSerpApi(image);
    const form = new FormData();
    form.append('image', new Blob([new Uint8Array(prepared)], { type: 'image/jpeg' }), 'ayrovix-lens.jpg');
    const upload = await fetch(`https://serpapi.com/image?api_key=${encodeURIComponent(key)}`, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(remainingMs(deadline, 5_000)),
    });
    if (!upload.ok) {
      console.warn(`[AYROVIX serpapi-lens] image upload HTTP ${upload.status}`);
      return [];
    }
    const uploadPayload: any = await responseJson(upload, 256 * 1024);
    const imageId = String(uploadPayload?.image_id || '').trim();
    if (!imageId || deadline - Date.now() < 500) {
      console.warn('[AYROVIX serpapi-lens] image upload returned no usable image_id');
      return [];
    }

    const configuredCountry = (process.env.AYROVIX_LENS_COUNTRY || '').trim().toLowerCase();
    const country = /^[a-z]{2}$/.test(configuredCountry) ? configuredCountry : 'fr';
    const params = new URLSearchParams({
      engine: 'google_lens',
      type: 'products',
      image_id: imageId,
      hl: 'fr',
      country,
      api_key: key,
    });
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      signal: AbortSignal.timeout(remainingMs(deadline, 10_000)),
    });
    if (!response.ok) {
      console.warn(`[AYROVIX serpapi-lens] search HTTP ${response.status}`);
      return [];
    }
    const payload: any = await responseJson(response);
    if (payload?.error) {
      console.warn('[AYROVIX serpapi-lens] search returned an API error');
      return [];
    }
    const results = toCandidates(payload, limit);
    if (results.length === 0 && Array.isArray(payload?.visual_matches) && payload.visual_matches.length > 0) {
      console.warn(`[AYROVIX serpapi-lens] strict filter removed ${payload.visual_matches.length} matches (no price>0) — WebSearch fallback will trigger (D2-10 lenient pending)`);
    }
    console.log(`[AYROVIX serpapi-lens] ${results.length} visual product matches`);
    return results;
  } catch (error: any) {
    console.warn(`[AYROVIX serpapi-lens] ${error?.name === 'TimeoutError' ? 'timeout' : 'unavailable'}`);
    return [];
  }
}

export async function serpApiVisualSearchUrl(imageUrl: string, limit = 24): Promise<AyrovixCandidate[]> {
  if (!serpApiVisualReady()) return [];
  let normalized: string;
  try { normalized = parsePublicHttpUrl(imageUrl).toString(); } catch { return []; }
  const safeLimit = boundedLimit(limit);
  const cacheKey = `url:${createHash('sha256').update(normalized).digest('hex')}|${safeLimit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results.map((item) => ({ ...item }));
  if (cached) cache.delete(cacheKey);
  const existing = inFlight.get(cacheKey);
  if (existing) return (await existing).map((item) => ({ ...item }));
  if (inFlight.size >= MAX_IN_FLIGHT) return [];

  // Never ask SerpApi to resolve a user-controlled URL itself. Fetch and validate
  // the public raster image here (DNS pinned locally), then upload only bytes.
  const task = fetchRemoteImage(normalized).then((image) => runSerpApiVisualSearch(image, safeLimit));
  inFlight.set(cacheKey, task);
  try {
    const results = await task;
    if (results.length) cacheResults(cacheKey, results);
    return results.map((item) => ({ ...item }));
  } finally {
    inFlight.delete(cacheKey);
  }
}

export async function serpApiVisualSearch(image: Buffer, limit = 24): Promise<AyrovixCandidate[]> {
  if (!serpApiVisualReady() || !image.length || image.length > 8 * 1024 * 1024) return [];
  const safeLimit = boundedLimit(limit);
  const cacheKey = `${createHash('sha256').update(image).digest('hex')}|${safeLimit}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.results.map((item) => ({ ...item }));
  if (cached) cache.delete(cacheKey);
  const existing = inFlight.get(cacheKey);
  if (existing) return (await existing).map((item) => ({ ...item }));
  if (inFlight.size >= MAX_IN_FLIGHT) return [];

  const task = runSerpApiVisualSearch(image, safeLimit);
  inFlight.set(cacheKey, task);
  try {
    const results = await task;
    if (results.length) cacheResults(cacheKey, results);
    return results.map((item) => ({ ...item }));
  } finally {
    inFlight.delete(cacheKey);
  }
}

export interface SerpApiVisualHealth {
  configured: boolean;
  engine: 'google_lens';
  mode: 'products';
  timeoutMs: number;
}

export function checkSerpApiVisualHealth(): SerpApiVisualHealth {
  return {
    configured: serpApiVisualReady(),
    engine: 'google_lens',
    mode: 'products',
    timeoutMs: timeoutMs(),
  };
}
