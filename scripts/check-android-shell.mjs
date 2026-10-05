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

/* ── 5. Origine des médias dans le paquet embarqué (AY-26, 04/10/2026) ─────────
 * Le pont nativeApiOrigin réécrit fetch/XHR ; le navigateur résout SEUL `src`,
 * `srcSet` et `poster`. Sans réécriture explicite, tout média servi par l'API
 * (`/uploads/…`, `/api/public/media/…`) est demandé à `https://localhost` :
 * 404 silencieux dans l'APK, alors que le web fonctionne. Inversement, une
 * réécriture AVEUGLE casserait `/media/…` : ces fichiers n'existent QUE dans le
 * paquet (le serveur n'a aucune route `/media`) — logo AYROVI et replis compris.
 */
const assetOrigin = stripComments(read('client/src/services/assetOrigin.ts'));
const mediaIsolation = stripComments(read('client/src/ayrovix/services/mediaIsolation.ts'));
const heroSrc = stripComments(read('client/src/components/EvergreenHero.tsx'));
const headerSrc = stripComments(read('client/src/design/AppHeader.tsx'));

check(
  'AY-26 : nativeAssetUrl branche sur la coque native (pas une identité)',
  /isNativeApp\(\)/.test(assetOrigin) && /normalizeApiOrigin\(origin\)/.test(assetOrigin),
  'sans ce branchement, les médias serveur restent relatifs à https://localhost dans l’APK'
);
check(
  'AY-26 : réécriture LIMITÉE aux préfixes serveur (/api, /uploads)',
  /SERVER_OWNED\s*=\s*\/\^\\\/\(\?:api\|uploads\)/.test(assetOrigin) && !/value\.startsWith\('\/'\)/.test(assetOrigin),
  'réécrire tout chemin relatif casserait /media, qui appartient au paquet et non au serveur'
);
check(
  'AY-26 : mediaIsolation réécrit ses trois sorties (point de passage unique)',
  (mediaIsolation.match(/nativeAssetUrl\(/g) || []).length === 3,
  'les images Lens/produit passent toutes par isolated/composed/proxied'
);
check(
  'AY-26 : le Hero réécrit src ET srcSet (le navigateur résout les deux)',
  /src=\{nativeAssetUrl\(visual\.imageUrl\)\}/.test(heroSrc) && /nativeAssetUrl\(entry\.url\)/.test(heroSrc),
  'srcSet non réécrit = mêmes images cassées en haute densité'
);
check(
  'AY-26 : aucun src brut restant sur les médias serveur courants',
  !/src=\{logoUrl\}/.test(headerSrc),
  'AppHeader affiche le logo : un src brut y est le premier symptôme visible'
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
console.log(`Coque Android : ${checks.length} invariants vérifiés, 0 rupture.`);
