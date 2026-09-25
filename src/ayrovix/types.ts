/**
 * AYROVIX — contrats partagés côté serveur.
 * AI Core fournit l'analyse visuelle et découvre des pages; AYROVIX reste
 * propriétaire de la validation et de la vérité marchande.
 */

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

/** Données structurées extraites de l'image puis validées par AYROVIX. */
export interface AyrovixIdentification {
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
  products?: AyrovixDetectedProductItem[];
  url?: string | null;
  seller?: string | null;
}

export type AyrovixChannel = 'image' | 'url' | 'qr' | 'text';

/** Un candidat produit proposé à l'utilisateur pour confirmation humaine. */
export interface AyrovixCandidate {
  id: string;
  kind: 'catalog' | 'external';
  title: string;
  /** Promo du jour côté serveur (management 23/09/2026) — prix déjà remisé. */
  promo?: AyrovixPromo | null;
  /** Optional descriptive text supplied by the merchant/search provider. */
  description?: string | null;
  brand: string | null;
  model: string | null;
  colors: string[];
  sizes: string[];
  source: string;         // ex. "Collection AYROVI", "SHEIN", "Amazon"
  sourceUrl: string;      // page produit (ou page interne)
  image: string;
  images?: string[];      // miniatures de repli si la source bloque l'image principale
  price: number | null;   // prix source (null si inconnu — jamais deviné)
  currency: string | null;
  priceTnd: number | null; // estimation "tout inclus" via le calculator AYROVI
  priceToken?: string | null;
  priceVerificationStatus?: 'VERIFIED' | 'PENDING_MANUAL';
  /** Preuve de disponibilité marchand (niveaux de confiance 24/09/2026). */
  availability?: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  rating?: number | null; // 0..5 : note marchand si fournie, sinon qualité du match AYROVIX
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

/** Promo moteur (management 23/09/2026) : prix remisé + original barré + badge. */
export interface AyrovixPromo {
  percent: number;
  label: string;
  priceTnd: number;
  originalPriceTnd: number;
}

/** Fiche produit confirmée, prête pour le Calculator puis le panier. */
export interface AyrovixProduct {
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
  /** Promo du jour appliquée par le serveur (prix déjà remisé, original conservé). */
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

export interface AyrovixAnalyzeImageResponse {
  identification: AyrovixIdentification;
  query: string;
  candidates: AyrovixCandidate[];
  eventId: string;
  detectedPrice?: AyrovixDetectedPrice | null;
  message?: string;
}

export interface AyrovixAnalyzeUrlResponse {
  product: AyrovixProduct;
  alternates: AyrovixCandidate[];
  eventId: string;
  fallback?: boolean;
}
