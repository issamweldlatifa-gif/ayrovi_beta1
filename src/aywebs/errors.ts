import type { AyWebsErrorContract, AyWebsErrorCode, AyWebsRequiredAction } from '../../shared/aywebsTypes';

/**
 * AYWEBs — Error architecture (§44).
 *
 * Chaque échec produit UN contrat : ce que le client comprend, ce que
 * l'ingénieur lit, si l'opération est récupérable, si un nouvel essai est
 * permis et quelle action est attendue. Aucune exception brute du backend ne
 * sort vers le client, et aucun échec n'est silencieux.
 */

type ErrorDefinition = Omit<AyWebsErrorContract, 'errorCode'> & {
  httpStatus: number;
  /** Statut métier renvoyé au client (READY / NEEDS_SELECTION / UNSUPPORTED / FAILED). */
  flowStatus: 'READY' | 'NEEDS_SELECTION' | 'UNSUPPORTED' | 'FAILED';
};

const DEFINITIONS: Record<string, ErrorDefinition> = {
  AYWEBS_DISABLED: {
    httpStatus: 503, flowStatus: 'FAILED', recoverable: true, retryAllowed: false, requiredAction: 'CONTACT_SUPPORT',
    userMessage: 'AyWebs est temporairement indisponible.',
    technicalMessage: 'AYWEBS_ENABLED=false : le module est suspendu par configuration.',
  },
  CAPTURE_DISABLED: {
    httpStatus: 503, flowStatus: 'FAILED', recoverable: true, retryAllowed: false, requiredAction: 'CONTACT_SUPPORT',
    userMessage: 'La capture de produits est temporairement suspendue.',
    technicalMessage: 'AYWEBS_CAPTURE_ENABLED=false : la couche de capture est arrêtée, la navigation reste ouverte.',
  },
  STORE_UNAVAILABLE: {
    httpStatus: 503, flowStatus: 'UNSUPPORTED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Cette boutique est momentanément inaccessible.',
    technicalMessage: 'Le marchand ne répond pas ou bloque la lecture automatisée.',
  },
  STORE_UNKNOWN: {
    // 404 : l'identifiant de boutique ne référence rien dans le Store Registry.
    httpStatus: 404, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Boutique AyWebs inconnue.',
    technicalMessage: 'store absent du Store Registry partagé.',
  },
  STORE_MISMATCH: {
    httpStatus: 400, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'PROVIDE_PRODUCT_URL',
    userMessage: 'Le lien ne correspond pas à la boutique sélectionnée.',
    technicalMessage: 'Le domaine résolu ne matche pas le storeId demandé.',
  },
  DOMAIN_NOT_ALLOWED: {
    httpStatus: 400, flowStatus: 'UNSUPPORTED', recoverable: true, retryAllowed: false, requiredAction: 'SUBMIT_PURCHASE_REQUEST',
    userMessage: 'Cette boutique ne fait pas encore partie du registre AyWebs.',
    technicalMessage: 'Aucun Store Registry entry pour ce domaine : chemin « Order with URL » obligatoire.',
  },
  STORE_CAPTURE_UNSUPPORTED: {
    httpStatus: 422, flowStatus: 'UNSUPPORTED', recoverable: true, retryAllowed: false, requiredAction: 'SUBMIT_PURCHASE_REQUEST',
    userMessage: 'La navigation reste disponible, mais la capture de cette boutique est désactivée.',
    technicalMessage: 'Flag runtime AYWEBS_<STORE>_CAPTURE_ENABLED=false ou integrationType sans capacité product.',
  },
  INVALID_URL: {
    httpStatus: 400, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'PROVIDE_PRODUCT_URL',
    userMessage: 'Collez un lien produit valide.',
    technicalMessage: 'URL non analysable ou hors allowlist publique (safeUrl).',
  },
  HTTPS_REQUIRED: {
    httpStatus: 400, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'PROVIDE_PRODUCT_URL',
    userMessage: 'Le lien produit doit utiliser HTTPS.',
    technicalMessage: 'Protocole refusé : http: (politique §45).',
  },
  PRODUCT_PAGE_REQUIRED: {
    httpStatus: 422, flowStatus: 'NEEDS_SELECTION', recoverable: true, retryAllowed: true, requiredAction: 'PROVIDE_PRODUCT_URL',
    userMessage: 'Ouvrez la fiche exacte du produit, puis copiez son lien.',
    technicalMessage: 'Page détectée comme SEARCH/CATEGORY/HOME : aucune identité produit exploitable.',
  },
  PRODUCT_NOT_FOUND: {
    httpStatus: 404, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Ce produit est introuvable.',
    technicalMessage: 'Résolution produit vide : pas de titre ni de prix source.',
  },
  PRODUCT_UNAVAILABLE: {
    httpStatus: 409, flowStatus: 'NEEDS_SELECTION', recoverable: false, retryAllowed: true, requiredAction: 'CHOOSE_ANOTHER_VARIANT',
    userMessage: 'Le marchand indique que ce produit est épuisé.',
    technicalMessage: 'availability=OUT_OF_STOCK depuis la source : le bouton d’ajout reste bloqué.',
  },
  PRODUCT_RESTRICTED: {
    httpStatus: 422, flowStatus: 'NEEDS_SELECTION', recoverable: false, retryAllowed: false, requiredAction: 'WAIT_FOR_REVIEW',
    userMessage: 'Ce type de produit nécessite une vérification manuelle avant commande.',
    technicalMessage: 'Catégorie douanière RESTRICTED renvoyée par le moteur tarifaire central.',
  },
  CAPTURE_INCOMPLETE: {
    httpStatus: 422, flowStatus: 'NEEDS_SELECTION', recoverable: true, retryAllowed: true, requiredAction: 'PROVIDE_PRODUCT_URL',
    userMessage: 'Nous n’avons pas pu lire toutes les informations du produit.',
    technicalMessage: 'Champs normalisés manquants (title/price/currency/image/verified_price).',
  },
  CAPTURE_FAILED: {
    httpStatus: 502, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Nous n’avons pas pu lire ce produit. Réessayez ou utilisez une capture d’écran.',
    technicalMessage: 'Échec d’extraction (bot-wall, DOM modifié, timeout) sur l’adaptateur.',
  },
  VARIANT_REQUIRED: {
    httpStatus: 422, flowStatus: 'NEEDS_SELECTION', recoverable: true, retryAllowed: true, requiredAction: 'SELECT_VARIANT',
    userMessage: 'Choisissez la version exacte du produit avant de l’ajouter.',
    technicalMessage: 'variantGroups non vides mais aucune sélection fournie (§13).',
  },
  VARIANT_UNAVAILABLE: {
    httpStatus: 409, flowStatus: 'NEEDS_SELECTION', recoverable: false, retryAllowed: true, requiredAction: 'CHOOSE_ANOTHER_VARIANT',
    userMessage: 'La version choisie n’est plus disponible. Sélectionnez-en une autre.',
    technicalMessage: 'La variante exacte (snapshot) est indisponible : aucun remplacement automatique (§30).',
  },
  VARIANT_UNKNOWN: {
    httpStatus: 409, flowStatus: 'NEEDS_SELECTION', recoverable: false, retryAllowed: true, requiredAction: 'SELECT_VARIANT',
    userMessage: 'La version choisie ne figure plus sur la fiche marchand.',
    technicalMessage: 'variantId absent de la résolution la plus récente : snapshot obsolète.',
  },
  STOCK_UNKNOWN: {
    httpStatus: 200, flowStatus: 'NEEDS_SELECTION', recoverable: true, retryAllowed: true, requiredAction: 'SELECT_VARIANT',
    userMessage: 'Le marchand ne publie pas le stock de cette version.',
    technicalMessage: 'availability=UNKNOWN : jamais converti en AVAILABLE (§14).',
  },
  OUT_OF_STOCK: {
    httpStatus: 409, flowStatus: 'NEEDS_SELECTION', recoverable: false, retryAllowed: true, requiredAction: 'CHOOSE_ANOTHER_VARIANT',
    userMessage: 'Produit épuisé chez le marchand.',
    technicalMessage: 'availability=OUT_OF_STOCK au moment de l’ajout ou du checkout.',
  },
  PRICE_CHANGED: {
    httpStatus: 409, flowStatus: 'NEEDS_SELECTION', recoverable: true, retryAllowed: true, requiredAction: 'ACCEPT_NEW_PRICE',
    userMessage: 'Le prix a changé depuis votre ajout au panier.',
    technicalMessage: 'priceSnapshot.price ≠ prix source recontrôlé : accord client exigé (§29).',
  },
  PRICE_UNAVAILABLE: {
    httpStatus: 422, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Le devis AYROVI est indisponible pour cet article. Vérifiez son prix et sa devise, puis réessayez.',
    technicalMessage: 'aucun devis exploitable : prix source absent ou invalide, devise non prise en charge, taux de change indisponible ou restriction produit.',
  },
  INVALID_QUOTE: {
    httpStatus: 400, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Données de devis AyWebs invalides.',
    technicalMessage: 'source_price/currency/source rejetés par la validation de devis.',
  },
  CART_EMPTY: {
    httpStatus: 422, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'PROVIDE_PRODUCT_URL',
    userMessage: 'Votre panier AyWebs est vide.',
    technicalMessage: 'Checkout demandé sans ligne ACTIVE exploitable.',
  },
  CART_ITEM_NOT_FOUND: {
    httpStatus: 404, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Article introuvable dans le panier AyWebs.',
    technicalMessage: 'cartItemId hors du panier de la session/compte courant.',
  },
  CART_LOCKED: {
    httpStatus: 409, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Le panier est verrouillé pendant la commande.',
    technicalMessage: 'Cart status=CHECKOUT/ORDERED : mutation refusée pour préserver le snapshot.',
  },
  AUTH_REQUIRED: {
    httpStatus: 401, flowStatus: 'FAILED', recoverable: true, retryAllowed: false, requiredAction: 'AUTHENTICATE',
    userMessage: 'Connectez-vous à votre compte AYROVI pour continuer.',
    technicalMessage: 'Session client absente sur une opération propriétaire.',
  },
  CAPTCHA_REQUIRED: {
    httpStatus: 409, flowStatus: 'NEEDS_SELECTION', recoverable: true, retryAllowed: false, requiredAction: 'CUSTOMER_BROWSER_ACTION',
    userMessage: 'La boutique demande une vérification. Faites-la dans le navigateur, puis revenez.',
    technicalMessage: 'Anti-bot marchand détecté : aucun contournement (§27).',
  },
  CUSTOMER_ACTION_REQUIRED: {
    httpStatus: 409, flowStatus: 'NEEDS_SELECTION', recoverable: true, retryAllowed: false, requiredAction: 'CUSTOMER_BROWSER_ACTION',
    userMessage: 'Une action est nécessaire dans la boutique avant de continuer.',
    technicalMessage: 'Login/2FA/sélection marchande requise : le client agit, AYWEBs ne devine pas (§27).',
  },
  PAYMENT_FAILED: {
    httpStatus: 402, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'CHOOSE_PAYMENT',
    userMessage: 'Le paiement n’a pas abouti.',
    technicalMessage: 'Échec du provider de paiement AYROVI existant (aucun écosystème parallèle, §20).',
  },
  ORDER_NOT_FOUND: {
    httpStatus: 404, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Commande AyWebs introuvable.',
    technicalMessage: 'orderNumber/id hors périmètre du client authentifié.',
  },
  ORDER_STATE_INVALID: {
    httpStatus: 409, flowStatus: 'FAILED', recoverable: true, retryAllowed: false, requiredAction: 'CONTACT_SUPPORT',
    userMessage: 'Cette action n’est pas possible à ce stade de la commande.',
    technicalMessage: 'Transition refusée par la machine à états (§54) — aucun saut d’état.',
  },
  PURCHASE_FAILED: {
    httpStatus: 502, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'CONTACT_SUPPORT',
    userMessage: 'L’achat auprès du marchand n’a pas abouti.',
    technicalMessage: 'Échec d’exécution côté procurement : une raison est toujours jointe (§22).',
  },
  PURCHASE_REQUEST_INVALID: {
    httpStatus: 400, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'PROVIDE_PRODUCT_URL',
    userMessage: 'Complétez la demande d’achat avec un lien produit valide.',
    technicalMessage: 'Formulaire « Order with URL » incomplet (§23).',
  },
  SHIPPING_UNAVAILABLE: {
    httpStatus: 503, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'CONTACT_SUPPORT',
    userMessage: 'Le devis d’expédition est momentanément indisponible.',
    technicalMessage: 'Moteur d’expédition non prêt pour ce colis.',
  },
  NETWORK_REQUIRED: {
    httpStatus: 0, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Cette information nécessite une connexion réseau.',
    technicalMessage: 'Donnée live (prix/stock/achat/devis) demandée hors ligne (§51).',
  },
  RATE_LIMITED: {
    httpStatus: 429, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Trop de demandes. Réessayez dans un instant.',
    technicalMessage: 'Rate limit AYWEBs atteint.',
  },
  SESSION_REQUIRED: {
    httpStatus: 400, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'RETRY',
    userMessage: 'Session AYROVI invalide ou absente.',
    technicalMessage: 'x-session-id manquant ou malformé.',
  },
  NOT_IMPLEMENTED: {
    httpStatus: 501, flowStatus: 'FAILED', recoverable: false, retryAllowed: false, requiredAction: 'CONTACT_SUPPORT',
    userMessage: 'Cette étape n’est pas encore disponible.',
    technicalMessage: 'Fonctionnalité non implémentée : état explicite, jamais un faux succès (§48).',
  },
  PENDING_INTEGRATION: {
    httpStatus: 501, flowStatus: 'UNSUPPORTED', recoverable: false, retryAllowed: false, requiredAction: 'WAIT_FOR_REVIEW',
    userMessage: 'L’achat automatique n’est pas encore connecté pour cette boutique.',
    technicalMessage: 'Intégration marchand en attente : la demande passe en revue humaine (§48).',
  },
  INTERNAL_ERROR: {
    httpStatus: 500, flowStatus: 'FAILED', recoverable: true, retryAllowed: true, requiredAction: 'CONTACT_SUPPORT',
    userMessage: 'Une erreur est survenue. Réessayez.',
    technicalMessage: 'Erreur interne non classée — journalisée avec requestId.',
  },
};

