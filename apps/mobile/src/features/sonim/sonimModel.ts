/**
 * Modèle pur de Sonim — normalisation des événements `tool` et des messages
 * sans dépendance à React Native, directement testable sous Vitest.
 */
import type { AssistantAttachment, AssistantState } from '@/api/assistant';

export interface SonimOrderHistoryItem {
  status: string;
  label: string;
  at: string;
}

export interface SonimOrderCard {
  orderId: string;
  statusLabel: string;
  carrier: string;
  trackingCode: string;
  history: SonimOrderHistoryItem[];
}

export interface SonimPriceBreakdown {
  totalTND: number;
  convertedPriceTND: number;
  customsFeeTND: number | null;
  shippingFeeTND: number | null;
  serviceFeeTND: number | null;
  expressFeeTND: number | null;
}

export interface SonimProductCard {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  image: string;
  price: number;
  currency: string;
  priceTnd: number | null;
}

export interface SonimSupportTicket {
  id: string;
}

export interface SonimChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  attachments?: Array<AssistantAttachment & { previewUri: string }>;
  orders?: SonimOrderCard[];
  priceBreakdown?: SonimPriceBreakdown;
  products?: SonimProductCard[];
  supportTicket?: SonimSupportTicket;
  errorText?: string;
}

const isObj = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

const asFinite = (value: unknown): number | null => {
  if (value === null || value === undefined || (typeof value === 'string' && !value.trim())) return null;
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

/** Nettoie les balises markdown superficielles pour une lecture fluide sur mobile. */
export function cleanSonimText(raw: string): string {
  return raw
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseOrderCard(raw: unknown): SonimOrderCard | null {
  if (!isObj(raw)) return null;
  const orderId = asText(raw.orderId || raw.orderNumber || raw.id);
  const statusLabel = asText(raw.statusLabel || raw.status);
  if (!orderId || !statusLabel) return null;
  const historyRaw = Array.isArray(raw.history) ? raw.history : [];
  const history: SonimOrderHistoryItem[] = historyRaw
    .filter(isObj)
    .map((item) => ({
      status: asText(item.status),
      label: asText(item.label || item.status),
      at: asText(item.at),
    }))
    .filter((item) => Boolean(item.label));
  return {
    orderId,
    statusLabel,
    carrier: asText(raw.carrier),
    trackingCode: asText(raw.trackingCode),
    history,
  };
}

function parseBreakdown(raw: unknown): SonimPriceBreakdown | null {
  if (!isObj(raw)) return null;
  const totalTND = asFinite(raw.totalTND);
  const convertedPriceTND = asFinite(raw.convertedPriceTND);
  if (totalTND === null || convertedPriceTND === null) return null;
  return {
    totalTND,
    convertedPriceTND,
    customsFeeTND: asFinite(raw.customsFeeTND),
    shippingFeeTND: asFinite(raw.shippingFeeTND),
    serviceFeeTND: asFinite(raw.serviceFeeTND),
    expressFeeTND: asFinite(raw.expressFeeTND),
  };
}

function parseProductCard(raw: unknown): SonimProductCard | null {
  if (!isObj(raw)) return null;
  const id = asText(raw.id) || asText(raw.sourceUrl);
  const title = asText(raw.title);
  const sourceUrl = asText(raw.sourceUrl);
  const price = asFinite(raw.price);
  const currency = asText(raw.currency).toUpperCase();
  if (!id || !title || !/^https?:\/\//i.test(sourceUrl) || price === null || price <= 0 || !currency) {
    return null;
  }
  const images = Array.isArray(raw.images) ? raw.images.map(asText).filter(Boolean) : [];
  const image = asText(raw.image) || images[0] || '';
  return {
    id,
    title,
    source: asText(raw.source) || 'Boutique',
    sourceUrl,
    image,
    price,
    currency,
    priceTnd: asFinite(raw.priceTnd),
  };
}

/** Applique la charge utile d'un outil serveur au message assistant en cours. */
export function applySonimToolEvent(
  message: SonimChatMessage,
  name: string,
  data: Record<string, unknown>,
): SonimChatMessage {
  const next: SonimChatMessage = { ...message };

  if (name === 'get_order_status') {
    const list: SonimOrderCard[] = [];
    if (isObj(data.order)) {
      const parsed = parseOrderCard(data.order);
      if (parsed) list.push(parsed);
    }
    if (Array.isArray(data.orders)) {
      for (const item of data.orders) {
        const parsed = parseOrderCard(item);
        if (parsed) list.push(parsed);
      }
    }
    if (list.length > 0) next.orders = list;
    return next;
  }

  if (name === 'calculate_price') {
    const parsed = parseBreakdown(data.breakdown ?? data);
    if (parsed) next.priceBreakdown = parsed;
    return next;
  }

  if (name === 'escalate_to_human') {
    const ticketObj = isObj(data.ticket) ? data.ticket : data;
    const id = asText(ticketObj.id || ticketObj.ticketId || ticketObj.reference);
    if (id) next.supportTicket = { id };
    return next;
  }

  const productList: SonimProductCard[] = [];
  if (isObj(data.product)) {
    const single = parseProductCard(data.product);
    if (single) productList.push(single);
  }
  if (Array.isArray(data.products)) {
    for (const item of data.products) {
      const parsed = parseProductCard(item);
      if (parsed && !productList.some((existing) => existing.sourceUrl === parsed.sourceUrl)) {
        productList.push(parsed);
      }
    }
  }
  if (productList.length > 0) {
    next.products = productList.slice(0, 6);
  }
  return next;
}

export function sonimStateTranslationKey(state: AssistantState) {
  switch (state) {
    case 'analyzing':
      return 'sonim.state.analyzing' as const;
    case 'reasoning':
      return 'sonim.state.reasoning' as const;
    case 'creating':
      return 'sonim.state.creating' as const;
    case 'thinking':
    default:
      return 'sonim.state.thinking' as const;
  }
}

export function buildSonimBrowserRoute(sourceUrl: string): string {
  return `/aywebs/browser?url=${encodeURIComponent(sourceUrl)}`;
}
