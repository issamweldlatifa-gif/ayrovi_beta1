/**
 * جسر أصل الـ API للتطبيق الأصلي (وضع الحزمة المضمّنة).
 *
 * داخل قشرة Capacitor بدون server.url تُقدَّم الواجهة من أصل القشرة
 * (https://localhost)، بينما تعيش الـ API على أصل النشر. هذا الملف هو
 * «السطر الواحد» الذي يوحد المسارين: يلتقط fetch/XHR النسبية ويعيد
 * كتابتها على أصل الـ API المطلق. على الويب لا يفعل شيئًا أبدًا
 * (same-origin) — aucune régression web (§2).
 *
 * مسار واحد، موقع واحد: نفس الكود، نفس الواجهة، نفس الـ API.
 */
import { getNativeSessionToken, isNativeApp } from './nativeShell';
import { AYROVI_API_ORIGIN } from './apiOrigin';

/** Réexporté depuis `apiOrigin.ts` — SOURCE UNIQUE, partagée avec la coque native
 *  (le module neutre évite le cycle nativeShell → nativeApiOrigin → nativeShell). */
export { AYROVI_API_ORIGIN };

const PATCH_FLAG = '__ayroviApiOriginPatched';

function toAbsolute(url: string, origin: string): string {
  return url.startsWith('/') ? origin + url : url;
}

/** En-têtes natifs : déclaration + Bearer de session (login applicatif réel). */
function nativeHeaders(init?: RequestInit): RequestInit | undefined {
  const headers = new Headers(init?.headers as HeadersInit | undefined);
  if (!headers.has('x-ayrovi-native')) headers.set('x-ayrovi-native', '1');
  const token = getNativeSessionToken();
  if (token && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return { ...init, headers };
}

/**
 * يُستدعى مرة واحدة عند إقلاع التطبيق (main.tsx). على الويب: no-op مطلق.
 */
export function installNativeApiOrigin(origin: string = AYROVI_API_ORIGIN): void {
  if (!isNativeApp()) return;
  const w = window as unknown as Record<string, unknown>;
  if (w[PATCH_FLAG]) return;
  w[PATCH_FLAG] = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return originalFetch(toAbsolute(input, origin), nativeHeaders(init));
    if (input instanceof URL) {
      const abs = toAbsolute(input.toString(), origin);
      return originalFetch(abs, nativeHeaders(init));
    }
    if (input instanceof Request && input.url.startsWith('/')) {
      return originalFetch(new Request(origin + input.url, input), nativeHeaders(init));
    }
    return originalFetch(input, nativeHeaders(init));
  }) as typeof window.fetch;

  const originalOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ) {
    const target = typeof url === 'string' ? toAbsolute(url, origin) : url.toString().startsWith('/') ? toAbsolute(url.toString(), origin) : url;
    return (originalOpen as unknown as (...args: unknown[]) => void).call(this, method, target, ...rest);
  } as typeof XMLHttpRequest.prototype.open;
}
