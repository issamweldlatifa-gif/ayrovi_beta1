export interface AssistantAttachment {
  id: string;
  name: string;
  type: string;
  preview?: string;
}

export interface AssistantPriceBreakdown {
  originalPrice: number;
  currency: string;
  exchangeRate: number;
  convertedPriceTND: number;
  customsFeeTND: number;
  shippingFeeTND: number;
  serviceFeeTND: number;
  expressFeeTND: number;
  totalTND: number;
  pricingVersion: number;
}

export interface AssistantOrderStatus {
  orderId: string;
  status: string;
  statusLabel: string;
  paymentStatus: string;
  depositStatus: string;
  trackingCode: string;
  carrier: string;
  expectedAt: string | null;
  updatedAt: string;
  history: Array<{ status: string; label: string; at: string }>;
}

export interface AssistantSupportTicket {
  id: string;
  status: string;
  priority?: string;
  createdAt: string;
  duplicate?: boolean;
}

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  fromVoice?: boolean;
  attachments?: AssistantAttachment[];
  products?: import('../../ayrovix/types').AyrovixCandidate[];
  priceBreakdown?: AssistantPriceBreakdown;
  orderStatuses?: AssistantOrderStatus[];
  suggestedActions?: Array<{ label: string; prompt: string }>;
  lensSummary?: { confidence: number; verified: boolean; warnings: string[] } | null;
  supportTicket?: AssistantSupportTicket;
}

export type FeedbackValue = 'up' | 'down';
