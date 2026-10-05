import { getNativeSessionToken, isNativeApp } from './nativeShell';
import { AYROVI_API_ORIGIN, normalizeApiOrigin } from './apiOrigin';
export { AYROVI_API_ORIGIN };
const PATCH_FLAG = '__ayroviApiOriginPatched';

/** Only bundled API paths move to the API. Assets and third-party URLs do not. */
export function nativeTarget(input: string | URL, base: string, origin: string): URL {
  const url = new URL(String(input), base);
  if (url.username || url.password) throw new TypeError('URL_CREDENTIALS_FORBIDDEN');
  if (url.origin === new URL(base).origin && /^\/api(?:\/|$)/.test(url.pathname)) {
    return new URL(url.pathname + url.search + url.hash, origin);
  }
  return url;
}

export function installNativeApiOrigin(origin: string = AYROVI_API_ORIGIN): void {
  if (!isNativeApp()) return;
  const trusted = normalizeApiOrigin(origin);
  if (!trusted) throw new TypeError('HTTPS_API_ORIGIN_REQUIRED');
  const w = window as unknown as Record<string, unknown>;
  if (w[PATCH_FLAG]) return;
  w[PATCH_FLAG] = true;
  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = nativeTarget(input instanceof Request ? input.url : input, location.href, trusted);
    const targetTrusted = url.origin === trusted && url.protocol === 'https:';
    if (!targetTrusted) return originalFetch(input, init);
    // Clone instead of consuming/mutating the caller's Request. RequestInit has
    // its standard override semantics, including replacement of headers.
    const request = input instanceof Request
      ? new Request(url.href, new Request(input.clone(), init))
      : new Request(url.href, init);
    const headers = new Headers(request.headers);
    if (!headers.has('x-ayrovi-native')) headers.set('x-ayrovi-native', '1');
    const token = getNativeSessionToken();
    if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
    // Never forward custom session headers over a redirect, even same-site.
    return originalFetch(new Request(request, { headers, redirect: 'error' }));
  }) as typeof window.fetch;

  // XHR deliberately remains credential-free: it cannot reliably disable
  // redirects. Authenticated native requests use fetch above.
  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (this: XMLHttpRequest, method: string, url: string | URL, ...rest: unknown[]) {
    const target = nativeTarget(url, location.href, trusted);
    return (originalOpen as unknown as (...args: unknown[]) => void).call(this, method, target.href, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
}
