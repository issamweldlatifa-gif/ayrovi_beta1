/**
 * Connexion Google NATIVE : le sélecteur de compte Android s'ouvre DANS l'application
 * (pas d'onglet navigateur). L'application n'obtient qu'un jeton d'identité signé par
 * Google ; c'est le serveur qui le vérifie (`/auth/google/native`).
 *
 * Identifiant : `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — l'identifiant de type « Web »,
 * le MÊME que `GOOGLE_CLIENT_ID` côté serveur (le serveur n'accepte que les jetons
 * émis pour cet identifiant). Lu au moment de l'appel : jamais de valeur figée.
 */
import { GoogleSignin, isErrorWithCode, isSuccessResponse } from '@react-native-google-signin/google-signin';
import {
  GOOGLE_CODES, GoogleConfigError, isCancelCode, outcomeFromResponse, type GoogleOutcome,
} from './googleOutcome';

export function googleWebClientId(): string {
  return String(process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '').trim();
}

/**
 * Ouvre le sélecteur natif et rend le jeton, ou « annulé ». Les pannes remontent
 * avec un code connu (`GoogleConfigError` ou code de la bibliothèque).
 */
export async function signInWithGoogleNative(): Promise<GoogleOutcome> {
  const webClientId = googleWebClientId();
  if (!webClientId) throw new GoogleConfigError('GOOGLE_CLIENT_ID_MISSING');

  GoogleSignin.configure({ webClientId, offlineAccess: false });
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    if (isSuccessResponse(response)) return outcomeFromResponse({ type: 'success', data: response.data });
    return { kind: 'cancelled' };
  } catch (error) {
    if (isErrorWithCode(error) && isCancelCode(error.code)) return { kind: 'cancelled' };
    throw error;
  }
}

/** Code connu d'une panne Google, pour choisir le bon message (sinon : message générique). */
export function googleFailureCode(error: unknown): 'play' | 'config' | 'generic' {
  if (error instanceof GoogleConfigError) return 'config';
  if (isErrorWithCode(error)) {
    if (error.code === GOOGLE_CODES.playServices) return 'play';
    // 10 = DEVELOPER_ERROR : empreinte SHA-1 ou identifiant Web ne correspondent pas.
    if (String(error.code) === '10') return 'config';
  }
  return 'generic';
}

/**
 * Code technique d'une panne de configuration Google, à donner au support
 * (ex. `GOOGLE_NO_ID_TOKEN` = identifiant Web absent ou faux ; `10` = empreinte
 * SHA-1 ou identifiant Android qui ne correspondent pas).
 */
export function googleFailureDetail(error: unknown): string {
  if (error instanceof GoogleConfigError) return error.code;
  if (isErrorWithCode(error)) return String(error.code);
  return 'UNKNOWN';
}
