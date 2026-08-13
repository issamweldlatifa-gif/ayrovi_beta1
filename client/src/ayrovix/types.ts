/** AYROVIX — contrats client (miroir 1:1 de src/ayrovix/types.ts). */

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
}

export interface AyrovixCandidate {
  id: string;
  kind: 'catalog' | 'external';
  title: string;
  brand: string | null;
  model: string | null;
  colors: string[];
  sizes: string[];
  source: string;
  sourceUrl: string;
  image: string;
  images?: string[];
  price: number | null;
  currency: string | null;
  priceTnd: number | null;
  match: number;
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
}

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

/** Charge utile transmise au Calculator/panier AYROVI existant (aucun flow modifié). */
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
  quantity: number;
}
