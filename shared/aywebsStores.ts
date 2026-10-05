import type {
  AyWebsIntegrationType,
  AyWebsStoreCapability,
} from './aywebsTypes';

export type AyWebsStoreStatus = 'active' | 'beta' | 'planned';
export type AyWebsBrowserMode = 'embedded' | 'external';
export type AyWebsAdapterId = 'amazon' | 'shein' | 'temu' | 'aliexpress' | 'generic';

/**
 * Store Registry (§7) — le registre CENTRALISÉ des boutiques.
 *
 * Aucune logique de boutique ne vit dans un écran ni dans une route : tout part
 * d'ici. Ajouter une boutique = ajouter une ligne + un adaptateur, sans réécrire
 * AYWEBs (§8).
 *
 * Les champs V1 (`captureSupported`, `browserMode`, `homeUrl`,
 * `searchUrlTemplate`, `phase`) sont conservés tels quels : le contrat HTTP
 * `/api/v1/aywebs/stores` et les tests existants en dépendent. Les champs du
 * Master Order (`integrationType`, `capabilities`, `country`, `currency`,
 * `displayName`, `logo`) s'ajoutent sans rien renommer.
 */
export interface AyWebsStoreDefinition {
  id: AyWebsAdapterId;
  name: string;
  /** Libellé marchand tel qu'affiché au client (peut différer de `name`). */
  displayName: string;
  domains: readonly string[];
  country: string;
  currency: string;
  /**
   * Chemin d'un logo administrable ; vide = monogramme typographique.
   *
   * ── Corrigé le 04/10/2026 ───────────────────────────────────────────────
   * Les quatre logos pointaient vers `https://logo.clearbit.com/<domaine>`.
   * Ce service a FERMÉ : chaque carte faisait une requête externe qui
   * échouait, et toutes les boutiques retombaient sur le monogramme. Pire,
   * c'était une fuite — l'adresse IP de chaque client partait chez un tiers
   * au seul affichage de la liste. Les logos sont désormais SERVIS PAR NOUS
   * depuis /stores/, donc hors ligne compris, sans requête tierce.
   */
  logo: string;
  enabled: boolean;
  captureSupported: boolean;
  adapter: AyWebsAdapterId;
  status: AyWebsStoreStatus;
  integrationType: AyWebsIntegrationType;
  capabilities: readonly AyWebsStoreCapability[];
  browserMode: AyWebsBrowserMode;
  homeUrl: string;
  searchUrlTemplate: string;
  /** Catégories marchand utilisées par l'accueil AYWEBs (§6). */
  categories: readonly string[];
  popular: boolean;
  phase: 1 | 2;
}

const FULL_CAPABILITIES: readonly AyWebsStoreCapability[] = [
  'browse', 'search', 'product', 'variants', 'availability', 'purchase', 'tracking',
] as const;
/** Lecture fiable, achat exécuté avec revue : honnête tant que l'intégration d'achat n'existe pas. */
const REVIEW_PURCHASE_CAPABILITIES: readonly AyWebsStoreCapability[] = [
  'browse', 'search', 'product', 'variants', 'availability', 'tracking',
] as const;

