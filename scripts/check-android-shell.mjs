/**
 * AYROVI — garde de la coque Android (ajouté le 2026-10-03).
 *
 * POURQUOI CE FICHIER EXISTE
 * La revue du 2026-10-03 a montré que rien, dans aucune porte automatique, ne
 * regardait la coque native : `ci.yml` ne compilait jamais Java et ne lisait
 * jamais le manifeste. C'est ainsi qu'ont pu cohabiter, sans alerte :
 *   • un Intent SANS action dans AyWebsBrowseActivity.openWebRoute(), que
 *     MainActivity.ayWebsTarget() rejette immédiatement (`action == null`) :
 *     les boutons Panier / Favoris / « Ajouter au panier » ne faisaient RIEN ;
 *   • `android:allowBackup="true"`, qui laisse `adb backup` extraire le profil
 *     de la WebView et les jetons de session ;
 *   • l'absence de `RECORD_AUDIO` alors que BridgeWebChromeClient demande déjà
 *     la permission à l'exécution — Android refuse alors en silence ;
 *   • un `capacitor.config.ts` qui portait `handleBackButton: true`, clé qui
 *     n'existe plus dans Capacitor 7 et ne faisait donc rien.
 *
 * CE QUE CE GARDE EST — ET N'EST PAS
 * Il vérifie des INVARIANTS structurels lisibles hors compilation. Il ne
 * remplace pas la compilation Java (qui, elle, tourne dans le job
 * `android-shell` de ci.yml, avec le SDK Android). Les contrôles « tripwire »
 * ci-dessous inspectent le texte source : ils attrapent une RÉGRESSION, ils ne
 * prouvent pas un comportement. Ne jamais les citer comme preuve d'exécution.
 *
 * Usage : node scripts/check-android-shell.mjs
 */
import fs from 'node:fs';

const MANIFEST = 'android/app/src/main/AndroidManifest.xml';
const MAIN = 'android/app/src/main/java/app/ayrovi/mobile/MainActivity.java';
const BROWSER = 'android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowseActivity.java';
const PLUGIN = 'android/app/src/main/java/app/ayrovi/mobile/AyWebsBrowsePlugin.java';
const STRINGS = 'android/app/src/main/res/values/strings.xml';
const CAP_CONFIG = 'capacitor.config.ts';

