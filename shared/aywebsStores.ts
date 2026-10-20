import { AYWEBS_CATALOG_STORES } from './aywebsStoreCatalog';
import type {
  AyWebsIntegrationType,
  AyWebsStoreCapability,
} from './aywebsTypes';

export type AyWebsStoreStatus = 'active' | 'beta' | 'planned';
export type AyWebsBrowserMode = 'embedded' | 'external';
export type AyWebsAdapterId = 'amazon' | 'shein' | 'temu' | 'aliexpress' | 'zalando' | 'generic';

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
  /** Identifiant de la boutique (ex. `amazon`, `creema`) — distinct de l'adaptateur. */
  id: string;
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
  /** Description courte de la carte (vide = la carte affiche ses catégories). */
  description?: string;
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
    categories: ['marketplace', 'electronics', 'fashion', 'home', 'beauty'],
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
    categories: ['marketplace', 'home', 'electronics', 'fashion'],
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
    categories: ['marketplace', 'electronics', 'home', 'fashion', 'beauty'],
    popular: true,
    phase: 2,
  },
  {
    id: 'zalando',
    name: 'Zalando',
    displayName: 'Zalando',
    domains: ['zalando.fr', 'zalando.de'],
    country: 'FR',
    currency: 'EUR',
    logo: '/stores/zalando.png',
    enabled: true,
    captureSupported: true,
    adapter: 'zalando',
    status: 'beta',
    integrationType: 'PARTIALLY_SUPPORTED',
    capabilities: REVIEW_PURCHASE_CAPABILITIES,
    browserMode: 'external',
    homeUrl: 'https://www.zalando.fr/',
    searchUrlTemplate: 'https://www.zalando.fr/catalog/?q={query}',
    categories: ['fashion'],
    popular: true,
    phase: 2,
  },
] as const;

/**
 * Catégories de l'accueil AYWEBs (§6). Libellés bilingues : le client ne traduit
 * jamais un identifiant technique à l'écran.
 */
export const AYWEBS_CATEGORIES: ReadonlyArray<{ id: string; labelFr: string; labelAr: string }> = [
  { id: 'marketplace', labelFr: 'Marketplace', labelAr: 'متاجر متنوعة' },
  { id: 'fashion', labelFr: 'Mode', labelAr: 'الملابس والأزياء' },
  { id: 'shoes', labelFr: 'Chaussures & sneakers', labelAr: 'الأحذية' },
  { id: 'electronics', labelFr: 'High-tech', labelAr: 'الإلكترونيات' },
  { id: 'smartphones', labelFr: 'Smartphones & accessoires', labelAr: 'الهواتف والإكسسوارات' },
  { id: 'gaming', labelFr: 'Jeux vidéo', labelAr: 'الألعاب الإلكترونية' },
  { id: 'beauty', labelFr: 'Beauté & cosmétiques', labelAr: 'الجمال والتجميل' },
  { id: 'perfumes', labelFr: 'Parfums', labelAr: 'العطور' },
  { id: 'home', labelFr: 'Maison & mobilier', labelAr: 'المنزل والأثاث' },
  { id: 'kitchen', labelFr: 'Cuisine & électroménager', labelAr: 'المطبخ والأجهزة المنزلية' },
  { id: 'sports', labelFr: 'Sport & plein air', labelAr: 'الرياضة والأنشطة الخارجية' },
  { id: 'luxury', labelFr: 'Luxe & griffes', labelAr: 'الماركات الفاخرة' },
  { id: 'toys', labelFr: 'Jouets & bébé', labelAr: 'الألعاب والأطفال' },
  { id: 'books', labelFr: 'Livres & médias', labelAr: 'الكتب والوسائط' },
  { id: 'pets', labelFr: 'Animalerie', labelAr: 'مستلزمات الحيوانات' },
  { id: 'grocery', labelFr: 'Épicerie & supermarchés', labelAr: 'المواد الغذائية' },
  { id: 'automotive', labelFr: 'Automobile', labelAr: 'السيارات وقطع الغيار' },
  { id: 'jewelry', labelFr: 'Bijoux & montres', labelAr: 'المجوهرات والساعات' },
  { id: 'bags', labelFr: 'Sacs & bagages', labelAr: 'الحقائب وحقائب السفر' },
  { id: 'tools', labelFr: 'Outils & bricolage', labelAr: 'الأدوات ومعدات البناء' },
  { id: 'arts', labelFr: 'Arts & loisirs créatifs', labelAr: 'الفنون والأشغال اليدوية' },
  { id: 'garden', labelFr: 'Jardin & extérieur', labelAr: 'الحديقة والخارج' },
  { id: 'health', labelFr: 'Santé & hygiène', labelAr: 'العناية الشخصية' },
  { id: 'bedding', labelFr: 'Literie & matelas', labelAr: 'الفراش والمراتب' },
  { id: 'music', labelFr: 'Instruments de musique', labelAr: 'الآلات الموسيقية' },
  { id: 'photography', labelFr: 'Photo & caméras', labelAr: 'التصوير والكاميرات' },
  { id: 'office', labelFr: 'Bureau & papeterie', labelAr: 'المكتب والقرطاسية' },
  { id: 'travel', labelFr: 'Accessoires de voyage', labelAr: 'مستلزمات السفر' },
  { id: 'kids', labelFr: 'Vêtements enfants', labelAr: 'ملابس الأطفال' },
  { id: 'accessories', labelFr: 'Accessoires', labelAr: 'الإكسسوارات' },
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

/**
 * Contrôle du registre des boutiques avant qu'il serve l'application.
 *  • identifiant unique ; • domaine non partagé entre deux boutiques ;
 *  • nom affiché unique (sans tenir compte de la casse) ;
 *  • catégories connues, et au moins une par boutique ;
 *  • une boutique peut appartenir à plusieurs catégories SANS être dupliquée.
 * Renvoie la liste des problèmes (vide = registre sain).
 */
export function validateAyWebsStoreRegistry(
  stores: readonly AyWebsStoreDefinition[] = [...AYWEBS_STORES, ...AYWEBS_CATALOG_STORES],
  categories: ReadonlyArray<{ id: string }> = AYWEBS_CATEGORIES,
): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const domains = new Map<string, string>();
  const names = new Map<string, string>();
  const categoryIds = new Set(categories.map((category) => category.id));
  for (const store of stores) {
    if (ids.has(store.id)) problems.push(`identifiant en double : ${store.id}`);
    ids.add(store.id);
    for (const domain of store.domains) {
      const owner = domains.get(domain);
      if (owner && owner !== store.id) problems.push(`domaine partagé : ${domain} (${owner}, ${store.id})`);
      domains.set(domain, store.id);
    }
    const nameKey = store.displayName.trim().toLowerCase();
    const nameOwner = names.get(nameKey);
    if (nameOwner && nameOwner !== store.id) problems.push(`nom en double : ${store.displayName} (${nameOwner}, ${store.id})`);
    names.set(nameKey, store.id);
    if (store.categories.length === 0) problems.push(`aucune catégorie : ${store.id}`);
    for (const category of store.categories) {
      if (!categoryIds.has(category)) problems.push(`catégorie inconnue : ${category} (${store.id})`);
    }
    if (new Set(store.categories).size !== store.categories.length) problems.push(`catégorie répétée : ${store.id}`);
  }
  return problems;
}

