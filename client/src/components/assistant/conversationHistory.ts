import type { AyrovixProduct } from '../../ayrovix/types';
import { AssistantMessage } from './types';

export interface AssistantConversation {
  id: string;
  title: string;
  messages: AssistantMessage[];
  selectedProduct?: { messageId: string; product: AyrovixProduct; priceVerified: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

const STORAGE_PREFIX = 'ayrovi_assistant_conversations_v1_';
const MAX_CONVERSATIONS = 20;
const MAX_MESSAGES = 60;

const storageKey = (scope?: string | null) => {
  const value = String(scope || '').trim();
  if (!value) return `${STORAGE_PREFIX}guest`;
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${STORAGE_PREFIX}account_${(hash >>> 0).toString(36)}`;
};

const sanitizeMessage = (value: any): AssistantMessage | null => {
  if (!value || !['user', 'assistant'].includes(value.role)) return null;
  const id = String(value.id || '').slice(0, 120);
  const text = String(value.text || '').slice(0, 8_000);
  if (!id || !text) return null;
  return {
    id,
    role: value.role,
    text,
    fromVoice: value.fromVoice === true,
    attachments: Array.isArray(value.attachments)
      ? value.attachments.slice(0, 4).map((item: any) => ({
          id: String(item?.id || '').slice(0, 120),
          name: String(item?.name || 'Pièce jointe').slice(0, 180),
          type: String(item?.type || '').slice(0, 120),
        }))
      : undefined,
    products: Array.isArray(value.products) ? value.products.slice(0, 8) : undefined,
    priceBreakdown: value.priceBreakdown && typeof value.priceBreakdown === 'object' ? value.priceBreakdown : undefined,
    orderStatuses: Array.isArray(value.orderStatuses) ? value.orderStatuses.slice(0, 5) : undefined,
    supportTicket: value.supportTicket && typeof value.supportTicket === 'object' ? value.supportTicket : undefined,
  };
};

const finiteNumber = (value: unknown): number | null => value == null || value === ''
  ? null
  : Number.isFinite(Number(value)) ? Number(value) : null;

const sanitizeSelectedProduct = (value: any): AssistantConversation['selectedProduct'] => {
  const source = value?.product;
  const messageId = String(value?.messageId || '').slice(0, 120);
  const title = String(source?.title || '').trim().slice(0, 240);
  if (!messageId || !title) return null;
  const strings = (items: unknown, limit: number) => Array.isArray(items)
    ? items.map((item) => String(item || '').trim().slice(0, 120)).filter(Boolean).slice(0, limit)
    : [];
  const availability = ['in_stock', 'limited', 'out_of_stock', 'unknown'].includes(source?.availability)
    ? source.availability : 'unknown';
  const product: AyrovixProduct = {
    title,
    brand: source?.brand ? String(source.brand).slice(0, 120) : null,
    model: source?.model ? String(source.model).slice(0, 120) : null,
    description: String(source?.description || '').slice(0, 1000),
    image: String(source?.image || '').slice(0, 4096),
    images: Array.isArray(source?.images)
      ? source.images.map((item: unknown) => String(item || '').trim().slice(0, 4096)).filter(Boolean).slice(0, 8)
      : [],
    source: String(source?.source || '').slice(0, 180),
    sourceUrl: String(source?.sourceUrl || '').slice(0, 4096),
    price: finiteNumber(source?.price),
    currency: source?.currency ? String(source.currency).slice(0, 8) : null,
    priceTnd: finiteNumber(source?.priceTnd),
    exchangeRate: finiteNumber(source?.exchangeRate),
    colors: strings(source?.colors, 30),
    sizes: strings(source?.sizes, 30),
    variantOptions: Array.isArray(source?.variantOptions) ? source.variantOptions.slice(0, 80).map((option: any) => ({
      id: option?.id ? String(option.id).slice(0, 160) : null,
      label: String(option?.label || '').slice(0, 180),
      size: option?.size ? String(option.size).slice(0, 120) : null,
      color: option?.color ? String(option.color).slice(0, 120) : null,
      available: option?.available !== false,
      price: finiteNumber(option?.price),
      currency: option?.currency ? String(option.currency).slice(0, 8) : null,
      priceTnd: finiteNumber(option?.priceTnd),
      priceToken: option?.priceToken ? String(option.priceToken).slice(0, 4096) : null,
    })) : undefined,
    availability,
    priceVerified: source?.priceVerified === true,
    priceVerificationStatus: source?.priceVerificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING_MANUAL',
    priceToken: source?.priceToken ? String(source.priceToken).slice(0, 4096) : null,
  };
  return { messageId, product, priceVerified: value?.priceVerified === true };
};

const sanitizeConversation = (value: any): AssistantConversation | null => {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '').slice(0, 120);
  if (!id) return null;
  const now = new Date().toISOString();
  const messages = Array.isArray(value.messages)
    ? value.messages.map(sanitizeMessage).filter(Boolean).slice(-MAX_MESSAGES) as AssistantMessage[]
    : [];
  return {
    id,
    title: String(value.title || 'Nouvelle conversation').trim().slice(0, 80) || 'Nouvelle conversation',
    messages,
    selectedProduct: sanitizeSelectedProduct(value.selectedProduct),
    createdAt: Number.isFinite(Date.parse(value.createdAt)) ? value.createdAt : now,
    updatedAt: Number.isFinite(Date.parse(value.updatedAt)) ? value.updatedAt : now,
  };
};

export const listAssistantConversations = (scope?: string | null): AssistantConversation[] => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(scope)) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(sanitizeConversation)
      .filter(Boolean)
      .sort((left, right) => String(right!.updatedAt).localeCompare(String(left!.updatedAt)))
      .slice(0, MAX_CONVERSATIONS) as AssistantConversation[];
  } catch {
    return [];
  }
};

const writeAssistantConversations = (scope: string | null | undefined, conversations: AssistantConversation[]) => {
  try {
    window.localStorage.setItem(storageKey(scope), JSON.stringify(conversations.slice(0, MAX_CONVERSATIONS)));
  } catch {
    // Private browsing and full storage must not prevent the assistant from working.
  }
};

export const saveAssistantConversation = (scope: string | null | undefined, conversation: AssistantConversation) => {
  const sanitized = sanitizeConversation(conversation);
  if (!sanitized || !sanitized.messages.length) return listAssistantConversations(scope);
  const current = listAssistantConversations(scope).filter((item) => item.id !== sanitized.id);
  const next = [sanitized, ...current].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, MAX_CONVERSATIONS);
  writeAssistantConversations(scope, next);
  return next;
};

export const deleteAssistantConversation = (scope: string | null | undefined, id: string) => {
  const next = listAssistantConversations(scope).filter((item) => item.id !== id);
  writeAssistantConversations(scope, next);
  return next;
};
