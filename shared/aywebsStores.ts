import { AYWEBS_CATALOG_STORES } from './aywebsStoreCatalog';
import { withExtraCategories } from './aywebsCategoryExtras';
import type {
  AyWebsIntegrationType,
  AyWebsStoreCapability,
} from './aywebsTypes';

export type AyWebsStoreStatus = 'active' | 'beta' | 'planned';
export type AyWebsBrowserMode = 'embedded' | 'external';
export type AyWebsAdapterId = 'amazon' | 'shein' | 'temu' | 'aliexpress' | 'zalando' | 'sephora' | 'primark' | 'catalogue' | 'generic';

/**
 * Comment la page produit d'une boutique est reconnue (23/10/2026).
 *
 *   • `url`     — l'adaptateur reconnaît le motif d'URL de la fiche (Amazon :
 *     `/dp/<ASIN>`, SHEIN : `-p-<id>.html`…). Le serveur décide sans lire la page.
 *   • `pattern` — la boutique n'a pas d'adaptateur écrit à la main, mais son
 *     motif d'URL de fiche est DÉCLARÉ en données (`productUrlPattern`). C'est
 *     un INDICE de navigation : il autorise à ouvrir la lecture, il ne fixe
 *     jamais un prix — le prix vient de la capture, comme pour `capture`.
 *   • `capture` — aucun motif d'URL : seule la CAPTURE STRUCTURÉE du navigateur
 *     du client (JSON-LD du marchand + prix corroboré) peut PROUVER que la page
 *     est une fiche produit. Aucune devinette d'URL.
 *
 * Ce champ n'ouvre aucun droit à lui seul : il dit seulement QUI a le droit de
 * dire « ceci est une fiche produit » (voir `assertAyWebsProductPage`).
 */
export type AyWebsStoreRecognition = 'url' | 'pattern' | 'capture';

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
  /**
   * Qui prouve la fiche produit : le motif d'URL de l'adaptateur (`url`, défaut),
   * un motif déclaré en données (`pattern`) ou la capture du client (`capture`).
   * Voir `AyWebsStoreRecognition`.
   */
  recognition?: AyWebsStoreRecognition;
  /**
   * Motif d'URL de la FICHE PRODUIT, pour une boutique sans adaptateur écrit à
   * la main (`recognition: 'pattern'`). Expression régulière ANCRÉE sur le chemin
   * (`^…` ajouté d'office, 120 caractères max), évaluée sur `pathname` seul.
   *
   * Ce n'est pas une preuve de prix : c'est ce qui permet d'affirmer « cette page
   * EST la fiche » pour laisser le client la lire. Le prix, la devise et le stock
   * restent exigés de la capture, corroborés par le serveur.
   */
  productUrlPattern?: string;
  popular: boolean;
  phase: 1 | 2;
}

/** Navigation et capture par adaptateur ; le stock dépend de la source et l'achat reste en revue humaine. */
const REVIEW_PURCHASE_CAPABILITIES: readonly AyWebsStoreCapability[] = [
  'browse', 'search', 'product', 'variants', 'availability',
] as const;

const AYWEBS_CORE_STORES: readonly AyWebsStoreDefinition[] = [
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
    domains: [
      'shein.com', 'shein.co.uk', 'shein.fr', 'shein.de', 'shein.es',
      'shein.it', 'shein.ca', 'shein.com.mx', 'shein.com.br',
    ],
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
    domains: ['aliexpress.com', 'aliexpress.us', 'aliexpress.ru'],
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
] as const;

/**
 * VAGUE 1 — boutiques du CATALOGUE admises à la lecture cliente (23/10/2026).
 *
 * Elles sortent du catalogue (`aywebsStoreCatalog.ts`) et entrent au registre :
 * même identifiant, même adresse, même logo, mêmes catégories — plus la lecture.
 *
 * ── CE QU'ELLES SAVENT FAIRE, ET RIEN DE PLUS ─────────────────────────────
 *   • navigation (`browse`) et fiche produit, mais la fiche est PROUVÉE par la
 *     capture du navigateur du client, pas par un motif d'URL : aucun adaptateur
 *     dédié n'existe pour elles (`adapter: 'catalogue'`, `recognition: 'capture'`) ;
 *   • prix, devise, variantes et disponibilité viennent de cette capture, passée
 *     au crible du serveur (mêmes bornes, même corroboration qu'un domaine hors
 *     registre) ;
 *   • l'ACHAT reste en revue humaine : `purchase` n'est jamais déclarée.
 *
 * ── POURQUOI PAS LES 380 D'UN COUP ─────────────────────────────────────────
 * Une capacité déclarée est une promesse faite à l'écran. On ouvre par vagues,
 * avec une mesure avant/après (taux de captures acceptées par boutique) ; le
 * reste du catalogue garde son contrat actuel : navigation seule, commande par
 * URL. Le passage d'une boutique d'une vague à l'autre est UNE ligne.
 */
