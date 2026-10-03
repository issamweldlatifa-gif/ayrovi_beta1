import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Coque native Capacitor — contrat d'une application RÉELLE à paquet embarqué
 * (décision 2026-10-03 : suppression du mode « coque vivante » server.url).
 *
 * Ce que le test verrouille :
 *  • l'UI est embarquée dans l'APK (webDir public, aucun server.url) ;
 *  • le pont d'origine API unique existe et est branché au démarrage ;
 *  • permissions caméra (Lens) + caméra optionnelle ;
 *  • signature release purement env-driven + versionCode Play injectable ;
 *  • aucune activité native fantôme après la dépose des écrans AyWebs V1.
 */

const cfg = readFileSync('capacitor.config.ts', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const bridge = readFileSync('client/src/services/nativeShell.ts', 'utf8');
const origin = readFileSync('client/src/services/nativeApiOrigin.ts', 'utf8');
const main = readFileSync('client/src/main.tsx', 'utf8');
const gradle = readFileSync('android/app/build.gradle', 'utf8');
const launcher = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');

describe('AYROVI Android shell (Capacitor) — application réelle', () => {
  it('config: paquet embarqué, AUCUN server.url (fin du wrapper), back système géré', () => {
    expect(cfg).toContain("webDir: 'public'");
    expect(cfg).toContain('handleBackButton: true');
    expect(cfg).toContain("appId: 'app.ayrovi.mobile'");
    expect(cfg).toContain("androidScheme: 'https'");
    expect(cfg).not.toContain('server.url');
    expect(cfg).not.toContain('onrender.com');
  });

  it('pont d\'origine API: un seul chemin, branché une fois au démarrage', () => {
    expect(origin).toContain('AYROVI_API_ORIGIN');
    expect(origin).toContain('installNativeApiOrigin');
    expect(origin).toContain('isNativeApp()');
    expect(main).toContain('installNativeApiOrigin()');
    // le web ne paie rien : le pont est gardé et no-op hors coque
    expect(origin).toContain('if (!isNativeApp()) return;');
  });

  it('manifest: INTERNET + CAMERA requis pour Lens, caméra optionnelle', () => {
    expect(manifest).toContain('android.permission.INTERNET');
    expect(manifest).toContain('android.permission.CAMERA');
    expect(manifest).toContain('android.hardware.camera" android:required="false"');
  });

  it('manifest: une seule activité, aucune activité native morte', () => {
    const activities = manifest.match(/<activity/g) || [];
    expect(activities.length).toBe(1);
    expect(manifest).not.toContain('AyWebsBrowseActivity');
  });

  it('pont natif: gardes isNativeApp + lazy-import, zéro régression web', () => {
    expect(bridge).toContain('Capacitor.isNativePlatform()');
    expect(bridge).toContain('if (!isNativeApp()) return;');
    expect(bridge).toContain("await import('@capacitor/status-bar')");
    expect(launcher).toContain('setNativeStatusBarForSurface(');
    expect(launcher).not.toContain('@capacitor');
  });

  it('gradle: signature release env-driven + versionCode Play injectable', () => {
    expect(gradle).toContain("System.getenv('AYROVI_KEYSTORE_BASE64')");
    expect(gradle).toContain("versionCode ((System.getenv('AYROVI_VERSION_CODE') ?: '1') as int)");
  });
});
