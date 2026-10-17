/**
 * Lecture EN FLUX de `/api/ayrovix/analyze-image` (SSE) — Z Lens, téléphone.
 *
 * POURQUOI CE FICHIER EXISTE
 *
 * Le serveur sait émettre les résultats un par un (`card`), l'avancement
 * (`progress`) puis la fin (`done`) — et le SITE le consomme déjà
 * (`client/src/ayrovix/services/lensApi.ts`). Le téléphone, lui, attendait le
 * corps JSON ENTIER : l'utilisateur restait devant un mur de squelettes
 * pendant 30 à 45 secondes, sans savoir si l'application travaillait encore.
 *
 * CONTRAINTE RÉACT NATIVE
 *
 * `fetch` sous React Native n'expose pas `response.body` : pas de lecture
 * incrémentale. Le XHR de RN, lui, expose `responseText` qui GRANDIT au fil
 * de l'eau : c'est la voie. Le multipart est construit par le `FormData`
 * natif — le fichier est lu par la couche native (file://), sans base64 ni
 * copie en mémoire (contrairement à `expo-file-system`, qui rend le corps
 * complet et ne peut donc pas servir un flux).
 *
 * RÈGLE : rien n'est inventé ici. Le client ne fait qu'afficher ce que le
 * serveur envoie — ordre des événements, identification, cartes.
 */
import { apiUrl, authHeaders } from './client';
import { ApiError } from './errors';
import {
  LENS_BASE,
  parseCandidate,
  parseExcluded,
  parseIdentification,
  type LensCandidate,
  type LensIdentification,
  type LensImageResult,
} from './lens';

/** Pas un seul morceau pendant ce délai : le flux est considéré bloqué. */
export const LENS_STREAM_IDLE_MS = 40_000;
/** Délai total côté client (filet de sécurité ; le serveur répond avant). */
export const LENS_STREAM_TOTAL_MS = 60_000;

export type LensProgressStep = 'identified' | 'searching' | 'reading';

export interface LensStreamProgress {
  step: LensProgressStep;
  /** Fiches lues (étape « reading »). */
  done?: number;
  /** Fiches à lire (étape « reading »). */
  total?: number;
  /**
   * L'intitulé du produit — envoyé DÈS l'étape « identified », pour
   * l'afficher avant la première fiche. Il vient du titre SerpApi nettoyé ;
   * aucune vision Anthropic ne prend le relais dans Lens.
   */
  identification?: LensIdentification | null;
}

export type LensStreamItem =
  | { type: 'card'; candidate: LensCandidate }
  | { type: 'progress'; progress: LensStreamProgress }
  | { type: 'done'; meta: { eventId?: string; query?: string; identification?: LensIdentification | null; excluded?: unknown } }
  | { type: 'error'; code: string; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Décode un bloc SSE « event: … / data: … ». Renvoie null si le bloc est vide ou invalide. */
export function parseLensSseBlock(block: string): LensStreamItem | null {
  let event = 'message';
  let raw = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) raw += line.slice(5).trim();
  }
  if (!raw) return null;
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return null; }
  if (!isRecord(payload)) return null;
  switch (event) {
    case 'card': {
      const sourceUrl = String(payload.sourceUrl || '');
      if (!sourceUrl) return null;
      try { return { type: 'card', candidate: parseCandidate(payload) }; } catch { return null; }
    }
    case 'progress': {
      const step = String(payload.step || '');
      if (step !== 'identified' && step !== 'searching' && step !== 'reading') return null;
      const identification = payload.identification
        ? parseIdentification(payload.identification)
        : null;
      return {
        type: 'progress',
        progress: {
          step,
          done: typeof payload.done === 'number' ? payload.done : undefined,
          total: typeof payload.total === 'number' ? payload.total : undefined,
          identification,
        },
      };
    }
    case 'done':
      return {
        type: 'done',
        meta: {
          eventId: typeof payload.eventId === 'string' ? payload.eventId : undefined,
          query: typeof payload.query === 'string' ? payload.query : undefined,
          identification: payload.identification ? parseIdentification(payload.identification) : null,
          excluded: payload.excluded,
        },
      };
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

/**
 * Découpe un flux SSE en blocs et les distribue.
 *
 * Le découpage se fait sur la ligne vide (`\n\n`) qui sépare deux blocs : un
 * bloc peut être coupé en deux dans la réception, il est donc mis en attente
 * jusqu'à ce qu'il soit complet.
 */
export function createLensSseReader(onItem: (item: LensStreamItem) => void): {
  push: (chunk: string) => void;
  flush: () => void;
} {
  let buffer = '';
  const consume = (block: string) => {
    const item = parseLensSseBlock(block);
    if (item) onItem(item);
  };
  return {
    push(chunk: string) {
      buffer += chunk;
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const block of parts) consume(block);
    },
    flush() {
      const rest = buffer.trim();
      buffer = '';
      if (rest) consume(rest);
    },
  };
}

