export type StoreType = 'amazon' | 'shein' | 'temu' | 'aliexpress' | 'generic';

export interface ProductVariantDetail {
  id?: string | null;
  label: string;
  size?: string | null;
  color?: string | null;
  available: boolean;
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
  rating?: number | null;
  reviewsCount?: number | null;
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
  quantity?: number;
}
