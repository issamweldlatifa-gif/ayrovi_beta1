/** AYROVIX — contrats client (miroir 1:1 de src/ayrovix/types.ts). */

export interface AyrovixDetectedProductItem {
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

export interface AyrovixPricingBlock {
  sale_price: number | null;
  original_price: number | null;
  shipping_price: number | null;
  total_price: number | null;
  currency: string | null;
  discount_percent: number | null;
}

export interface AyrovixIdentification {
  input_kind: 'product_photo' | 'product_screenshot' | 'cart_screenshot' | 'barcode' | 'other';
  category: string;
  brand: string | null;
  model: string | null;
  color: string[];
  visible_text: string[];
  possible_model_codes: string[];
  description: string;
  confidence: number;
  detected_price: {
    amount: number;
    currency: string;
    label: 'none' | 'product_price' | 'old_price' | 'cart_total';
    confidence: number;
  };
  pricing?: AyrovixPricingBlock;
  products?: AyrovixDetectedProductItem[];
  url?: string | null;
  seller?: string | null;
}

/** Promo moteur (management 23/09/2026) : prix remisé + original barré + badge. */
export interface AyrovixPromo {
  percent: number;
  label: string;
  priceTnd: number;
  originalPriceTnd: number;
}

export interface AyrovixCandidate {
  id: string;
  kind: 'catalog' | 'external';
  title: string;
  /** Promo du jour côté serveur — prix déjà remisé, original conservé. */
  promo?: AyrovixPromo | null;
  /** Optional descriptive text supplied by the merchant/search provider. */
  description?: string | null;
  brand: string | null;
  model: string | null;
  colors: string[];
  sizes: string[];
  source: string;
  sourceUrl: string;
  image: string;
  images?: string[];
  /** Jeu d'images PAR COULEUR (24/09/2026) — le swatch change toute la galerie. */
  colorImages?: Record<string, string[]> | null;
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  priceToken?: string | null;
  priceVerificationStatus?: 'VERIFIED' | 'PENDING_MANUAL';
  /** Preuve de disponibilité marchand (niveaux de confiance 24/09/2026). */
  availability?: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  rating?: number | null;
  ratingCount?: number | null;
  ratingKind?: 'merchant' | 'match';
  match: number;
  /** GLOBAL DISCOVERY — un même produit trouvé chez plusieurs sources du web mondial
   *  devient UN candidat avec plusieurs offres (jamais quatre doublons à la suite). */
  offerCount?: number;
  offers?: Array<{
    source: string;
    sourceUrl: string;
    price: number | null;
    currency: string | null;
    priceTnd: number | null;
    promo?: AyrovixPromo | null;
  }>;
}

export interface AyrovixVariantOption {
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

export interface AyrovixProduct {
  title: string;
  brand: string | null;
  model: string | null;
  description: string;
  image: string;
  images: string[];
  /** Jeu d'images PAR COULEUR (24/09/2026) — le swatch change toute la galerie. */
  colorImages?: Record<string, string[]> | null;
  source: string;
  sourceUrl: string;
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  exchangeRate: number | null;
  promo?: AyrovixPromo | null;
  colors: string[];
  sizes: string[];
  variantOptions?: AyrovixVariantOption[];
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
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

export interface AyrovixDetectedPrice {
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

export interface AyrovixImageResult {
  identification: AyrovixIdentification;
  query: string;
  candidates: AyrovixCandidate[];
  eventId: string;
  detectedPrice?: AyrovixDetectedPrice | null;
  message?: string;
}

export interface AyrovixUrlResult {
  product: AyrovixProduct;
  alternates: AyrovixCandidate[];
  eventId: string;
  fallback?: boolean;
}

export interface AyrovixReviewRequest {
  id: string;
  status: 'PENDING' | 'IN_REVIEW' | 'QUOTED' | 'REJECTED' | 'CANCELLED';
  title: string;
  sourceUrl: string;
  imageUrl: string;
  source: string;
  lensPrice: number | null;
  lensCurrency: string | null;
  desiredSize: string;
  desiredColor: string;
  quotedPrice: number | null;
  quotedCurrency: string | null;
  verifiedVariant: string;
  verifiedUrl: string;
  customerMessage: string;
  createdAt: string;
  updatedAt: string;
  duplicate?: boolean;
}

/** Charge utile transmise au Calculator/panier AYROVI existant (aucun flow modifié). */
export interface AyrovixHistoryItem {
  id: string;
  kind: 'image' | 'url' | 'qr' | 'barcode' | 'code' | 'text';
  inputValue: string;
  queryLabel: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
  source: string;
  price: number | null;
  currency: string | null;
  verificationStatus: 'VERIFIED' | 'PENDING_MANUAL';
  resultsCount: number;
  createdAt: string;
}

export interface AyrovixOrderPayload {
  store: 'amazon' | 'shein' | 'temu' | 'aliexpress' | 'generic';
  externalId: string | null;
  url: string;
  title: string;
  imageUrl: string;
  sourcePrice: number;
  sourceCurrency: string;
  /** Ignoré par le serveur (le Calculator recalcule) — fourni pour compatibilité AddToCartPayload. */
  priceTND?: number;
  variant?: string;
  requestedSize?: string;
  requestedColor?: string;
  customerNote?: string;
  referenceUrl?: string;
  priceVerificationStatus: 'VERIFIED' | 'PENDING_MANUAL';
  priceToken: string;
  quantity: number;
}
