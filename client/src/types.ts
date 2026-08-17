export type StoreType = 'amazon' | 'shein' | 'temu' | 'aliexpress' | 'generic';

export interface ProductVariants {
  sizes?: string[];
  colors?: string[];
  styles?: string[];
  options?: string[];
}

export interface ScrapedProduct {
  id: string;
  store: StoreType;
  storeName: string;
  url: string;
  externalId: string | null;
  title: string;
  description: string | null;
  images: string[];
  mainImage: string;
  sourcePrice: number;
  sourceCurrency: string;
  convertedPriceTND: number;
  estimatedShippingTND: number;
  serviceFeeTND: number;
  totalPriceTND: number;
  variants: ProductVariants;
  selectedVariant?: string | null;
  availability: 'in_stock' | 'limited' | 'out_of_stock' | 'unknown';
  brand: string | null;
  scrapedAt: string;
}

export interface AddToCartResult {
  totalTND: number;
  itemCount: number;
}

export interface AddToCartPayload {
  store: StoreType;
  externalId: string | null;
  url: string;
  title: string;
  imageUrl: string;
  sourcePrice: number;
  sourceCurrency: string;
  priceTND: number;
  variant?: string;
  requestedSize?: string;
  requestedColor?: string;
  customerNote?: string;
  referenceUrl?: string;
  priceVerificationStatus?: 'VERIFIED' | 'PENDING_MANUAL';
  priceToken?: string;
  quantity: number;
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
  lineTotalTND?: number;
  pricingVersion?: number;
  convertedPriceTND?: number;
  customsFeeTND?: number;
  shippingFeeTND?: number;
  serviceFeeTND?: number;
  expressFeeTND?: number;
  discountTND?: number;
  variant: string | null;
  requestedSize: string;
  requestedColor: string;
  customerNote: string;
  referenceUrl: string;
  priceVerificationStatus: 'VERIFIED' | 'PENDING_MANUAL';
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInfo {
  name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  paymentMethod: string;
  latitude?: number | null;
  longitude?: number | null;
  termsAccepted: boolean;
  locale: 'fr-TN' | 'ar-TN';
}

export interface OrderResult {
  orderNumber: string;
  customer: CustomerInfo;
  totalTND: number;
  itemCount: number;
  message: string;
  orderId?: string;
  trackingCode?: string;
  invoice?: { number: string; generated: boolean };
  breakdown?: {
    subtotalTnd: number;
    customsTnd: number;
    shippingTnd: number;
    serviceTnd: number;
    expressTnd: number;
    discountTnd: number;
    totalTnd: number;
  };
  deposit?: {
    percent: number;
    amountTnd: number;
    balanceTnd: number;
    method: string;
    status: string;
  } | null;
}

export interface CustomerAccount {
  id: string;
  displayName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string;
  emailVerified: boolean;
  phoneVerified: boolean;
  status: 'ACTIVE' | 'BLOCKED' | 'DELETED';
  locale: string;
  marketingOptIn: boolean;
}

export interface CustomerSession {
  account: CustomerAccount;
  csrfToken: string;
}

export interface CustomerAddress {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  governorate: string;
  city: string;
  postal_code: string;
  address_line: string;
  delivery_notes: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}
