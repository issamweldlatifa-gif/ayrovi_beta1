/**
 * GLOBAL DISCOVERY — le type d'une source est OUVERT : les valeurs historiques
 * restent proposées en complétion, mais toute nouvelle boutique mondiale est
 * acceptée sans modification du code. La source est une métadonnée
 * (registre `discovery_sources`), jamais l'architecture.
 */
export type StoreType = 'amazon' | 'shein' | 'temu' | 'aliexpress' | 'generic' | (string & {});
export type PriceVerificationStatus = 'VERIFIED' | 'PENDING_MANUAL';

export interface ProductVariantDetail {
  id?: string | null;
  label: string;
  size?: string | null;
  color?: string | null;
  /**
   * Attributs publiés par le marchand au-delà de taille/couleur, clé normalisée
   * (ex. `{ format: 'Kindle' }`) — lus tels quels sur la page, jamais déduits.
   * Sans cette donnée, un marchand qui publie « Format » verrait cette option
   * perdue (ou pire, prise pour une couleur).
   */
  attributes?: Record<string, string> | null;
  /** Eligible for a variant-specific choice; not a live stock guarantee. */
  available: boolean;
  /**
   * Live stock flag AS THE MERCHANT PUBLISHES IT (true/false), or null when the
   * source says nothing. Separate from `available` (a choice eligibility) on
   * purpose: a silence is not a stock, here as everywhere else.
   */
  stock?: boolean | null;
  price?: number | null;
}

export interface ProductVariants {
  sizes?: string[];
  colors?: string[];
  styles?: string[];
  options?: string[];
  details?: ProductVariantDetail[];
}

export interface ScrapedProduct {
  id: string;
  /** Present when the product entered through the AyWebs capture pipeline. */
  captureId?: string;
  store: StoreType;
  storeName: string;
  url: string;
  externalId: string | null;
  title: string;
  description: string | null;
  images: string[];
  /** Images par couleur (clé = couleur minuscule) — référence Zalando 24/09/2026. */
  colorImages?: Record<string, string[]>;
  mainImage: string;
  sourcePrice: number;
  /** Prix barré publié par le marchand (strictement > sourcePrice), sinon absent. */
  sourceOriginalPrice?: number;
  sourceCurrency: string;
  convertedPriceTND: number;
  estimatedShippingTND: number;
  serviceFeeTND: number;
  totalPriceTND: number;
  variants: ProductVariants;
  selectedVariant?: string | null;
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  /**
   * État publié par la source (JSON-LD `itemCondition`) : 'new' | 'used' |
   * 'refurbished'. Absent quand la page ne le déclare pas — jamais déduit.
   */
  condition?: 'new' | 'used' | 'refurbished';
  brand: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  /**
   * CHAMPS ÉTENDUS (Phase 2.5, 07/10/2026) — publiés par la page ou absents.
   * `gtin` (code-barres), `sku` (référence marchand) et `seller` (vendeur de
   * l'offre, ≠ boutique) servent la comparaison de prix et la traçabilité ; ils
   * ne sont JAMAIS déduits d'un titre ou d'une URL.
   */
  gtin?: string | null;
  sku?: string | null;
  seller?: string | null;
  priceVerified?: boolean;
  /**
   * INTÉGRITÉ DU PRIX (Phase 0, 06/10/2026) — raison pour laquelle un montant
   * lu sur la page a été ÉCARTÉ au lieu d'être publié (`DUPLICATED_TEXT`,
   * `MULTIPLE_AMOUNTS`, `MALFORMED_NUMBER`, `REPEATED_SYMBOL`,
   * `CURRENCY_CONFLICT`, `OUT_OF_RANGE`). `null`/absent quand aucun montant
   * n'était présent ou quand le prix publié est sain.
   */
  priceRejection?: string | null;
  /** True only when the merchant page explicitly publishes a supported currency. */
  currencyVerified?: boolean;
  verificationProvider?: string;
  verificationMethod?: string;
  verificationFailureCode?: string | null;
  /**
   * PROVENANCE DU TITRE (Phase 0, suite — 07/10/2026).
   *
   * `merchant`  : le titre vient de la page marchande (JSON-LD, meta, h1…).
   * `url_slug`  : le titre vient du SLUG de l'URL, faute de lecture de la page.
   *               C'est une donnée déterministe et vérifiable (elle est dans
   *               l'URL publiée par le marchand), mais ce n'est PAS le titre du
   *               produit : elle doit être présentée comme une piste.
   * `none`      : aucun titre publié — l'interface écrit « non communiqué »
   *               au lieu d'inventer « Produit Amazon » (fabrication retirée).
   */
  titleSource?: 'merchant' | 'url_slug' | 'none';
  scrapedAt: string;
}

export interface CartItem {
  id: string;
  sessionId: string;
  store: string;
  externalId: string | null;
  sourceUrl: string;
  title: string;
  imageUrl: string;
  sourcePrice: number;
  sourceCurrency: string;
  priceTND: number;
  variant: string | null;
  requestedSize: string;
  requestedColor: string;
  customerNote: string;
  referenceUrl: string;
  priceVerificationStatus: PriceVerificationStatus;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface AddToCartRequest {
  store: string;
  externalId?: string | null;
  url: string;
  title: string;
  imageUrl: string;
  sourcePrice: number;
  sourceCurrency: string;
  priceTND: number;
  variant?: string | null;
  requestedSize?: string;
  requestedColor?: string;
  customerNote?: string;
  referenceUrl?: string;
  priceVerificationStatus?: PriceVerificationStatus;
  priceToken?: string;
  quantity?: number;
}