interface CaptureStoreRow {
  id: string;
  displayName: string;
  country: string;
  currency: string;
  homeUrl: string;
  categories: readonly string[];
  /**
   * Motif de la fiche produit, ÉCRIT EN DONNÉES (voir `productUrlPattern`).
   *
   * Règle d'admission d'un motif : il doit être stable, public, et vérifiable
   * sur au moins deux fiches réelles. Tant qu'il n'a pas été vérifié, la ligne
   * ne porte AUCUN motif et la boutique reste en `capture` : c'est le cas de
   * MediaMarkt et Cdiscount ci-dessous — leur motif d'URL n'est pas publié de
   * façon fiable, donc on ne le devine pas.
   */
  productUrlPattern?: string;
  /**
   * Domaines SUPPLÉMENTAIRES de la même boutique (miroirs pays).
   *
   * Constat du 23/10/2026 : le registre ne dérivait le domaine que de
   * `homeUrl`. Une fiche `zalando.de` n'était donc reconnue par AUCUNE
   * boutique : elle retombait dans « domaine inconnu », et le serveur y
   * autorisait la lecture à la demande — d'où la pré-lecture qui partait sur
   * une page de magasin. Le domaine d'accueil reste dérivé ; cette liste
   * ajoute les miroirs pays.
   *
   * RÈGLE D'ADMISSION : un miroir n'est ajouté que si sa devise est celle de
   * la ligne. Un `zalando.ch` (CHF) ou `zalando.se` (SEK) sous une ligne en
   * EUR publierait un prix libellé dans la mauvaise devise : il reste hors
   * registre (capture externe, à la demande, comme avant).
   */
  domains?: readonly string[];
  /**
   * Adaptateur dédié de la boutique, quand elle en a un. Sans cette valeur,
   * une boutique de la vague 1 utilise l'adaptateur « catalogue ». Une entrée
   * dédiée peut tout de même déclarer `recognition: 'capture'` tant que son
   * motif URL n'a pas été mesuré.
   */
  adapter?: AyWebsAdapterId;
  /** Reconnaissance volontairement explicite pour les nouveaux lecteurs. */
  recognition?: AyWebsStoreRecognition;
}

