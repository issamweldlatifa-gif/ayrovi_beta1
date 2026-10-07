/**
 * AYROVI · AYWEBs — Master Engineering Order contract (shared).
 *
 * Ce fichier est LA seule définition des vocabulaires AYWEBs partagés entre le
 * serveur, le client et l'Admin. Aucune chaîne d'état, aucun code d'erreur et
 * aucune capacité ne doit être ré-écrit dans un écran ou dans une route :
 * l'import vient d'ici.
 *
 * Règle maître (§53 du Master Order) : l'identité SOURCE (boutique externe +
 * identifiant marchand) n'est JAMAIS remplacée par l'identité AYROVI. Les deux
 * vivent côte à côte sur chaque objet : `source*` = le marchand, `id`/`number`
 * = AYROVI.
 */

/* ------------------------------------------------------------------ *
 * 1. Store registry vocabulary (§7)
 * ------------------------------------------------------------------ */

/** Niveau d'intégration réel d'une boutique. Ce n'est pas un drapeau binaire. */
export const AYWEBS_INTEGRATION_TYPES = [
  /** Adaptateur complet : navigation, produit, variantes, stock, achat. */
  'SUPPORTED',
  /** Produit et variantes lisibles, mais achat exécuté avec revue humaine. */
  'PARTIALLY_SUPPORTED',
  /** Lecture générique (structured data / meta) sans garantie marchand. */
  'GENERIC',
  /** Aucun accès automatisé : la commande passe par « Order with URL ». */
  'URL_REQUEST',
  /** Interdit (produits prohibés, restrictions légales, blocage marchand). */
  'BLOCKED',
] as const;
export type AyWebsIntegrationType = (typeof AYWEBS_INTEGRATION_TYPES)[number];

/** Ce qu'une boutique sait réellement faire. Chaque capacité est vérifiable. */
export const AYWEBS_STORE_CAPABILITIES = [
  'browse',
  'search',
  'product',
  'variants',
  'availability',
  'purchase',
  'tracking',
] as const;
export type AyWebsStoreCapability = (typeof AYWEBS_STORE_CAPABILITIES)[number];

/* ------------------------------------------------------------------ *
 * 2. Page / product detection vocabulary (§10)
 * ------------------------------------------------------------------ */

export const AYWEBS_PAGE_TYPES = [
  'PRODUCT',
  'SEARCH',
  'CATEGORY',
  'HOME',
  'LOGIN',
  'CHECKOUT',
  'CAPTCHA',
  'UNKNOWN',
  'ERROR',
] as const;
export type AyWebsPageType = (typeof AYWEBS_PAGE_TYPES)[number];

/** Mode d'achat décidé par le serveur, jamais par l'écran. */
export const AYWEBS_PURCHASE_MODES = [
  /** Adaptateur intégré : achat direct possible. */
  'SUPPORTED',
  /** Lecture possible, achat avec revue manuelle. */
  'MANUAL_REVIEW',
  /** Aucune intégration : formulaire « Order with URL ». */
  'URL_REQUEST',
  /** Fonctionnalité absente : état explicite, jamais un faux succès (§48). */
  'NOT_IMPLEMENTED',
] as const;
export type AyWebsPurchaseMode = (typeof AYWEBS_PURCHASE_MODES)[number];

/* ------------------------------------------------------------------ *
 * 3. Availability (§14) — UNKNOWN n'est JAMAIS converti en AVAILABLE
 * ------------------------------------------------------------------ */

export const AYWEBS_AVAILABILITY_STATES = [
  'AVAILABLE',
  'LOW_STOCK',
  'OUT_OF_STOCK',
  'UNKNOWN',
] as const;
export type AyWebsAvailabilityState = (typeof AYWEBS_AVAILABILITY_STATES)[number];

/** L'état d'attente client : le bouton d'ajout doit rester bloqué, pas optimiste. */
export const AYWEBS_ADD_BUTTON_STATES = ['IDLE', 'BLOCKED', 'ADDING', 'ADDED', 'FAILED'] as const;
export type AyWebsAddButtonState = (typeof AYWEBS_ADD_BUTTON_STATES)[number];

