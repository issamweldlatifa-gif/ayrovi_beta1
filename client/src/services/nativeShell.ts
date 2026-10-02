import { Capacitor, registerPlugin } from '@capacitor/core';
import { getSessionId } from '../utils/session';

/**
 * Coque native (APK Capacitor) — un seul point de détection pour tout l'app.
 * Le web ignore ces helpers ; l'UI est identique dans les deux modes.
 */
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
 * §9 — navigation marchande DANS l'app (expérience type Buyee) sur Android :
 * la coque ouvre une WebView native avec barre d'outils et bouton d'ajout
 * injecté ; la classification de la page et le panier restent serveurs (§11,
 * §16). Hors coque native : false, et le web garde l'onglet externe (§2).
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

/**
 * Ouvre une page marchande : WebView interne sur Android, onglet externe sur
 * le web. Le repli est SYNCHRONE pour préserver le comportement historique.
 */
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
