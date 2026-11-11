import { createHash } from 'node:crypto';
import { getAyroviAiCore } from '../../ai-core/core';
export interface LocalizedProduct {
  name: string;
  category: string;
  confidence: number;
  box: { x: number; y: number; w: number; h: number };
}
export interface ImagePoint {
  x: number;
  y: number;
}
/** Reject ungrounded, low-confidence, off-image and near-full-scene proposals; no fabricated fallback box. */
export function parseLocalizedProducts(
  value: unknown,
  point?: ImagePoint
): LocalizedProduct[] {
  const rows = (value as any)?.products;
  if (!Array.isArray(rows)) throw new Error('INVALID_LOCALIZATION');
  return rows
    .slice(0, 12)
    .flatMap((row: any) => {
      const b = row?.box;
      if (
        !Array.isArray(b) ||
        b.length !== 4 ||
        !b.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))
      )
        return [];
      const [x, y, w, h] = b;
      if (
        x < 0 ||
        y < 0 ||
        w < 0.02 ||
        h < 0.02 ||
        x + w > 1.001 ||
        y + h > 1.001 ||
        w * h > 0.94 ||
        typeof row.confidence !== 'number' ||
        !Number.isFinite(row.confidence) ||
        row.confidence < 0.65 ||
        row.confidence > 1 ||
        typeof row.name !== 'string' ||
        !row.name.trim()
      )
        return [];
      if (
        point &&
        !(point.x >= x && point.x <= x + w && point.y >= y && point.y <= y + h)
      )
        return [];
      if (
        ['person', 'human', 'scene', 'background', 'outfit'].includes(
          String(row.category).trim().toLowerCase()
        )
      )
        return [];
      return [
        {
          name: row.name.trim().slice(0, 120),
          category: String(row.category || 'product').slice(0, 80),
          confidence: row.confidence,
          box: { x, y, w, h },
        },
      ];
    })
    .sort((a, b) =>
      point
        ? a.box.w * a.box.h - b.box.w * b.box.h
        : b.confidence - a.confidence
    );
}
/**
 * Raison d'un échec de repérage (11/11/2026) — journalisée côté serveur (sans
 * image ni donnée personnelle) pour comprendre les pannes « par moments ».
 */
export type LocalizationFailure = 'NOT_CONFIGURED' | 'BUSY' | 'TIMEOUT' | 'PROVIDER' | 'INVALID_OUTPUT';
export class LocalizationError extends Error {
  constructor(public readonly reason: LocalizationFailure, cause?: unknown) {
    super(`LOCALIZATION_${reason}`);
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * Lit l'objet JSON rendu par le modèle, même entouré de texte ou de balises
 * ```json (certains fournisseurs ignorent le schéma imposé). Sans objet
 * lisible : `INVALID_OUTPUT` — jamais de cadre deviné.
 */
export function extractLocalizationJson(text: string): unknown {
  const clean = text.replace(/```(?:json)?/gi, '').trim();
  try { return JSON.parse(clean); } catch { /* texte autour : on isole l'objet */ }
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new LocalizationError('INVALID_OUTPUT');
  try { return JSON.parse(clean.slice(start, end + 1)); } catch (cause) { throw new LocalizationError('INVALID_OUTPUT', cause); }
}

/** Budget total d'un repérage (le téléphone abandonne à 22 s). */
export const LOCALIZE_DEADLINE_MS = 18_000;
/** Un 2e essai n'a lieu que si le 1er a échoué VITE (erreur passagère). */
export const LOCALIZE_RETRY_WINDOW_MS = 7_000;
/** Appels vision simultanés ; au-delà, on attend une place au lieu de refuser. */
const MAX_ACTIVE = 6;
const QUEUE_WAIT_MS = 4_000;

const cache = new Map<string, { at: number; products: LocalizedProduct[] }>();
let active = 0;
const waiting: Array<() => void> = [];

