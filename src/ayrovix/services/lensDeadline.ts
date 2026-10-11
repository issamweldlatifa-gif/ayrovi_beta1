/**
 * Délai global de /analyze-image et étapes de progression.
 * Sans délai global, une étape qui ne répond pas laisse le client sur « Analyse en cours… ».
 */

export const LENS_ANALYZE_DEADLINE_DEFAULT_MS = 45_000;
export const LENS_ANALYZE_DEADLINE_MIN_MS = 15_000;
export const LENS_ANALYZE_DEADLINE_MAX_MS = 90_000;

export function lensAnalyzeDeadlineMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env.AYROVI_LENS_ANALYZE_DEADLINE_MS);
  if (!Number.isFinite(raw) || raw <= 0) return LENS_ANALYZE_DEADLINE_DEFAULT_MS;
  return Math.min(LENS_ANALYZE_DEADLINE_MAX_MS, Math.max(LENS_ANALYZE_DEADLINE_MIN_MS, Math.round(raw)));
}

export type LensProgressStep = 'identified' | 'searching' | 'reading';

export interface LensProgressEvent {
  step: LensProgressStep;
  /** Nombre de fiches prêtes (étape « reading ») */
  done?: number;
  /** Nombre total de fiches à lire (étape « reading ») */
  total?: number;
}

/**
 * Armé au début de la requête. Quand il se déclenche, la réponse reçoit une erreur
 * explicite ANALYZE_TIMEOUT. Le travail restant est ignoré par le handler (flag `timedOut`).
 */
export function armLensDeadline(ms: number, onTimeout: () => void): () => void {
  const timer = setTimeout(onTimeout, ms);
  if (typeof (timer as any).unref === 'function') (timer as any).unref();
  return () => clearTimeout(timer);
}