export const AYWEBS_STORES: readonly AyWebsStoreDefinition[] = [
  {
    id: 'amazon',
    name: 'Amazon',
    displayName: 'Amazon',
    domains: [
      'amazon.com', 'amazon.fr', 'amazon.co.uk', 'amazon.de', 'amazon.it', 'amazon.es',
      'amazon.co.jp', 'amazon.ca', 'amazon.com.au', 'amazon.nl', 'amazon.se', 'amazon.pl',
      'amazon.com.tr', 'amazon.ae', 'amazon.sa', 'amazon.in', 'amazon.sg', 'amazon.com.mx',
      'amazon.com.br', 'amazon.eg', 'amazon.be',
    ],
    country: 'US',
    currency: 'USD',
    logo: '/stores/amazon.png',
    enabled: true,
    captureSupported: true,
    adapter: 'amazon',
    status: 'active',
    integrationType: 'SUPPORTED',
    capabilities: FULL_CAPABILITIES,
    browserMode: 'external',
    homeUrl: 'https://www.amazon.com/',
    searchUrlTemplate: 'https://www.amazon.com/s?k={query}',
    categories: ['electronics', 'fashion', 'home', 'beauty'],
    popular: true,
    phase: 1,
  },
  {
    id: 'shein',
    name: 'SHEIN',
    displayName: 'SHEIN',
    domains: ['shein.com', 'shein.co.uk'],
    country: 'CN',
    currency: 'USD',
    logo: '/stores/shein.png',
    enabled: true,
    captureSupported: true,
    adapter: 'shein',
    status: 'beta',
    integrationType: 'PARTIALLY_SUPPORTED',
    capabilities: REVIEW_PURCHASE_CAPABILITIES,
    browserMode: 'external',
    homeUrl: 'https://www.shein.com/',
    searchUrlTemplate: 'https://www.shein.com/pdsearch/{query}/',
    categories: ['fashion', 'beauty', 'home'],
    popular: true,
    phase: 2,
  },
  {
    id: 'temu',
    name: 'TEMU',
    displayName: 'TEMU',
    domains: ['temu.com'],
    country: 'CN',
    currency: 'USD',
    logo: '/stores/temu.png',
    enabled: true,
    captureSupported: true,
    adapter: 'temu',
    status: 'beta',
    integrationType: 'PARTIALLY_SUPPORTED',
    capabilities: REVIEW_PURCHASE_CAPABILITIES,
    browserMode: 'external',
    homeUrl: 'https://www.temu.com/',
    searchUrlTemplate: 'https://www.temu.com/search_result.html?search_key={query}',
    categories: ['home', 'electronics', 'fashion'],
    popular: true,
    phase: 2,
  },
  {
    id: 'aliexpress',
    name: 'AliExpress',
    displayName: 'AliExpress',
    domains: ['aliexpress.com'],
    country: 'CN',
    currency: 'USD',
    logo: '/stores/aliexpress.png',
    enabled: true,
    captureSupported: true,
    adapter: 'aliexpress',
    status: 'beta',
    integrationType: 'PARTIALLY_SUPPORTED',
    capabilities: REVIEW_PURCHASE_CAPABILITIES,
    browserMode: 'external',
    homeUrl: 'https://www.aliexpress.com/',
    searchUrlTemplate: 'https://www.aliexpress.com/wholesale?SearchText={query}',
    categories: ['electronics', 'home', 'fashion', 'beauty'],
    popular: true,
    phase: 2,
  },
] as const;

/**
 * Catégories de l'accueil AYWEBs (§6). Libellés bilingues : le client ne traduit
 * jamais un identifiant technique à l'écran.
 */
export const AYWEBS_CATEGORIES: ReadonlyArray<{ id: string; labelFr: string; labelAr: string }> = [
  { id: 'fashion', labelFr: 'Mode', labelAr: 'أزياء' },
  { id: 'electronics', labelFr: 'High-tech', labelAr: 'إلكترونيات' },
  { id: 'beauty', labelFr: 'Beauté', labelAr: 'جمال وعناية' },
  { id: 'home', labelFr: 'Maison', labelAr: 'المنزل' },
  { id: 'sports', labelFr: 'Sport', labelAr: 'رياضة' },
  { id: 'toys', labelFr: 'Jouets', labelAr: 'ألعاب' },
];

export function ayWebsHostnameMatches(hostname: string, domains: readonly string[]): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.+$/, '');
  return domains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

export function findAyWebsStore(id: unknown): AyWebsStoreDefinition | null {
  const normalized = String(id || '').trim().toLowerCase();
  return AYWEBS_STORES.find((store) => store.id === normalized) || null;
}

export function detectAyWebsStore(rawUrl: unknown): AyWebsStoreDefinition | null {
  if (typeof rawUrl !== 'string') return null;
  try {
    const url = new URL(rawUrl.trim());
    return AYWEBS_STORES.find((store) => ayWebsHostnameMatches(url.hostname, store.domains)) || null;
  } catch {
    return null;
  }
}

export function ayWebsSearchUrl(store: AyWebsStoreDefinition, query: string): string {
  return store.searchUrlTemplate.replace('{query}', encodeURIComponent(query.trim()));
}

/** Une boutique ne peut revendiquer une capacité que si le registre la lui donne. */
export function ayWebsStoreCan(store: AyWebsStoreDefinition | null, capability: AyWebsStoreCapability): boolean {
  return Boolean(store?.enabled) && Boolean(store?.capabilities.includes(capability));
}

/** Domaine registrable extrait d'une URL (preuve, §28) — sans sous-domaine applicatif. */
export function ayWebsSourceDomain(rawUrl: unknown): string {
  try {
    const hostname = new URL(String(rawUrl)).hostname.toLowerCase().replace(/^www\./, '');
    return hostname;
  } catch {
    return '';
  }
}

export function ayWebsStoresForCategory(categoryId: string): AyWebsStoreDefinition[] {
  const normalized = String(categoryId || '').trim().toLowerCase();
  if (!normalized) return [];
  return AYWEBS_STORES.filter((store) => store.enabled && store.categories.includes(normalized));
}
