import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { resolveAyWebsDeepLink } from '../client/src/features/aywebs/AyWebsScreen';

/**
 * Coque native Capacitor — contrat minimum pour un « vrai » APK Android :
 * config, permissions caméra (Lens), pont natif gardé (le web ne doit RIEN payer),
 * signature release optionnelle côté CI, versionCode injectable pour Play.
 *
 * AYWEBs (§24, §25) : la coque reçoit le partage Android et les liens profonds,
 * puis les traduit en routes WEB de l'origine servie. Aucune logique métier en
 * Java, aucun second écran natif, aucune origine recopiée à la main.
 */

const cfg = readFileSync('capacitor.config.ts', 'utf8');
const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
const bridge = readFileSync('client/src/services/nativeShell.ts', 'utf8');
const launcher = readFileSync('client/src/ayrovix/components/LensLauncher.tsx', 'utf8');
const gradle = readFileSync('android/app/build.gradle', 'utf8');
const mainActivity = readFileSync('android/app/src/main/java/app/ayrovi/mobile/MainActivity.java', 'utf8');
const aywebsHost = readFileSync('client/src/features/aywebs/AyWebsScreen.tsx', 'utf8');
const browseActivity = readFileSync('android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java', 'utf8');
const browsePlugin = readFileSync('android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowsePlugin.java', 'utf8');
const browseLayout = readFileSync('android/app/src/main/res/layout/activity_aywebs_browse.xml', 'utf8');
const stringsFr = readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
const stringsAr = readFileSync('android/app/src/main/res/values-ar/strings.xml', 'utf8');

