/**
 * Z Lens — Live : quand interroger la caméra (sans React, testable).
 *
 * Live repère les produits de la caméra en direct. Chaque repérage envoie une
 * petite image au serveur : on ne le fait donc PAS en boucle aveugle, mais
 * quand le téléphone se STABILISE sur quelque chose de nouveau — comme on vise
 * avec Google Lens. L'accéléromètre dit si le téléphone bouge ; sans capteur,
 * on retombe sur un rythme lent et borné.
 */

export interface MotionSample { x: number; y: number; z: number }

export interface MotionState {
  last: MotionSample | null;
  /** Agitation lissée (moyenne exponentielle des écarts entre mesures, en g). */
  level: number;
  /** Depuis quand le téléphone est calme (ms), ou null s'il bouge. */
  steadySince: number | null;
  /** Dernier instant où un vrai mouvement a été vu. */
  movedAt: number;
}

export const MOTION_MOVE_THRESHOLD = 0.06;
export const MOTION_STEADY_THRESHOLD = 0.03;
export const STEADY_MS = 650;

export function initialMotion(now: number): MotionState {
  return { last: null, level: 0, steadySince: now, movedAt: 0 };
}

export function nextMotion(state: MotionState, sample: MotionSample, now: number): MotionState {
  if (!state.last) return { ...state, last: sample };
  const delta = Math.hypot(sample.x - state.last.x, sample.y - state.last.y, sample.z - state.last.z);
  const level = state.level * 0.6 + delta * 0.4;
  if (level > MOTION_MOVE_THRESHOLD) return { last: sample, level, steadySince: null, movedAt: now };
  if (level < MOTION_STEADY_THRESHOLD) return { last: sample, level, steadySince: state.steadySince ?? now, movedAt: state.movedAt };
  return { ...state, last: sample, level };
}

export function isSteady(state: MotionState, now: number, ms = STEADY_MS): boolean {
  return state.steadySince !== null && now - state.steadySince >= ms;
}

/** Délai minimal entre deux repérages, et rythme de repli sans capteur. */
export const LIVE_MIN_INTERVAL_MS = 2_500;
export const LIVE_FALLBACK_INTERVAL_MS = 4_500;
/** Plafond par ouverture de Live : protège la dépense même si le téléphone tremble sans arrêt. */
export const LIVE_SESSION_BUDGET = 40;

export interface LiveScheduleInput {
  now: number;
  lastDetectAt: number;
  detections: number;
  failures: number;
  sensor: boolean;
  steady: boolean;
  /** Mouvement vu depuis le dernier repérage réussi (la scène a pu changer). */
  movedSinceDetect: boolean;
  hasResult: boolean;
}

/** Faut-il prendre une image et repérer les produits maintenant ? */
export function shouldDetect(input: LiveScheduleInput): boolean {
  if (input.detections >= LIVE_SESSION_BUDGET) return false;
  // Échecs répétés (réseau, quota, service coupé) : on espace de plus en plus.
  const backoff = Math.min(30_000, LIVE_MIN_INTERVAL_MS * 2 ** Math.min(4, input.failures));
  if (input.now - input.lastDetectAt < (input.failures ? backoff : LIVE_MIN_INTERVAL_MS)) return false;
  if (!input.sensor) {
    return !input.hasResult || input.now - input.lastDetectAt >= LIVE_FALLBACK_INTERVAL_MS * 2;
  }
  if (!input.steady) return false;
  return !input.hasResult || input.movedSinceDetect;
}