/** Contrat complet d'un code d'erreur. Un code inconnu retombe sur INTERNAL_ERROR. */
export function ayWebsErrorContract(code: AyWebsErrorCode | string, detail?: {
  userMessage?: string;
  technicalMessage?: string;
  requiredAction?: AyWebsRequiredAction;
  retryAllowed?: boolean;
  recoverable?: boolean;
}): AyWebsErrorContract {
  const definition = DEFINITIONS[String(code)] || DEFINITIONS.INTERNAL_ERROR;
  return {
    errorCode: String(code),
    userMessage: detail?.userMessage || definition.userMessage,
    technicalMessage: detail?.technicalMessage || definition.technicalMessage,
    recoverable: detail?.recoverable ?? definition.recoverable,
    retryAllowed: detail?.retryAllowed ?? definition.retryAllowed,
    requiredAction: detail?.requiredAction || definition.requiredAction,
  };
}

export function ayWebsErrorHttpStatus(code: AyWebsErrorCode | string): number {
  return (DEFINITIONS[String(code)] || DEFINITIONS.INTERNAL_ERROR).httpStatus;
}

export function ayWebsErrorFlowStatus(code: AyWebsErrorCode | string): ErrorDefinition['flowStatus'] {
  return (DEFINITIONS[String(code)] || DEFINITIONS.INTERNAL_ERROR).flowStatus;
}

