import { registerPlugin } from '@capacitor/core';
import { AYROVI_API_ORIGIN } from '../services/apiOrigin';
import { isNativeApp } from '../services/nativeShell';

/**
 * Connexion par fournisseur (Google / Facebook / Apple) DANS l'application.
 *
 * ── Le défaut corrigé (04/10/2026) : « erreur 404 à la connexion Google » ────
 * Le bouton était un lien RELATIF `/api/customer/auth/google/start`. Dans
 * l'APK, l'interface est servie depuis `https://localhost` (paquet Capacitor) ;
 * le pont `nativeApiOrigin` ne réécrit que `fetch` et XHR, jamais une
 * NAVIGATION. Le clic partait donc vers `https://localhost/api/customer/auth/
 * google/start`, où aucun serveur n'écoute → 404. Et même si l'URL avait été
 * absolue, deux murs suivaient :
 *   1. Google refuse les WebView embarquées (`disallowed_useragent`) ;
 *   2. le cookie de session déposé sur l'origine de l'API n'atteint jamais
 *      l'origine de la coque : l'utilisateur serait resté déconnecté.
 *
 * ── Ce que fait ce module ───────────────────────────────────────────────────
 * 1. il tire un code de remise aléatoire (32 octets) ;
 * 2. il ouvre `…/start?nativeHandoff=…` dans le NAVIGATEUR SYSTÈME (la coque
 *    n'autorise aucune navigation externe : Capacitor délègue à Android) ;
 * 3. il réclame ensuite le jeton de session à `POST /auth/native/claim`,
 *    endpoint à usage unique. Tant que l'utilisateur n'a pas fini, le serveur
 *    répond 404 `HANDOFF_PENDING` et on attend — sans jamais afficher un état
 *    « connecté » qui n'existe pas.
 *
 * Sur le WEB ce module n'est pas utilisé : le lien relatif reste le parcours
 * normal, cookie same-origin compris. Aucune régression.
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
}

/**
 * Ouvre le flux du fournisseur SANS quitter l'application.
 *
 * ── Correction du 04/10/2026 (deuxième passe) ───────────────────────────────
 * La première version appelait `window.open`, que la coque délègue à Android :
 * l'utilisateur basculait dans Chrome, une AUTRE application, et devait
 * revenir à la main. Le client l'a refusé : « تسجيل دخول بش ولي داخل تطبيق لا
 * خروج من تطبيق ».
 *
 * On passe donc par un ONGLET PERSONNALISÉ, qui s'ouvre dans notre propre
 * tâche et se referme seul. Ce n'est pas un détail cosmétique : c'est la seule
 * voie qui satisfasse les deux contraintes à la fois —
 *   • Google REFUSE les WebView embarquées (`disallowed_useragent`), donc on
 *     ne peut pas afficher sa page dans notre WebView ;
 *   • le navigateur système fait sortir de l'application.
 * L'onglet personnalisé est le moteur de Chrome (agent utilisateur accepté,
 * mot de passe invisible pour AYROVI) hébergé dans notre pile d'activités.
 *
 * Repli honnête : hors coque, ou si aucun navigateur compatible n'existe, on
 * retombe sur l'ancien comportement plutôt que de ne rien faire.
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
