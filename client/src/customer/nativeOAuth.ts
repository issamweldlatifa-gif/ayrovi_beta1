/**
 * Web-only stub — `customer/nativeOAuth`.
 *
 * L'APK Capacitor a été retiré (cf. `services/nativeShell.ts`). L'ancien
 * `nativeOAuth` pilotait un onglet natif in-app via `@capacitor/browser` /
 * `AyWebsBrowseActivity` pour OAuth (Google refuse les WebView embarquées
 * avec `disallowed_useragent`). Sur le web, on retombe sur le flux
 * standard `window.open` vers `/api/customer/auth/{provider}/start` —
 * même comportement que les utilisateurs non-Capacitor historique.
 *
 * Les signatures exportées sont conservées pour ne casser aucun import
 * (`CustomerAccountPage.tsx`, `LensLauncher.tsx`, etc.).
 */

import { isNativeApp } from '../services/nativeShell';

export type OAuthProvider = 'google' | 'facebook' | 'apple';

// Minimal shape: keeps the structural type that the former native flow
// exposed (account, csrfToken, native_session_token) but every field is
// optional. The web flow never produces a real NativeOAuthSession — the
// helpers below all return null on web — so consumers must defensively
// check for null before reading any property.
export interface NativeOAuthSession {
  provider: OAuthProvider;
  account?: unknown;
  csrfToken?: string;
  native_session_token?: string;
  expiresAt?: number;
  handoff?: string;
}

export function createHandoffCode(): string {
  // Web path: no APK to hand off to. Return a random opaque string so
  // server-side code that joins it to callback URLs remains well-typed;
  // the value is unused on web (no native session will claim it).
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function oauthStartUrl(
  provider: OAuthProvider,
  query: string,
  handoff: string = '',
): string {
  // Web only — same-origin /api path. Handoff is appended for parity with
  // the native flow; server endpoints are expected to ignore it on web.
  const params = new URLSearchParams(query);
  if (handoff) params.set('handoff', handoff);
  const qs = params.toString();
  return `/api/customer/auth/${provider}/start${qs ? `?${qs}` : ''}`;
}

export interface ClaimOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
}

export async function claimNativeSession(
  _handoff: string,
  _options: ClaimOptions = {},
): Promise<NativeOAuthSession | null> {
  // No native session store on web. The web flow completes via the standard
  // server-issued cookies once the provider redirects back.
  return null;
}

export async function signInWithGoogleNatively(_cartSessionId: string = ''): Promise<NativeOAuthSession | null> {
  // No native in-app browser on web. Caller is expected to fall back to the
  // standard `window.open` flow when this returns null.
  if (isNativeApp()) return null;
  return null;
}

export async function openProviderInAppTab(url: string): Promise<void> {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export function openProviderInSystemBrowser(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}