export interface LensStreamOptions {
  roi?: { x: number; y: number; w: number; h: number };
  signal?: AbortSignal;
  /** Étape d'avancement : « identified », « searching », « reading ». */
  onProgress?: (progress: LensStreamProgress) => void;
  /** Une fiche dès la découverte SerpApi, puis mise à jour après lecture marchande. */
  onCard?: (candidate: LensCandidate) => void;
  /** Délai maximal d'inactivité (défaut : `LENS_STREAM_IDLE_MS`). */
  idleMs?: number;
  /** Délai maximal total (défaut : `LENS_STREAM_TOTAL_MS`). */
  totalMs?: number;
}

/**
 * Analyse une image en flux : les résultats arrivent au fil de l'eau.
 *
 * Résout avec le résultat complet (identique à la voie JSON) ; les callbacks
 * `onProgress` / `onCard` sont appelés en plus, pendant l'analyse.
 */
export function analyzeImageStream(
  file: { uri: string; name: string; type: string },
  options: LensStreamOptions = {},
): Promise<LensImageResult> {
  const idleMs = options.idleMs ?? LENS_STREAM_IDLE_MS;
  const totalMs = options.totalMs ?? LENS_STREAM_TOTAL_MS;

  return new Promise<LensImageResult>((resolve, reject) => {
    if (!String(file.uri || '').trim()) {
      reject(new ApiError('device', 'Aucune photo à analyser.', { code: 'IMAGE_FILE_MISSING' }));
      return;
    }

    const xhr = new XMLHttpRequest();
    let settled = false;
    let consumed = 0;
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    let totalTimer: ReturnType<typeof setTimeout> | undefined;
    let abortedByCaller = false;
    let timedOut = false;

    const cards: LensCandidate[] = [];
    let identification: LensIdentification | null = null;
    let doneMeta: { eventId?: string; query?: string; identification?: LensIdentification | null; excluded?: unknown } = {};
    let sawDone = false;

    const cleanup = () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (totalTimer) clearTimeout(totalTimer);
      options.signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const succeed = (result: LensImageResult) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };
    const armIdle = () => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        timedOut = true;
        try { xhr.abort(); } catch { /* déjà arrêté */ }
        fail(new ApiError('timeout', "L'analyse a pris trop de temps. Réessayez avec une photo plus nette.", { code: 'ANALYZE_TIMEOUT' }));
      }, idleMs);
    };
    function onAbort() {
      abortedByCaller = true;
      try { xhr.abort(); } catch { /* déjà arrêté */ }
      fail(new ApiError('aborted', 'Analyse annulée.', { code: 'ABORTED' }));
    }

    const reader = createLensSseReader((item) => {
      armIdle();
      if (item.type === 'error') {
        fail(new ApiError('http', item.message, { code: item.code, status: 422 }));
        return;
      }
      if (item.type === 'progress') {
        if (item.progress.identification) identification = item.progress.identification;
        options.onProgress?.(item.progress);
        return;
      }
      if (item.type === 'card') {
        // SerpApi publishes a title/image/link first; Bright Data may later
        // publish the same link with merchant facts. Replace, do not discard,
        // that update. A link still occupies only one grid card.
        const existing = cards.findIndex((entry) => entry.sourceUrl === item.candidate.sourceUrl);
        if (existing < 0) cards.push(item.candidate);
        else cards[existing] = item.candidate;
        options.onCard?.(item.candidate);
        return;
      }
      sawDone = true;
      doneMeta = item.meta;
      if (item.meta.identification) identification = item.meta.identification;
    });

    try {
      xhr.open('POST', apiUrl(`${LENS_BASE}/analyze-image`));
      xhr.setRequestHeader('Accept', 'text/event-stream');
      xhr.setRequestHeader('x-ayrovi-native', '1');
      for (const [name, value] of Object.entries(authHeaders('POST'))) xhr.setRequestHeader(name, value);
    } catch (error) {
      fail(new ApiError('network', "Connexion impossible.", { code: 'NETWORK_ERROR', cause: error }));
      return;
    }

    if (options.signal?.aborted) { onAbort(); return; }
    options.signal?.addEventListener('abort', onAbort, { once: true });

    totalTimer = setTimeout(() => {
      timedOut = true;
      try { xhr.abort(); } catch { /* déjà arrêté */ }
      fail(new ApiError('timeout', "L'analyse a pris trop de temps. Réessayez avec une photo plus nette.", { code: 'ANALYZE_TIMEOUT' }));
    }, totalMs);
    armIdle();

    // Lecture incrémentale : `responseText` est cumulatif, on ne consomme que
    // ce qui est nouveau. Si la plateforme ne livre le corps qu'à la fin,
    // `onload` reprend la main et le même lecteur traite le texte complet.
    xhr.onprogress = () => {
      const text = xhr.responseText;
      if (typeof text !== 'string' || text.length <= consumed) return;
      reader.push(text.slice(consumed));
      consumed = text.length;
    };

    xhr.onload = () => {
      const contentType = String(xhr.getResponseHeader('content-type') || '');
      if (!contentType.includes('event-stream')) {
        // Réponse classique (erreur JSON, ou serveur qui n'a pas streamé).
        let payload: unknown = null;
        try { payload = JSON.parse(xhr.responseText || 'null'); } catch { payload = null; }
        if (isRecord(payload) && payload.success === false) {
          fail(new ApiError('http', String(payload.error || 'Erreur du serveur.'), {
            code: String(payload.code || 'INTERNAL_ERROR'),
            status: xhr.status,
          }));
          return;
        }
        if (isRecord(payload) && isRecord(payload.data)) {
          succeed({
            identification: parseIdentification(payload.data.identification),
            query: String(payload.data.query || ''),
            candidates: Array.isArray(payload.data.candidates)
              ? payload.data.candidates.map((item) => parseCandidate(item)).filter(Boolean)
              : [],
            eventId: String(payload.data.eventId || ''),
            message: null,
            excluded: parseExcluded(payload.data.excluded),
          });
          return;
        }
        fail(new ApiError('malformed', 'Réponse illisible.', { code: 'MALFORMED_RESPONSE', status: xhr.status }));
        return;
      }
      try { reader.flush(); } catch { /* bloc final incomplet : ignoré */ }
      if (!sawDone) {
        // Flux fermé sans « done » : jamais un résultat vide silencieux.
        fail(new ApiError('network', "La connexion a été interrompue avant la fin de l'analyse. Réessayez.", {
          code: 'STREAM_INCOMPLETE',
          status: xhr.status,
        }));
        return;
      }
      succeed({
        identification: identification ?? parseIdentification(undefined),
        query: doneMeta.query ?? '',
        candidates: cards,
        eventId: doneMeta.eventId ?? '',
        message: null,
        excluded: parseExcluded(doneMeta.excluded),
      });
    };

    xhr.onerror = () => {
      if (abortedByCaller) return;
      fail(new ApiError('network', "Connexion impossible.", { code: 'NETWORK_ERROR' }));
    };
    xhr.onabort = () => {
      if (abortedByCaller) return;
      if (timedOut) return; // le délai a déjà produit son erreur
      fail(new ApiError('network', "La connexion a été interrompue avant la fin de l'analyse. Réessayez.", {
        code: 'STREAM_INCOMPLETE',
      }));
    };

    try {
      const form = new FormData();
      // Le fichier est lu par la couche native (file://) : pas de base64, pas
      // de copie en mémoire JavaScript.
      form.append('image', { uri: file.uri, name: file.name, type: file.type } as unknown as Blob);
      if (options.roi) form.append('roi', JSON.stringify(options.roi));
      xhr.send(form);
    } catch (error) {
      fail(new ApiError('device', "La photo n'a pas pu être envoyée.", { code: 'IMAGE_UPLOAD_FAILED', cause: error }));
    }
  });
}
