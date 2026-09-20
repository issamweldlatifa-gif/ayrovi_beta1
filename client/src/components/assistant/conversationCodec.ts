import type { AyrovixCandidate, AyrovixProduct, AyrovixVariantOption } from '../../ayrovix/types';
import type { AssistantMessage, AssistantOrderStatus, AssistantPriceBreakdown } from './types';
import { safePublicHref } from '../../utils/publicLinks';

export interface AssistantConversation {
  id: string;
  title: string;
  messages: AssistantMessage[];
  selectedProduct?: { messageId: string; product: AyrovixProduct; priceVerified: boolean } | null;
  createdAt: string;
  updatedAt: string;
}

// Storage is untrusted input. Reject malformed records instead of coercing objects
// into strings, inventing prices, crashing renderers, or silently shortening text.
const invalid = (): never => { throw new Error('INVALID_CONVERSATION_RECORD'); };
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : invalid();
const text = (value: unknown, fallback = ''): string => value == null ? fallback : typeof value === 'string' ? value : invalid();
const id = (value: unknown): string => { const result = text(value); return result.trim() ? result : invalid(); };
const number = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? value : invalid();
const nullableNumber = (value: unknown): number | null => value == null ? null : number(value);
const nullableText = (value: unknown): string | null => value == null ? null : text(value);
const list = <T,>(value: unknown, decode: (item: unknown) => T): T[] => value == null ? [] : Array.isArray(value) ? value.map(decode) : invalid();
const strings = (value: unknown) => list(value, item => text(item));
const date = (value: unknown): string => { const result = text(value); return Number.isFinite(Date.parse(result)) ? result : invalid(); };
const image = (value: unknown): string => { const result = text(value); return result ? safePublicHref(result) || '' : ''; };
const unique = <T,>(values: T[], key: (value: T) => string): T[] => {
  if (new Set(values.map(key)).size !== values.length) invalid();
  return values;
};
const rating = (source: Record<string, unknown>) => ({
  rating: nullableNumber(source.rating), ratingCount: nullableNumber(source.ratingCount),
  ratingKind: source.ratingKind === 'merchant' ? 'merchant' as const : source.ratingKind === 'listing-quality' ? 'listing-quality' as const : 'match' as const,
});