/* ------------------------------------------------------------------ *
 * 4. Cart (§16, §17)
 * ------------------------------------------------------------------ */

export const AYWEBS_CART_STATUSES = ['ACTIVE', 'CHECKOUT', 'ORDERED', 'ABANDONED'] as const;
export type AyWebsCartStatus = (typeof AYWEBS_CART_STATUSES)[number];

export const AYWEBS_CART_ITEM_STATUSES = [
  'ACTIVE',
  /** Le prix source a bougé : le client doit accepter ou annuler (§29). */
  'PRICE_CHANGED',
  /** La variante exacte choisie n'existe plus : aucun remplacement automatique (§30). */
  'VARIANT_UNAVAILABLE',
  'OUT_OF_STOCK',
  /** Le marchand exige une action du client (login, CAPTCHA, 2FA) (§27). */
  'CUSTOMER_ACTION_REQUIRED',
  'REMOVED',
] as const;
export type AyWebsCartItemStatus = (typeof AYWEBS_CART_ITEM_STATUSES)[number];

/* ------------------------------------------------------------------ *
 * 5. Checkout / orders (§21)
 * ------------------------------------------------------------------ */

export const AYWEBS_ORDER_STATUSES = [
  'DRAFT',
  'CHECKOUT',
  'PAYMENT_PENDING',
  'PAID',
  'PURCHASE_PENDING',
  'PURCHASING',
  'PURCHASED',
  'SUPPLIER_SHIPPED',
  'WAREHOUSE_RECEIVED',
  'CONSOLIDATION',
  'PACKED',
  'SHIPPING_PAYMENT',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
] as const;
export type AyWebsOrderStatus = (typeof AYWEBS_ORDER_STATUSES)[number];

/** Lignes de frais du devis d'achat (§19). Le calcul vit dans checkout/fees.ts. */
export const AYWEBS_FEE_KINDS = [
  'PRODUCT_SUBTOTAL',
  'AYROVI_SERVICE',
  'IMPORT_DUTY',
  'SHIPPING_ESTIMATE',
  'OTHER',
] as const;
export type AyWebsFeeKind = (typeof AYWEBS_FEE_KINDS)[number];

/* ------------------------------------------------------------------ *
 * 6. Purchase engine (§22) — aucun échec silencieux
 * ------------------------------------------------------------------ */

export const AYWEBS_PURCHASE_STATUSES = [
  'PURCHASE_PENDING',
  'PURCHASING',
  'PURCHASED',
  'PRICE_CHANGED',
  'VARIANT_UNAVAILABLE',
  'OUT_OF_STOCK',
  'PURCHASE_FAILED',
  'REQUIRES_REVIEW',
  /** Pas d'intégration réelle : état honnête, jamais déguisé en succès (§48). */
  'PENDING_INTEGRATION',
  'MANUAL_REVIEW',
] as const;
export type AyWebsPurchaseStatus = (typeof AYWEBS_PURCHASE_STATUSES)[number];

/* ------------------------------------------------------------------ *
 * 7. Purchase request — « Order with URL » (§23)
 * ------------------------------------------------------------------ */

export const AYWEBS_PURCHASE_REQUEST_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'ORDER_READY',
] as const;
export type AyWebsPurchaseRequestStatus = (typeof AYWEBS_PURCHASE_REQUEST_STATUSES)[number];

export const AYWEBS_PURCHASE_REQUEST_REASONS = [
  'URL_NOT_ACCESSIBLE',
  'OUT_OF_STOCK',
  'VARIANT_UNCLEAR',
  'PROHIBITED_ITEM',
  'STORE_RESTRICTED',
  'PURCHASE_RESTRICTED',
  'PRICE_CHANGED',
  'OTHER',
] as const;
export type AyWebsPurchaseRequestReason = (typeof AYWEBS_PURCHASE_REQUEST_REASONS)[number];

/* ------------------------------------------------------------------ *
 * 8. Store requests (§38)
 * ------------------------------------------------------------------ */

