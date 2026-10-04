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
import { readFileSync } from 'node:fs';
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
    expect(java).toMatch(/public void onBackPressed\(\)/);
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
