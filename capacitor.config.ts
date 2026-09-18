import type { CapacitorConfig } from '@capacitor/cli';

/**
 * AYROVI — coque native Android (Capacitor 7).
 * Le webDir est le build Vite (public/) embarqué dans l'APK → l'app s'ouvre hors-ligne
 * et appelle l'API Render. Les couches de navigation utilisent window.history,
 * donc handleBackButton:true mappe la touche système sur « retour » (Lens inclus).
 */
const config: CapacitorConfig = {
  appId: 'app.ayrovi.mobile',
  appName: 'AYROVI',
  webDir: 'public',
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    // back système = history.back() — les overlays Lens sont des couches history
    handleBackButton: true,
    backgroundColor: '#FAFAFA',
  },
  // Pas de chargement distant : bundle embarqué = démarrage instantané + démo offline ;
  // l'API reste https://eta1-1.onrender.com (CORS_ORIGINS doit contenir https://localhost).
};

export default config;
