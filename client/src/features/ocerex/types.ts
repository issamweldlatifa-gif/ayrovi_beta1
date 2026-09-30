export type OcerexScreenType = 'PRODUCT' | 'CART' | 'UNKNOWN';
export type OcerexConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';
export type OcerexCode =
  | 'OK'
  | 'NO_PRICE_FOUND'
  | 'LOW_CONFIDENCE'
  | 'NO_REFERENCE_PRICE'
  | 'UNSUPPORTED_SCREEN'
  | 'INVALID_IMAGE'
  | 'INVALID_URL'
  | 'PROCESSING_ERROR'
  | 'CURRENCY_UNCONFIRMED'
  | 'RESTRICTED'
  | 'EXTRACTION_EXPIRED'
  | 'SESSION_REQUIRED';

export interface OcerexExtraction {
  extractionId: string;
  type: OcerexScreenType | string;
  referencePrice: number | null;
  currency: string | null;
  confidence: number;
  confidenceLevel: OcerexConfidenceLevel | string;
  source: 'OCR';
  priceContext: 'REFERENCE' | 'CART_REFERENCE_TOTAL' | null;
  productTitle: string | null;
  platform: string | null;
  sourceUrl: string | null;
  code: OcerexCode;
  ayroviPrice: number | null;
  pricingVersion: number | null;
  supportedCurrencies: string[];
  resolved?: {
    title: string;
    platform: string;
    url: string;
    imageUrl: string;
  };
}

export type OcerexStage = 'image' | 'read' | 'reference' | 'price';
