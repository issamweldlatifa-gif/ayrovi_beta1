/**
 * Envoi de notifications push — FCM HTTP v1, SANS dépendance.
 *
 * ── Pourquoi pas `google-auth-library` ──────────────────────────────────────
 * La porte n° 4 de la CI est `npm audit --audit-level=high` : chaque paquet
 * ajouté est une dette de sécurité qu'on ne maîtrise pas. Or ce dont on a
 * besoin se résume à signer un JWT en RS256 et à poster un JSON — `node:crypto`
 * le fait très bien, et l'empreinte du code est de cent lignes auditable.
 *
 * ── Le contrat d'honnêteté ──────────────────────────────────────────────────
 * Ce module ne prétend JAMAIS avoir envoyé ce qu'il n'a pas envoyé. Trois
 * états, pas deux :
 *   • `sent`      — FCM a accepté (200) ;
 *   • `invalid`   — FCM dit que le jeton n'existe plus : l'appareil est à
 *                   révoquer, et c'est une information UTILE, pas un échec ;
 *   • `failed`    — tout le reste (réseau, quota, configuration).
 * Et quand Firebase n'est pas configuré, `pushConfigured()` rend `false` :
 * l'appelant n'envoie rien au lieu d'annoncer une réussite.
 */

import { createSign, randomUUID } from 'node:crypto';

export interface PushConfig {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

/**
 * Les clés privées arrivent presque toujours avec des `\n` LITTÉRAUX (variable
 * d'environnement d'un hébergeur, `.env` sur une seule ligne). Sans ce
 * rétablissement, `createSign` échoue d'une façon illisible — « error:0909006C»
 * — et quelqu'un passera une heure à chercher une panne réseau.
 */
export function normalizePrivateKey(raw: string): string {
  const key = String(raw || '').trim();
  if (!key) return '';
  return key.includes('\n') ? key : key.replace(/\\n/g, '\n');
}

export function pushConfigFromEnv(env: NodeJS.ProcessEnv = process.env): PushConfig {
  return {
    projectId: String(env.FIREBASE_PROJECT_ID || '').trim(),
    clientEmail: String(env.FIREBASE_CLIENT_EMAIL || '').trim(),
    privateKey: normalizePrivateKey(String(env.FIREBASE_PRIVATE_KEY || '')),
  };
}

export function pushConfigured(config: PushConfig = pushConfigFromEnv()): boolean {
  return Boolean(config.projectId && config.clientEmail && config.privateKey.includes('PRIVATE KEY'));
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

/** base64url — ni `btoa`, ni dépendance. */
function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Fabrique l'assertion JWT. Fonction pure (le résultat est déterministe à
 * `iat`/`exp` près, injectés) : c'est ce qui la rend testable avec une clé
 * générée à la volée.
 */
/** Vide le cache du jeton d'accès — indispensable aux tests, inoffensif ailleurs. */
export function resetPushTokenCache(): void {
  cachedToken = null;
}

export function buildFcmAssertion(
  config: Pick<PushConfig, 'clientEmail' | 'privateKey'>,
  now: number,
): string {
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify({
    iss: config.clientEmail,
    scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token',
    // Une heure, comme l'exige Google ; on renouvelle bien avant.
    iat: Math.floor(now / 1000),
    exp: Math.floor(now / 1000) + 3600,
  }));
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(config.privateKey, 'base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${header}.${claims}.${signature}`;
}

export interface FcmPayload {
  title: string;
  body: string;
  /** Données libres : FCM exige des CHAÎNES, un nombre serait rejeté. */
  data?: Record<string, string>;
}

/** Corps de la requête `messages:send`. Extrait pour être testé sans réseau. */
export function fcmMessageBody(token: string, payload: FcmPayload): Record<string, unknown> {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload.data || {})) {
    if (value === undefined || value === null) continue;
    data[key] = String(value).slice(0, 1000);
  }
  return {
    message: {
      token,
      notification: { title: String(payload.title).slice(0, 200), body: String(payload.body).slice(0, 1000) },
      data: Object.keys(data).length > 0 ? data : undefined,
      android: { priority: 'HIGH', notification: { channelId: 'ayrovi-default', sound: 'default' } },
    },
  };
}

