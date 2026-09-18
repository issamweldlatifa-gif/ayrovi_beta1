import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Coque native Capacitor — contrat minimum pour un « vrai » APK Android :
 * config, permissions caméra (Lens), pont natif gardé (le web ne doit RIEN payer),
 * signature release optionnelle côté CI, versionCode injectable pour Play.
 */

const cfg = readFileSync('capacitor.config.ts', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const bridge = readFileSync('client/src/services/nativeShell.ts', 'utf8');
const launcher = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');
const gradle = readFileSync('android/app/build.gradle', 'utf8');

describe('AYROVI Android shell (Capacitor)', () => {
  it('config: bundle embarqué, back système géré, appId stable', () => {
    expect(cfg).toContain("webDir: 'public'");
    expect(cfg).toContain('handleBackButton: true');
    expect(cfg).toContain("appId: 'app.ayrovi.mobile'");
    expect(cfg).not.toContain('server.url'); // offline shell — pas de remote load
  });

  it('manifest: INTERNET + CAMERA requis pour Lens, caméra optionnelle (feature not required)', () => {
    expect(manifest).toContain('android.permission.INTERNET');
    expect(manifest).toContain('android.permission.CAMERA');
    expect(manifest).toContain('android.hardware.camera" android:required="false"');
  });

  it('pont natif: chaque appel web est gardé par isNativeApp et lazy-importé (zéro regression web)', () => {
    expect(bridge).toContain('Capacitor.isNativePlatform()');
    expect(bridge).toContain("if (!isNativeApp()) return;");
    expect(bridge).toContain("await import('@capacitor/status-bar')");
    // Lens ne fait qu'appeler le pont — aucune UI dupliquée pour le natif
    expect(launcher).toContain('setNativeStatusBarForSurface(');
    expect(launcher).not.toContain('@capacitor'); // passe par le pont, jamais directement
  });

  it('gradle: signature release purement env-driven + versionCode Play injectable', () => {
    expect(gradle).toContain("System.getenv('AYROVI_KEYSTORE_BASE64')");
    expect(gradle).toContain("versionCode ((System.getenv('AYROVI_VERSION_CODE') ?: '1') as int)");
  });
});
