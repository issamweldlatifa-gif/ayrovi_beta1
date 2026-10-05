import { registerPlugin } from '@capacitor/core';
import { AYROVI_API_ORIGIN } from '../services/apiOrigin';
import { isNativeApp } from '../services/nativeShell';

/**
 * Connexion fournisseur : Google natif via Android Credential Manager ; les
 * autres fournisseurs utilisent le flux OAuth en Custom Tab avec une remise
 * de session à usage unique. Le web conserve son OAuth same-origin.
 *
 * Google ne passe jamais en Custom Tab sur Android : annulation ou indisponibilité
 * ramène simplement l'utilisateur à l'écran AYROVI. Le jeton d'identité n'est
 * accepté qu'après vérification par le serveur.
 */
export type OAuthProvider = 'google' | 'facebook' | 'apple';

export interface NativeOAuthSession {
  account: any;
  csrfToken: string;
  expiresAt?: string;
  native_session_token?: string;
}

/** Code de remise : seul secret du parcours, jamais réutilisé. */
export function createHandoffCode(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((value) => { binary += String.fromCharCode(value); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * URL de démarrage : ABSOLUE dans l'application (sinon 404 sur l'origine de la
 * coque), RELATIVE sur le web (même origine, cookie conservé).
 */
export function oauthStartUrl(provider: OAuthProvider, query: string, handoff = ''): string {
  const path = `/api/customer/auth/${provider}/start?${query}${handoff ? `&nativeHandoff=${encodeURIComponent(handoff)}` : ''}`;
  return isNativeApp() ? `${AYROVI_API_ORIGIN}${path}` : path;
}

export type NativeGoogleSignInResult =
  | { status: 'success'; session: NativeOAuthSession }
  | { status: 'cancelled' }
  | { status: 'unavailable'; reason: string };

export interface ClaimOptions {
  /** Durée maximale d'attente ; au-delà, l'utilisateur a abandonné. */
  timeoutMs?: number;
  intervalMs?: number;
  signal?: AbortSignal;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Réclame la session une fois le navigateur système revenu. Retourne `null`
 * quand le délai expire : c'est une absence de connexion, pas une erreur à
 * inventer.
 */
export async function claimNativeSession(handoff: string, options: ClaimOptions = {}): Promise<NativeOAuthSession | null> {
  const timeoutMs = options.timeoutMs ?? 5 * 60_000;
  const intervalMs = options.intervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (options.signal?.aborted) return null;
    try {
      const response = await fetch(`${AYROVI_API_ORIGIN}/api/customer/auth/native/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-ayrovi-native': '1' },
        body: JSON.stringify({ handoff }),
        signal: options.signal,
      });
      if (response.ok) {
        const payload = await response.json().catch(() => null);
        if (payload?.success && payload.data?.account) return payload.data as NativeOAuthSession;
      }
    } catch {
      /* réseau coupé pendant l'attente : on retentera au prochain tour */
    }
    await sleep(intervalMs);
  }
  return null;
}

interface AuthTabBridge {
  open(options: { url: string }): Promise<{ opened: boolean }>;
  signInWithGoogle(): Promise<{ available: boolean; idToken?: string; reason?: string }>;
}

/**
 * Connexion Google par le SÉLECTEUR DE COMPTE DU SYSTÈME (3e passe,
 * 04/10/2026).
 *
 * ── Pourquoi aller plus loin que l'onglet personnalisé ──────────────────────
 * L'onglet restait une page web qui se déplie par-dessus l'application : le
 * client l'a lue comme « je sors ». Android sait faire mieux — Credential
 * Manager affiche la liste des comptes déjà présents sur le téléphone, en
 * feuille native, sans charger la moindre page. Aucun mot de passe à taper,
 * aucune redirection, aucune bascule.
 *
 * ── Ce qu'on reçoit, et ce qu'on n'en fait PAS ──────────────────────────────
 * Le système rend un jeton d'identité signé par Google. On ne l'interprète
 * pas ici : un jeton lu côté client ne prouve rien, puisque le client est
 * justement ce qu'on cherche à authentifier. Il part tel quel vers
 * POST /auth/google/native, qui le fait valider par Google avant d'ouvrir une
 * session.
 *
 * ── Échec ou annulation ─────────────────────────────────────────────────────
 * Une annulation est un retour normal, sans message d'erreur. Si Credential
 * Manager n'est pas configuré/disponible, on garde le client dans AYROVI et
 * propose ses autres moyens de connexion — aucun basculement automatique vers
 * une page Google en Custom Tab.
 */
function isGooglePickerCancellation(reason: unknown): boolean {
  const value = String(reason || '').toLowerCase();
  return value === 'user_canceled'
    || value === 'user_cancelled'
    || value.includes('type_user_canceled')
    || value.includes('type_user_cancelled');
}

/**
 * Ouvre le sélecteur Android Google, puis échange le jeton contre une session.
 * L'annulation revient simplement à l'écran AYROVI. Une indisponibilité ne
 * déclenche JAMAIS un Custom Tab : le client a demandé à ne pas quitter l'app.
 */
export async function signInWithGoogleNatively(cartSessionId = ''): Promise<NativeGoogleSignInResult> {
  if (!isNativeApp()) return { status: 'unavailable', reason: 'NOT_NATIVE' };

  let picked: { available: boolean; idToken?: string; reason?: string };
  try {
    const plugin = registerPlugin<AuthTabBridge>('AyroviAuthTab');
    picked = await plugin.signInWithGoogle();
  } catch {
    return { status: 'unavailable', reason: 'NATIVE_PLUGIN_UNAVAILABLE' };
  }

  if (isGooglePickerCancellation(picked?.reason)) return { status: 'cancelled' };
  if (!picked?.available || !picked.idToken) {
    return { status: 'unavailable', reason: picked?.reason || 'CREDENTIAL_UNAVAILABLE' };
  }

  try {
    const response = await fetch(`${AYROVI_API_ORIGIN}/api/customer/auth/google/native`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-ayrovi-native': '1' },
      body: JSON.stringify({ idToken: picked.idToken, cartSessionId }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return { status: 'unavailable', reason: String(payload?.code || 'GOOGLE_SESSION_REJECTED') };
    }
    if (payload?.success && payload.data?.account && payload.data?.native_session_token) {
      return { status: 'success', session: payload.data as NativeOAuthSession };
    }
    return { status: 'unavailable', reason: 'GOOGLE_SESSION_INVALID' };
  } catch {
    return { status: 'unavailable', reason: 'GOOGLE_SESSION_NETWORK_ERROR' };
  }
}

/**
 * Flux OAuth en Custom Tab pour les fournisseurs qui n'utilisent pas le
 * sélecteur système Google. Le Custom Tab reste dans la tâche AYROVI, mais
 * présente une page web de fournisseur : le parcours Google natif ne doit pas
 * appeler cette fonction.
 *
 * Si le pont natif manque, le comportement web historique est conservé.
 */
export async function openProviderInAppTab(url: string): Promise<void> {
  if (isNativeApp()) {
    try {
      const plugin = registerPlugin<AuthTabBridge>('AyroviAuthTab');
      const result = await plugin.open({ url });
      if (result?.opened) return;
    } catch {
      /* plugin absent (ancienne coque) : repli ci-dessous */
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}

/** @deprecated conservé pour le web ; préférez openProviderInAppTab. */
export function openProviderInSystemBrowser(url: string): void {
  void openProviderInAppTab(url);
}
