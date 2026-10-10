/**
 * Interprétation pure de la réponse du sélecteur de compte Google (sans module natif,
 * donc testable sous vitest). Le module natif appelle ces fonctions.
 */

/** Codes d'erreur de la bibliothèque Google Sign-In (Android). */
export const GOOGLE_CODES = {
  cancelled: '12501', // SIGN_IN_CANCELLED : la personne a fermé le sélecteur
  inProgress: '12502', // IN_PROGRESS : une connexion est déjà ouverte
  playServices: 'PLAY_SERVICES_NOT_AVAILABLE',
} as const;

export type GoogleOutcome =
  | { kind: 'token'; idToken: string }
  | { kind: 'cancelled' };

/** Réponse minimale de la bibliothèque : succès avec données, ou annulation. */
export interface GoogleSignInResponseLike {
  type: 'success' | 'cancelled';
  data?: { idToken?: string | null } | null;
}

/**
 * Renvoie le jeton d'identité, ou « annulé ». Un succès SANS jeton est une panne
 * de configuration (identifiant Web absent ou faux) : on le signale, on ne
 * devine pas.
 */
export function outcomeFromResponse(response: GoogleSignInResponseLike): GoogleOutcome {
  if (response.type !== 'success') return { kind: 'cancelled' };
  const idToken = String(response.data?.idToken ?? '').trim();
  if (!idToken) throw new GoogleConfigError('GOOGLE_NO_ID_TOKEN');
  return { kind: 'token', idToken };
}

/** Erreur de configuration côté application : identifiant Web absent, ou jeton manquant. */
export class GoogleConfigError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = 'GoogleConfigError';
  }
}

/** Une annulation vient parfois en erreur (code 12501), pas en réponse « cancelled ». */
export function isCancelCode(code: unknown): boolean {
  return String(code ?? '') === GOOGLE_CODES.cancelled;
}
