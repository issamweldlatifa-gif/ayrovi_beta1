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

export function storeEntryTarget(store: AyWebsStore): StoreEntryTarget | null {
  if (!store.enabled) return null;
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
