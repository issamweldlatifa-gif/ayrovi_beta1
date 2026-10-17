/**
 * Web-only stub — `services/nativeApiOrigin`.
 *
 * L'APK Capacitor a été retiré (cf. `nativeShell.ts` pour le contexte).
 * Ce module exportait un patch sur `fetch` et `XMLHttpRequest` qui réécrivait
 * les chemins `/api/…` relatifs vers l'origine absolue du backend. Sur le web
 * pur, l'API est same-origin, donc le patch est inutile.
 *
 * On garde l'export `ZAYROVI_API_ORIGIN` (utilisé par d'autres modules qui
 * construisent des URLs absolues côté web) et la fonction `installNativeApiOrigin`
 * qui devient un no-op. Les signatures sont préservées pour ne casser aucun
 * import.
 */

import { ZAYROVI_API_ORIGIN, normalizeApiOrigin } from './apiOrigin';

export { ZAYROVI_API_ORIGIN };

/** Only bundled API paths move to the API. Assets and third-party URLs do not. */
export function nativeTarget(input: string | URL, base: string, origin: string): URL {
  const url = new URL(String(input), base);
  if (url.username || url.password) throw new TypeError('URL_CREDENTIALS_FORBIDDEN');
  if (url.origin === new URL(base).origin && /^\/api(?:\/|$)/.test(url.pathname)) {
    return new URL(url.pathname + url.search + url.hash, origin);
  }
  return url;
}

export function installNativeApiOrigin(_origin: string = ZAYROVI_API_ORIGIN): void {
  // No-op on the web: fetch/XHR are already same-origin. The original
  // implementation monkey-patched globalThis.fetch and XMLHttpRequest.prototype
  // to redirect /api calls to the absolute API origin. That bridge existed
  // because the Capacitor APK served the bundle from https://localhost while
  // the backend lived on a different host. With Capacitor removed, the
  // web build is served from the same origin as the API and no rewrite is
  // needed. `normalizeApiOrigin` is still imported above so future
  // implementations can reuse it without re-deriving the rule.
  void normalizeApiOrigin;
}