export const AYWEBS_STORE_REQUEST_STATUSES = [
  'SUBMITTED',
  'UNDER_REVIEW',
  'APPROVED',
  'REJECTED',
  'PROMOTED',
] as const;
export type AyWebsStoreRequestStatus = (typeof AYWEBS_STORE_REQUEST_STATUSES)[number];

/* ------------------------------------------------------------------ *
 * 9. Warehouse / consolidation / shipping (§33, §34, §35)
 * ------------------------------------------------------------------ */

export const AYWEBS_WAREHOUSE_STATES = [
  'WAITING_SUPPLIER',
  'IN_TRANSIT',
  'RECEIVED',
  'INSPECTING',
  'READY_TO_CONSOLIDATE',
  'CONSOLIDATED',
  'PACKED',
] as const;
export type AyWebsWarehouseState = (typeof AYWEBS_WAREHOUSE_STATES)[number];

export const AYWEBS_PACKAGE_STATES = [
  'OPEN',
  'CONSOLIDATED',
  'PACKED',
  'READY_TO_SHIP',
  'SHIPPING_QUOTE',
  'AWAITING_PAYMENT',
  'PAID',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
] as const;
export type AyWebsPackageState = (typeof AYWEBS_PACKAGE_STATES)[number];

/* ------------------------------------------------------------------ *
 * 10. Master state machine (§54)
 * ------------------------------------------------------------------ */

/** Parcours nominal, dans l'ordre. Les branches d'exception sont séparées. */
export const AYWEBS_MASTER_FLOW = [
  'DISCOVERY',
  'STORE_SELECTED',
  'BROWSING',
  'PRODUCT_DETECTED',
  'PRODUCT_RESOLVED',
  'VARIANT_REQUIRED',
  'VARIANT_SELECTED',
  'AVAILABILITY_CONFIRMED',
  'CART',
  'CHECKOUT',
  'PAYMENT_PENDING',
  'PAID',
  'PURCHASE_PENDING',
  'PURCHASING',
  'PURCHASED',
  'SUPPLIER_SHIPPED',
  'WAREHOUSE_RECEIVED',
  'CONSOLIDATION',
  'PACKED',
  'SHIPPING_PAYMENT',
  'DISPATCHED',
  'IN_TRANSIT',
  'DELIVERED',
] as const;
export type AyWebsMasterStage = (typeof AYWEBS_MASTER_FLOW)[number];

/** Branches d'exception : chacune exige une raison et une action possible. */
export const AYWEBS_EXCEPTION_STATES = [
  'PRICE_CHANGED',
  'VARIANT_UNAVAILABLE',
  'OUT_OF_STOCK',
  'AUTH_REQUIRED',
  'CAPTCHA_REQUIRED',
  'PURCHASE_FAILED',
  'PAYMENT_FAILED',
  'SHIPPING_FAILED',
  'CUSTOMER_ACTION_REQUIRED',
  'NOT_IMPLEMENTED',
  'PENDING_INTEGRATION',
] as const;
export type AyWebsExceptionState = (typeof AYWEBS_EXCEPTION_STATES)[number];

/**
 * Étapes visibles par le client (§36). Les états techniques internes ne sont
 * jamais exposés tels quels : cette projection est la seule lecture publique.
 */
export const AYWEBS_CUSTOMER_TIMELINE = [
  { key: 'ORDER_SUBMITTED', stages: ['CHECKOUT', 'PAYMENT_PENDING'] },
  { key: 'PAYMENT_CONFIRMED', stages: ['PAID'] },
  { key: 'PURCHASE_COMPLETED', stages: ['PURCHASE_PENDING', 'PURCHASING', 'PURCHASED'] },
  { key: 'SUPPLIER_SHIPPED', stages: ['SUPPLIER_SHIPPED'] },
  { key: 'WAREHOUSE_RECEIVED', stages: ['WAREHOUSE_RECEIVED'] },
  { key: 'CONSOLIDATED', stages: ['CONSOLIDATION'] },
  { key: 'PACKED', stages: ['PACKED'] },
  { key: 'SHIPPING_PAID', stages: ['SHIPPING_PAYMENT'] },
  { key: 'IN_TRANSIT', stages: ['DISPATCHED', 'IN_TRANSIT'] },
  { key: 'DELIVERED', stages: ['DELIVERED'] },
] as const;
export type AyWebsCustomerTimelineKey = (typeof AYWEBS_CUSTOMER_TIMELINE)[number]['key'];