/** Erreur métier AYWEBs : le seul type d'erreur que les routes traduisent en contrat. */
export class AyWebsDomainError extends Error {
  readonly contract: AyWebsErrorContract;
  constructor(
    readonly code: AyWebsErrorCode | string,
    detail: { userMessage?: string; technicalMessage?: string; requiredAction?: AyWebsRequiredAction; retryAllowed?: boolean; recoverable?: boolean; cause?: unknown } = {},
  ) {
    super(detail.technicalMessage || ayWebsErrorContract(code, detail).technicalMessage);
    this.name = 'AyWebsDomainError';
    this.contract = ayWebsErrorContract(code, detail);
  }
}

/**
 * Sérialisation HTTP unique. `fallback` conserve les pistes de secours V1
 * (retry / product_link / screenshot) que l'écran sait déjà exploiter.
 */
export function ayWebsErrorPayload(error: AyWebsDomainError, extra: Record<string, unknown> = {}) {
  const { contract } = error;
  return {
    success: false,
    status: ayWebsErrorFlowStatus(contract.errorCode),
    code: contract.errorCode,
    error: contract.userMessage,
    error_contract: contract,
    recoverable: contract.recoverable,
    retry_allowed: contract.retryAllowed,
    required_action: contract.requiredAction,
    fallback: requiredActionFallbacks(contract.requiredAction),
    ...extra,
  };
}