const failures = [];
const checks = [];
const check = (name, pass, detail) => {
  checks.push({ name, pass: Boolean(pass), detail });
  if (!pass) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const read = (file) => {
  if (!fs.existsSync(file)) {
    failures.push(`fichier introuvable : ${file}`);
    return '';
  }
  return fs.readFileSync(file, 'utf8');
};

/**
 * Retire les commentaires avant toute vérification.
 * Nécessaire : le fichier de configuration EXPLIQUE pourquoi `handleBackButton` a
 * été retiré ; sans ce nettoyage, la simple mention dans un commentaire ferait
 * échouer le garde. Un garde qui se déclenche sur de la prose est un faux
 * positif — et un faux positif apprend à ignorer les alertes.
 */
const stripComments = (source) => source
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

// Le manifeste est lu SANS ses commentaires : ils citent volontairement les mots
// qu'on interdit (« POST_NOTIFICATIONS », « allowBackup »…) pour expliquer les
// décisions. Un garde qui lit la prose est un garde qui se trompe dans les deux sens.
const manifest = stripComments(read(MANIFEST));
const main = read(MAIN);
const browser = read(BROWSER);
// Ces fichiers sont lus SANS leurs commentaires (voir stripComments) : ils
// expliquent volontairement les décisions en citant les mots concernés.
const capConfig = stripComments(read(CAP_CONFIG));
const plugin = read(PLUGIN);
const strings = stripComments(read(STRINGS));

/* ── 1. Invariants de sécurité du manifeste ─────────────────────────────────── */
check(
  'manifeste : allowBackup désactivé',
  /android:allowBackup="false"/.test(manifest),
  'allowBackup="true" laisse `adb backup` extraire le profil WebView et les jetons de session'
);

// Les permissions déclarées, dans l'ordre où elles apparaissent.
const declared = [...manifest.matchAll(/<uses-permission\s+android:name="android\.permission\.([A-Z_]+)"\s*\/>/g)].map((m) => m[1]);
const unique = new Set(declared);
check(
  'manifeste : aucune permission déclarée deux fois',
  unique.size === declared.length,
  `doublons : ${declared.filter((p, i) => declared.indexOf(p) !== i).join(', ')}`
);
check(
  'manifeste : INTERNET + CAMERA déclarées',
  unique.has('INTERNET') && unique.has('CAMERA'),
  `déclarées : ${[...unique].join(', ') || 'aucune'}`
);
check(
  'manifeste : RECORD_AUDIO déclarée',
  unique.has('RECORD_AUDIO'),
  'sans cette déclaration, la demande runtime de BridgeWebChromeClient est refusée en SILENCE (micro inutilisable)'
);
check(
  'manifeste : POST_NOTIFICATIONS volontairement absente',
  !unique.has('POST_NOTIFICATIONS'),
  'la déclarer seule ferait croire que les notifications marchent : il manque la pile push (plugin, jetons d’appareil, FCM)'
);

/* ── 2. Liens profonds AYWEBs (Manifest §25) ────────────────────────────────── */
check(
  'manifeste : lien profond ayrovi://aywebs déclaré',
  /android:scheme="ayrovi"/.test(manifest) && /android:host="aywebs"/.test(manifest),
  'sans ce filtre, les routes AYWEBs ne peuvent pas être reçues'
);
check(
  'manifeste : partage ACTION_SEND text/plain déclaré',
  /android:name="android.intent.action.SEND"/.test(manifest) && /android:mimeType="text\/plain"/.test(manifest),
  'le partage Android (§24) arriverait dans aucun écran'
);

/* ── 3. Tripwires Java — la forme EXACTE du défaut P0 corrigé ───────────────── */
// L'intent doit porter une ACTION. Sans elle, ayWebsTarget() sort sur `action == null`.
check(
  'AyWebsBrowseActivity : openWebRoute envoie une action',
  /new Intent\(\s*Intent\.ACTION_VIEW\s*,/.test(browser),
  'un Intent construit sans action est rejeté par MainActivity.ayWebsTarget() → navigation silencieusement morte'
);
// Et cette action doit viser le schéma que le contrôle accepte.
check(
  'AyWebsBrowseActivity : openWebRoute utilise le schéma ayrovi://',
  /AYWEBS_DEEP_LINK/.test(browser) && /ayrovi:\/\/aywebs/.test(browser),
  'ayWebsTarget() exige scheme=ayrovi et host=aywebs ; une URL https://localhost/… est rejetée même avec ACTION_VIEW'
);
// MainActivity doit refuser explicitement ce qu'il n'accepte pas (garde-fou de lecture).
check(
  'MainActivity : ayWebsTarget rejette les intents sans action',
  /action\s*==\s*null/.test(main),
  'ce rejet est la raison pour laquelle l’Intent sans action ne naviguait pas — le supprimer changerait le contrat'
);
check(
  'MainActivity : partage et lien profond traités au lancement à froid',
  /Intent launchIntent = getIntent\(\)/.test(main)
    && /savedInstanceState == null/.test(main)
    && /Uri initialTarget = ayWebsTarget\(launchIntent\)/.test(main)
    && /getWebView\(\)\.post\(\(\) -> navigate\(initialTarget\)\)/.test(main),
  'onNewIntent() ne couvre que les intents reçus après la création de MainActivity'
);
check(
  'MainActivity : bouton retour matériel câblé',
  /public void onBackPressed\s*\(/.test(main),
  'sans onBackPressed, le retour système ferme l’application même quand un écran AYROVI est ouvert (Capacitor 7 n’en fournit aucun)'
);

/* ── 3bis. AYWEBs : origine d'API + connexion marchande (2026-10-03) ───────── */
// Les appels privés de la coque (analyse, résolution, panier) doivent viser
// l'origine de l'API, PAS `webBase` (= https://localhost, le paquet embarqué où
// aucun serveur n'écoute). Les confondre gelait le bouton « Add to Cart ».
check(
  'AyWebsBrowseActivity : appelle l’API via apiOrigin, jamais via webBase',
  /post\(apiOrigin\s*\+\s*ANALYZE_PATH/.test(browser)
    && /post\(apiOrigin\s*\+\s*RESOLVE_PATH/.test(browser)
    && /post\(apiOrigin\s*\+\s*CART_ITEMS_PATH/.test(browser),
  'post(webBase + …) visait https://localhost : analyse et ajout échouaient systématiquement'
);
check(
  'AyWebsBrowseActivity : aucun appel API resté sur webBase',
  !/post\(webBase\s*\+/.test(browser),
  'un seul appel oublié suffit à casser le parcours d’achat'
);
check(
  'AyWebsBrowsePlugin : accepte et valide apiOrigin',
  /EXTRA_API_ORIGIN/.test(plugin) && /apiOrigin/.test(plugin),
  'sans transmission depuis la couche web, la coque n’a aucun moyen de connaître l’API'
);
check(
  'AyWebsBrowseActivity : popups window.open() prises en charge',
  /setSupportMultipleWindows\(true\)/.test(browser) && /onCreateWindow/.test(browser),
  'sans cela window.open() est ignoré en silence : les popups de connexion SSO ne s’ouvrent jamais'
);
check(
  'AyWebsBrowseActivity : cookies tiers acceptés',
  /setAcceptThirdPartyCookies\(webView,\s*true\)/.test(browser),
  'refusés par défaut depuis Android 5.0 : les parcours de connexion bouclent'
);
/* ── 3ter. §5 (04/10/2026) : boutons de la barre haute RÉELLEMENT câblés ───── */
// Le défaut : `@+id/aywebs_close` et `@+id/aywebs_refresh` existaient dans le
// XML mais n'étaient référencés nulle part en Java. Les appuis partaient dans
// le vide. Un bouton présent et muet est pire qu'un bouton absent.
check(
  'AyWebsBrowseActivity : bouton X câblé',
  /R\.id\.aywebs_close/.test(browser) && /closeButton\.setOnClickListener/.test(browser),
  'le X du navigateur marchand ne faisait rien : aucun findViewById, aucun listener'
);
check(
  'AyWebsBrowseActivity : bouton rafraîchir câblé',
  /R\.id\.aywebs_refresh/.test(browser) && /refreshButton\.setOnClickListener/.test(browser),
  'même défaut que le X : présent dans le XML, absent du Java'
);
check(
  'AyWebsBrowseActivity : X revient à AYROVI sans tuer l’application',
  /onClosePressed/.test(browser) && /isTaskRoot\(\)/.test(browser),
  'un finish() inconditionnel ferme l’application quand le navigateur est la racine de la tâche (lien profond, partage)'
);
/* ── 3quater. (04/10/2026) : Panier et Favoris RESTENT dans la boutique ───── */
// Le défaut signalé : les deux boutons de la barre basse appelaient
// openWebRoute(), c'est-à-dire startActivity(lien profond) + finish(). La page
// marchande était DÉTRUITE et l'utilisateur éjecté de son achat pour la seule
// raison qu'il voulait vérifier son panier. Ils ouvrent désormais un tiroir
// par-dessus la WebView, qui reste vivante dessous.
check(
  'AyWebsBrowseActivity : Panier ouvre un tiroir interne',
  /cartButton\.setOnClickListener\(v -> openListSheet\(true\)\)/.test(browser),
  'openWebRoute() détruisait la page marchande : consulter son panier n’est pas quitter sa boutique'
);
check(
  'AyWebsBrowseActivity : Favoris ouvre un tiroir interne',
  /wishButton\.setOnClickListener\(v -> openListSheet\(false\)\)/.test(browser),
  'même défaut que le panier : le favori éjectait de la boutique'
);
check(
  'AyWebsBrowseActivity : fermer le tiroir rend la boutique, ne la ferme pas',
  /private void openListSheet\(/.test(browser)
    && /close\.setOnClickListener\(v -> dialog\.dismiss\(\)\)/.test(browser)
    && /keepShopping\.setOnClickListener\(v -> dialog\.dismiss\(\)\)/.test(browser),
  'un tiroir dont la croix appelle finish() est un tiroir qui ment : il ferme la boutique'
);
check(
  'AyWebsBrowseActivity : les deux seules sorties du tiroir sont payer et se connecter',
  /R\.string\.aywebs_sheet_checkout/.test(browser) && /R\.string\.aywebs_sheet_login/.test(browser),
  'le client a autorisé exactement ces deux sorties, pas une de plus'
);
check(
  'AyWebsBrowseActivity : tiroir plafonné à 82 % de l’écran',
  /capSheetHeight/.test(browser) && /0\.82f/.test(browser),
  'sans plafond, une longue liste recouvre la barre du marchand et déborde sous la barre système'
);
check(
  'AyWebsBrowseActivity : les favoris portent le jeton du COMPTE',
  /EXTRA_CUSTOMER_TOKEN/.test(browser) && /Bearer/.test(browser),
  'sans lui, un utilisateur connecté verrait « connectez-vous » au milieu de ses achats'
);

check(
  'AyWebsBrowseActivity : retour matériel câblé',
  /public void onBackPressed\s*\(/.test(browser),
  'sans onBackPressed, le retour système quitte le navigateur marchand au lieu de remonter son historique'
);

check(
  'AyWebsBrowseActivity : panne de service distinguée de « page non éligible »',
  /setAddUnavailable/.test(browser) && /aywebs_service_unavailable/.test(strings),
  'annoncer « page non éligible » quand l’API ne répond pas est un mensonge à l’utilisateur'
);

check(
  'AyWebsBrowseActivity : le classement serveur LOGIN/CHECKOUT/CAPTCHA est expliqué',
  /customer_action_required/.test(browser) && /aywebs_login_required/.test(browser)
    && /aywebs_merchant_cart/.test(browser) && /aywebs_captcha_page/.test(browser),
  'le serveur distingue ces pages ; les réduire à « Page non éligible » n’aide pas le client'
);
check(
  'AyWebsBrowseActivity : le message utilisateur du serveur est remonté',
  /error_contract/.test(browser) && /userMessageOf/.test(browser),
  'jeter le contrat d’erreur prive le client de la raison réelle (connexion, panier marchand, devise)'
);
check(
  'strings.xml : libellés des états marchands présents',
  ['aywebs_login_required', 'aywebs_merchant_cart', 'aywebs_captcha_page', 'aywebs_service_unavailable']
    .every((key) => strings.includes(key)),
  'un état sans libellé retombe sur un texte générique'
);

/* ── 4. capacitor.config.ts ─────────────────────────────────────────────────── */
check(
  'capacitor.config.ts : clé fantôme handleBackButton retirée',
  !/handleBackButton/.test(capConfig),
  'cette clé n’existe plus dans Capacitor 7 : la laisser fait croire que le retour est câblé'
);
check(
  'capacitor.config.ts : barre d’état configurée explicitement',
  /overlaysWebView\s*:\s*false/.test(capConfig),
  'targetSdk 35 impose l’edge-to-edge et le défaut de Capacitor est overlaysWebView=true → l’en-tête passe sous la barre d’état'
);

/* ── Rapport ────────────────────────────────────────────────────────────────── */
for (const c of checks) {
  console.log(`${c.pass ? '  ✓' : '  ✗'} ${c.name}`);
}
console.log('');
if (failures.length) {
  console.error(`Coque Android : ${failures.length} invariant(s) rompu(s).`);
  for (const f of failures) console.error(`  • ${f}`);
  process.exit(1);
}
/* ── 3sexies. (04/10/2026, 3e passe) : attente, favoris, connexion ───────── */
// Mesure : le service dort après inactivité et met ~60 s à se réveiller ; le
// lecteur était à 20 s, donc le premier ajout au panier de chaque session ne
// pouvait QUE expirer. Ce n'était ni Amazon ni le produit.
check(
  'AyWebsBrowseActivity : délais à la mesure d’un réveil à froid',
  /setReadTimeout\(60_000\)/.test(browser) && !/setReadTimeout\(20_000\)/.test(browser),
  '20 s ne suffisent pas à réveiller le service : le premier ajout expirait systématiquement'
);
check(
  'AyWebsBrowseActivity : le service est réveillé dès l’ouverture du magasin',
  /warmUpApi\(\)/.test(browser) && /HEALTH_PATH/.test(browser),
  'sans réveil anticipé, c’est l’utilisateur qui paie le démarrage à froid, debout devant un bouton muet'
);
check(
  'AyWebsBrowseActivity : une seule relance après expiration',
  /SocketTimeoutException/.test(browser) && /postOnce/.test(browser),
  'réessayer en boucle prolonge l’attente en silence ; ne pas réessayer du tout gaspille le réveil déjà payé'
);
check(
  'AyWebsBrowseActivity : se connecter ne quitte plus la boutique',
  /private void openLoginSheet\(/.test(browser)
    && !/cta\.setOnClickListener\(v -> \{ dialog\.dismiss\(\); openWebRoute\("\/account"\); \}\)/.test(browser),
  'le bouton renvoyait vers l’écran compte : se connecter détruisait la page marchande en plein achat'
);
check(
  'AyWebsBrowseActivity : la connexion réclame le jeton natif',
  /"x-ayrovi-native", "1"/.test(browser),
  'sans cet en-tête le serveur n’émet aucun jeton natif : la coque resterait déconnectée après une connexion réussie'
);
check(
  'AyWebsBrowseActivity : le tiroir Favoris sait AJOUTER la page courante',
  /addFavoriteCurrentPageButton/.test(browser) && /R\.string\.aywebs_fav_add/.test(browser),
  'on ouvre ses favoris en regardant un produit, justement pour l’y mettre'
);
check(
  'AyWebsBrowseActivity : on ne propose pas d’ajouter une page qui n’est pas un produit',
  /if \(!productPage \|\| currentUrl\.isEmpty\(\)\) \{\s*toast\(R\.string\.aywebs_fav_not_product\);/.test(browser),
  'proposer d’ajouter une page d’accueil aux favoris est une promesse creuse'
);

/* ── 3quinquies. (04/10/2026) : la connexion ne sort plus de l'application ── */
// « تسجيل دخول بش ولي داخل تطبيق لا خروج من تطبيق ». Le correctif précédent du
// 404 Google ouvrait le NAVIGATEUR SYSTÈME : application différente, bascule
// visible, retour manuel. L'onglet personnalisé est la seule voie qui soit à la
// fois acceptée par Google (qui refuse les WebView embarquées) et sans sortie.
const authTab = read('android/app/src/main/java/app/ayrovi/mobile/AyroviAuthTabPlugin.java');
check(
  'AyroviAuthTabPlugin : onglet personnalisé présent',
  /CustomTabsIntent/.test(authTab) && /launchUrl/.test(authTab),
  'sans lui, la connexion par fournisseur bascule vers Chrome et quitte AYROVI'
);
check(
  'AyroviAuthTabPlugin : l’onglet reste dans NOTRE tâche',
  !/FLAG_ACTIVITY_NEW_TASK/.test(authTab),
  'avec NEW_TASK, l’onglet devient une fenêtre séparée dans le sélecteur d’applications'
);
check(
  'AyroviAuthTabPlugin : https exigé pour une page de mot de passe',
  /AUTH_TAB_URL_INVALID/.test(authTab),
  'ouvrir un formulaire de connexion en http serait une faute'
);
check(
  'MainActivity : le plugin d’onglet est enregistré',
  /registerPlugin\(AyroviAuthTabPlugin\.class\)/.test(read('android/app/src/main/java/app/ayrovi/mobile/MainActivity.java')),
  'un plugin non enregistré est invisible depuis le web : le repli navigateur reprendrait'
);

console.log(`Coque Android : ${checks.length} invariants vérifiés, 0 rupture.`);