/* ------------------------------------------------------------------ *
 * 11. Domain events (§39)
 * ------------------------------------------------------------------ */

export const AYWEBS_DOMAIN_EVENTS = [
  'AYWEB_PRODUCT_RESOLVED',
  'AYWEB_VARIANT_SELECTED',
  'AYWEB_CART_ITEM_ADDED',
  'AYWEB_CART_ITEM_UPDATED',
  'AYWEB_CART_ITEM_REMOVED',
  'AYWEB_CHECKOUT_PREVIEWED',
  'AYWEB_ORDER_CREATED',
  'AYWEB_ORDER_SUBMITTED',
  'AYWEB_PAYMENT_CONFIRMED',
  'AYWEB_PURCHASE_STARTED',
  'AYWEB_PURCHASE_CONFIRMED',
  'AYWEB_PURCHASE_FAILED',
  'AYWEB_PRICE_CHANGED',
  'AYWEB_VARIANT_UNAVAILABLE',
  'AYWEB_WAREHOUSE_RECEIVED',
  'AYWEB_CONSOLIDATION_COMPLETED',
  'AYWEB_SHIPPING_READY',
  'AYWEB_SHIPPING_PAID',
  'AYWEB_DISPATCHED',
  'AYWEB_DELIVERED',
  /**
   * Phase 2.1 (06/10/2026) — la vérification par échantillon d'une capture
   * WebView a trouvé un écart entre ce que le client a lu et ce que le serveur
   * relit (prix, devise ou disponibilité). Événement d'EXPLOITATION : il ne
   * change rien pour le client, il dit qu'une lecture cliente a dérivé.
   */
  'AYWEB_WEBVIEW_PRICE_MISMATCH',
  'AYWEB_PURCHASE_REQUEST_SUBMITTED',
  'AYWEB_PURCHASE_REQUEST_DECIDED',
  'AYWEB_STORE_REQUEST_SUBMITTED',
] as const;
export type AyWebsDomainEvent = (typeof AYWEBS_DOMAIN_EVENTS)[number];

/** Événements d'usage (funnel, sans PII) — conservés depuis V1, étendus ici. */
export const AYWEBS_FUNNEL_EVENTS = [
  'aywebs_open',
  'store_selected',
  'store_opened',
  'product_page_detected',
  'capture_started',
  'capture_succeeded',
  'capture_failed',
  'variant_selected',
  'add_to_cart_clicked',
  'add_to_cart_succeeded',
  'cart_opened',
  'checkout_previewed',
  'order_created',
  'order_submitted',
  'purchase_request_submitted',
  'store_request_submitted',
] as const;
export type AyWebsFunnelEvent = (typeof AYWEBS_FUNNEL_EVENTS)[number];

/* ------------------------------------------------------------------ *
 * 12. Error architecture (§44)
 * ------------------------------------------------------------------ */

