/**
 * Contrat SEO public — une seule liste de pages, lue par le serveur ET le client.
 *
 * Historique du défaut : le `<head>` était écrit une fois pour toutes dans `index.html`, avec
 * `canonical = https://ayrovi.tn/`. Comme l'application est une SPA servie par le même
 * `index.html`, `/arrivage`, `/gift-cards` et `/magazine` se déclaraient « copies de la
 * page d'accueil » — la pire instruction possible pour un moteur de recherche. Et toute
 * adresse inconnue recevait un `200` (soft-404) : le site répondait « tout va bien » même
 * pour une page qui n'existe pas.
 *
 * Ce module est la source unique : le client y lit le titre, la description et le robots de
 * la route affichée ; le serveur y lit les pages réelles (pour le 404) et les pages à
 * publier (pour le sitemap). Ajouter une page = une entrée ici, jamais trois listes à
 * tenir synchronisées — c'est précisément la triple divergence qui avait produit le défaut.
 */

export interface PublicSeoRoute {
  /** Chemin exact servi par le client (sans slash final). */
  path: string;
  titleFr: string;
  titleAr: string;
  descriptionFr: string;
  descriptionAr: string;
  /** Réelle mais jamais indexable : console d'administration, réinitialisation de mot de passe. */
  indexable: boolean;
  inSitemap: boolean;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
  priority: number;
}

const HOME_TITLE_FR = 'AYROVI — Votre Shopping International en Dinars Tunisiens';
const HOME_TITLE_AR = 'أيروفي — تسوّقك العالمي بالدينار التونسي';
const HOME_DESCRIPTION_FR = "Découvrez et achetez n'importe quel produit du web mondial, directement en Dinars Tunisiens (DT) par photo ou lien, avec livraison dans les 24 gouvernorats.";
const HOME_DESCRIPTION_AR = 'اكتشف واشترِ أي منتج من الويب العالمي مباشرة بالدينار التونسي، بصورة أو برابط، مع توصيل إلى 24 ولاية.';

export const PUBLIC_SEO_ROUTES: readonly PublicSeoRoute[] = [
  {
    path: '/',
    titleFr: HOME_TITLE_FR,
    titleAr: HOME_TITLE_AR,
    descriptionFr: HOME_DESCRIPTION_FR,
    descriptionAr: HOME_DESCRIPTION_AR,
    indexable: true,
    inSitemap: true,
    changeFrequency: 'daily',
    priority: 1,
  },
  {
    path: '/aywebs',
    titleFr: 'AyWebs — shopping depuis le web avec AYROVI',
    titleAr: 'AyWebs — التسوق من الويب عبر أيروفي',
    descriptionFr: 'AyWebs est le point d’entrée AYROVI pour parcourir des boutiques externes et préparer des produits pour le panier AYROVI.',
    descriptionAr: 'AyWebs هي بوابة أيروفي لتصفح المتاجر الخارجية وتجهيز المنتجات لإضافتها إلى سلة أيروفي.',
    indexable: false,
    inSitemap: false,
    changeFrequency: 'weekly',
    priority: 0.1,
  },
  {
    path: '/arrivage',
    titleFr: 'Arrivage — nouvelles trouvailles AYROVI',
    titleAr: 'وصلات جديدة — أحدث اكتشافات أيروفي',
    descriptionFr: 'Les arrivages AYROVI : les produits fraîchement découverts, au prix transparent en dinars tunisiens, avec livraison dans toute la Tunisie.',
    descriptionAr: 'وصلات أيروفي: أحدث المنتجات المكتشفة بأسعار شفافة بالدينار التونسي مع التوصيل إلى كامل ولايات تونس.',
    indexable: true,
    inSitemap: true,
    changeFrequency: 'daily',
    priority: 0.8,
  },
  {
    path: '/gift-cards',
    titleFr: 'Gift & Cards — idées cadeaux AYROVI',
    titleAr: 'هدايا وبطاقات — أفكار هدايا أيروفي',
    descriptionFr: 'Idées cadeaux et cartes AYROVI : choisissez un cadeau du monde entier, payez en dinars et faites-le livrer partout en Tunisie.',
    descriptionAr: 'أفكار هدايا وبطاقات أيروفي: اختر هدية من العالم، وادفع بالدينار، ووصّلها إلى أي مكان في تونس.',
    indexable: true,
    inSitemap: true,
    changeFrequency: 'weekly',
    priority: 0.7,
  },
  {
    path: '/magazine',
    titleFr: 'Magazine — le journal AYROVI',
    titleAr: 'مجلة أيروفي',
    descriptionFr: "Le Magazine AYROVI : sélections, tendances et guides d'achat pour mieux choisir depuis la Tunisie.",
    descriptionAr: 'مجلة أيروفي: مختارات واتجاهات وأدلة شراء لاختيار أفضل من تونس.',
    indexable: true,
    inSitemap: true,
    changeFrequency: 'weekly',
    priority: 0.6,
  },
  {
    path: '/admin',
    titleFr: 'Administration — AYROVI',
    titleAr: 'لوحة الإدارة — أيروفي',
    descriptionFr: "Console d'administration AYROVI. Accès réservé.",
    descriptionAr: 'لوحة إدارة أيروفي. الدخول محصور بالمصرّح لهم.',
    indexable: false,
    inSitemap: false,
    changeFrequency: 'monthly',
    priority: 0.1,
  },
  {
    path: '/reset-password',
    titleFr: 'Réinitialiser le mot de passe — AYROVI',
    titleAr: 'استعادة كلمة المرور — أيروفي',
    descriptionFr: 'Réinitialisation du mot de passe AYROVI, réservée aux comptes clients.',
    descriptionAr: 'استعادة كلمة مرور حساب العميل في أيروفي.',
    indexable: false,
    inSitemap: false,
    changeFrequency: 'monthly',
    priority: 0.1,
  },
] as const;

/** Le slash final ne change pas la page ; `/Arrivage` non plus (les chemins servis sont en minuscules). */
function normalizePath(pathname: string): string {
  const trimmed = String(pathname || '/').trim();
  const withoutSlash = trimmed.replace(/\/+$/, '') || '/';
  return withoutSlash.startsWith('/') ? withoutSlash.toLowerCase() : `/${withoutSlash.toLowerCase()}`;
}

export function seoRouteFor(pathname: string): PublicSeoRoute | undefined {
  const path = normalizePath(pathname);
  return PUBLIC_SEO_ROUTES.find((route) => route.path === path);
}

/** Vrai pour toute page réellement servie par le client — y compris les pages non indexables. */
export function isKnownPagePath(pathname: string): boolean {
  return Boolean(seoRouteFor(pathname));
}

export function sitemapRoutes(): PublicSeoRoute[] {
  return PUBLIC_SEO_ROUTES.filter((route) => route.inSitemap);
}

/** Le catalogue de pages réelles, côté serveur, pour distinguer une page d'une adresse inventée. */
export const KNOWN_PAGE_PATHS: readonly string[] = PUBLIC_SEO_ROUTES.map((route) => route.path);
