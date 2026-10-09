/**
 * Destinations fermées du carrousel Hero (client ↔ serveur).
 *
 * Même décision produit que `publicNavigation.ts` (2026-09-22) : l'Admin choisit
 * un TYPE dans cette liste fermée (+ une valeur quand le type l'exige) — il ne
 * saisit jamais une URL libre, donc aucun lien mort ni page blanche ne peut être
 * publié par erreur. Seules les routes qui EXISTENT dans l'application mobile
 * sont proposées : si une destination n'existe pas, elle n'est pas dans la liste.
 *
 * `href` reste la seule source des chemins réels : le carrousel mobile navigue
 * dessus telle quelle (`router.push(href)`), sans réinventer de routage.
 */
export const HERO_DESTINATIONS = [
  { id: 'CAMPAIGN', needsValue: false, adminLabel: 'Campagne — /promotions' },
  { id: 'COLLECTION', needsValue: true, adminLabel: 'Collection (arrivage) — /catalog?arrivalId=…' },
  { id: 'PRODUCT', needsValue: true, adminLabel: 'Produit — /product/<id>' },
  { id: 'NEWS', needsValue: false, adminLabel: 'Actualités — /news' },
  { id: 'STORIES', needsValue: false, adminLabel: 'Stories — /stories' },
  { id: 'LENS', needsValue: false, adminLabel: 'Ayrovix Lens — /lens' },
  { id: 'AYWEBS', needsValue: false, adminLabel: 'AYWEBs — /aywebs' },
  { id: 'ASSISTANT', needsValue: false, adminLabel: 'Assistant — /assistant' },
  { id: 'EXTERNAL', needsValue: true, adminLabel: 'Lien externe (http/https)' },
] as const;

export type HeroDestinationType = (typeof HERO_DESTINATIONS)[number]['id'];

export const HERO_DESTINATION_TYPES: HeroDestinationType[] =
  HERO_DESTINATIONS.map((destination) => destination.id);

export function heroDestinationConfig(type: unknown) {
  const id = String(type ?? '').trim().toUpperCase();
  return HERO_DESTINATIONS.find((destination) => destination.id === id) || null;
}

export function heroDestinationNeedsValue(type: unknown): boolean {
  return heroDestinationConfig(type)?.needsValue ?? false;
}

/** Lien externe : http/https uniquement, jamais un schéma libre. */
export function isValidExternalUrl(value: unknown): boolean {
  const url = String(value ?? '').trim();
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const encode = (value: string) => encodeURIComponent(value.trim());

/**
 * Résolution pure : type + valeur → href mobile, ou `null` si la combinaison est
 * invalide. L'existence de la cible (arrivage/produit) est vérifiée par l'appelant
 * (base de données) — ce contrat ne connaît pas la persistance.
 */
export function heroDestinationHref(type: unknown, value: unknown): string | null {
  const config = heroDestinationConfig(type);
  if (!config) return null;
  const raw = String(value ?? '').trim();
  if (config.needsValue && !raw) return null;
  switch (config.id) {
    case 'CAMPAIGN': return '/promotions';
    case 'COLLECTION': return `/catalog?arrivalId=${encode(raw)}`;
    case 'PRODUCT': return `/product/${encode(raw)}`;
    case 'NEWS': return '/news';
    case 'STORIES': return '/stories';
    case 'LENS': return '/lens';
    case 'AYWEBS': return '/aywebs';
    case 'ASSISTANT': return '/assistant';
    case 'EXTERNAL': return isValidExternalUrl(raw) ? raw : null;
    default: return null;
  }
}
