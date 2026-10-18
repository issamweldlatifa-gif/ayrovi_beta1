/**
 * AYWEBs — phases de lecture (Q7).
 *
 * ── Le principe, et il n'est pas négociable ─────────────────────────────────
 * Une attente « compréhensible » n'est pas une attente décorée : c'est une
 * attente qui DIT où elle en est. Chaque phase ci-dessous correspond à un
 * jalon RÉEL du code, pas à une estimation :
 *
 *   1. `preparing` — `fetchAyWebsCaptureScript()` : on va chercher le lecteur ;
 *   2. `reading`   — `injectJavaScript(...)` : la page du marchand est lue, on
 *                    attend le message du pont (15 s au plus) ;
 *   3. `resolving` — `resolveAyWebsProductWithCapture(...)` : le SERVEUR
 *                    classifie, vérifie le prix et la disponibilité.
 *
 * Un indicateur qui avance tout seul, lui, ment dès que le réseau traîne : il
 * finit à 99 % pendant qu'il ne s'est rien passé. Mieux vaut trois jalons
 * vrais qu'une barre qui rassure à tort.
 *
 * ── Le décompte, lui aussi, est un fait ─────────────────────────────────────
 * `remainingSeconds` ne prédit RIEN : il retranche le temps écoulé de la
 * BUDGET réel de la capture (celui du minuteur d'abandon). Afficher « 8 s »
 * quand il reste 8 secondes de budget est une information ; afficher « 80 % »
 * serait une invention.
 */

export type ReadPhase = 'idle' | 'preparing' | 'reading' | 'resolving' | 'done' | 'failed';

/** Les trois phases d'ATTENTE, dans l'ordre où elles se produisent. */
export const WAITING_PHASES: ReadPhase[] = ['preparing', 'reading', 'resolving'];

/** Les phases qui se terminent : l'indicateur s'arrête, il ne tourne plus. */
export const TERMINAL_PHASES: ReadPhase[] = ['done', 'failed'];

export function isWaitingPhase(phase: ReadPhase): boolean {
  return phase === 'preparing' || phase === 'reading' || phase === 'resolving';
}

export function isTerminalPhase(phase: ReadPhase): boolean {
  return phase === 'done' || phase === 'failed';
}

/**
 * Position dans la file d'attente : `-1` avant de commencer, `3` une fois
 * terminé. Sert à marquer les jalons déjà franchis — et UNIQUEMENT eux.
 */
export function phaseIndex(phase: ReadPhase): number {
  const index = WAITING_PHASES.indexOf(phase);
  if (index >= 0) return index;
  return isTerminalPhase(phase) ? WAITING_PHASES.length : -1;
}

/** Budget de la capture : le même que le minuteur d'abandon de l'écran. */
export const CAPTURE_BUDGET_MS = 15_000;

/**
 * Secondes restantes AVANT l'abandon. Jamais négatif, jamais au-delà du
 * budget : un affichage qui descend sous zéro annoncerait une seconde qui
 * n'existe pas.
 */
export function remainingSeconds(elapsedMs: number, budgetMs: number = CAPTURE_BUDGET_MS): number {
  const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const budget = Number.isFinite(budgetMs) && budgetMs > 0 ? budgetMs : CAPTURE_BUDGET_MS;
  return Math.max(0, Math.ceil((budget - elapsed) / 1000));
}

/**
 * État d'un jalon, pour l'affichage. Volontairement dérivé de deux mesures
 * (`index`, `phase`) et non d'un compteur qui avance : c'est ce qui rend le
 * composant incapable de mentir.
 */
export type StepState = 'done' | 'active' | 'waiting';

export function stepState(index: number, phase: ReadPhase): StepState {
  const current = phaseIndex(phase);
  if (current > index) return 'done';
  if (current === index) return 'active';
  return 'waiting';
}
