/** OCEREX extraction model. No image bytes belong in this contract. */

export type OcerexScreenType = 'PRODUCT' | 'CART' | 'UNKNOWN';

export type OcerexConfidenceLevel = 'HIGH' | 'MEDIUM' | 'LOW';

export type OcerexPriceContext = 'REFERENCE' | 'CART_REFERENCE_TOTAL' | null;

export type OcerexSemanticType =
  | 'PRODUCT_NAME'
  | 'REFERENCE_PRICE'
  | 'DISCOUNTED_PRICE'
  | 'CART_REFERENCE_TOTAL'
  | 'CURRENT_TOTAL'
  | 'DISCOUNT'
  | 'COUPON'
  | 'SHIPPING'
  | 'TAX'
  | 'UNKNOWN';

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
  | 'EXTRACTION_EXPIRED';

export type OcerexCurrencyStatus = 'DETECTED' | 'MISSING' | 'AMBIGUOUS' | 'UNSUPPORTED';

export interface OcerexOcrToken {
  text: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  struck: boolean;
}

export interface OcerexPriceFinding {
  text: string;
  value: number;
  currency: string | null;
  explicitCurrency: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  confidence: number;
  struck: boolean;
  labeledOriginal: boolean;
  semanticType: OcerexSemanticType;
  snippet: string;
}

export interface OcerexDecision {
  type: OcerexScreenType;
  referencePrice: number | null;
  currency: string | null;
  currencyStatus: OcerexCurrencyStatus;
  confidence: number;
  confidenceLevel: OcerexConfidenceLevel;
  priceContext: OcerexPriceContext;
  source: 'OCR';
  productTitle: string | null;
  code: OcerexCode;
  findings: OcerexPriceFinding[];
}

export const OCEREX_EVENTS = [
  'ocerex_opened',
  'ocerex_first_use_completed',
  'ocerex_image_uploaded',
  'ocerex_camera_used',
  'ocerex_ocr_started',
  'ocerex_ocr_success',
  'ocerex_ocr_failed',
  'ocerex_product_detected',
  'ocerex_cart_detected',
  'ocerex_reference_price_detected',
  'ocerex_low_confidence',
  'ocerex_link_submitted',
  'ocerex_price_calculated',
  'ocerex_order_started',
  'ocerex_order_completed',
] as const;

export type OcerexEventName = (typeof OCEREX_EVENTS)[number];
