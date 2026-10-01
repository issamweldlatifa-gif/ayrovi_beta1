import { seoRouteFor, type PublicSeoRoute } from '../../../shared/publicSeo';

/**
 * Applique l'identité SEO de la route affichée — un seul endroit écrit dans le `<head>`.
 *
 * Pourquoi côté client : le site est une SPA servie par un unique `index.html` (décision
 * d'architecture, pas un accident). Le serveur ne connaît donc pas la page demandée ; c'est
 * le client qui sait où il est. Tant qu'un rendu serveur (SSR/prerender) n'est pas en place,
 * cette fonction est la manière honnête de ne pas laisser chaque page se déclarer « accueil ».
 * Le sitemap et le 404, eux, sont côté serveur — voir `shared/publicSeo.ts` et `src/server.ts`.
 */
const SITE_ORIGIN = 'https://ayrovi.tn';
const LOCALE_TAGS: Record<string, string> = { fr: 'fr_TN', ar: 'ar_TN' };

function ensureMeta(selector: string, create: () => Element): Element {
  const existing = document.head.querySelector(selector);
  if (existing) return existing;
  const element = create();
  document.head.appendChild(element);
  return element;
}

function setMeta(attribute: 'name' | 'property', key: string, content: string): void {
  const element = ensureMeta(`meta[${attribute}="${key}"]`, () => {
    const meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    return meta;
  });
  element.setAttribute('content', content);
}

function setCanonical(href: string): void {
  const link = ensureMeta('link[rel="canonical"]', () => {
    const element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    return element;
  }) as HTMLLinkElement;
  link.setAttribute('href', href);
}

/** Le `<html lang dir>` suit la langue réellement lue — sans quoi un lecteur d'écran arabe lit du latin. */
function setDocumentLanguage(locale: string): void {
  document.documentElement.setAttribute('lang', locale === 'ar' ? 'ar' : 'fr');
  document.documentElement.setAttribute('dir', locale === 'ar' ? 'rtl' : 'ltr');
}

export function applyRouteMeta(pathname: string, locale: string): PublicSeoRoute | null {
  const language = locale === 'ar' ? 'ar' : 'fr';
  const route = seoRouteFor(pathname);
  if (!route) {
    // Adresse inconnue : le serveur a déjà répondu 404 (voir `src/server.ts`), et le `<head>`
    // ne doit pas rester sur le `index,follow` d'une page précédente — ce serait inviter la
    // moteur d'indexation à enregistrer une page qui n'existe pas.
    document.title = language === 'ar' ? 'الصفحة غير موجودة — أيروفي' : 'Page introuvable — AYROVI';
    setMeta('name', 'robots', 'noindex,follow');
    setDocumentLanguage(language);
    return null;
  }

  const title = language === 'ar' ? route.titleAr : route.titleFr;
  const description = language === 'ar' ? route.descriptionAr : route.descriptionFr;
  const canonical = `${SITE_ORIGIN}${route.path === '/' ? '/' : route.path}`;

  document.title = title;
  setMeta('name', 'description', description);
  setMeta('name', 'robots', route.indexable ? 'index,follow,max-image-preview:large' : 'noindex,nofollow');
  setCanonical(canonical);
  setMeta('property', 'og:type', 'website');
  setMeta('property', 'og:locale', LOCALE_TAGS[language]);
  setMeta('property', 'og:site_name', 'AYROVI');
  setMeta('property', 'og:title', title);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', canonical);
  setMeta('name', 'twitter:card', 'summary_large_image');
  setMeta('name', 'twitter:title', title);
  setMeta('name', 'twitter:description', description);
  setDocumentLanguage(language);
  return route;
}
