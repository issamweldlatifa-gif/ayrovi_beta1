import { Capacitor } from '@capacitor/core';

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
