/**
 * Déclaration du client et remise de session.
 *
 * Le WEB utilise un cookie SameSite (même origine que l'API). L'APPLICATION
 * mobile ne peut pas : elle n'a pas d'« origine de l'API », et un cookie ne se
 * range pas dans un trousseau sécurisé. Elle déclare donc son type et reçoit
 * le jeton de session dans le corps de la réponse, une seule fois, pour le
 * garder elle-même (expo-secure-store).
 *
 * Deux en-têtes sont reconnus :
 *   • `x-ayrovi-client: mobile/<version>` — le client de la nouvelle
 *     application (AYROVI React Native). Reçoit `session_token`.
 *   • `x-ayrovi-native: 1` — l'ancienne coque Capacitor, encore installée chez
 *     des utilisateurs. Reçoit `native_session_token`, exactement comme avant.
 *     Cette branche disparaîtra avec elle ; elle est isolée ici pour que la
 *     suppression soit une ligne, pas une chasse.
 *
 * Aucun des deux n'affaiblit le web : le cookie reste le seul mécanisme des
 * navigateurs, et un client qui demande un jeton le fait sur sa PROPRE session,
 * créée par sa propre authentification, sur HTTPS.
 */
import type { Request } from 'express';

export const MOBILE_CLIENT_HEADER = 'x-ayrovi-client';
export const LEGACY_NATIVE_HEADER = 'x-ayrovi-native';

/** `mobile/2.0.0`, `mobile/2` → vrai. Le type et la version, rien d'autre. */
export function isMobileClient(req: Request): boolean {
  return /^mobile\/\d+(\.\d+)*$/.test(String(req.headers[MOBILE_CLIENT_HEADER] || '').trim());
}

/** Ancienne coque Capacitor (04/10/2026 → retrait avec elle). */
export function isLegacyNativeClient(req: Request): boolean {
  return String(req.headers[LEGACY_NATIVE_HEADER] || '') === '1';
}

export interface IssuedSession {
  token: string;
  expiresAt: string;
}

/**
 * Champs à ajouter à une réponse d'authentification réussie, selon le client.
 * Un navigateur ne reçoit RIEN : son jeton reste dans un cookie HttpOnly, hors
 * de portée du JavaScript.
 */
export function sessionExchangeFields(req: Request, session: IssuedSession): Record<string, string> {
  const fields: Record<string, string> = {};
  // Un client qui se déclarerait deux fois est contradictoire : le client
  // déclaré le plus récent gagne, et la réponse ne porte jamais les DEUX clés.
  if (isMobileClient(req)) {
    fields.session_token = session.token;
    fields.session_expires_at = session.expiresAt;
  } else if (isLegacyNativeClient(req)) fields.native_session_token = session.token;
  return fields;
}
