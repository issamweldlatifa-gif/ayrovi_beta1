/**
 * Web-only stub — `services/nativeShell`.
 *
 * L'APK Capacitor a été retiré : la coque Android n'est plus construite ici.
 * L'application mobile est désormais React Native (apps/mobile/) et consomme
 * l'API directement via HTTP, sans WebView. Le site web public est donc la
 * seule surface qui dépendait de ces helpers — et ces helpers n'ont plus de
 * raison d'être sur le web.
 *
 * Ce module conserve les MÊMES signatures d'export que l'ancien
 * `nativeShell.ts` afin de ne casser aucun import existant. Tous les appels
 * deviennent des no-op ou des fallbacks web équivalents :
 *   - `isNativeApp()`        → false (toujours web)
 *   - jetons de session      → no-op (les cookies same-origin suffisent)
 *   - `openMerchantPage()`   → window.open en tab sécurisé
 *   - `setNativeStatusBarForSurface()` → no-op (pas de status bar native)
 *
 * Si l'application React Native devait un jour réintégrer une coque
 * Capacitor, ce fichier sera supprimé et `nativeShell.ts` réintroduit.
 */

export function rememberNativeSessionToken(_token: string | undefined | null): void {
  // Web only — no native token storage.
}

export function getNativeSessionToken(): string {
  return '';
}

export function clearNativeSessionToken(): void {
  // Web only — no native token storage.
}

export const isNativeApp = (): boolean => false;

export async function openAyWebsNativeBrowser(url: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  return w !== null;
}

export function openMerchantPage(url: string): void {
  if (typeof window === 'undefined') return;
  window.open(url, '_blank', 'noopener,noreferrer');
}

export async function setNativeStatusBarForSurface(_darkSurface: boolean): Promise<void> {
  // No native status bar on web.
}