export const AYWEBS_ERROR_CODES = [
  'STORE_UNAVAILABLE',
  'STORE_UNKNOWN',
  'STORE_MISMATCH',
  'DOMAIN_NOT_ALLOWED',
  'PRODUCT_NOT_FOUND',
  'PRODUCT_PAGE_REQUIRED',
  'PRODUCT_UNAVAILABLE',
  'PRODUCT_RESTRICTED',
  'CAPTURE_INCOMPLETE',
  'CAPTURE_FAILED',
  'CAPTURE_DISABLED',
  'VARIANT_REQUIRED',
  'VARIANT_UNAVAILABLE',
  'VARIANT_UNKNOWN',
  'STOCK_UNKNOWN',
  'OUT_OF_STOCK',
  'PRICE_CHANGED',
  'PRICE_UNAVAILABLE',
  'PRICE_AMBIGUOUS',
  'CART_EMPTY',
  'CART_ITEM_NOT_FOUND',
  'CART_LOCKED',
  'IDEMPOTENCY_CONFLICT',
  'AUTH_REQUIRED',
  'CAPTCHA_REQUIRED',
  'CUSTOMER_ACTION_REQUIRED',
  'PAYMENT_FAILED',
  'ORDER_NOT_FOUND',
  'ORDER_STATE_INVALID',
  'PURCHASE_FAILED',
  'PURCHASE_REQUEST_INVALID',
  'SHIPPING_UNAVAILABLE',
  'NETWORK_REQUIRED',
  'INVALID_URL',
  'HTTPS_REQUIRED',
  'INVALID_QUOTE',
  'AYWEBS_DISABLED',
  'NOT_IMPLEMENTED',
  'PENDING_INTEGRATION',
  'RATE_LIMITED',
  'SESSION_REQUIRED',
  'INTERNAL_ERROR',
] as const;
export type AyWebsErrorCode = (typeof AYWEBS_ERROR_CODES)[number];

/** Action attendue du client ou de l'opérateur — jamais un échec sans issue. */
export const AYWEBS_REQUIRED_ACTIONS = [
  'NONE',
  'RETRY',
  'SELECT_VARIANT',
  'PROVIDE_PRODUCT_URL',
  'SUBMIT_PURCHASE_REQUEST',
  'ACCEPT_NEW_PRICE',
  'CHOOSE_ANOTHER_VARIANT',
  'CUSTOMER_BROWSER_ACTION',
  'AUTHENTICATE',
  'CHOOSE_PAYMENT',
  'CONTACT_SUPPORT',
  'WAIT_FOR_REVIEW',
] as const;
export type AyWebsRequiredAction = (typeof AYWEBS_REQUIRED_ACTIONS)[number];

/** Contrat d'erreur unique : ce que voit le client, ce que lit l'ingénieur. */
export interface AyWebsErrorContract {
  errorCode: AyWebsErrorCode | string;
  userMessage: string;
  technicalMessage: string;
  recoverable: boolean;
  retryAllowed: boolean;
  requiredAction: AyWebsRequiredAction;
}

/* ------------------------------------------------------------------ *
 * 13. Normalized product (§11)
 * ------------------------------------------------------------------ */

/**
 * Représentation normalisée d'un produit source. Les attributs de variante
 * sont ARBITRAIRES (§13) : couleur, taille, capacité, format, modèle…
 * Aucun écran ne doit supposer « couleur + taille ».
 */
export interface AyWebsVariantAttributes {
  [attribute: string]: string;
}

export interface AyWebsVariantOption {
  attribute: string;
  value: string;
  /** Image marchand associée à cette valeur, si le magasin en publie une. */
  image?: string | null;
}

export interface AyWebsVariant {
  variantId: string;
  attributes: AyWebsVariantAttributes;
  available: boolean | null;
  availability: AyWebsAvailabilityState;
  price: number | null;
  currency: string | null;
  sourceVariantId?: string | null;
}

export interface AyWebsVariantSelection {
  variantId: string;
  /** Attributs PUBLIÉS par le marchand — seuls eux identifient la variante. */
  attributes: AyWebsVariantAttributes;
  quantity: number;
  /**
   * Métadonnées de contexte fournies par le client mais ABSENTES de l'offre
   * marchand (ex. `condition: "new"` envoyé par la coque Android / la feuille
   * web). Conservées pour la trace et l'affichage ; jamais utilisées pour
   * décider qu'une combinaison existe ou non (régression du 03/10/2026).
   */
  metadata?: Record<string, string> | null;
}

export interface AyWebsAvailability {
  state: AyWebsAvailabilityState;
  /** Pourquoi cet état — le marchand, l'adaptateur, ou une absence de donnée. */
  reason: string;
  checkedAt: string;
  source: string;
  /** Reste `null` quand le marchand ne publie aucun chiffre : jamais 0, jamais infini. */
  quantityHint: number | null;
}

