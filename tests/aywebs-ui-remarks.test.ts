/**
 * AYWEBs — les sept remarques d'interface du 04/10/2026, verrouillées.
 *
 * Ces tests lisent la SOURCE (CSS, TSX, Java) plutôt que de simuler un écran :
 * chacun des sept points est un invariant de structure dont la régression est
 * invisible à l'œil tant qu'on ne tient pas le téléphone. Ils ne prouvent pas
 * un rendu, ils empêchent le retour EXACT du défaut constaté.
 *
 * Le huitième bloc couvre le 404 de la connexion Google dans l'application.
 */
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

const read = (file: string) => readFileSync(file, 'utf8');

/**
 * Lecture SANS commentaires. Les fichiers expliquent volontairement ce qu'ils
 * n'utilisent plus (« aucun localStorage », « l'ancien useState<Set<string>> »)
 * : un garde qui lit la prose se déclenche sur une explication et apprend à
 * être ignoré. Même décision que scripts/check-android-shell.mjs.
 */
const readCode = (file: string) => readFileSync(file, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const CSS = 'client/src/features/aywebs/aywebs.css';
const APP = 'client/src/features/aywebs/AyWebsApp.tsx';
const ROOT_APP = 'client/src/App.tsx';
const STORES = 'client/src/features/aywebs/components/AyWebsStoresScreen.tsx';
const WISH = 'client/src/features/aywebs/components/AyWebsWishScreen.tsx';
const FAV_SHEET = 'client/src/features/aywebs/components/AyWebsFavoriteSheet.tsx';
const FAV_HOOK = 'client/src/features/aywebs/useAyWebsFavorites.ts';
const BROWSER_ACTIVITY = 'android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java';
const NATIVE_OAUTH = 'client/src/customer/nativeOAuth.ts';
const ACCOUNT_PAGE = 'client/src/components/CustomerAccountPage.tsx';
const CUSTOMER_ROUTES = 'src/customer/routes.ts';

describe('§1 — l’image originale est montrée entière, jamais rognée', () => {
  test('aucune image de produit AyWebs n’utilise object-fit: cover', () => {
    const css = read(CSS);
    const covers = css
      .split('\n')
      .filter((line) => /object-fit:\s*cover/.test(line));
    expect(covers).toEqual([]);
  });

  test('les quatre surfaces d’image produit sont en contain sur fond neutre', () => {
    const css = read(CSS);
    for (const selector of ['.ayw-sheet-thumb', '.ayw-added-thumb', '.ayw-cartline-img', '.ayw-variantcard-img']) {
      const rule = css.split('\n').find((line) => line.trim().startsWith(`${selector} {`));
      expect(rule, `règle absente : ${selector}`).toBeTruthy();
      expect(rule).toMatch(/object-fit:\s*contain/);
      expect(rule).toMatch(/background:\s*#f2f4f7/);
    }
  });
});

describe('§2 — les onglets restent dans AyWebs, sauf « Mon compte »', () => {
  test('« Favoris » n’appelle plus onOpenFavorites : c’est un écran interne', () => {
    const app = read(APP);
    expect(app).toMatch(/if \(next === 'account'\) \{ onOpenAccount\(\); return; \}/);
    expect(app).not.toMatch(/if \(next === 'wish'\) \{ onOpenFavorites\(\); return; \}/);
    expect(app).toMatch(/AyWebsWishScreen/);
  });

  test('le lien profond /aywebs/wish ouvre l’onglet interne', () => {
    expect(read(APP)).toMatch(/section === 'wish'\s*\)\s*\{\s*setTab\('wish'\)/);
  });

  test('l’écran Favoris existe et porte sa propre barre d’onglets', () => {
    const wish = read(WISH);
    expect(wish).toMatch(/data-aywebs-screen="wish"/);
    expect(wish).toMatch(/<AyWebsTabBar/);
  });
});

describe('§3 + §7 — une seule barre visible, rien sous la barre', () => {
  test('la barre AYROVI est démontée pendant AyWebs', () => {
    const app = read(ROOT_APP);
    expect(app).toMatch(/\{!isAyWebsOpen && \(\s*<BottomNavBar/);
  });

  test('les deux conteneurs data-preserved-navigation subsistent', () => {
    expect(read(ROOT_APP).match(/data-preserved-navigation/g)).toHaveLength(2);
  });

  test('la barre AyWebs est au-dessus de la couche AyWebs et de hauteur fixe', () => {
    const css = read(CSS);
    const block = css.slice(css.indexOf('.ayw-tabs {'), css.indexOf('.ayw-tab {'));
    expect(block).toMatch(/z-index:\s*40/);
    expect(block).toMatch(/height:\s*calc\(3\.4rem \+ env\(safe-area-inset-bottom\)\)/);
  });

  test('chaque écran garde un dégagement sous la barre', () => {
    expect(read(CSS)).toMatch(/\.ayw-screen \{[^}]*padding-bottom:\s*calc\(4\.5rem \+ env\(safe-area-inset-bottom\)\)/s);
  });

  test('la feuille ne dépasse pas 82vh sur un petit écran', () => {
    expect(read(CSS)).toMatch(/max-height:\s*82vh/);
    expect(read(CSS)).not.toMatch(/max-height:\s*88vh/);
  });
});

describe('§4 — plus d’en-tête AyWebs : « Accueil » est la sortie', () => {
  test('AyWebsApp ne monte plus AppHeader ni le tampon de build', () => {
    const app = readCode(APP);
    expect(app).not.toMatch(/AppHeader/);
    expect(app).not.toMatch(/APP_BUILD_STAMP/);
  });

  test('« home » referme AyWebs', () => {
    expect(read(APP)).toMatch(/if \(next === 'home'\) \{ onClose\(\); return; \}/);
  });
});

describe('§5 — le X du navigateur marchand fonctionne', () => {
  test('X et rafraîchir sont résolus ET écoutés', () => {
    const java = read(BROWSER_ACTIVITY);
    expect(java).toMatch(/closeButton = requireView\(R\.id\.aywebs_close\)/);
    expect(java).toMatch(/refreshButton = requireView\(R\.id\.aywebs_refresh\)/);
    expect(java).toMatch(/closeButton\.setOnClickListener\(v -> onClosePressed\(\)\)/);
    expect(java).toMatch(/refreshButton\.setOnClickListener\(v -> webView\.reload\(\)\)/);
  });

  test('X ne ferme pas l’application quand le navigateur est la racine', () => {
    const java = read(BROWSER_ACTIVITY);
    const method = java.slice(java.indexOf('private void onClosePressed()'));
    expect(method).toMatch(/isTaskRoot\(\)/);
    expect(method.slice(0, method.indexOf('}\n\n'))).toMatch(/openWebRoute\(""\)/);
  });

  test('le retour matériel remonte l’historique marchand avant de sortir', () => {
    const java = read(BROWSER_ACTIVITY);
    expect(java).toMatch(/getOnBackInvokedDispatcher\(\)/);
    expect(java).toMatch(/handleBackPressed/);
    expect(java).toMatch(/webView\.canGoBack\(\)[\s\S]{0,80}webView\.goBack\(\)/);
  });
});

describe('§6 — favoris : tiroir réel et stockage du compte', () => {
  test('aucun état local de favoris ne subsiste dans l’écran Boutiques', () => {
    const stores = readCode(STORES);
    expect(stores).not.toMatch(/useState<Set<string>>/);
    expect(stores).not.toMatch(/toggleFavorite/);
    expect(stores).toMatch(/onOpenFavorite/);
  });

  test('le stockage est l’API du compte, sans copie locale', () => {
    const hook = readCode(FAV_HOOK);
    expect(hook).toMatch(/'\/api\/customer\/account\/favorites'/);
    expect(hook).toMatch(/method: 'DELETE'/);
    expect(hook).toMatch(/method: 'POST'/);
    expect(hook).not.toMatch(/localStorage/);
    expect(hook).not.toMatch(/sessionStorage/);
  });

  test('le tiroir existe, monte du bas et porte une action unique et explicite', () => {
    const sheet = read(FAV_SHEET);
    expect(sheet).toMatch(/data-aywebs-sheet="favorite"/);
    expect(sheet).toMatch(/ayw-sheet-mask/);
    expect(sheet).toMatch(/Add to favorites/);
    expect(sheet).toMatch(/Remove from favorites/);
  });

  test('sans session, le tiroir le dit et propose la connexion', () => {
    const sheet = read(FAV_SHEET);
    expect(sheet).toMatch(/favorites\.authRequired/);
    expect(sheet).toMatch(/Sign in/);
  });

  test('le cœur des cartes produit est hors du bouton d’ouverture', () => {
    const stores = read(STORES);
    const wrapper = stores.indexOf('ayw-prodwrap');
    const favButton = stores.indexOf('ayw-prodfav');
    const openButton = stores.indexOf('ayw-variantcard ayw-prodcard');
    expect(wrapper).toBeGreaterThan(-1);
    expect(favButton).toBeGreaterThan(wrapper);
    expect(openButton).toBeGreaterThan(favButton);
  });
});

describe('§8 — connexion Google dans l’application : fin du 404', () => {
  test('l’URL de démarrage est absolue dans la coque, relative sur le web', () => {
    const module = read(NATIVE_OAUTH);
    expect(module).toMatch(/isNativeApp\(\) \? `\$\{AYROVI_API_ORIGIN\}\$\{path\}` : path/);
  });

  test('la page de compte n’émet plus de lien relatif codé en dur', () => {
    const page = read(ACCOUNT_PAGE);
    expect(page).not.toMatch(/`\/api\/customer\/auth\/google\/start\?/);
    expect(page).toMatch(/oauthStartUrl\('google', oauthQuery\)/);
    expect(page).toMatch(/startNativeProvider\('google'\)/);
  });

  test('le serveur expose une remise de session à usage unique', () => {
    const routes = read(CUSTOMER_ROUTES);
    expect(routes).toMatch(/router\.post\('\/auth\/native\/claim'/);
    // La ligne est DÉTRUITE à la lecture : un code ne sert jamais deux fois.
    expect(routes).toMatch(/DELETE FROM customer_native_handoffs WHERE id=\?/);
    // On conserve le hachage du code, jamais le code lui-même.
    expect(routes).toMatch(/hashOptionalHandoff/);
    expect(routes).toMatch(/const id = hashToken\(handoff\);/);
  });

  test('les trois fournisseurs enregistrent le code de remise', () => {
    const routes = read(CUSTOMER_ROUTES);
    expect(routes.match(/hashOptionalHandoff\(req\.query\.nativeHandoff\)/g)).toHaveLength(3);
    expect(routes.match(/storeNativeHandoff\(db, String\(state\.native_handoff_id\)/g)).toHaveLength(3);
  });

  test('la page de retour du navigateur système ne porte aucun jeton', () => {
    const page = read('client/public/auth/native-done.html');
    expect(page).toMatch(/Connexion terminée/);
    expect(page).not.toMatch(/token/i);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   Deuxième passe — remarques du 04/10/2026 (soir)

   Le client a rouvert deux points que la première passe n'avait pas traités au
   bon endroit :

   §9  « تبويب aywebs favorite في شريط داخل متجر مزالت متصلحتش » — la première
       passe avait rendu l'onglet « Favoris » interne à l'écran AyWebs en
       React. Mais le reproche portait sur la BARRE DU NAVIGATEUR MARCHAND, en
       Java : là, « Panier » et « Favoris » appelaient openWebRoute(), soit
       startActivity(lien profond) + finish(). La page marchande était détruite
       et l'utilisateur éjecté de son achat. Corriger l'un ne corrigeait pas
       l'autre : ce sont deux interfaces distinctes.

   §10 « تسجيل دخول بش ولي داخل تطبيق لا خروج من تطبيق » — le correctif du 404
       Google ouvrait le navigateur système. C'est bien une sortie
       d'application. L'onglet personnalisé la supprime sans retomber dans la
       WebView embarquée, que Google refuse.
   ════════════════════════════════════════════════════════════════════════════ */

const BROWSE_ACTIVITY = 'android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java';
const AUTH_TAB_PLUGIN = 'android/app/src/main/java/app/ayrovi/mobile/AyroviAuthTabPlugin.java';

describe('§9 — Panier et Favoris restent DANS la boutique', () => {
  test('les deux boutons de la barre marchande ouvrent un tiroir, plus une route', () => {
    const activity = read(BROWSE_ACTIVITY);
    expect(activity).toMatch(/cartButton\.setOnClickListener\(v -> openListSheet\(true\)\)/);
    expect(activity).toMatch(/wishButton\.setOnClickListener\(v -> openListSheet\(false\)\)/);
    // La régression exacte à interdire : le retour à openWebRoute sur ces deux
    // boutons, qui détruisait la page marchande.
    expect(activity).not.toMatch(/cartButton\.setOnClickListener\(v -> openWebRoute/);
    expect(activity).not.toMatch(/wishButton\.setOnClickListener\(v -> openWebRoute/);
  });

  test('fermer le tiroir rend la boutique au lieu de la fermer', () => {
    const activity = read(BROWSE_ACTIVITY);
    expect(activity).toMatch(/close\.setOnClickListener\(v -> dialog\.dismiss\(\)\)/);
    expect(activity).toMatch(/keepShopping\.setOnClickListener\(v -> dialog\.dismiss\(\)\)/);
  });

  test('payer est la SEULE sortie restante ; se connecter se fait sur place', () => {
    const activity = read(BROWSE_ACTIVITY);
    // Payer doit sortir : le tunnel de commande est une page AYROVI, pas une
    // page marchande. Se connecter, au contraire, n'a aucune raison de coûter
    // la page qu'on est en train de regarder — c'était la remarque du client.
    expect(activity).toMatch(/cta\.setOnClickListener\(v -> \{ dialog\.dismiss\(\); openWebRoute\("\/aywebs\/cart"\); \}\)/);
    expect(activity).not.toMatch(/cta\.setOnClickListener\(v -> \{ dialog\.dismiss\(\); openWebRoute\("\/account"\); \}\)/);
    expect(readCode(BROWSE_ACTIVITY)).toMatch(/cta\.setOnClickListener\(v -> openLoginSheet\(/);
  });

  test('le tiroir Favoris peut enregistrer le produit affiché à l’instant', () => {
    const activity = readCode(BROWSE_ACTIVITY);
    expect(activity).toMatch(/addFavoriteCurrentPageButton\(dialog, list, notice\)/);
    expect(activity).toMatch(/new JSONObject\(\)\.put\("sourceUrl", target\)/);
  });

  test('ouvrir un favori recharge la WebView courante, sans quitter le navigateur', () => {
    const activity = read(BROWSE_ACTIVITY);
    expect(activity).toMatch(/dialog\.dismiss\(\); if \(ApiTrust\.browsable\(target\)\) webView\.loadUrl\(target\);/);
  });

  test('401 est traité comme « connectez-vous », pas comme une panne', () => {
    const activity = read(BROWSE_ACTIVITY);
    expect(activity).toMatch(/error\.status == 401 \|\| error\.status == 403/);
    expect(activity).toMatch(/R\.string\.aywebs_sheet_login_required/);
  });

  test('le tiroir est plafonné à 82 % et défile à l’intérieur (§7)', () => {
    expect(read(BROWSE_ACTIVITY)).toMatch(/0\.82f/);
    expect(read('android/app/src/main/res/layout/sheet_aywebs_list.xml')).toMatch(/ScrollView/);
  });

  test('les favoris du COMPTE voyagent avec leur jeton', () => {
    const activity = read(BROWSE_ACTIVITY);
    expect(activity).toMatch(/EXTRA_CUSTOMER_TOKEN/);
    expect(activity).toMatch(/"authorization", "Bearer " \+ customerToken/);
    expect(read('client/src/services/nativeShell.ts')).toMatch(/customerToken: getNativeSessionToken\(\)/);
  });

  test('les libellés du tiroir existent dans les deux langues', () => {
    for (const file of ['android/app/src/main/res/values/strings.xml',
                        'android/app/src/main/res/values-ar/strings.xml']) {
      const strings = read(file);
      for (const key of ['aywebs_sheet_checkout', 'aywebs_sheet_login',
                         'aywebs_sheet_empty_cart', 'aywebs_sheet_empty_wish']) {
        expect(strings).toContain(key);
      }
    }
  });
});

describe('§10 — la connexion ne sort plus de l’application', () => {
  test('l’onglet personnalisé remplace le navigateur système', () => {
    const plugin = read(AUTH_TAB_PLUGIN);
    expect(plugin).toMatch(/CustomTabsIntent/);
    expect(plugin).toMatch(/launchUrl\(getActivity\(\), parsed\)/);
    // NEW_TASK ferait de l'onglet une fenêtre séparée : exactement la bascule
    // d'application reprochée. Lecture SANS commentaires : le fichier explique
    // justement pourquoi ce drapeau est absent, et une lecture naïve se
    // déclencherait sur cette explication.
    expect(readCode(AUTH_TAB_PLUGIN)).not.toMatch(/FLAG_ACTIVITY_NEW_TASK/);
  });

  test('une page de mot de passe n’est jamais ouverte en http', () => {
    expect(read(AUTH_TAB_PLUGIN)).toMatch(/AUTH_TAB_URL_INVALID/);
  });

  test('le plugin est enregistré, sinon le repli navigateur reprendrait', () => {
    expect(read('android/app/src/main/java/app/ayrovi/mobile/MainActivity.java'))
      .toMatch(/registerPlugin\(AyroviAuthTabPlugin\.class\)/);
  });

  test('la couche web appelle l’onglet et garde un repli honnête', () => {
    const module = read(NATIVE_OAUTH);
    expect(module).toMatch(/export async function openProviderInAppTab/);
    expect(module).toMatch(/registerPlugin<AuthTabBridge>\('AyroviAuthTab'\)/);
    expect(module).toMatch(/window\.open\(url, '_blank', 'noopener,noreferrer'\)/);
    expect(read(ACCOUNT_PAGE)).toMatch(/await openProviderInAppTab\(oauthStartUrl\(provider, query, handoff\)\)/);
  });
});

describe('§11 — écran de connexion refondu d’après les captures', () => {
  test('l’adresse d’abord, le mot de passe ensuite', () => {
    const page = read(ACCOUNT_PAGE);
    expect(page).toMatch(/const \[emailStep, setEmailStep\] = useState<'email' \| 'password'>\('email'\)/);
    // Étape 1 : aucun champ mot de passe tant que l'adresse n'est pas saisie.
    expect(page).toMatch(/\{emailStep === 'email' \? <>/);
  });

  test('les trois entrées des captures sont présentes', () => {
    const page = read(ACCOUNT_PAGE);
    expect(page).toMatch(/Se connecter ou s’inscrire/);
    expect(page).toMatch(/Continuer avec Google/);
    expect(page).toMatch(/Continuer avec un numéro de téléphone/);
  });

  test('les boutons de fournisseur sont empilés, pas comprimés en rangée', () => {
    const css = read('client/src/styles/customer-auth.css');
    expect(css).toMatch(/\.ay-auth__social \{ display: flex; flex-direction: column;/);
    expect(css).toMatch(/\.ay-auth__provider \{ width: 100%;/);
  });

  test('aucune question « cet e-mail existe-t-il ? » n’est posée au serveur', () => {
    // Elle révélerait qui possède un compte chez AYROVI. C'est le serveur qui
    // tranche à l'envoi du mot de passe.
    expect(read(ACCOUNT_PAGE)).not.toMatch(/auth\/email\/exists|checkEmailExists/);
  });
});

/* ── 3e passe (04/10/2026) : logos des boutiques et hôte de l’API ────────── */
describe('Logos des boutiques et hôte de l’API', () => {
  test('ne dépend plus d’un fournisseur de logos tiers', () => {
    // clearbit a fermé son service de logos : chaque carte demandait une image
    // à un serveur mort, d’où les vignettes vides — et chaque client exposait
    // au passage son adresse à un tiers pour rien.
    const catalogue = readCode('shared/aywebsStores.ts');
    expect(catalogue).not.toContain('clearbit');
    expect(catalogue).not.toMatch(/logo:\s*'https?:/);
  });

  test('sert les quatre logos depuis l’application elle-même', () => {
    const catalogue = readCode('shared/aywebsStores.ts');
    for (const id of ['amazon', 'shein', 'temu', 'aliexpress']) {
      expect(catalogue).toContain(`/stores/${id}.png`);
      expect(existsSync(`client/public/stores/${id}.png`)).toBe(true);
    }
  });

  test('parle à l’hôte qui répond réellement', () => {
    // Mesuré au curl : l’hôte sans « -1 » renvoie 404 sur les routes d’auth,
    // et c’est l’hôte « -1 » que le serveur met lui-même dans son redirect_uri.
    const origin = readCode('client/src/services/apiOrigin.ts');
    expect(origin).toContain('https://ayrovi-beta1-1.onrender.com');
    expect(origin).not.toMatch(/ayrovi-beta1\.onrender\.com/);
  });
});

/* ── Connexion Google NATIVE (04/10/2026, identifiant fourni par le client) ─ */
describe('Connexion Google sans navigateur', () => {
  const PLUGIN = 'android/app/src/main/java/app/ayrovi/mobile/AyroviAuthTabPlugin.java';

  test('le sélecteur de compte du système est demandé, pas une page web', () => {
    const plugin = readCode(PLUGIN);
    expect(plugin).toContain('GetGoogleIdOption');
    expect(plugin).toContain('getCredentialAsync');
    // Premier usage : aucun compte n'est encore « autorisé » pour l'app ;
    // filtrer afficherait une feuille vide, lue comme une panne.
    expect(plugin).toContain('setFilterByAuthorizedAccounts(false)');
  });

  test('l’identifiant client Web est une ressource, pas une constante perdue', () => {
    expect(readCode(PLUGIN)).toContain('R.string.google_web_client_id');
    expect(read('android/app/src/main/res/values/strings.xml'))
      .toContain('917317804534-5v3d6fmlddpgrraj8bemu5tkju16066o.apps.googleusercontent.com');
  });

  test('un échec natif retombe sur l’onglet au lieu d’afficher une panne', () => {
    const plugin = readCode(PLUGIN);
    expect(plugin).toMatch(/onError\(GetCredentialException error\)/);
    expect(plugin).toContain('unavailable.put("available", false)');
    expect(readCode('client/src/customer/nativeOAuth.ts')).toContain('signInWithGoogleNatively');
  });

  test('le jeton d’identité est VÉRIFIÉ par Google côté serveur', () => {
    const routes = readCode(CUSTOMER_ROUTES);
    expect(routes).toContain("router.post('/auth/google/native'");
    expect(routes).toContain('https://oauth2.googleapis.com/tokeninfo?id_token=');
    // Sans contrôle d'audience, le jeton d'une AUTRE application ouvrirait
    // une session ici : c'est le contrôle qui porte toute la sécurité.
    expect(routes).toMatch(/claims\.aud[\s\S]{0,40}google\.clientId/);
  });

  test('les deux chemins Google partagent la même logique de compte', () => {
    // Deux copies divergeraient et produiraient des comptes dédoublés.
    const routes = readCode(CUSTOMER_ROUTES);
    expect(routes).toContain('function linkGoogleProfile');
    expect((routes.match(/linkGoogleProfile\(db, profile/g) || []).length).toBe(2);
  });

  test('la route native est plafonnée', () => {
    expect(readCode('src/server.ts')).toContain("rateLimit('google-native'");
  });
});

/* ── Audit follow-up: variant truth, retries, and the unsupported-link exit ─ */
describe('AYWEBs follow-up: variants, idempotent Add and Purchase Support', () => {
  const VARIANT_SHEET = 'client/src/features/aywebs/components/AyWebsVariantSheet.tsx';
  const API = 'client/src/features/aywebs/api.ts';
  const ROUTES = 'src/aywebs/routes.ts';

  test('Add retries keep one request id; changed selection or quantity creates a new intent', () => {
    const sheet = readCode(VARIANT_SHEET);
    const api = readCode(API);
    const routes = readCode(ROUTES);
    expect(sheet).toContain('useRef');
    expect(sheet).toContain('request_id: requestId');
    expect(sheet).toContain('pendingAddRequestId.current = requestId');
    expect(sheet).toContain('pendingAddRequestId.current = \'\'');
    expect(api).toContain('request_id?: string');
    expect(routes).toContain('const idempotencyKey = idempotencyKeyOf(req);');
    expect(routes).toContain('idempotencyKey,');
    expect(routes).toContain('idempotent_replay: result.idempotentReplay');
  });

  test('unknown stock is explicit and missing exact variants cannot be added', () => {
    const sheet = readCode(VARIANT_SHEET);
    const activity = readCode('android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java');
    expect(sheet).toContain("state === 'UNKNOWN'");
    expect(sheet).toContain('selectedVariantUnknown');
    expect(sheet).toContain('selectedVariantUnavailable');
    expect(activity).toContain('aywebs_availability_unknown');
    expect(activity).toContain('sameVariantAttributes(selected, candidateAttributes)');
  });

  test('unsupported capture leads to human review, explicitly separate from cart and merchant purchase', () => {
    const sheet = readCode(VARIANT_SHEET);
    const api = readCode(API);
    expect(sheet).toContain("fallback.includes('purchase_request')");
    expect(sheet).toContain('createAyWebsPurchaseRequest({');
    expect(sheet).toContain('does not add an item to your cart or buy from the merchant');
    expect(api).toContain("'/purchase-requests'");
  });
});