describe('AYROVI Android shell (Capacitor)', () => {
  it('config: coque vivante (live shell sur Render), back système géré, appId stable', () => {
    expect(cfg).toContain("webDir: 'public'");
    expect(cfg).toContain('handleBackButton: true');
    expect(cfg).toContain("appId: 'app.ayrovi.mobile'");
    // live mode EST la décision (API en chemins relatifs côté client)
    // 2026-09-23 : bascule vers le service Render vérifié sain (l'ancienne URL
    // eta1-1 a été perdue — voir capacitor.config.ts).
    expect(cfg).toContain("url: 'https://ayrovi-beta1.onrender.com'");
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

/* ================================================================== *
 * AYWEBs — entrée native : partage Android (§24) et liens profonds (§25)
 * ================================================================== */

/** Origine servie par la coque, telle que déclarée dans capacitor.config.ts. */
const SHELL_ORIGIN = /url:\s*'([^']+)'/.exec(cfg)?.[1] || '';

/**
 * Miroir fidèle de `MainActivity.ayWebsTarget` : même traduction, vérifiée ici
 * sans gradle. Un partage devient `/aywebs?text=…`, un lien profond devient
 * `/aywebs/<segments>?<query>` sur l'origine servie.
 */
function webTargetFromSend(text: string): string {
  return `${SHELL_ORIGIN}/aywebs?text=${encodeURIComponent(text)}`;
}

function webTargetFromDeepLink(deepLink: string): string | null {
  const data = new URL(deepLink);
  if (data.protocol.replace(':', '') !== 'ayrovi') return null;
  if (data.hostname !== 'aywebs') return null;
  const target = new URL(`${SHELL_ORIGIN}/aywebs`);
  for (const segment of data.pathname.split('/').filter(Boolean)) target.pathname += `/${segment}`;
  for (const [name, value] of data.searchParams) target.searchParams.append(name, value);
  return target.toString();
}

function routeOf(location: string) {
  const url = new URL(location);
  return resolveAyWebsDeepLink({ pathname: url.pathname, search: url.search });
}

describe('AYWEBs native entry — partage Android (§24)', () => {
  it('manifest: ACTION_SEND text/plain sur l’activité principale, launchMode singleTask', () => {
    expect(manifest).toContain('android.intent.action.SEND');
    expect(manifest).toContain('android:mimeType="text/plain"');
    expect(manifest).toContain('android:launchMode="singleTask"');
    expect(manifest).toContain('android:exported="true"');
  });

  it('MainActivity: lit EXTRA_TEXT et le transmet brut — la détection reste serveur', () => {
    expect(mainActivity).toContain('Intent.ACTION_SEND');
    expect(mainActivity).toContain('"text/plain".equals(intent.getType())');
    expect(mainActivity).toContain('Intent.EXTRA_TEXT');
    expect(mainActivity).toContain('appendQueryParameter("text", text)');
    // Aucune devinette côté natif : ni domaine marchand, ni type de page, ni prix.
    expect(mainActivity).not.toMatch(/amazon|shein|temu|aliexpress/i);
    expect(mainActivity).not.toMatch(/price|variant|checkout/i);
  });

  it('un lien partagé ouvre AYWEBs et laisse le serveur décider de la boutique', () => {
    const target = webTargetFromSend('Regarde ça https://www.nike.com/fr/w/air-max-1');
    expect(target.startsWith(`${SHELL_ORIGIN}/aywebs?text=`)).toBe(true);
    const route = routeOf(target);
    // Le texte brut remonte tel quel : la coque et l'écran ne devinent pas le produit.
    expect(route).toMatchObject({ view: 'home', url: 'Regarde ça https://www.nike.com/fr/w/air-max-1' });
    // L'hôte consomme cette URL via detectAyWebsStore puis /page/analyze côté serveur.
    expect(aywebsHost).toContain('detectAyWebsStore(url)');
    expect(aywebsHost).toContain("setView('request')");
    expect(aywebsHost).toContain("setView('browser')");
  });
});

describe('AYWEBs native entry — liens profonds (§25)', () => {
  it('manifest: VIEW BROWSABLE sur le schéma ayrovi, hôte aywebs uniquement', () => {
    expect(manifest).toContain('android.intent.action.VIEW');
    expect(manifest).toContain('android.intent.category.BROWSABLE');
    expect(manifest).toContain('android:scheme="ayrovi" android:host="aywebs"');
  });

  it('MainActivity: aucune origine codée en dur — elle lit la config Capacitor', () => {
    expect(mainActivity).toContain('bridge.getServerUrl()');
    expect(mainActivity).not.toContain('onrender.com');
    expect(mainActivity).not.toContain('ayrovi.tn');
    expect(mainActivity).toContain('webView.loadUrl(target.toString())');
    // Démarrage à froid ET relance passent par le même point d'entrée.
    expect(mainActivity).toContain('protected void onNewIntent(Intent intent)');
    expect(mainActivity).toContain('super.onNewIntent(intent)');
  });

  it('ayrovi://aywebs → accueil AYWEBs', () => {
    const target = webTargetFromDeepLink('ayrovi://aywebs');
    expect(target).toBe(`${SHELL_ORIGIN}/aywebs`);
    expect(routeOf(target!)).toEqual({ view: 'home' });
  });

  it('ayrovi://aywebs/cart → panier AyWebs (≠ panier AYROVI)', () => {
    expect(routeOf(webTargetFromDeepLink('ayrovi://aywebs/cart')!)).toEqual({ view: 'cart' });
  });

  it('ayrovi://aywebs/checkout → paiement', () => {
    expect(routeOf(webTargetFromDeepLink('ayrovi://aywebs/checkout')!)).toEqual({ view: 'checkout' });
  });

  it('ayrovi://aywebs/product?url=… → fiche produit avec l’URL source exacte', () => {
    const target = webTargetFromDeepLink('ayrovi://aywebs/product?url=https%3A%2F%2Fwww.nike.com%2Fdp%2F1&store=nike');
    expect(routeOf(target!)).toEqual({ view: 'product', url: 'https://www.nike.com/dp/1', storeId: 'nike' });
  });

  it('ayrovi://aywebs/order/AYW-000456 → achats, commande AYROVI ouverte', () => {
    expect(routeOf(webTargetFromDeepLink('ayrovi://aywebs/order/AYW-000456')!))
      .toEqual({ view: 'orders', orderNumber: 'AYW-000456' });
  });

  it('ayrovi://aywebs/request?url=…&mode=store → demande avec URL préremplie (§23, §38)', () => {
    expect(routeOf(webTargetFromDeepLink('ayrovi://aywebs/request?url=https%3A%2F%2Fshop.example.tn%2Fp%2F9&mode=store')!))
      .toEqual({ view: 'request', requestMode: 'store', prefill: { url: 'https://shop.example.tn/p/9' } });
  });

  it('un lien hors AYWEBs ou inconnu n’ouvre rien de fantaisiste', () => {
    // Hors périmètre : aucun paramètre AYWEBs → pas de route imposée.
    expect(resolveAyWebsDeepLink({ pathname: '/shop', search: '' })).toBeNull();
    // Section inconnue sous /aywebs : retour à l'accueil, jamais un écran inventé.
    expect(routeOf(`${SHELL_ORIGIN}/aywebs/inconnu`)).toEqual({ view: 'home' });
    // Fiche produit sans URL : rien à résoudre → accueil.
    expect(routeOf(`${SHELL_ORIGIN}/aywebs/product`)).toEqual({ view: 'home' });
  });

  it('le lien historique /aywebs/capture atterrit dans le navigateur AYWEBs (§9)', () => {
    // Plus de vue « capture par lien » : l'adresse du navigateur fait ce travail,
    // et l'ajout passe par le flux Add to Cart natif (§13, §15).
    expect(routeOf(`${SHELL_ORIGIN}/aywebs/capture`)).toEqual({ view: 'browser' });
    expect(aywebsHost).not.toContain('AyWebsCapturePanel');
  });
});

describe('AYWEBs §9 — navigateur marchand interne (expérience type Buyee)', () => {
  it('manifest: activity dédiée, NON exportée, rattachée à la MainActivity', () => {
    expect(manifest).toContain('android:name=".AyWebsBrowseActivity"');
    expect(manifest).toContain('android:parentActivityName=".MainActivity"');
    const block = manifest.slice(manifest.indexOf('.AyWebsBrowseActivity'));
    expect(block.slice(0, block.indexOf('/>'))).toContain('android:exported="false"');
  });

  it('pont: le web ouvre le navigateur interne, et seulement des URL http(s)', () => {
    expect(mainActivity).toContain('registerPlugin(AyWebsBrowsePlugin.class)');
    expect(browsePlugin).toContain('@CapacitorPlugin(name = "AyWebsBrowse")');
    expect(browsePlugin).toContain('call.reject("URL_NOT_BROWSABLE")');
    // L'origine vient de la config Capacitor, jamais recopiée (§25).
    expect(browsePlugin).toContain('getBridge().getServerUrl()');
    expect(browsePlugin).toContain('EXTRA_WEB_BASE');
  });

  it('barre d’outils complète : fermer, URL, actualiser, précédent, suivant, panier, ajout', () => {
    for (const id of ['aywebs_close', 'aywebs_url', 'aywebs_refresh', 'aywebs_back', 'aywebs_forward', 'aywebs_cart', 'aywebs_add', 'aywebs_webview', 'aywebs_notice', 'aywebs_progress']) {
      expect(browseLayout, id).toContain(`@+id/${id}`);
    }
    expect(stringsFr).toContain('aywebs_add_to_cart');
    expect(stringsAr).toContain('aywebs_add_to_cart');
    // Avis §27 bilingue : la coque ne contourne jamais connexion/captcha.
    expect(stringsFr).toContain('aywebs_action_required');
    expect(stringsAr).toContain('aywebs_action_required');
  });

  it('WebView durcie : le marchand s’exécute, la coque ne s’expose pas', () => {
    expect(browseActivity).toContain('setAllowFileAccess(false)');
    expect(browseActivity).toContain('setAllowContentAccess(false)');
    expect(browseActivity).toContain('setJavaScriptCanOpenWindowsAutomatically(false)');
    expect(browseActivity).toContain('setSupportMultipleWindows(false)');
    expect(browseActivity).toContain('MIXED_CONTENT_NEVER_ALLOW');
    // tel:, mailto:, intent:, file: bloqués ; http(s) restent dans la vue.
    expect(browseActivity).toContain('shouldOverrideUrlLoading');
  });

  it('le serveur décide : bouton injecté seulement sur fiche produit détectée (§11, §12)', () => {
    expect(browseActivity).toContain('/api/v1/aywebs/page/analyze');
    expect(browseActivity).toContain('product_detected');
    expect(browseActivity).toContain('capture_allowed');
    expect(browseActivity).toContain('customer_action_required');
    expect(browseActivity).toContain('addJavascriptInterface');
    expect(browseActivity).toContain('AyWebsBridge');
  });

  it('aucune logique métier dans la coque : ni montants, ni achat, ni origine en dur', () => {
    expect(browseActivity).not.toMatch(/price/i);
    expect(browseActivity).not.toMatch(/checkout/i);
    expect(browseActivity).not.toContain('onrender.com');
    expect(browseActivity).not.toContain('"https://');
    expect(browsePlugin).not.toContain('onrender.com');
    // L’ajout au panier est réel dans la coque via /cart/items (§13) ; la seule
    // sortie « Voir le panier » est un renvoi §25 vers la session web, seule
    // détentrice des montants (§45) — jamais une fiche produit native.
    expect(browseActivity).toContain('ayrovi://aywebs/');
    expect(browseActivity).toContain('handoff("cart"');
    expect(browseActivity).not.toContain('handoff("product"');
  });
});
describe('AYWEBs §13/§15 — Add to Cart natif sans quitter le marchand', () => {
  const browse = readFileSync('android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java', 'utf8');
  const sheet = readFileSync('android/app/src/main/res/layout/dialog_aywebs_variant_sheet.xml', 'utf8');

  it('Add to Cart = ajout réel : resolve serveur puis POST /cart/items, aucune fiche produit', () => {
    expect(browse).toContain('/product/resolve');
    expect(browse).toContain('/cart/items');
    expect(browse).toContain('AyWebsBridge');
    // Aucun renvoi vers une fiche produit plein écran : le contexte marchand est conservé.
    expect(browse).not.toContain('handoff("product"');
    expect(browse).toContain('Add to Cart');
  });

  it('feuille de variantes AU-DESSUS du marchand : groupes, quantité, confirmation (§13)', () => {
    for (const id of ['aywebs_sheet_groups', 'aywebs_sheet_qty', 'aywebs_sheet_add', 'aywebs_sheet_added', 'aywebs_sheet_continue', 'aywebs_sheet_open_cart']) {
      expect(sheet, id).toContain(`@+id/${id}`);
    }
    expect(stringsFr).toContain('>Ajouter au panier<');
    expect(stringsFr).toContain('aywebs_continue_shopping');
    expect(stringsAr).toContain('aywebs_continue_shopping');
    expect(stringsFr).toContain('aywebs_proceed_checkout');
  });

  it('versions indisponibles : désactivées et jamais sélection par défaut (§13, §14)', () => {
    expect(browse).toContain('isValueUnavailable');
    expect(browse).toContain('firstLive');
    expect(browse).toContain('OUT_OF_STOCK');
  });
});