export interface AyWebsPriceSnapshot {
  price: number;
  currency: string;
  timestamp: string;
  sourceUrl: string;
  variant: AyWebsVariantSelection | null;
  availability: AyWebsAvailabilityState;
  pricingVersion: number;
  /** Preuve de lecture : empreinte du contenu source au moment de la capture (§28). */
  evidenceHash: string;
}

export interface AyWebsResolvedProduct {
  productId: string;
  storeId: string;
  storeName: string;
  sourceUrl: string;
  sourceDomain: string;
  sourceProductId: string | null;
  title: string;
  description: string | null;
  brand: string | null;
  images: string[];
  price: number;
  currency: string;
  variants: AyWebsVariantOption[];
  variantGroups: Array<{ attribute: string; values: string[] }>;
  selectedVariant: AyWebsVariantSelection | null;
  availability: AyWebsAvailability;
  /** État publié par la source (neuf / occasion / reconditionné) ou `null`. */
  condition: 'new' | 'used' | 'refurbished' | null;
  merchant: { name: string | null; url: string | null };
  purchaseMode: AyWebsPurchaseMode;
  integrationType: AyWebsIntegrationType;
  capturedAt: string;
  evidenceHash: string;
  /** Devis AYROVI recalculé côté serveur — aucune formule de prix dans le client. */
  ayroviPricing: {
    totalTnd: number;
    pricingVersion: number;
    breakdown: {
      convertedSourcePrice: number;
      shipping: number;
      customs: number;
      serviceFee: number;
      other: number;
    };
  } | null;
}

/* ------------------------------------------------------------------ *
 * 14. Session context (§26)
 * ------------------------------------------------------------------ */

export interface AyWebsSessionContext {
  sessionId: string;
  currentStoreId: string | null;
  currentUrl: string | null;
  currentProductId: string | null;
  selectedVariant: AyWebsVariantSelection | null;
  cartId: string | null;
  cartItemCount: number;
  accountId: string | null;
  updatedAt: string;
}

/* ------------------------------------------------------------------ *
 * 15. Deep links (§25)
 * ------------------------------------------------------------------ */

export const AYWEBS_DEEP_LINK_SCHEME = 'ayrovi';
export const AYWEBS_DEEP_LINK_HOST = 'aywebs';

export type AyWebsRoute =
  | { name: 'home' }
  | { name: 'store'; storeId: string }
  | { name: 'browser'; storeId?: string; url?: string }
  | { name: 'product'; productId: string }
  | { name: 'cart' }
  | { name: 'checkout' }
  | { name: 'orders' }
  | { name: 'order'; orderNumber: string }
  | { name: 'purchase-request'; url?: string; storeId?: string }
  | { name: 'store-requests' }
  | { name: 'unknown'; raw: string };

/** Forme web canonique (aussi utilisée par le share_target PWA). */
export const AYWEBS_PATHS = {
  home: '/aywebs',
  cart: '/aywebs/cart',
  checkout: '/aywebs/checkout',
  orders: '/aywebs/orders',
  storeRequests: '/aywebs/store-requests',
} as const;

export function ayWebsProductPath(productId: string): string {
  return `/aywebs/product/${encodeURIComponent(productId)}`;
}

export function ayWebsOrderPath(orderNumber: string): string {
  return `/aywebs/order/${encodeURIComponent(orderNumber)}`;
}

export function ayWebsStorePath(storeId: string): string {
  return `/aywebs/store/${encodeURIComponent(storeId)}`;
}

const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,120}$/;

/**
 * Analyse un deep link `ayrovi://aywebs/...`, un chemin `/aywebs/...` ou une
 * URL de partage Android. Retourne toujours une route, y compris `unknown` :
 * un lien non reconnu ne doit jamais ouvrir un écran vide ni planter.
 */
