import { PUBLIC_NAV_DESTINATIONS, type PublicNavDestinationId } from '../../../shared/publicNavigation';

/**
 * Destinations réelles des pages plein écran (Arrivage, Gift & Cards, Magazine).
 *
 * Les chemins viennent du contrat partagé `shared/publicNavigation.ts` : l'Admin peut renommer,
 * réordonner ou masquer les onglets, il ne peut pas changer la cible. Le routage SPA reste donc
 * exactement aligné sur ce que le serveur sert.
 */
export const PUBLIC_PAGES = PUBLIC_NAV_DESTINATIONS.map((destination) => ({
  id: destination.id,
  href: destination.href,
  label: destination.labelFr,
}));

export type PublicPageId = PublicNavDestinationId;

export function publicPageForPath(pathname: string): PublicPageId | undefined {
  const path = pathname.replace(/\/+$/, '') || '/';
  return PUBLIC_PAGES.find(page => page.href === path)?.id;
}
