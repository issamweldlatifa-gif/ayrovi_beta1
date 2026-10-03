import type { SmartLinkScraper } from '../../scraper/scraper';
import type { ScrapedProduct } from '../../types';
import type { AyWebsAdapterId, AyWebsStoreDefinition } from '../../../shared/aywebsStores';
import type {
  AyWebsAvailabilityState,
  AyWebsIntegrationType,
  AyWebsPageType,
  AyWebsPurchaseMode,
  AyWebsPurchaseStatus,
} from '../../../shared/aywebsTypes';

/**
 * AYWEBs — Store Adapter contract (§8).
 *
 * Règle absolue du Master Order : AUCUN `if (store === 'amazon')` dispersé dans
 * le code. Toute spécificité marchand vit dans un adaptateur qui respecte CE
 * contrat. Ajouter une boutique = écrire un adaptateur + une ligne de registre,
 * sans réécrire AYWEBs.
 */

/** Résultat brut de lecture d'un produit chez le marchand. */
export interface AyWebsSourceProduct {
  sourceUrl: string;
  sourceDomain: string;
  sourceProductId: string | null;
  title: string;
  description: string | null;
  brand: string | null;
  images: string[];
  price: number;
  currency: string;
  /** Attributs libres : couleur, taille, capacité, format, modèle… (§13) */
  variantGroups: Array<{ attribute: string; values: string[] }>;
  variants: Array<{
    sourceVariantId: string | null;
    attributes: Record<string, string>;
    label: string;
    price: number | null;
    currency: string | null;
    available: boolean | null;
    availability: AyWebsAvailabilityState;
    availabilityReason: string;
    image: string | null;
  }>;
  availability: AyWebsAvailabilityState;
  availabilityReason: string;
  /**
   * État du produit (neuf / occasion / reconditionné), quand la SOURCE le publie
   * de façon structurée (JSON-LD `offers.itemCondition`). `null` sinon : la
   * coque ne doit jamais afficher « New » par défaut.
   */
  condition: 'new' | 'used' | 'refurbished' | null;
  merchant: { name: string | null; url: string | null };
  /** Produit AYROVI historique conservé pour la compatibilité V1 (confirmation, panier). */
  scrapedProduct: ScrapedProduct;
  capturedAt: string;
}

export interface AyWebsPageClassification {
  pageType: AyWebsPageType;
  storeId: AyWebsAdapterId | null;
  isProductPage: boolean;
  /** Ce qui a permis de décider — indispensable au diagnostic (§46). */
  reason: string;
  /** Une action du client est nécessaire (login, CAPTCHA, 2FA) : §27. */
  customerActionRequired: 'NONE' | 'LOGIN' | 'CAPTCHA' | 'REGION' | 'OTHER';
}

export interface AyWebsAvailabilityCheck {
  state: AyWebsAvailabilityState;
  reason: string;
  checkedAt: string;
  source: string;
  quantityHint: number | null;
  variantAvailable: boolean | null;
}

export interface AyWebsPurchasePreparation {
  /** HONNÊTETÉ (§48) : sans intégration d'achat réelle, l'état le dit. */
  status: AyWebsPurchaseStatus;
  reason: string;
  requiredAction: 'NONE' | 'MANUAL_REVIEW' | 'CUSTOMER_BROWSER_ACTION' | 'WAIT_FOR_INTEGRATION';
  adapter: AyWebsAdapterId;
}

export interface AyWebsStoreAdapter {
  readonly id: AyWebsAdapterId;
  readonly integrationType: AyWebsIntegrationType;
  readonly purchaseMode: AyWebsPurchaseMode;

  /** Le domaine/URL relève-t-il de cet adaptateur ? */
  canHandle(url: string | URL): boolean;
  /** Type de page : PRODUCT, SEARCH, CATEGORY, HOME, LOGIN, CHECKOUT, CAPTCHA… (§10) */
  classifyPage(url: string | URL): AyWebsPageClassification;
  /** Lecture et normalisation du produit source (§11). */
  resolveProduct(url: string): Promise<AyWebsSourceProduct>;
  /** Variantes d'un produit déjà résolu (§13). */
  resolveVariants(product: AyWebsSourceProduct): AyWebsSourceProduct['variants'];
  /** Disponibilité produit + variante exacte (§14). */
  checkAvailability(product: AyWebsSourceProduct, variantAttributes?: Record<string, string> | null): Promise<AyWebsAvailabilityCheck>;
  /** Préparation d'achat (§22) — jamais un faux succès. */
  preparePurchase(input: { product: AyWebsSourceProduct; variantAttributes: Record<string, string> | null; quantity: number }): Promise<AyWebsPurchasePreparation>;
  /** Suivi d'achat (§36). */
  getPurchaseStatus(input: { orderItemId: string; sourceProductId: string | null }): Promise<AyWebsPurchasePreparation>;

  /* ---- Contrat V1 conservé : `/capture` et les tests existants en dépendent ---- */
  isProductPage(url: URL): boolean;
  capture(url: string): Promise<ScrapedProduct>;
}

export type AyWebsAdapterDependencies = {
  scraper: SmartLinkScraper;
};

/** Codes d'échec V1 conservés (routes.ts et tests existants). */
export type AyWebsCaptureErrorCode = 'PRODUCT_PAGE_REQUIRED' | 'ADAPTER_UNAVAILABLE' | 'STORE_MISMATCH';

export class AyWebsCaptureError extends Error {
  constructor(readonly code: AyWebsCaptureErrorCode, message: string) {
    super(message);
    this.name = 'AyWebsCaptureError';
  }
}

/** Décrit ce qu'un adaptateur sait faire, pour le registre et l'Admin. */
export interface AyWebsAdapterDescriptor {
  id: AyWebsAdapterId;
  label: string;
  integrationType: AyWebsIntegrationType;
  purchaseMode: AyWebsPurchaseMode;
  /** Ce que l'adaptateur lit réellement — affiché tel quel, sans sur-promesse. */
  reads: string[];
  implemented: boolean;
  pendingIntegration: string;
}

export const AYWEBS_ADAPTER_CONTRACT_VERSION = 2;

/** Type de page déductible de l'URL seule, partagé par tous les adaptateurs. */
export const AYWEBS_URL_PAGE_HINTS: ReadonlyArray<{ pattern: RegExp; pageType: AyWebsPageType; action: AyWebsPageClassification['customerActionRequired'] }> = [
  { pattern: /(captcha|recaptcha|hcaptcha|challenge|robot|areyouhuman|verify\/human)/i, pageType: 'CAPTCHA', action: 'CAPTCHA' },
  { pattern: /(signin|sign-in|login|log-in|auth|ap\/signin|account\/login|sso)/i, pageType: 'LOGIN', action: 'LOGIN' },
  { pattern: /(checkout|basket|cart|panier|order\/complete|payment|gc\/checkout)/i, pageType: 'CHECKOUT', action: 'NONE' },
];

export type { AyWebsStoreDefinition };
