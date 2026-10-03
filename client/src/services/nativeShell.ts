import { Capacitor, registerPlugin } from '@capacitor/core';
import { getSessionId } from '../utils/session';

/**
 * Coque native (APK Capacitor) — un seul point de détection pour tout l'app.
 * Le web ignore ces helpers ; l'UI est identique dans les deux modes.
 */
const NATIVE_TOKEN_KEY = 'ayrovi_native_session_token';

/**
 * Application native (paquet embarqué) : le jeton de session client est gardé
 * hors cookie (origins croisés Capacitor → API) et rejoué en en-tête Bearer
 * par le pont nativeApiOrigin. Le web n'écrit jamais cette clé.
 */
export function rememberNativeSessionToken(token: string | undefined | null): void {
  if (!isNativeApp() || !token) return;
  try { window.localStorage.setItem(NATIVE_TOKEN_KEY, String(token)); } catch { /* silencieux */ }
}

export function getNativeSessionToken(): string {
  if (!isNativeApp()) return '';
  try { return window.localStorage.getItem(NATIVE_TOKEN_KEY) || ''; } catch { return ''; }
}

export function clearNativeSessionToken(): void {
  if (!isNativeApp()) return;
  try { window.localStorage.removeItem(NATIVE_TOKEN_KEY); } catch { /* silencieux */ }
}

export const isNativeApp = (): boolean => {
  try {
    return typeof Capacitor !== 'undefined' && Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

interface AyWebsBrowseBridge {
  open(options: { url: string; sessionId: string }): Promise<{ opened: boolean }>;
}

/**
 * §9 — navigation marchande DANS l'app (parcours proxy-shopping reconstruit) :
 * la coque ouvre une WebView native avec barre flottante « Add to Cart » ;
 * la classification et le panier restent serveurs (§11, §16). Hors coque :
 * onglet externe (comportement web historique, §2 non destructif).
 */
export async function openAyWebsNativeBrowser(url: string): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const plugin = registerPlugin<AyWebsBrowseBridge>('AyWebsBrowse');
    await plugin.open({ url, sessionId: getSessionId() });
    return true;
  } catch {
    return false;
  }
}

export function openMerchantPage(url: string): void {
  if (!isNativeApp()) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }
  void openAyWebsNativeBrowser(url).then((handled) => {
    if (!handled) window.open(url, '_blank', 'noopener,noreferrer');
  });
}

/**
 * Barre système : icônes claires sur les surfaces sombres (Lens/caméra),
 * foncées sur le blanc marchand. Cosmétique → ne casse jamais l'UI.
 */
export async function setNativeStatusBarForSurface(darkSurface: boolean): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: darkSurface ? Style.Light : Style.Dark });
  } catch {
    /* no-op : hors coque native le plugin n'existe pas */
  }
}
