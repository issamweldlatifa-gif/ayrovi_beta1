/**
 * ZAYROVIX — contrats partagés côté serveur.
 * AI Core fournit l'analyse visuelle et découvre des pages; ZAYROVIX reste
 * propriétaire de la validation et de la vérité marchande.
 */

export interface ZayrovixDetectedProductItem {
  name: string;
  brand: string | null;
  category: string;
  subcategory?: string | null;
  price: number | null;
  currency: string | null;
  priceTnd?: number | null;
  box?: [number, number, number, number] | null;
  color?: string[];
  pattern?: string | null;
  material?: string | null;
}

/** Données structurées extraites de l'image puis validées par ZAYROVIX. */
export interface ZayrovixIdentification {
  input_kind: 'product_photo' | 'product_screenshot' | 'cart_screenshot' | 'barcode' | 'other';
  category: string;
  brand: string | null;
  model: string | null;
  color: string[];
  visible_text: string[];
  possible_model_codes: string[];
  description: string;
  confidence: number; // 0..1
  detected_price: {
    amount: number;
    currency: string;
    label: 'none' | 'product_price' | 'old_price' | 'cart_total';
    confidence: number;
  };
  pricing?: {
    sale_price: number | null;
    original_price: number | null;
    shipping_price: number | null;
    total_price: number | null;
    currency: string | null;
    discount_percent: number | null;
  };
  products?: ZayrovixDetectedProductItem[];
  url?: string | null;
  seller?: string | null;
}

export type ZayrovixChannel = 'image' | 'url' | 'qr' | 'text';

/** Un candidat produit proposé à l'utilisateur pour confirmation humaine. */
export interface ZayrovixCandidate {
  id: string;
  kind: 'catalog' | 'external';
  title: string;
  /** Promo du jour côté serveur (management 23/09/2026) — prix déjà remisé. */
  promo?: ZayrovixPromo | null;
  /** Optional descriptive text supplied by the merchant/search provider. */
  description?: string | null;
  brand: string | null;
  model: string | null;
  colors: string[];
  sizes: string[];
  source: string;         // ex. "Collection ZAYROVI", "SHEIN", "Amazon"
  sourceUrl: string;      // page produit (ou page interne)
  image: string;
  images?: string[];      // miniatures de repli si la source bloque l'image principale
  price: number | null;   // prix source (null si inconnu — jamais deviné)
  currency: string | null;
  priceTnd: number | null; // estimation "tout inclus" via le calculator ZAYROVI
  /**
   * VÉRITÉ MARCHANDE (02/10/2026) — d'où vient `price` :
   *  'merchant' : lu sur la page produit derrière le lien (JSON-LD, meta, variante) ;
   *  'search'   : extrait SerpApi, en attendant la lecture de la page.
   */
  priceOrigin?: 'merchant' | 'search';
  /** Prix barré publié par le marchand (strictement > price), jamais déduit. */
  originalPrice?: number | null;
  /** Le même prix barré, passé par le calculateur ZAYROVI (tout inclus). */
  originalPriceTnd?: number | null;
  /**
   * PREUVE D'ACHAT (02/10/2026) — la page marchande a-t-elle été lue, et que
   * dit-elle du stock par variante ? Une fiche sans cette preuve n'atteint pas
   * le client : on ne montre pas ce qu'on ne peut pas acheter.
   */
  sourceRead?: { at: string; variantsAvailable: number; variantsAvailableWithColor?: number; variantsUnavailable: number; variantsUnknown: number } | null;
  priceToken?: string | null;
  priceVerificationStatus?: 'VERIFIED' | 'PENDING_MANUAL';
  /** Preuve de disponibilité marchand (niveaux de confiance 24/09/2026). */
  availability?: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  /**
   * État du produit TEL QUE LA SOURCE L'ÉCRIT (ex. « New », « Refurbished »).
   * Il prime sur toute détection par mots-clés : ce que le marchand affirme
   * vaut mieux que ce que nous devinons dans son titre.
   */
  sourceCondition?: string | null;
  rating?: number | null; // 0..5 : note marchand si fournie, sinon qualité du match ZAYROVIX
  ratingCount?: number | null;
  ratingKind?: 'merchant' | 'match';
  match: number;          // 0..99, score de correspondance déterministe
  /** GLOBAL DISCOVERY — un même produit trouvé chez plusieurs sources du web mondial
   *  devient UN candidat avec plusieurs offres (jamais quatre doublons à la suite). */
  offerCount?: number;
  offers?: Array<{
    source: string;
    sourceUrl: string;
    price: number | null;
    currency: string | null;
    priceTnd: number | null;
    promo?: ZayrovixPromo | null;
  }>;
}