const CAPTURE_WAVE_1: readonly CaptureStoreRow[] = [
  /* Marchés anglo-saxons — motifs d'URL publics et stables. */
  { id: 'walmart', displayName: 'Walmart', country: 'US', currency: 'USD', homeUrl: 'https://www.walmart.com', categories: ['marketplace'], productUrlPattern: '^/ip/(?:[^/]+/)?\\d+' },
  { id: 'target', displayName: 'Target', country: 'US', currency: 'USD', homeUrl: 'https://www.target.com', categories: ['marketplace'], productUrlPattern: '^/p/(?:[^/]+/)?-/A-\\d+' },
  { id: 'etsy', displayName: 'Etsy', country: 'US', currency: 'USD', homeUrl: 'https://www.etsy.com', categories: ['marketplace', 'arts'], productUrlPattern: '^/(?:[a-z]{2}(?:-[a-z]{2})?/)?listing/\\d+' },
  { id: 'best-buy', displayName: 'Best Buy', country: 'US', currency: 'USD', homeUrl: 'https://www.bestbuy.com', categories: ['electronics'], productUrlPattern: '^/site/[^?]*/\\d+\\.p' },
  { id: 'newegg', displayName: 'Newegg', country: 'US', currency: 'USD', homeUrl: 'https://www.newegg.com', categories: ['electronics'], productUrlPattern: '^/p/[A-Za-z0-9-]+' },
  /* Allemagne / Europe — même règle : motif vérifié ou rien. */
  { id: 'otto', displayName: 'OTTO', country: 'DE', currency: 'EUR', homeUrl: 'https://www.otto.de', categories: ['marketplace'], productUrlPattern: '^/p/[^/]+-\\d+' },
  { id: 'kaufland', displayName: 'Kaufland', country: 'DE', currency: 'EUR', homeUrl: 'https://www.kaufland.de', categories: ['marketplace'], productUrlPattern: '^/product/\\d+' },
  { id: 'zalando', displayName: 'Zalando', country: 'DE', currency: 'EUR', homeUrl: 'https://www.zalando.com', categories: ['fashion'], productUrlPattern: '^/(?:[a-z]{2}/)?[^/]*-[A-Z0-9]{6,}(?:-[A-Z0-9]{2,})?\\.html$', domains: ['zalando.de', 'zalando.fr', 'zalando.it', 'zalando.es', 'zalando.nl', 'zalando.be', 'zalando.at'], adapter: 'zalando' },
  { id: 'mediamarkt', displayName: 'MediaMarkt', country: 'DE', currency: 'EUR', homeUrl: 'https://www.mediamarkt.com', categories: ['electronics'], domains: ['mediamarkt.de', 'mediamarkt.at', 'mediamarkt.es', 'mediamarkt.it', 'mediamarkt.nl', 'mediamarkt.be', 'mediamarkt.pt', 'mediamarkt.fr'] },
  { id: 'asos', displayName: 'ASOS', country: 'GB', currency: 'GBP', homeUrl: 'https://www.asos.com', categories: ['fashion'], productUrlPattern: '^/(?:[a-z]{2}(?:-[a-z]{2})?/)?(?:[^/]+/)?[^/]+/prd/\\d+' },
  { id: 'h-m', displayName: 'H&M', country: 'SE', currency: 'EUR', homeUrl: 'https://www.hm.com', categories: ['fashion', 'kids'], productUrlPattern: '^/[a-z]{2}_[a-z]{2}/productpage\\.\\d+\\.html' },
  /* Deux nouveaux lecteurs versionnés séparément. Sephora est limité au domaine
     US en USD ; Primark reste région/currency-neutral tant que la page n'a pas
     publié une devise explicite. Aucun motif d'URL non vérifié : capture à la demande. */
  { id: 'sephora', displayName: 'Sephora', country: 'US', currency: 'USD', homeUrl: 'https://www.sephora.com', categories: ['beauty', 'perfumes'], adapter: 'sephora', recognition: 'capture' },
  { id: 'primark', displayName: 'Primark', country: '', currency: '', homeUrl: 'https://www.primark.com', categories: ['fashion'], adapter: 'primark', recognition: 'capture' },
  /* France / Pologne — motif non vérifiable de façon fiable : capture seule. */
  { id: 'cdiscount', displayName: 'Cdiscount', country: 'FR', currency: 'EUR', homeUrl: 'https://www.cdiscount.com', categories: ['marketplace'] },
  { id: 'allegro', displayName: 'Allegro', country: 'PL', currency: 'PLN', homeUrl: 'https://allegro.pl', categories: ['marketplace'], productUrlPattern: '^/oferta/[^/]+-\\d+' },
];

/** Lecture cliente : navigation + fiche + variantes + stock ; JAMAIS l'achat. */
const CAPTURE_READ_CAPABILITIES: readonly AyWebsStoreCapability[] = [
  'browse', 'product', 'variants', 'availability',
] as const;

function captureStore(row: CaptureStoreRow): AyWebsStoreDefinition {
  const { id, displayName, country, currency, homeUrl, categories, productUrlPattern } = row;
  let domain = '';
  try { domain = new URL(homeUrl).hostname.toLowerCase().replace(/^\.?www\./, ''); } catch { domain = ''; }
  const domains = [domain, ...(row.domains || [])]
    .map((value) => String(value || '').trim().toLowerCase().replace(/^\.?www\./, '').replace(/\.+$/, ''))
    .filter((value, index, all) => value.length > 0 && all.indexOf(value) === index);
  return {
    id,
    name: displayName,
    displayName,
    domains,
    country,
    currency,
    logo: `/stores/${id}.png`,
    enabled: true,
    captureSupported: true,
    adapter: row.adapter || 'catalogue',
    status: 'beta',
    integrationType: 'PARTIALLY_SUPPORTED',
    capabilities: CAPTURE_READ_CAPABILITIES,
    browserMode: 'external',
    homeUrl,
    searchUrlTemplate: '',
    categories,
    /* Un adaptateur dédié choisit sa reconnaissance explicitement quand son
       motif est connu ; sans motif vérifié, `capture` reste la seule preuve.
       Les adaptateurs catalogue gardent `pattern` ou `capture` selon les données. */
    recognition: row.recognition ?? (row.adapter && row.adapter !== 'catalogue' && productUrlPattern
      ? 'url'
      : productUrlPattern ? 'pattern' : 'capture'),
    productUrlPattern,
    popular: false,
    phase: 2,
  };
}

