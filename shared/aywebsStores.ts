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

/** Navigation et capture par adaptateur ; le stock dépend de la source et l'achat reste en revue humaine. */
const REVIEW_PURCHASE_CAPABILITIES: readonly AyWebsStoreCapability[] = [
  'browse', 'search', 'product', 'variants', 'availability',
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
    integrationType: 'PARTIALLY_SUPPORTED',
    capabilities: REVIEW_PURCHASE_CAPABILITIES,
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

/**
 * BOUTIQUE EXTERNE — le chemin « Add-to-Buyee » (Phase 2.1, 06/10/2026).
 *
 * Elle est HORS du tableau `AYWEBS_STORES` À DESSEIN, et cette exclusion est le
 * cœur de sa garantie :
 *
 *   • `domains: []` ⇒ `detectAyWebsStore()` ne la renvoie JAMAIS depuis une URL.
 *     Une boutique hors registre reste hors registre : aucun domaine ne peut
 *     « devenir » générique par accident, et la liste publique des boutiques
 *     (`GET /stores`, accueil, catégories) ne l'affiche pas.
 *   • elle n'est choisie que par le SERVEUR, et seulement quand une capture
 *     WebView STRUCTURÉE et CORROBORÉE arrive pour un domaine absent du registre
 *     (voir `assertAyWebsExternalCapturePage`). C'est le modèle Add-to-Buyee :
 *     la page est déjà ouverte sous les yeux du client, sa lecture est la preuve.
 *   • `findAyWebsStore('generic')` la résout pour que le reste du parcours
 *     (panier, commande, revue humaine) fonctionne sans cas particulier.
 *
 * Mode d'achat : `PARTIALLY_SUPPORTED` sans capacité `purchase` ⇒ la commande
 * part en revue humaine. Nous n'achetons jamais automatiquement chez un marchand
 * qui n'a pas d'intégration — c'est la règle des §7 et §48, et c'est aussi ce
 * que font Buyee/ZenMarket : l'extraction est cliente, l'achat est re-vérifié.
 */
export const AYWEBS_EXTERNAL_STORE: AyWebsStoreDefinition = {
  id: 'generic',
  name: 'Boutique externe',
  displayName: 'Boutique externe',
  domains: [],
  country: '',
  currency: '',
  logo: '',
  enabled: true,
  captureSupported: true,
  adapter: 'generic',
  status: 'beta',
  integrationType: 'PARTIALLY_SUPPORTED',
  capabilities: ['browse', 'product', 'variants', 'availability'] as const,
  browserMode: 'external',
  homeUrl: '',
  searchUrlTemplate: '',
  categories: [],
  popular: false,
  phase: 2,
};

/** `true` si l'identifiant désigne la boutique externe (captures hors registre). */
export function isAyWebsExternalStoreId(id: unknown): boolean {
  return String(id || '').trim().toLowerCase() === AYWEBS_EXTERNAL_STORE.id;
}

export function ayWebsHostnameMatches(hostname: string, domains: readonly string[]): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/\.+$/, '');
  return domains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}

export function findAyWebsStore(id: unknown): AyWebsStoreDefinition | null {
  const normalized = String(id || '').trim().toLowerCase();
  const registered = AYWEBS_STORES.find((store) => store.id === normalized);
  if (registered) return registered;
  /* Le registre reste la vérité : la boutique externe n'est résolue qu'après
     lui, donc jamais à la place d'une boutique nommée. */
  return isAyWebsExternalStoreId(normalized) ? AYWEBS_EXTERNAL_STORE : null;
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
