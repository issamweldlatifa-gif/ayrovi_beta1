/**
 * Lens — flux SSE de `POST /api/ayrovix/analyze-image` (même contrat que le site).
 *
 * Pourquoi XMLHttpRequest et pas `fetch` : React Native ne donne pas le corps de la
 * réponse au fur et à mesure avec `fetch`. XHR expose `responseText` pendant la
 * réception, ce qui permet d'afficher chaque étape et chaque fiche dès qu'elle arrive.
 *
 * Règle : aucune étape n'est simulée ici. `progress`, `card`, `done` et `error` viennent
 * du serveur, et un flux qui se coupe sans `done` est une erreur (`STREAM_INCOMPLETE`),
 * jamais un succès silencieux.
 */
import { apiUrl, authHeaders } from './client';
import { failureFrom, parseRetryAfter } from './envelope';
import { ApiError } from './errors';
import {
  LENS_BASE, parseLensAnalysis, parseLensCandidate,
  type LensAnalysis, type LensCandidate, type LensImageInput,
} from './lens';

export type LensStep = 'identified' | 'searching' | 'reading';

export interface LensProgress {
  step: LensStep;
  done?: number;
  total?: number;
}

export type LensStreamEvent =
  | { type: 'progress'; progress: LensProgress }
  | { type: 'card'; payload: Record<string, unknown> }
  | { type: 'done'; meta: Record<string, unknown> }
  | { type: 'error'; code: string; message: string };

const STEPS: readonly LensStep[] = ['identified', 'searching', 'reading'];

/** Sans nouvelle donnée pendant ce délai ⇒ `ANALYZE_TIMEOUT` (comme le site). */
export const LENS_STALL_TIMEOUT_MS = 40_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const finiteOrUndefined = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/**
 * Découpe le texte reçu en blocs complets (séparés par une ligne vide).
 * Le reste incomplet est rendu tel quel pour le bloc suivant.
 */
export function takeSseBlocks(buffer: string): { blocks: string[]; rest: string } {
  const parts = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  return { blocks: parts, rest };
}

/** Décode un bloc `event: … / data: …`. `null` si le bloc est vide ou invalide. */
export function parseLensSseBlock(block: string): LensStreamEvent | null {
  let event = 'message';
  let raw = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) raw += line.slice(5).trim();
  }
  if (!raw) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(payload)) return null;

  switch (event) {
    case 'progress': {
      const step = String(payload.step ?? '');
      if (!STEPS.includes(step as LensStep)) return null;
      return {
        type: 'progress',
        progress: {
          step: step as LensStep,
          done: finiteOrUndefined(payload.done),
          total: finiteOrUndefined(payload.total),
        },
      };
    }
    case 'card':
      return typeof payload.sourceUrl === 'string' && payload.sourceUrl
        ? { type: 'card', payload }
        : null;
    case 'done':
      return { type: 'done', meta: payload };
    case 'error':
      return {
        type: 'error',
        code: String(payload.code || 'IDENTIFICATION_FAILED'),
        message: String(payload.error || 'IDENTIFICATION_FAILED'),
      };
    default:
      return null;
  }
}

export interface LensStreamHandlers {
  onProgress?: (progress: LensProgress) => void;
  /** Une fiche produit dès qu'elle arrive (déjà normalisée). */
  onCard?: (candidate: LensCandidate) => void;
}

export interface LensStreamOptions {
  signal?: AbortSignal;
  stallTimeoutMs?: number;
}

/**
 * Envoie la photo et suit le flux jusqu'au `done`.
 * - `error` du serveur ⇒ `ApiError` avec le code du serveur.
 * - Coupure sans `done` ⇒ `STREAM_INCOMPLETE`.
 * - Annulation (signal) ⇒ `ApiError` de type `aborted` (pas de message à afficher).
 */
