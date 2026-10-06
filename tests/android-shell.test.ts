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

/**
 * Les assertions de ce fichier portent sur du TEXTE. Or ces fichiers contiennent
 * des commentaires qui EXPLIQUENT les décisions — et qui citent donc les mots
 * mêmes qu'on veut interdire (« handleBackButton », « POST_NOTIFICATIONS »…).
 * Sans ce nettoyage, le test se déclenche sur la prose : faux positif dans un
 * sens (échec sur une explication) et faux NÉGATIF dans l'autre (l'ancien
 * `toContain('handleBackButton: true')` passait grâce au commentaire, longtemps
 * après le retrait de la clé). Vérifier le code, jamais les explications.
 */
const stripComments = (source) => source.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const manifest = stripComments(readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8'));
const bridge = readFileSync('client/src/services/nativeShell.ts', 'utf8');
const apiOrigin = readFileSync('client/src/services/apiOrigin.ts', 'utf8');
const browserActivity = readFileSync('android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java', 'utf8');
const origin = readFileSync('client/src/services/nativeApiOrigin.ts', 'utf8');
const main = readFileSync('client/src/main.tsx', 'utf8');
const gradle = readFileSync('android/app/build.gradle', 'utf8');
const launcher = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');

describe('AYROVI Android shell (Capacitor) — application réelle', () => {
  it('config: paquet embarqué, AUCUN server.url (fin du wrapper), barre d’état réglée', () => {
    expect(cfg).toContain("webDir: 'public'");
    // 2026-10-03 — l'assertion précédente était `expect(cfg).toContain('handleBackButton: true')`.
    // Deux problèmes, tous deux corrigés ici :
    //  1. elle verrouillait une clé FANTÔME : `android.handleBackButton` n'est plus lue
    //     par Capacitor 7 (aucun `onBackPressed` dans le cœur) — elle ne faisait rien ;
    //  2. `toContain` cherche dans TOUT le fichier, commentaires compris : le test
    //     passait donc même après le retrait de la clé, simplement parce que le
    //     commentaire explicatif la mentionnait. Un test qui passe sur une
    //     explication ne teste plus rien.
    // On assère désormais la PROPRIÉTÉ de configuration, pas une sous-chaîne.
    expect(cfg).not.toMatch(/^\s*handleBackButton\s*:/m);
    // Le retour matériel est câblé côté Java (MainActivity.onBackPressed) et le
    // verrou correspondant vit dans scripts/check-android-shell.mjs.
    expect(cfg).toMatch(/overlaysWebView:\s*false/);
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
    // 2026-10-03 : le micro était inutilisable. BridgeWebChromeClient demande
    // DÉJÀ RECORD_AUDIO à l'exécution pour getUserMedia({audio:true}), mais
    // Android refuse silencieusement toute permission non déclarée.
    expect(manifest).toContain('android.permission.RECORD_AUDIO');
    // Et la sauvegarde ADB est fermée : elle exposait le profil WebView et les
    // jetons de session via `adb backup`.
    expect(manifest).toContain('android:allowBackup="false"');
    // POST_NOTIFICATIONS reste absente À DESSEIN : sans pile push (plugin,
    // jetons d'appareil, FCM) la déclarer ferait croire que les notifications
    // fonctionnent. Le test verrouille cette décision pour qu'elle soit revue
    // consciemment, pas oubliée.
    expect(manifest).not.toContain('POST_NOTIFICATIONS');
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
    expect(activity).toContain('.put("request_id", pendingAddRequestId)');
    expect(activity).toContain('if (pendingAddRequestId.isEmpty())');
    expect(activity).toContain('variant_details');
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

  // ── 2026-10-03 : le bouton « Add to Cart » ne pouvait pas aboutir ────────────
  // Les appels privés de la coque visaient `webBase`, c'est-à-dire
  // https://localhost — l'origine du PAQUET EMBARQUÉ, où aucun serveur
  // n'écoute. Résultat observé sur appareil : bouton figé sur « Loading… » ou
  // désactivé, et message « Page non éligible » alors que la page était valide.
  it('AWEBs: la coque appelle l’API sur l’origine réelle, pas sur l’origine embarquée', () => {
    expect(browserActivity).toMatch(/post\(apiOrigin\s*\+\s*ANALYZE_PATH/);
    expect(browserActivity).toMatch(/post\(apiOrigin\s*\+\s*RESOLVE_PATH/);
    expect(browserActivity).toMatch(/post\(apiOrigin\s*\+\s*CART_ITEMS_PATH/);
    expect(browserActivity).not.toMatch(/post\(webBase\s*\+/);
  });

  it('AWEBs: l’origine de l’API est transmise par la couche web (source unique)', () => {
    expect(bridge).not.toContain('apiOrigin: AYROVI_API_ORIGIN');
    expect(browserActivity).toContain('BuildConfig.AYROVI_API_ORIGIN');
    expect(bridge).toContain("from './apiOrigin'");
    expect(apiOrigin).toContain("export const AYROVI_API_ORIGIN");
    // Le module neutre ne doit RIEN importer : c'est ce qui empêche le cycle
    // nativeShell → nativeApiOrigin → nativeShell.
    expect(apiOrigin).not.toMatch(/^import /m);
  });

  // ── Limites de connexion marchand : aucune promesse sans test appareil ──────
  it('AWEBs: popup refusée explicitement; cookies tiers gardés désactivés', () => {
    expect(browserActivity).toContain('setSupportMultipleWindows(true)');
    const popupStart = browserActivity.indexOf('public boolean onCreateWindow');
    const popupEnd = browserActivity.indexOf('\n      }\n    });', popupStart);
    expect(popupStart).toBeGreaterThanOrEqual(0);
    expect(popupEnd).toBeGreaterThan(popupStart);
    expect(browserActivity.slice(popupStart, popupEnd)).toContain('return false;');
    // Ce test verrouille le choix de confidentialité, pas une preuve de SSO :
    // les cookies tiers restent désactivés tant qu'un test produit/appareil ne
    // justifie pas de les ouvrir.
    expect(browserActivity).toContain('setAcceptThirdPartyCookies(webView, false)');
  });

  it('AWEBs: la WebView native reçoit pause/resume puis destroy', () => {
    expect(browserActivity).toMatch(/protected void onPause\(\)[\s\S]*?webView\.onPause\(\)/);
    expect(browserActivity).toMatch(/protected void onResume\(\)[\s\S]*?webView\.onResume\(\)/);
    expect(browserActivity).toMatch(/protected void onDestroy\(\)[\s\S]*?webView\.destroy\(\)/);
  });

  it('AWEBs: une panne de service n’est jamais présentée comme un refus de la page', () => {
    expect(browserActivity).toContain('setAddUnavailable');
    expect(browserActivity).toContain('aywebs_service_unavailable');
  });

  // ── Le serveur classe les pages finement ; la coque doit le refléter ─────────
  // Constaté en direct : amazon.co.jp/ap/signin → page_type=LOGIN,
  // /gp/cart/view.html → page_type=CHECKOUT, /dp/… → page_type=PRODUCT.
  // La coque n'en lisait QUE is_product_page, donc affichait « Page non éligible »
  // sur une page de connexion — précisément l'écran de l'utilisateur.
  it('AWEBs: les états LOGIN / CHECKOUT / CAPTCHA sont distingués et expliqués', () => {
    expect(browserActivity).toContain('customer_action_required');
    expect(browserActivity).toContain('aywebs_login_required');
    expect(browserActivity).toContain('aywebs_merchant_cart');
    expect(browserActivity).toContain('aywebs_captcha_page');
  });

  it('AWEBs: lien non supporté mène à une demande Purchase Support, pas à une impasse', () => {
    const supportLayout = readFileSync('android/app/src/main/res/layout/sheet_aywebs_purchase_support.xml', 'utf8');
    expect(browserActivity).toContain('data.optString("fallback"');
    expect(browserActivity).toContain('setPurchaseSupportEnabled()');
    expect(browserActivity).toContain('showPurchaseSupportSheet(currentUrl)');
    expect(browserActivity).toContain('/api/v1/aywebs/purchase-requests');
    expect(supportLayout).toContain('aywebs_support_requirements');
    expect(supportLayout).toContain('aywebs_support_send');
  });

  it('AWEBs: le contrat d’erreur du serveur parvient au client', () => {
    // { error_contract: { userMessage, recoverable, requiredAction } } était jeté.
    expect(browserActivity).toContain('error_contract');
    expect(browserActivity).toContain('userMessageOf');
  });

  it('AYWEBs Android: devis exigé, feuille basse pleine largeur, erreurs conservées dans la feuille', () => {
    const sheet = readFileSync('android/app/src/main/res/layout/dialog_aywebs_variant_sheet.xml', 'utf8');
    const added = readFileSync('android/app/src/main/res/layout/dialog_aywebs_added.xml', 'utf8');
    expect(sheet).toContain('aywebs_sheet_error');
    expect(sheet).toContain('@drawable/bg_aywebs_sheet');
    expect(added).toContain('aywebs_added_close');
    expect(browserActivity).toContain('window.setGravity(Gravity.BOTTOM)');
    expect(browserActivity).toContain('WindowManager.LayoutParams.MATCH_PARENT');
    expect(browserActivity).toContain('if (!quoteReady[0]) return;');
    expect(browserActivity).toContain('boolean stockConfirmed = "AVAILABLE".equals(state) || "LOW_STOCK".equals(state);');
    expect(browserActivity).toContain('&& stockConfirmed;');
    expect(browserActivity).toContain('showSheetError(errorLine, error.getMessage())');

    // Le POST précède le dismiss : une réponse 4xx garde le contexte pour afficher
    // le message dans la feuille au lieu de fermer l'écran et perdre la sélection.
    const addHandler = browserActivity.indexOf('confirm.setOnClickListener(v -> {');
    const cartPost = browserActivity.indexOf('post(apiOrigin + CART_ITEMS_PATH, body)', addHandler);
    const dismiss = browserActivity.indexOf('dialog.dismiss();', addHandler);
    expect(addHandler).toBeGreaterThanOrEqual(0);
    expect(cartPost).toBeGreaterThan(addHandler);
    expect(dismiss).toBeGreaterThan(cartPost);
  });

  it('gradle: signature release env-driven + versionCode Play injectable', () => {
    expect(gradle).toContain("System.getenv('AYROVI_KEYSTORE_BASE64')");
    // Ce qui compte est l'INJECTION par l'environnement, pas la valeur de repli
    // (qui suit la version courante du paquet : 1.0.3 / 3 au 04/10/2026).
    expect(gradle).toMatch(/versionCode \(\(System\.getenv\('AYROVI_VERSION_CODE'\) \?: '\d+'\) as int\)/);
    expect(gradle).toMatch(/versionName \(System\.getenv\('AYROVI_VERSION_NAME'\) \?: '\d+\.\d+(\.\d+)?'\)/);
  });
});
