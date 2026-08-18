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

export type CustomerOrderStatus =
  | 'CREATED'
  | 'AWAITING_DEPOSIT'
  | 'AWAITING_PAYMENT_VERIFICATION'
  | 'CONFIRMED'
  | 'PREPARING'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'CANCELLED';

export type CustomerPaymentStatus =
  | 'PENDING'
  | 'PENDING_VERIFICATION'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'FAILED'
  | 'REJECTED'
  | 'REFUNDED';

export type CustomerPaymentMethod = 'PENDING_SELECTION' | 'CARD' | 'BANK_TRANSFER' | 'POSTE';
export type CustomerTransactionStatus = CustomerPaymentStatus;
export type CustomerProofStatus = 'PENDING_VERIFICATION' | 'APPROVED' | 'REJECTED';
export type CustomerInvoiceStatus = 'ISSUED' | 'VOID';
export type CustomerNotificationType = 'GENERAL' | 'ORDER' | 'ACCOUNT' | 'PROMOTION' | 'PAYMENT' | 'PROOF' | 'SHIPPING' | 'INVOICE';

export interface OrderResult {
  orderNumber: string;
  customer: CustomerInfo;
  totalTND: number;
  itemCount: number;
  message: string;
  orderId?: string;
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
    method: CustomerPaymentMethod | string;
    status: CustomerPaymentStatus | string;
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

export interface CustomerOrderSummary {
  id: string;
  order_number: string;
  status: CustomerOrderStatus;
  payment_status: CustomerPaymentStatus;
  payment_method: CustomerPaymentMethod;
  total_tnd: number;
  governorate?: string;
  item_count: number;
  image_url: string | null;
  created_at: string;
}

export interface CustomerAccountOverview {
  account: CustomerAccount;
  counts: {
    orders: number;
    addresses: number;
    favorites: number;
    cartItems: number;
    unreadNotifications: number;
  };
  totalSpent: number;
  recentOrders: CustomerOrderSummary[];
}

export interface CustomerPayment {
  id: string;
  payment_number: string;
  order_id: string;
  order_number: string;
  method: CustomerPaymentMethod;
  status: CustomerPaymentStatus;
  amount_tnd: number;
  currency: string;
  reference: string;
  provider: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerPaymentTransaction {
  id: string;
  transaction_number: string;
  payment_id?: string;
  order_id?: string;
  order_number?: string;
  provider: string;
  provider_reference: string;
  amount_tnd: number;
  currency: string;
  status: CustomerTransactionStatus;
  failure_reason: string;
  confirmed_at: string | null;
  created_at: string;
}

export interface CustomerPaymentProof {
  id: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  transfer_reference: string;
  status: CustomerProofStatus;
  submitted_at: string;
  reviewed_at: string | null;
  rejection_reason: string;
}

export interface CustomerInvoice {
  id: string;
  invoice_number: string;
  order_id?: string;
  order_number?: string;
  status: CustomerInvoiceStatus;
  issued_at: string;
}

export interface CustomerDelivery {
  id: string;
  order_id: string;
  order_number?: string;
  status: CustomerOrderStatus | string;
  delivery_status?: string;
  carrier: string;
  tracking_number: string;
  tracking_url: string;
  shipped_at: string | null;
  expected_at?: string | null;
  delivered_at?: string | null;
}

export interface CustomerOrderItem {
  id: string;
  product_name: string;
  image_url: string;
  quantity: number;
  original_price: number;
  currency: string;
  total_tnd: number;
  created_at: string;
}

export interface CustomerOrderHistoryEntry {
  id: string;
  from_status: string | null;
  to_status: CustomerOrderStatus;
  note: string;
  created_at: string;
}

export interface CustomerOrderDetail extends CustomerOrderSummary {
  address: string;
  phone: string;
  subtotal_tnd: number;
  customs_tnd: number;
  shipping_tnd: number;
  service_tnd: number;
  express_tnd: number;
  discount_tnd: number;
  deposit_percent: number;
  deposit_amount_tnd: number;
  paid_amount_tnd: number;
  remainder_tnd: number;
  items: CustomerOrderItem[];
  history: CustomerOrderHistoryEntry[];
  payment: CustomerPayment | null;
  transactions: CustomerPaymentTransaction[];
  proofs: CustomerPaymentProof[];
  invoice: CustomerInvoice | null;
  delivery: CustomerDelivery | null;
  paymentOptions: {
    choices: Array<'CARD' | 'BANK_TRANSFER' | 'POSTE'>;
    cardGatewayAvailable: boolean;
    transfer: {
      companyName: string;
      bankRib: string;
      posteAccount: string;
      reviewDelay: string;
    };
  };
}

export interface CustomerPaymentsOverview {
  payments: CustomerPayment[];
  transactions: CustomerPaymentTransaction[];
}

export interface CustomerFavorite {
  id: string;
  product_id: string | null;
  source_url: string;
  title: string;
  image_url: string;
  price_tnd: number | null;
  created_at: string;
}

export interface CustomerNotification {
  id: string;
  type: CustomerNotificationType;
  title: string;
  message: string;
  action_url: string;
  read_at: string | null;
  created_at: string;
}

export interface CustomerSecuritySummary {
  emailVerified: boolean;
  phoneVerified: boolean;
  identities: Array<{ provider: 'PHONE' | 'GOOGLE' | 'FACEBOOK'; created_at: string }>;
  activeSessions: number;
  lastLoginAt: string | null;
}

export interface CustomerPreferences {
  account_id: string;
  dark_mode: number;
  order_updates: number;
  payment_updates: number;
  shipping_updates: number;
  invoice_updates: number;
  updated_at?: string;
}

export interface CustomerCardInitiation {
  payUrl: string;
  transactionNumber: string;
  amountTnd: number;
  status: 'PENDING';
}
