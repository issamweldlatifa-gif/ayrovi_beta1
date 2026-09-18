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
  server: {
    // Mode « coque vivante » : l'app charge le site en direct depuis Render.
    // Pourquoi : tous les services du client appellent l'API en chemins relatifs
    // (`fetch('/api/…')` avec credentials same-origin) → dans un bundle local ces
    // appels viseraient https://localhost (inexistant) = écran vide + Lens mort.
    // En live : même origine que le navigateur → zéro CORS, zéro rebuild à chaque
    //mise à jour  du web, et getUserMedia/Camera gérés par la WebView Capacitor (permission CAMERA accordée).
    url: 'https://eta1-1.onrender.com',
    // aucun sous-domaine externe navigable dans la coque
    allowNavigation: [],
  },
};

export default config;
