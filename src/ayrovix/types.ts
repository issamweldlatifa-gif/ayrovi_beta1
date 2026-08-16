/**
 * AYROVIX — contrats partagés côté serveur.
 * Claude Vision identifie le produit et lit uniquement un prix réellement visible;
 * Claude Web Search découvre des pages, sans devenir la source du prix marchand.
 */

/** Données structurées extraites de l'image par Claude Vision. */
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
  products?: Array<{ name: string; brand: string | null; category: string; price: number | null; currency: string | null }>;
  url?: string | null;
  seller?: string | null;
}

export type AyrovixChannel = 'image' | 'url' | 'qr';

/** Un candidat produit proposé à l'utilisateur pour confirmation humaine. */
export interface AyrovixCandidate {
  id: string;
  kind: 'catalog' | 'external';
  title: string;
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
  rating?: number | null; // 0..5 : note marchand si fournie, sinon qualité du match AYROVIX
  ratingCount?: number | null;
  ratingKind?: 'merchant' | 'match';
  match: number;          // 0..99, score de correspondance déterministe
}

export interface AyrovixVariantOption {
  id: string | null;
  label: string;
  size: string | null;
  color: string | null;
  available: boolean;
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  priceToken?: string | null;
}

/** Fiche produit confirmée, prête pour le Calculator puis le panier. */
export interface AyrovixProduct {
  title: string;
  brand: string | null;
  model: string | null;
  description: string;
  image: string;
  images: string[];
  source: string;
  sourceUrl: string;
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  exchangeRate: number | null;
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
