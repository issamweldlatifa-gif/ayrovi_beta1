/**
 * Messages d'erreur de connexion — dans la langue de l'utilisateur.
 *
 * Deux sources, dans cet ordre :
 *   1. le CODE du serveur (`OTP_INVALID`, `EMAIL_TAKEN`…) : il dit précisément
 *      ce qui s'est passé, et l'application sait le traduire ;
 *   2. le TYPE d'erreur réseau (hors-ligne, délai, 429…) : le serveur n'a rien
 *      répondu, donc c'est la couche réseau qui parle.
 *
 * On ne montre JAMAIS le texte brut du serveur : il est toujours en français,
 * et un utilisateur arabophone mérite une phrase dans sa langue.
 */
import { isApiError, userMessage, type LocalizedMessage } from './errors';

/** Message { fr, ar } et clé i18n quand une traduction existe dans le dictionnaire. */
export type AuthMessageKey =
  | 'auth.error.offline' | 'auth.error.rateLimited' | 'auth.error.otpInvalid'
  | 'auth.error.otpExpired' | 'auth.error.phone' | 'auth.error.credentials'
  | 'auth.error.emailTaken' | 'auth.error.unavailable' | 'auth.error.noSession'
  | 'auth.error.register'
  | 'auth.forgot.unavailable' | 'auth.forgot.rateLimited'
  // Clé de repli d'écran : le serveur a refusé (400) sans code exploitable.
  | 'auth.forgot.badEmail'
  | 'profile.photoTooBig' | 'profile.photoFormat' | 'profile.photoUnreadable' | 'profile.photoFailed';

export type AuthMessage = LocalizedMessage | { key: AuthMessageKey };

/**
 * Traduit un code du serveur en clé de dictionnaire.
 *
 * Le STATUT fait partie de la traduction : `AVATAR_UPLOAD_INVALID` décrit un
 * envoi refusé, mais 413 veut dire « trop lourd » quand 400 veut dire
 * « mal formé ». Confondre les deux ferait chercher l'utilisateur dans la
 * mauvaise direction.
 */
export function authMessageForCode(code: string, status = 0): AuthMessageKey | null {
  switch (code) {
    case 'AVATAR_UPLOAD_INVALID':
      return status === 413 ? 'profile.photoTooBig' : 'profile.photoFormat';
    case 'AVATAR_FORMAT_INVALID':
      return 'profile.photoFormat';
    case 'AVATAR_INVALID':
      return 'profile.photoUnreadable';
    case 'AVATAR_REQUIRED':
      return 'profile.photoFailed';
    case 'OTP_INVALID':
      return 'auth.error.otpInvalid';
    case 'OTP_EXPIRED':
    case 'OTP_ALREADY_USED':
      return 'auth.error.otpExpired';
    case 'OTP_UNAVAILABLE':
    case 'OTP_DELIVERY_FAILED':
    case 'OTP_VERIFICATION_FAILED':
      return 'auth.error.unavailable';
    case 'RATE_LIMITED':
    case 'OTP_RATE_LIMITED':
    case 'REGISTER_RATE_LIMITED':
      return 'auth.error.rateLimited';
    // الخادم ما فتحش جلسة للتطبيق: نسخة ما تعرفش عميل الموبايل.
    case 'SESSION_NOT_ISSUED':
      return 'auth.error.noSession';
    case 'EMAIL_TAKEN':
      return 'auth.error.emailTaken';

    // Récupération de mot de passe : le serveur refuse AVANT toute recherche de
    // compte quand l'envoi d'e-mails n'est pas configuré — l'écran doit le dire
    // au lieu de laisser croire qu'un lien part.
    case 'RESET_UNAVAILABLE':
      return 'auth.forgot.unavailable';
    case 'RESET_RATE_LIMITED':
      return 'auth.forgot.rateLimited';
    // Le serveur ne dit pas si c'est l'e-mail ou le mot de passe qui est faux —
    // et c'est volontaire : ne pas révéler quels comptes existent.
    case 'INVALID_CREDENTIALS':
    case 'AUTH_INVALID':
      return 'auth.error.credentials';
    default:
      return null;
  }
}

/**
 * Message présentable pour n'importe quel échec de connexion.
 *
 * `fallback` couvre le cas ambigu : le serveur a refusé (400) sans code
 * exploitable, et seul l'écran sait quoi dire (« numéro invalide » vs
 * « mot de passe »). Sans lui, on retombe sur le message réseau générique.
 */
export function authMessage(error: unknown, fallback?: AuthMessageKey): AuthMessage {
  if (isApiError(error)) {
    const byCode = authMessageForCode(error.code, error.status);
    if (byCode) return { key: byCode };
    if ((error.status === 400 || error.status === 422) && fallback) return { key: fallback };
  }
  return userMessage(error);
}
