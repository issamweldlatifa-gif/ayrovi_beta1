/**
 * Destinations officielles de la barre publique sous l'en-tête (client ↔ serveur).
 *
 * Décision produit du 2026-09-22 : les onglets sous l'en-tête (Arrivage, Gift & Cards,
 * Magazine) sont pilotés depuis l'Admin. L'Admin choisit une DESTINATION dans cette liste
 * fermée — il ne saisit jamais une URL libre, donc aucun lien mort ni page blanche ne peut
 * être publié par erreur. `href` reste la seule source des chemins réels (`/arrivage`,
 * `/gift-cards`, `/magazine`) : le routage SPA des pages plein écran s'appuie dessus.
 */
export const PUBLIC_NAV_DESTINATIONS = [
  { id: 'arrivals', href: '/arrivage', labelFr: 'Arrivage', labelAr: 'Arrivage', adminLabel: 'Arrivage — /arrivage' },
  { id: 'promotions', href: '/gift-cards', labelFr: 'Gift & Cards', labelAr: 'Gift & Cards', adminLabel: 'Gift & Cards — /gift-cards' },
  { id: 'news', href: '/magazine', labelFr: 'Magazine', labelAr: 'Magazine', adminLabel: 'Magazine — /magazine' },
] as const;

export type PublicNavDestinationId = (typeof PUBLIC_NAV_DESTINATIONS)[number]['id'];

export const PUBLIC_NAV_DESTINATION_IDS: PublicNavDestinationId[] =
  PUBLIC_NAV_DESTINATIONS.map((destination) => destination.id);

/** Résolution tolérante : une valeur inconnue (base ancienne, saisie directe) ne rend rien. */
export function publicNavDestination(value: unknown) {
  const id = String(value ?? '').trim();
  return PUBLIC_NAV_DESTINATIONS.find((destination) => destination.id === id) || null;
}

export function publicNavHref(value: unknown): string | null {
  return publicNavDestination(value)?.href ?? null;
}