export function parseAyWebsDeepLink(raw: unknown): AyWebsRoute {
  const value = String(raw ?? '').trim();
  if (!value) return { name: 'unknown', raw: '' };

  let path = '';
  let query = '';
  try {
    if (/^ayrovi:\/\//i.test(value)) {
      const url = new URL(value);
      if (url.hostname.toLowerCase() !== AYWEBS_DEEP_LINK_HOST && !/^\/?aywebs/i.test(url.pathname)) {
        return { name: 'unknown', raw: value };
      }
      path = url.pathname.replace(/^\/+/, '');
      if (url.hostname.toLowerCase() === AYWEBS_DEEP_LINK_HOST && path.toLowerCase().startsWith('aywebs/')) {
        path = path.slice('aywebs/'.length);
      } else if (url.hostname.toLowerCase() === AYWEBS_DEEP_LINK_HOST) {
        path = '';
      }
      query = url.search;
    } else if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      if (!/^\/aywebs(\/|$)/i.test(url.pathname)) return { name: 'unknown', raw: value };
      path = url.pathname.replace(/^\/aywebs\/?/i, '');
      query = url.search;
    } else if (/^\/?aywebs(\/|$)/i.test(value)) {
      const [rawPath, rawQuery = ''] = value.split('?');
      path = rawPath.replace(/^\/?aywebs\/?/i, '');
      query = rawQuery ? `?${rawQuery}` : '';
    } else {
      return { name: 'unknown', raw: value };
    }
  } catch {
    return { name: 'unknown', raw: value };
  }

  const params = new URLSearchParams(query);
  const segments = path.split('/').filter(Boolean).map((segment) => {
    try { return decodeURIComponent(segment); } catch { return segment; }
  });
  const [head, second] = segments;
  const shareUrl = params.get('url') || params.get('text') || '';

  switch (String(head || '').toLowerCase()) {
    case '':
      return shareUrl ? { name: 'browser', url: shareUrl } : { name: 'home' };
    case 'product':
      return second && SAFE_SEGMENT.test(second) ? { name: 'product', productId: second } : { name: 'unknown', raw: value };
    case 'order':
      return second && SAFE_SEGMENT.test(second) ? { name: 'order', orderNumber: second } : { name: 'unknown', raw: value };
    case 'store':
      return second && SAFE_SEGMENT.test(second) ? { name: 'store', storeId: second } : { name: 'unknown', raw: value };
    case 'cart':
      return { name: 'cart' };
    case 'checkout':
      return { name: 'checkout' };
    case 'orders':
      return { name: 'orders' };
    case 'browser':
      return {
        name: 'browser',
        ...(second && SAFE_SEGMENT.test(second) ? { storeId: second } : {}),
        ...(shareUrl ? { url: shareUrl } : {}),
      };
    case 'purchase-request':
      return {
        name: 'purchase-request',
        ...(shareUrl ? { url: shareUrl } : {}),
        ...(second && SAFE_SEGMENT.test(second) ? { storeId: second } : {}),
      };
    case 'store-requests':
      return { name: 'store-requests' };
    default:
      return { name: 'unknown', raw: value };
  }
}

/** Construit le deep link natif correspondant à une route (partage Sonim/Lens, §40-41). */
export function ayWebsDeepLink(route: AyWebsRoute): string {
  const base = `${AYWEBS_DEEP_LINK_SCHEME}://${AYWEBS_DEEP_LINK_HOST}`;
  switch (route.name) {
    case 'home': return base;
    case 'store': return `${base}/store/${encodeURIComponent(route.storeId)}`;
    case 'browser':
      return route.url
        ? `${base}/browser?url=${encodeURIComponent(route.url)}`
        : route.storeId ? `${base}/browser/${encodeURIComponent(route.storeId)}` : `${base}/browser`;
    case 'product': return `${base}/product/${encodeURIComponent(route.productId)}`;
    case 'cart': return `${base}/cart`;
    case 'checkout': return `${base}/checkout`;
    case 'orders': return `${base}/orders`;
    case 'order': return `${base}/order/${encodeURIComponent(route.orderNumber)}`;
    case 'purchase-request':
      return route.url ? `${base}/purchase-request?url=${encodeURIComponent(route.url)}` : `${base}/purchase-request`;
    case 'store-requests': return `${base}/store-requests`;
    default: return base;
  }
}