export function analyzeLensImageStream(
  input: LensImageInput,
  handlers: LensStreamHandlers = {},
  options: LensStreamOptions = {},
): Promise<LensAnalysis> {
  return new Promise<LensAnalysis>((resolve, reject) => {
    if (!input.uri) {
      reject(new ApiError('malformed', 'Aucune image à analyser'));
      return;
    }

    const xhr = new XMLHttpRequest();
    const form = new FormData();
    const name = input.fileName
      || `lens.${input.mimeType === 'image/png' ? 'png' : input.mimeType === 'image/webp' ? 'webp' : 'jpg'}`;
    form.append('image', { uri: input.uri, name, type: input.mimeType } as unknown as Blob);
    if (input.roi) form.append('roi', JSON.stringify(input.roi));

    const rawCards: Record<string, unknown>[] = [];
    let consumed = 0;
    let pending = '';
    let settled = false;
    let stall: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (stall !== undefined) clearTimeout(stall);
      options.signal?.removeEventListener('abort', onAbort);
    };

    const finish = (error: ApiError | null, value?: LensAnalysis) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) {
        try {
          xhr.abort();
        } catch {
          // déjà terminé : rien à faire
        }
        reject(error);
        return;
      }
      resolve(value as LensAnalysis);
    };

    const onAbort = () => finish(new ApiError('aborted', 'Analyse annulée'));

    const armStall = () => {
      if (stall !== undefined) clearTimeout(stall);
      stall = setTimeout(() => {
        finish(new ApiError('timeout', "L'analyse a pris trop de temps.", { code: 'ANALYZE_TIMEOUT' }));
      }, options.stallTimeoutMs ?? LENS_STALL_TIMEOUT_MS);
    };

    const handle = (event: LensStreamEvent | null) => {
      if (!event || settled) return;
      if (event.type === 'progress') {
        handlers.onProgress?.(event.progress);
      } else if (event.type === 'card') {
        rawCards.push(event.payload);
        try {
          handlers.onCard?.(parseLensCandidate(event.payload));
        } catch {
          // fiche invalide : on la saute, les autres continuent
        }
      } else if (event.type === 'error') {
        finish(new ApiError('http', event.message, { code: event.code }));
      } else {
        try {
          finish(null, parseLensAnalysis({ ...event.meta, candidates: rawCards }));
        } catch (error) {
          finish(error instanceof ApiError ? error : new ApiError('malformed', 'analyse'));
        }
      }
    };

    const drain = () => {
      // Une erreur HTTP renvoie du JSON, pas un flux : on ne le découpe pas.
      if (xhr.status >= 400) return;
      const text = typeof xhr.responseText === 'string' ? xhr.responseText : '';
      if (text.length <= consumed) return;
      armStall();
      pending += text.slice(consumed);
      consumed = text.length;
      const { blocks, rest } = takeSseBlocks(pending);
      pending = rest;
      for (const block of blocks) handle(parseLensSseBlock(block));
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState === 3 || xhr.readyState === 4) drain();
    };
    xhr.onprogress = drain;
    xhr.onload = () => {
      drain();
      if (settled) return;
      if (xhr.status >= 400) {
        let payload: unknown = null;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch {
          payload = null;
        }
        finish(failureFrom(xhr.status, payload, parseRetryAfter(xhr.getResponseHeader('Retry-After'))));
        return;
      }
      finish(new ApiError('malformed', 'Flux Lens incomplet', { status: xhr.status, code: 'STREAM_INCOMPLETE' }));
    };
    xhr.onerror = () => finish(new ApiError('network', 'Réseau indisponible'));
    xhr.onabort = () => finish(new ApiError('aborted', 'Analyse annulée'));

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort);
    }

    xhr.open('POST', apiUrl(`${LENS_BASE}/analyze-image`));
    xhr.setRequestHeader('Accept', 'text/event-stream');
    for (const [key, value] of Object.entries(authHeaders('POST'))) xhr.setRequestHeader(key, value);
    armStall();
    xhr.send(form);
  });
}