function candidate(value: unknown): AyrovixCandidate {
  const source = object(value);
  return {
    id: id(source.id), kind: source.kind === 'catalog' ? 'catalog' : 'external',
    title: text(source.title), brand: nullableText(source.brand), model: nullableText(source.model),
    colors: strings(source.colors), sizes: strings(source.sizes), source: text(source.source), sourceUrl: text(source.sourceUrl),
    image: image(source.image), images: list(source.images, image),
    price: nullableNumber(source.price), currency: nullableText(source.currency), priceTnd: nullableNumber(source.priceTnd),
    priceToken: nullableText(source.priceToken), priceVerificationStatus: source.priceVerificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING_MANUAL',
    ...rating(source), ratingKind: source.ratingKind === 'merchant' ? 'merchant' : 'match',
    match: source.match == null ? 0 : number(source.match),
  };
}
function variant(value: unknown): AyrovixVariantOption {
  const source = object(value);
  return { id: nullableText(source.id), label: text(source.label), size: nullableText(source.size), color: nullableText(source.color), available: source.available !== false,
    price: nullableNumber(source.price), currency: nullableText(source.currency), priceTnd: nullableNumber(source.priceTnd), priceToken: nullableText(source.priceToken) };
}
function product(value: unknown): AyrovixProduct {
  const source = object(value);
  return {
    title: id(source.title), brand: nullableText(source.brand), model: nullableText(source.model), description: text(source.description),
    image: image(source.image), images: list(source.images, image), source: text(source.source), sourceUrl: text(source.sourceUrl),
    price: nullableNumber(source.price), currency: nullableText(source.currency), priceTnd: nullableNumber(source.priceTnd), exchangeRate: nullableNumber(source.exchangeRate),
    colors: strings(source.colors), sizes: strings(source.sizes), variantOptions: source.variantOptions == null ? undefined : list(source.variantOptions, variant),
    availability: source.availability === 'in_stock' || source.availability === 'out_of_stock' || source.availability === 'limited' ? source.availability : 'unknown',
    priceVerified: source.priceVerified === true, priceVerificationStatus: source.priceVerificationStatus === 'VERIFIED' ? 'VERIFIED' : 'PENDING_MANUAL', priceToken: nullableText(source.priceToken),
    verificationProvider: source.verificationProvider == null ? undefined : text(source.verificationProvider),
    verificationMethod: source.verificationMethod == null ? undefined : text(source.verificationMethod),
    verificationFailureCode: nullableText(source.verificationFailureCode), ...rating(source),
  };
}
function breakdown(value: unknown): AssistantPriceBreakdown {
  const source = object(value);
  return { originalPrice: number(source.originalPrice), currency: text(source.currency), exchangeRate: number(source.exchangeRate),
    convertedPriceTND: number(source.convertedPriceTND), customsFeeTND: number(source.customsFeeTND), shippingFeeTND: number(source.shippingFeeTND),
    serviceFeeTND: number(source.serviceFeeTND), expressFeeTND: number(source.expressFeeTND), totalTND: number(source.totalTND), pricingVersion: number(source.pricingVersion) };
}
function order(value: unknown): AssistantOrderStatus {
  const source = object(value);
  return { orderId: id(source.orderId), status: text(source.status), statusLabel: text(source.statusLabel), paymentStatus: text(source.paymentStatus), depositStatus: text(source.depositStatus),
    trackingCode: text(source.trackingCode), carrier: text(source.carrier), expectedAt: source.expectedAt == null ? null : date(source.expectedAt), updatedAt: date(source.updatedAt),
    history: list(source.history, item => { const entry = object(item); return { status: text(entry.status), label: text(entry.label), at: date(entry.at) }; }) };
}
function message(value: unknown): AssistantMessage {
  const source = object(value);
  if (source.role !== 'assistant' && source.role !== 'user') invalid();
  const lens = source.lensSummary == null ? null : object(source.lensSummary);
  const ticket = source.supportTicket == null ? null : object(source.supportTicket);
  return {
    id: id(source.id), role: source.role as AssistantMessage['role'], text: text(source.text), fromVoice: source.fromVoice === true, incomplete: typeof source.incomplete === 'boolean' ? source.incomplete : undefined,
    // Deliberately metadata-only: never persist private image bytes or blob/data URLs.
    attachments: source.attachments == null ? undefined : list(source.attachments, item => { const attachment = object(item); return { id: id(attachment.id), name: text(attachment.name), type: text(attachment.type) }; }),
    products: source.products == null ? undefined : unique(list(source.products, candidate), item => item.id),
    priceBreakdown: source.priceBreakdown == null ? undefined : breakdown(source.priceBreakdown),
    orderStatuses: source.orderStatuses == null ? undefined : unique(list(source.orderStatuses, order), item => item.orderId),
    suggestedActions: source.suggestedActions == null ? undefined : list(source.suggestedActions, item => { const action = object(item); return { label: id(action.label), prompt: id(action.prompt) }; }),
    lensSummary: lens ? { confidence: number(lens.confidence), verified: lens.verified === true, warnings: strings(lens.warnings) } : null,
    supportTicket: ticket ? { id: id(ticket.id), status: text(ticket.status), priority: ticket.priority == null ? undefined : text(ticket.priority), createdAt: date(ticket.createdAt), duplicate: ticket.duplicate === true } : undefined,
  };
}

/** Entire known content is round-tripped. Quota limits belong to storage, not prose. */
export function decodeConversation(value: unknown): AssistantConversation {
  const source = object(value);
  const messages = unique(list(source.messages, message), item => item.id);
  const selection = source.selectedProduct == null ? null : object(source.selectedProduct);
  const selectedProduct = selection ? { messageId: id(selection.messageId), product: product(selection.product), priceVerified: selection.priceVerified === true } : null;
  if (selectedProduct && !messages.some(item => item.id === selectedProduct.messageId && item.role === 'assistant')) invalid();
  return { id: id(source.id), title: text(source.title), messages, selectedProduct, createdAt: date(source.createdAt), updatedAt: date(source.updatedAt) };
}
