/**
 * Lecture du flux SSE de /api/ayrovix/analyze-image.
 * Module sans dépendance (testé côté serveur) : ne fait que décoder les blocs.
 */

export interface LensProgress {
  step: 'identified' | 'searching' | 'reading';
  done?: number;
  total?: number;
}

export type LensStreamItem =
  | { type: 'card'; candidate: any }
  | { type: 'progress'; progress: LensProgress }
  | { type: 'done'; meta: any }
  | { type: 'error'; code: string; message: string };

/** Décode un bloc SSE « event: … / data: … ». Renvoie null si le bloc est vide ou invalide. */
export function parseLensSseBlock(block: string): LensStreamItem | null {
  let event = 'message';
  let raw = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) raw += line.slice(5).trim();
  }
  if (!raw) return null;
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return null; }
  switch (event) {
    case 'card':
      return payload?.sourceUrl ? { type: 'card', candidate: payload } : null;
    case 'progress':
      return payload && typeof payload.step === 'string' ? { type: 'progress', progress: payload as LensProgress } : null;
    case 'done':
      return { type: 'done', meta: payload || {} };
    case 'error':
      return {
        type: 'error',
        code: String(payload?.code || 'IDENTIFICATION_FAILED'),
        message: String(payload?.error || 'IDENTIFICATION_FAILED'),
      };
    default:
      return null;
  }
}