function requiredActionFallbacks(action: AyWebsRequiredAction): string[] {
  switch (action) {
    case 'RETRY': return ['retry'];
    case 'SELECT_VARIANT':
    case 'CHOOSE_ANOTHER_VARIANT': return ['retry', 'product_link'];
    case 'PROVIDE_PRODUCT_URL': return ['retry', 'product_link', 'screenshot'];
    case 'SUBMIT_PURCHASE_REQUEST': return ['purchase_request', 'store_request', 'screenshot'];
    case 'CUSTOMER_BROWSER_ACTION': return ['open_store', 'retry'];
    case 'ACCEPT_NEW_PRICE': return ['accept_price', 'cancel'];
    case 'AUTHENTICATE': return ['authenticate'];
    case 'CHOOSE_PAYMENT': return ['choose_payment', 'retry'];
    case 'WAIT_FOR_REVIEW': return ['wait'];
    case 'CONTACT_SUPPORT': return ['support'];
    default: return [];
  }
}

/** Toute erreur inattendue devient un contrat, jamais une stack trace cliente. */
export function toAyWebsDomainError(error: unknown): AyWebsDomainError {
  if (error instanceof AyWebsDomainError) return error;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return new AyWebsDomainError('INTERNAL_ERROR', { technicalMessage: message || 'unexpected failure' });
}

export const AYWEBS_ERROR_CATALOG = DEFINITIONS;