export type PushOutcome =
  | { status: 'sent'; id: string }
  | { status: 'invalid'; reason: string }
  | { status: 'failed'; reason: string };

/** Jeton d'accès mis en cache jusqu'à sa vraie expiration. */
let cachedToken: { value: string; expiresAt: number } | null = null;

/**
 * `fetchImpl` pour l'échange de jeton AUSSI : le laisser filer vers le réseau
 * réel rendait « envoi réussi » intestable — et un chemin qu'on ne peut pas
 * tester est un chemin qu'on ne peut pas garantir.
 */
async function fetchAccessToken(config: PushConfig, fetchImpl: FetchImpl = defaultFetch): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const assertion = buildFcmAssertion(config, Date.now());
  const response = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`FCM_TOKEN_${response.status}`);
  }
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) throw new Error('FCM_TOKEN_EMPTY');
  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + Math.max(60, Number(payload.expires_in) || 3600) * 1000,
  };
  return cachedToken.value;
}

/** `fetchImpl` injectable : les tests n'ont pas à toucher le réseau. */
/**
 * Le type décrit ce que le code utilise VRAIMENT : `json()` pour l'échange de
 * jeton, `text()` pour lire le motif d'un refus. Le limiter à `text()` rendait
 * le chemin « envoi réussi » intestable — et un chemin intestable est un
 * chemin qu'on ne peut pas garantir.
 */
export type FetchImpl = (url: string, init: {
  method: string;
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: () => Promise<unknown>;
}>;

const defaultFetch = (async (url, init) => {
  const response = await fetch(url, init as RequestInit);
  return {
    ok: response.ok,
    status: response.status,
    text: () => response.text(),
    json: () => response.json(),
  };
}) as FetchImpl;

/**
 * Envoie une notification à UN appareil.
 *
 * Ne jette jamais : une panne réseau pendant l'envoi ne doit pas faire échouer
 * la commande qui l'a déclenchée. L'appelant décide quoi faire du résultat.
 */
export async function sendFcmNotification(
  token: string,
  payload: FcmPayload,
  options: { config?: PushConfig; fetchImpl?: FetchImpl } = {},
): Promise<PushOutcome> {
  const config = options.config ?? pushConfigFromEnv();
  if (!pushConfigured(config)) return { status: 'failed', reason: 'PUSH_NOT_CONFIGURED' };
  if (!token) return { status: 'invalid', reason: 'EMPTY_TOKEN' };

  try {
    const accessToken = await fetchAccessToken(config, options.fetchImpl ?? defaultFetch);
    const project = encodeURIComponent(config.projectId);
    const response = await (options.fetchImpl ?? defaultFetch)(
      `https://fcm.googleapis.com/v1/projects/${project}/messages:send`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(fcmMessageBody(token, payload)),
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (response.ok) return { status: 'sent', id: randomUUID() };
    const body = await response.text().catch(() => '');
    // 404 / 400 « registration-token-not-registered » : l'appareil n'existe
    // plus. C'est un fait à exploiter, pas une panne à réessayer.
    const unregistered = body.includes('UNREGISTERED')
      || body.includes('registration-token-not-registered')
      || body.includes('invalid-argument');
    if (response.status === 404 || (response.status === 400 && unregistered)) {
      return { status: 'invalid', reason: `FCM_${response.status}` };
    }
    return { status: 'failed', reason: `FCM_${response.status}` };
  } catch (error) {
    return { status: 'failed', reason: error instanceof Error ? error.message.slice(0, 200) : 'FCM_ERROR' };
  }
}