export interface ZayrovixVariantOption {
  id: string | null;
  label: string;
  size: string | null;
  color: string | null;
  /** Eligible for a variant-specific choice; not a live stock guarantee. */
  available: boolean;
  /**
   * Stock RÉELLEMENT établi pour cette variante (25/09/2026).
   * Trois états honnêtes : `available` = offre marchande constatée,
   * `unavailable` = rupture constatée, `unknown` = la source ne dit rien.
   * `unknown` n'est JAMAIS promu en `available`, ni par le client ni par le serveur.
   */
  availability?: 'available' | 'unavailable' | 'unknown';
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  priceToken?: string | null;
}

/** Promo moteur (management 23/09/2026) : prix remisé + original barré + badge. */
export interface ZayrovixPromo {
  percent: number;
  label: string;
  priceTnd: number;
  originalPriceTnd: number;
}

/** Fiche produit confirmée, prête pour le Calculator puis le panier. */
export interface ZayrovixProduct {
  title: string;
  brand: string | null;
  model: string | null;
  description: string;
  image: string;
  images: string[];
  /** Images par couleur (clé = couleur minuscule) — 24/09/2026. */
  colorImages?: Record<string, string[]> | null;
  source: string;
  sourceUrl: string;
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  exchangeRate: number | null;
  /** Prix barré publié par le marchand sur sa fiche (strictement > price). */
  originalPrice?: number | null;
  originalPriceTnd?: number | null;
  /** Promo du jour appliquée par le serveur (prix déjà remisé, original conservé). */
  promo?: ZayrovixPromo | null;
  colors: string[];
  /** Merchant-published option values for the primary variant attribute (size, storage, volume…). */
  sizes: string[];
  /** Display label for `sizes` when a merchant exposes non-clothing options. */
  optionLabel?: string | null;
  variantOptions?: ZayrovixVariantOption[];
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  /** Timestamp of the exact merchant-page fetch that supplied availability. */
  availabilityCheckedAt?: string | null;
  /** Expiration of the server's source-backed stock contract. */
  availabilityExpiresAt?: string | null;
  priceVerified?: boolean;
  priceVerificationStatus?: 'VERIFIED' | 'PENDING_MANUAL';
  priceToken?: string | null;
  verificationProvider?: string;
  verificationMethod?: string;
  verificationFailureCode?: string | null;
  rating?: number | null;
  ratingCount?: number | null;
  ratingKind?: 'merchant' | 'match' | 'listing-quality';
}

export interface ZayrovixDetectedPrice {
  sourcePrice: number;
  sourceCurrency: string;
  convertedPriceTND: number | null;
  serviceFeeTND: number | null;
  estimatedShippingTND: number | null;
  totalPriceTND: number | null;
  title: string;
  brand: string | null;
  isCartScreenshot: boolean;
  imageUrl: string | null;
  priceToken?: string | null;
}

export interface ZayrovixAnalyzeImageResponse {
  identification: ZayrovixIdentification;
  query: string;
  candidates: ZayrovixCandidate[];
  eventId: string;
  detectedPrice?: ZayrovixDetectedPrice | null;
  message?: string;
}

export interface ZayrovixAnalyzeUrlResponse {
  product: ZayrovixProduct;
  alternates: ZayrovixCandidate[];
  eventId: string;
  fallback?: boolean;
}
