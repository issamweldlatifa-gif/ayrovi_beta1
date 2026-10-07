/**
 * Connexion par fournisseur (Google, Facebook, Apple) — transport de l'application.
 *
 * Principe côté serveur, et il commande tout le reste :
 *   1. l'application fabrique un CODE DE REMISE aléatoire et le garde pour elle ;
 *   2. elle ouvre le navigateur système sur `/auth/{fournisseur}/start`, en
 *      joignant ce code. Le serveur n'en range que l'EMPREINTE, jamais le code ;
 *   3. après le consentement, le serveur dépose la session sous cette empreinte
 *      et redirige le navigateur vers une page « revenez à l'application » ;
 *   4. l'application réclame sa session avec le code (`/auth/native/claim`).
 *      La ligne est détruite à la première réclamation : le code ne sert qu'une
 *      fois, et le laisser traîner dans un historique de navigateur ne donne
 *      accès à rien.
 *
 * Pourquoi une attente active plutôt qu'un schéma d'URL personnalisé : un lien
 * `ayrovi://` renvoyé par Google obligerait à déclarer et faire valider une
 * redirection de plus ; le client, lui, veut voir le moins de navigateur
 * possible. On interroge donc `/auth/native/claim` — 404 `HANDOFF_PENDING` tant
 * que le consentement n'a pas abouti, 200 quand la session est déposée.
 *
 * Google propose AUSSI une voie sans navigateur (`/auth/google/native`) : le
 * sélecteur de compte du système rend un jeton d'identité, que le SERVEUR
 * vérifie auprès de Google. Cette voie demande un identifiant client Google
 * natif ; elle est exposée ici mais elle n'est proposée que si le serveur
 * annonce `google.enabled`.
 */
import { getRandomBytesAsync } from 'expo-crypto';
import { apiSend, apiUrl, type RequestOptions } from './client';
import { parseSessionIssue, type SessionIssue } from './account';

export type ProviderId = 'google' | 'facebook' | 'apple';

/**
 * Code de remise : 32 octets aléatoires en base64url = 43 caractères.
 * Le serveur exige 32 à 128 caractères `[A-Za-z0-9_-]` ; on reste dans la
 * fourchette sans jamais la frôler.
 */
export async function newHandoffCode(bytes = 32): Promise<string> {
  const random = await getRandomBytesAsync(bytes);
  const base64 = base64FromBytes(random);
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** base64 sans dépendre de `btoa` (absent du moteur JavaScript d'Android). */
export function base64FromBytes(bytes: Uint8Array): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += alphabet[a >> 2];
    out += alphabet[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? alphabet[((b & 15) << 2) | (c >> 6)] : '=';
    out += i + 2 < bytes.length ? alphabet[c & 63] : '=';
  }
  return out;
}

/** Chemin de démarrage du flux navigateur pour un fournisseur donné. */
export function providerStartPath(
  provider: ProviderId,
  options: { handoff: string; cartSessionId?: string | null; returnTo?: string | null } = { handoff: '' },
): string {
  const params = new URLSearchParams({ nativeHandoff: options.handoff });
  if (options.cartSessionId) params.set('cartSessionId', options.cartSessionId);
  if (options.returnTo) params.set('returnTo', options.returnTo);
  return `/api/customer/auth/${provider}/start?${params.toString()}`;
}

export function providerStartUrl(provider: ProviderId, handoff: string): string {
  return apiUrl(providerStartPath(provider, { handoff }));
}

/** Le serveur dit « pas encore » : ce n'est pas un échec, c'est une attente. */
export function isHandoffPending(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  const status = (error as { status?: unknown } | null)?.status;
  return code === 'HANDOFF_PENDING' || status === 404;
}

export async function claimHandoff(handoff: string, options?: RequestOptions): Promise<SessionIssue> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/auth/native/claim', {
    ...options,
    body: { handoff },
  });
  return parseSessionIssue(data);
}

/**
 * Connexion Google sans navigateur : l'application apporte un jeton d'identité
 * signé par Google, le serveur le vérifie lui-même (signature, `aud`, `iss`,
 * expiration, adresse vérifiée). L'application ne décide de RIEN.
 */
export async function googleNativeLogin(idToken: string, options?: RequestOptions): Promise<SessionIssue> {
  const { data } = await apiSend<unknown>('POST', '/api/customer/auth/google/native', {
    ...options,
    body: { idToken },
  });
  return parseSessionIssue(data);
}

export interface PollOptions {
  /** Nombre d'interrogations au maximum. */
  attempts?: number;
  /** Délai entre deux interrogations. */
  delayMs?: number;
  claim?: (handoff: string) => Promise<SessionIssue>;
  sleep?: (ms: number) => Promise<void>;
  /** Rend `true` pour arrêter l'attente (bouton « Annuler »). */
  shouldStop?: () => boolean;
  /** Appelé avant chaque pause — permet d'afficher « toujours en attente ». */
  onWait?: (attempt: number) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Attend la session déposée par le serveur après le consentement.
 *
 * Renvoie `null` quand le délai est écoulé ou que l'utilisateur a annulé :
 * une attente qui n'aboutit pas n'est PAS une erreur, c'est une absence de
 * connexion — l'écran doit pouvoir rester véridique sans crier au loup.
 * Toute autre erreur remonte : elle signale un vrai défaut (code refusé).
 */
export async function pollHandoff(handoff: string, options: PollOptions = {}): Promise<SessionIssue | null> {
  const {
    attempts = 40,
    delayMs = 1500,
    claim = (value) => claimHandoff(value),
    sleep = defaultSleep,
    shouldStop,
    onWait,
  } = options;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (shouldStop?.()) return null;
    try {
      return await claim(handoff);
    } catch (error) {
      if (!isHandoffPending(error)) throw error;
    }
    if (attempt === attempts) break;
    onWait?.(attempt);
    await sleep(delayMs);
  }
  return null;
}
