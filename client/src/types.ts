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
  availability: 'in_stock' | 'limited' | 'out_of_stock';
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
  variant: string | null;
  quantity: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerInfo {
  name: string;
  phone: string;
  city: string;
  address: string;
  paymentMethod: string;
}

export interface OrderResult {
  orderNumber: string;
  customer: CustomerInfo;
  totalTND: number;
  itemCount: number;
  message: string;
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
