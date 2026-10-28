/**
 * AYWEBs — entrer dans une boutique directement depuis la liste.
 *
 * Une boutique s'ouvre si le serveur la déclare active (`enabled`), qu'elle
 * accepte la navigation (`browse`) et qu'elle a une page d'accueil publique en
 * HTTPS. Entrer dans une boutique est une navigation : aucune capture, aucun
 * achat. Le verdict « prête / pas prête » reste affiché à côté, sans bloquer
 * l'entrée. La boutique « générique » n'a pas d'accueil : elle reste
 * désactivée, avec la raison écrite.
 */
import type { AyWebsStore } from '@/api/aywebs';
import { isWebPageUrl } from '@/features/aywebs/webNavigation';

export interface StoreEntryTarget {
  pathname: '/aywebs/browser';
  params: { url: string; storeId: string; storeName: string; capture: '0' | '1' };
}

/**
 * Une boutique s'ouvre dès qu'elle sait naviguer (`browse`) et qu'elle a une page d'accueil
 * HTTPS. `enabled` ne décide que de l'achat, pas de l'ouverture : une boutique du catalogue
 * s'ouvre dans le navigateur intégré (avec la barre AYWEBs) sans être activée pour l'achat.
 */
export function storeEntryTarget(store: AyWebsStore): StoreEntryTarget | null {
  if (!store.capabilities.includes('browse')) return null;
  const home = store.homeUrl.trim();
  if (!isWebPageUrl(home)) return null;
  return {
    pathname: '/aywebs/browser',
    params: { url: home, storeId: store.id, storeName: store.displayName || store.name, capture: '0' },
  };
}

/**
 * Adresse tapée dans la barre « Adresse de la boutique ». Un domaine nu
 * (`www.amazon.com`) reçoit `https://` ; tout le reste qui n'est pas une page
 * HTTPS publique est refusé (`null`) — jamais chargé dans le WebView.
 */
export function normalizeStoreAddress(raw: string): string | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  if (!/^https:\/\//i.test(candidate) || !isWebPageUrl(candidate)) return null;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}

/**
 * Entrer dans une boutique **à la page d'un produit** (23/10/2026).
 *
 * C'est le chemin de la vente EXTERNE : une carte Lens (ou une correspondance
 * visuelle) porte déjà l'URL marchande ; on ouvre cette page telle quelle dans
 * le navigateur intégré, le client choisit sur le site, et c'est la capture qui
 * prouve le prix et la variante. Aucune réécriture d'URL : si elle ne passe pas
 * le contrôle (`isWebPageUrl`), on renvoie `null` et l'appelant garde la fiche.
 *
 * `capture: '0'` — on ne promet pas un droit de lecture AVANT le verdict du
 * serveur : c'est `analyzeAyWebsPage` qui décide, page par page.
 */
export interface ProductEntryTarget {
  pathname: '/aywebs/browser';
  params: { url: string; storeName: string; capture: '0' };
}

const SEARCH_ENGINE_HOSTS = /(^|\.)(google\.[a-z.]+|googleusercontent\.com|gstatic\.com|goo\.gl|bing\.com|duckduckgo\.com|yahoo\.com)$/i;
const REDIRECT_WRAPPER_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|duckduckgo\.com|l\.facebook\.com|lm\.facebook\.com)$/i;

function unwrapMerchantUrl(rawUrl: string, allowUnwrap = true): string | null {
  const raw = String(rawUrl ?? '').trim();
  if (!isWebPageUrl(raw)) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    if (REDIRECT_WRAPPER_HOSTS.test(host)) {
      if (allowUnwrap && (parsed.pathname === '/url' || parsed.pathname === '/aclk' || parsed.pathname === '/l.php')) {
        const inner = parsed.searchParams.get('q')
          || parsed.searchParams.get('url')
          || parsed.searchParams.get('adurl')
          || parsed.searchParams.get('u');
        return inner ? unwrapMerchantUrl(inner, false) : null;
      }
    }
    if (SEARCH_ENGINE_HOSTS.test(host)) {
      return null;
    }
    if (parsed.protocol === 'http:') {
      parsed.protocol = 'https:';
      return parsed.toString();
    }
    return raw;
  } catch {
    return null;
  }
}

export function productEntryTarget(rawUrl: string, storeName = ''): ProductEntryTarget | null {
  const url = unwrapMerchantUrl(rawUrl);
  if (!url) return null;
  return {
    pathname: '/aywebs/browser',
    params: { url, storeName: String(storeName ?? '').trim().slice(0, 80), capture: '0' },
  };
}
