import { API_BASE_URL } from '@/api/config';
import { DEEP_LINK_SCHEME } from '@/config/deepLinks';
/**
 * Liens profonds — traduction d'une URL du site en écran de l'application.
 *
 * Deux décisions de fond, et ce sont des décisions de SÉCURITÉ avant d'être
 * des décisions de confort :
 *
 * 1. **Seuls les hôtes déclarés sont acceptés.** `app.json` ouvre des
 *    `intentFilters` `autoVerify` sur quelques hôtes ; traduire une URL
 *    venue d'AILLEURS ouvrirait la porte à n'importe quelle page qui
 *    ferait naviguer notre application où bon lui semble. Un lien inconnu
 *    ne navigue pas : il est ignoré, sans message d'erreur (l'utilisateur
 *    n'a rien demandé, il n'a rien à comprendre).
 *
 * 2. **Aucun lien profond n'ouvre la vue Web marchande.** `aywebs/browser`
 *    prend une URL en paramètre ; l'exposer aux liens profonds
 *    transformait n'importe quel lien en « ouvrir cette adresse dans
 *    l'application ». Cette écran reste accessible uniquement de l'intérieur.
 *
 * Le reste est de la traduction : un préfixe de chemin vers une route
 * existante. Chaque cible a été vérifiée contre l'arborescence réelle de
 * `app/` — un lien qui mène à un écran absent est un lien mort.
 */

/**
 * Hôtes du domaine public — ceux de la marque, stables par nature.
 *
 * L'hôte de l'API n'est PAS écrit ici : il est DÉDUIT de `API_BASE_URL`,
 * seule source de vérité (voir `src/api/config.ts`). Le recopier revenait à
 * écrire l'origine du serveur à deux endroits ; le jour où elle change, un
 * lien profond continuerait d'être refusé sans que rien ne l'explique.
 */
const BRAND_HOSTS = ['ayrovi.tn', 'www.ayrovi.tn'] as const;

function hostOf(value: string): string {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return '';
  }
}

/** Hôtes autorisés : la marque, plus l'API réellement configurée. */
export const deepLinkHosts = (apiBaseUrl: string = API_BASE_URL): string[] => {
  const apiHost = hostOf(apiBaseUrl);
  return apiHost && !BRAND_HOSTS.includes(apiHost as (typeof BRAND_HOSTS)[number])
    ? [...BRAND_HOSTS, apiHost]
    : [...BRAND_HOSTS];
};

/** Liste figée à l'import — conservée pour les tests et l'affichage. */
export const DEEP_LINK_HOSTS = deepLinkHosts();

/** Préfixes de chemin du site → route de l'application. */
const ROUTES: { prefix: string; route: string | ((rest: string) => string | null) }[] = [
  { prefix: '/product/', route: (rest) => (rest ? `/product/${rest}` : null) },
  { prefix: '/orders/', route: (rest) => (rest ? `/orders/${rest}` : null) },
  { prefix: '/news/', route: (rest) => (rest ? `/news/${rest}` : null) },
  { prefix: '/produit/', route: (rest) => (rest ? `/product/${rest}` : null) },
  { prefix: '/catalog', route: '/catalog' },
  { prefix: '/orders', route: '/orders' },
  { prefix: '/commandes', route: '/orders' },
  { prefix: '/checkout', route: '/checkout' },
  { prefix: '/panier', route: '/(tabs)/cart' },
  { prefix: '/cart', route: '/(tabs)/cart' },
  { prefix: '/lens/scan', route: '/lens/scan' },
  { prefix: '/lens/ocerex', route: '/lens/ocerex' },
  { prefix: '/lens/watches', route: '/lens/watches' },
  { prefix: '/lens', route: '/(tabs)/lens' },
  { prefix: '/aywebs', route: '/(tabs)/aywebs' },
  { prefix: '/assistant', route: '/assistant' },
  { prefix: '/sonim', route: '/assistant' },
  { prefix: '/account/notifications', route: '/account/notifications' },
  { prefix: '/account/addresses', route: '/account/addresses' },
  { prefix: '/account/favorites', route: '/account/favorites' },
  { prefix: '/account/security', route: '/account/security' },
  { prefix: '/account/preferences', route: '/account/preferences' },
  { prefix: '/account/profile', route: '/account/profile' },
  { prefix: '/account/about', route: '/account/about' },
  { prefix: '/account', route: '/(tabs)/account' },
  { prefix: '/promotions', route: '/promotions' },
  { prefix: '/news', route: '/news' },
  { prefix: '/reels', route: '/reels' },
  { prefix: '/stories', route: '/stories' },
  { prefix: '/publications', route: '/publications' },
  { prefix: '/sign-in', route: '/sign-in' },
];

/** `ayrovi://orders/42` et `ayrovi:///orders/42` désignent la même chose. */
function normalizePathname(url: URL): string {
  let path = url.pathname || '/';
  if (!path.startsWith('/')) path = `/${path}`;
  // Barre oblique finale : « /orders/ » et « /orders » sont le même écran.
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

/**
 * Traduit une URL en route, ou `null` si elle ne doit rien ouvrir.
 *
 * `null` n'est pas une erreur : c'est « ce lien ne nous concerne pas », et
 * l'appelant se contente de ne rien faire.
 */
export function resolveDeepLink(rawUrl: string | null | undefined): string | null {
  const raw = String(rawUrl || '').trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null; // URL illisible : rien à traduire.
  }

  const scheme = url.protocol.replace(/:$/, '').toLowerCase();
  if (scheme === DEEP_LINK_SCHEME || scheme === 'exp' || scheme === `exp+${DEEP_LINK_SCHEME}`) {
    // Schéma propre à l'application : l'hôte n'est pas un hôte, c'est parfois
    // le début du chemin (`ayrovi://orders/42` ⇒ host « orders »).
    const path = url.host ? `/${url.host}${normalizePathname(url)}` : normalizePathname(url);
    return matchRoute(path.replace(/\/{2,}/g, '/'));
  }
  if (scheme !== 'http' && scheme !== 'https') return null;
  if (!deepLinkHosts().includes(url.hostname.toLowerCase())) return null;

  return matchRoute(normalizePathname(url));
}

function matchRoute(path: string): string | null {
  if (path === '/' || path === '') return '/(tabs)';

  // Le PLUS LONG préfixe gagne, et pas « le premier de la liste » : s'en
  // remettre à l'ordre d'écriture fait dépendre le routage d'un déplacement de
  // ligne. Ici `/orders/42` ne peut pas tomber sur `/orders`, quel que soit
  // l'ordre du tableau.
  const candidates = ROUTES
    .filter((entry) => path.startsWith(entry.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length);

  for (const entry of candidates) {
    const rest = path.slice(entry.prefix.length);
    // « /ordersX » ne doit pas ouvrir « /orders » : un préfixe ne colle que
    // sur une fin de segment.
    if (rest && !rest.startsWith('/') && !entry.prefix.endsWith('/')) continue;
    const target = typeof entry.route === 'string' ? entry.route : entry.route(rest.replace(/^\//, ''));
    if (target) return target;
  }
  return null;
}
