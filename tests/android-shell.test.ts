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

  it('manifest: deux activités vivantes — lanceur + navigateur marchand AYWEBs V2', () => {
    const activities = manifest.match(/<activity/g) || [];
    expect(activities.length).toBe(2);
    expect(manifest).toContain('.AyWebsBrowseActivity');
    // §24/§25 : partage texte + liens profonds ayrovi://aywebs
    expect(manifest).toContain('android.intent.action.SEND');
    expect(manifest).toContain('android:scheme="ayrovi"');
  });

  it('AYWEBs V2 natif: barre flottante + feuille variantes + confirmation (captures 1/3/4)', () => {
    const activity = readFileSync('android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java', 'utf8');
    const browse = readFileSync('android/app/src/main/res/layout/activity_aywebs_browse.xml', 'utf8');
    const sheet = readFileSync('android/app/src/main/res/layout/dialog_aywebs_variant_sheet.xml', 'utf8');
    const added = readFileSync('android/app/src/main/res/layout/dialog_aywebs_added.xml', 'utf8');
    const strings = readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
    const main = readFileSync('android/app/src/main/java/app/ayrovi/mobile/MainActivity.java', 'utf8');
    // barre flottante : retour, avant, Panier, Favoris, Add to Cart (libellé imposé)
    for (const id of ['aywebs_back', 'aywebs_forward', 'aywebs_cart', 'aywebs_wish', 'aywebs_add']) {
      expect(browse).toContain(`@+id/${id}`);
    }
    expect(strings).toContain('>Add to Cart<');
    // la coque ne devine rien : classification serveur (§11)
    expect(activity).toContain('/api/v1/aywebs/page/analyze');
    expect(activity).toContain('/api/v1/aywebs/cart/items');
    // feuille par-dessus le marchand + confirmation sans sortie (§13/§15)
    expect(sheet).toContain('aywebs_sheet_groups');
    expect(added).toContain('aywebs_added_checkout');
    expect(added).toContain('aywebs_added_continue');
    // une seule UI : les routes WEB de la coque (§2)
    expect(activity).toContain('openWebRoute(');
    expect(main).toContain('registerPlugin(AyWebsBrowsePlugin.class);');
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