export const AYWEBS_CAPTURE_STORES: readonly AyWebsStoreDefinition[] = CAPTURE_WAVE_1.map(captureStore);

/** Registre public : le cœur (adaptateurs dédiés) + la vague 1 du catalogue. */
export const AYWEBS_STORES: readonly AyWebsStoreDefinition[] =
  [...AYWEBS_CORE_STORES, ...AYWEBS_CAPTURE_STORES].map(withExtraCategories);

/**
 * Qui prouve la fiche produit pour cette boutique ? Défaut : le motif d'URL de
 * l'adaptateur. Une boutique sans adaptateur dédié ne peut être prouvée que par
 * la capture structurée du client (`capture`).
 */
export function ayWebsStoreRecognition(store: AyWebsStoreDefinition | null | undefined): AyWebsStoreRecognition {
  if (!store) return 'url';
  if (store.recognition) return store.recognition;
  if (store.adapter === 'catalogue') return store.productUrlPattern ? 'pattern' : 'capture';
  if (store.adapter !== 'generic') return 'url';
  return 'url';
}

/**
 * Compile le motif de fiche déclaré par une boutique — ou `null`.
 *
 * Borné et ancré à dessein : un motif fourni en données ne doit jamais pouvoir
 * matcher « n'importe quoi ». 120 caractères max, `^` ajouté d'office, évalué
 * sur le CHEMIN seul (les paramètres de suivi charrient des jetons opaques).
 * Motif invalide = aucun motif : la boutique retombe sur la preuve par capture.
 */
const PATTERN_CACHE = new Map<string, RegExp | null>();
export function ayWebsProductUrlPattern(store: AyWebsStoreDefinition | null | undefined): RegExp | null {
  const source = String(store?.productUrlPattern || '').trim();
  if (!source || source.length > 120) return null;
  if (PATTERN_CACHE.has(source)) return PATTERN_CACHE.get(source) || null;
  let compiled: RegExp | null = null;
  try {
    compiled = new RegExp(source.startsWith('^') ? source : `^${source}`, 'i');
  } catch {
    compiled = null;
  }
  PATTERN_CACHE.set(source, compiled);
  return compiled;
}

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
  { id: 'beauty', labelFr: 'Beauté et parfum', labelAr: 'الجمال والعطور' },
  { id: 'perfumes', labelFr: 'Parfums', labelAr: 'العطور' },
  { id: 'home', labelFr: 'Meubles', labelAr: 'الأثاث' },
  /**
   * Deux catégories nées avec la section catégories de la référence
   * (27/10/2026) : « Casques et écouteurs » et « Activités de plein air ».
   * Elles sont de vraies catégories — des boutiques les déclarent (voir
   * `aywebsCategoryExtras.ts`) — et non des tuiles décoratives.
   */
  { id: 'audio', labelFr: 'Casques et écouteurs', labelAr: 'السماعات والهيدفون' },
  { id: 'outdoor', labelFr: 'Activités de plein air', labelAr: 'أنشطة في الهواء الطلق' },
  { id: 'kitchen', labelFr: 'Cuisine & électroménager', labelAr: 'المطبخ والأجهزة المنزلية' },
  { id: 'sports', labelFr: 'Sports et loisirs', labelAr: 'الرياضة والأنشطة' },
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

/**
 * Normalise un nom d'hôte en retirant uniquement les préfixes techniques de
 * surface web/mobile (`www.`, `www2.`, `m.`, `m2.`, `mobile.`, `wap.`, `touch.`,
 * `smile.`), SANS jamais fusionner deux domaines pays ou devises distincts
 * (`amazon.fr` ≠ `amazon.com`, `ca.shein.com` ≠ `shein.com`).
 */
export function ayWebsComparableHost(hostname: unknown): string {
  return String(hostname || '')
    .trim()
    .toLowerCase()
    .replace(/\.+$/, '')
    .replace(/^(?:www\d*|m\d*|mobile|wap|touch|smile)\./, '');
}

/** Domaine registrable extrait d'une URL (preuve, §28) — sans sous-domaine applicatif. */
export function ayWebsSourceDomain(rawUrl: unknown): string {
  try {
    return ayWebsComparableHost(new URL(String(rawUrl)).hostname);
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