/** Prend une place, en attendant au plus `QUEUE_WAIT_MS` (avant : refus immédiat à 4). */
async function acquireSlot(signal: AbortSignal): Promise<void> {
  if (active < MAX_ACTIVE) { active++; return; }
  await new Promise<void>((resolve, reject) => {
    const grant = () => { clearTimeout(timer); signal.removeEventListener('abort', onAbort); active++; resolve(); };
    const drop = () => { const index = waiting.indexOf(grant); if (index >= 0) waiting.splice(index, 1); };
    const timer = setTimeout(() => { drop(); signal.removeEventListener('abort', onAbort); reject(new LocalizationError('BUSY')); }, QUEUE_WAIT_MS);
    const onAbort = () => { clearTimeout(timer); drop(); reject(new LocalizationError('TIMEOUT')); };
    signal.addEventListener('abort', onAbort, { once: true });
    waiting.push(grant);
  });
}
function releaseSlot() {
  active--;
  waiting.shift()?.();
}

export async function localizeProducts(
  image: Buffer,
  mime: string,
  point?: ImagePoint,
  signal?: AbortSignal
): Promise<LocalizedProduct[]> {
  const key = createHash('sha256')
    .update(image)
    .update(JSON.stringify(point || null))
    .digest('hex');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 120000) return hit.products;
  const provider = getAyroviAiCore().responses();
  if (!provider.isConfigured()) throw new LocalizationError('NOT_CONFIGURED');
  const deadline = AbortSignal.timeout(LOCALIZE_DEADLINE_MS);
  const budget = signal ? AbortSignal.any([signal, deadline]) : deadline;
  const startedAt = Date.now();
  await acquireSlot(budget);
  try {
    let lastError: unknown;
    // Un seul nouvel essai, et seulement après un échec RAPIDE (surcharge
    // passagère du fournisseur, réponse illisible) : jamais au-delà du budget.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await runLocalization(provider, image, mime, point, budget, key);
      } catch (error) {
        lastError = error;
        if (signal?.aborted) throw error;
        if (deadline.aborted) throw new LocalizationError('TIMEOUT', error);
        if (Date.now() - startedAt > LOCALIZE_RETRY_WINDOW_MS) break;
      }
    }
    throw lastError instanceof LocalizationError ? lastError : new LocalizationError('PROVIDER', lastError);
  } finally {
    releaseSlot();
  }
}

async function runLocalization(
  provider: ReturnType<ReturnType<typeof getAyroviAiCore>['responses']>,
  image: Buffer,
  mime: string,
  point: ImagePoint | undefined,
  budget: AbortSignal,
  key: string
): Promise<LocalizedProduct[]> {
    const result = await provider.complete(
      {
        workload: 'vision',
        modelClass: 'default',
        temperature: 0,
        maxOutputTokens: 1800,
        instructions:
          'Ground individual shopping products in this image. Return normalized [x,y,width,height] boxes and honest confidence, not prices or merchant matches. Clothing worn on a person must be separate garments/accessories, not the whole person. Exclude scene background, people, screenshots chrome and uncertain objects. Empty products if no reliable object. A box must tightly enclose the complete visible item, not a fixed region around a point. Never invent a box.',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  mediaType: mime,
                  data: image.toString('base64'),
                },
              },
              {
                type: 'text',
                text: point
                  ? `Locate ONLY the shopping item touched at normalized x=${point.x}, y=${point.y}. Do not include other garments or nearby items. If ambiguous or no item there, return empty products.`
                  : 'Locate up to 12 distinct visible shopping items.',
              },
            ],
          },
        ],
        outputSchema: {
          name: 'lens_product_localization',
          schema: {
            type: 'object',
            properties: {
              products: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    category: { type: 'string' },
                    confidence: { type: 'number' },
                    box: { type: 'array', items: { type: 'number' } },
                  },
                  required: ['name', 'category', 'confidence', 'box'],
                  additionalProperties: false,
                },
              },
            },
            required: ['products'],
            additionalProperties: false,
          },
        },
      },
      budget
    );
    let parsed: LocalizedProduct[];
    try {
      parsed = parseLocalizedProducts(extractLocalizationJson(result.textBlocks.join('')), point);
    } catch (error) {
      throw error instanceof LocalizationError ? error : new LocalizationError('INVALID_OUTPUT', error);
    }
    if (cache.size >= 64) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), products: parsed });
    return parsed;
}
