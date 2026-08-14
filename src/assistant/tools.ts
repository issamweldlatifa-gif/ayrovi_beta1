import { createHash, randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import type { CustomerIdentity } from '../customer/auth';
import { calculatePrice } from '../services/pricing';
import { createAyrovixPriceToken, type AyrovixQuoteStatus } from '../ayrovix/priceQuote';
import { anthropicExternalSearch, catalogSearch, scoreCandidate } from '../ayrovix/services/search';
import type { AyrovixCandidate } from '../ayrovix/types';

export type AssistantToolName = 'get_order_status' | 'calculate_price' | 'search_products' | 'escalate_to_human';

export interface AssistantConversationLine {
  role: 'user' | 'assistant';
  text: string;
}

export interface AssistantToolContext {
  db: QatafoDatabase;
  customer: CustomerIdentity | null;
  sessionId: string;
  conversationId: string;
  messages: AssistantConversationLine[];
}

export interface AssistantToolExecution {
  modelResult: Record<string, any>;
  presentation?: Record<string, any>;
}

export const ASSISTANT_TOOLS = [
  {
    name: 'get_order_status',
    description: 'Retrieve real AYROVI order status. For guests, both order_id and the matching delivery phone are required. Never guess an order status.',
    input_schema: {
      type: 'object',
      properties: {
        order_id: { type: 'string', description: 'AYROVI order number or internal order id. May be omitted only for a signed-in customer asking for recent orders.' },
        phone: { type: 'string', description: 'Delivery phone used on the order. Required for guests.' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'calculate_price',
    description: 'Calculate the real AYROVI all-inclusive TND price with the current backend pricing rules. Always use this tool for exchange rates, totals or fees.',
    input_schema: {
      type: 'object',
      properties: {
        product_price: { type: 'number', description: 'Unit product price in the source currency.' },
        currency: { type: 'string', enum: ['TND', 'EUR', 'USD', 'GBP', 'JPY'] },
        quantity: { type: 'integer', minimum: 1, maximum: 99 },
        express: { type: 'boolean' },
      },
      required: ['product_price', 'currency'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_products',
    description: 'Search real available AYROVI catalogue products and direct merchant references. Always use this tool before naming or offering products.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Precise product search query, brand, model or product code.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'escalate_to_human',
    description: 'Create a real support ticket for a sensitive, unresolved or complex request. If the visitor is not signed in, collect a phone or email first.',
    input_schema: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Concise reason for escalation.' },
        contact: { type: 'string', description: 'Visitor phone or email. Optional for a signed-in customer.' },
        priority: { type: 'string', enum: ['NORMAL', 'HIGH'] },
      },
      required: ['reason'],
      additionalProperties: false,
    },
  },
] as const;

const ORDER_LABELS: Record<string, string> = {
  NEW: 'Reçue', CONFIRMED: 'Confirmée', PAYMENT_PENDING: 'Acompte en attente', PAID: 'Payée',
  PURCHASING: 'Achat en cours', PURCHASED: 'Achetée', IN_TRANSIT: 'En transit', ARRIVED: 'Arrivée en Tunisie',
  OUT_FOR_DELIVERY: 'En cours de livraison', DELIVERED: 'Livrée', CANCELLED: 'Annulée',
};

function cleanText(value: unknown, max: number): string {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizedPhone(value: unknown): string {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('00216')) digits = digits.slice(5);
  else if (digits.startsWith('216') && digits.length === 11) digits = digits.slice(3);
  return /^[24579]\d{7}$/.test(digits) ? digits : '';
}

function validContact(value: unknown): string {
  const text = cleanText(value, 160);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(text)) return text;
  return normalizedPhone(text) ? text : '';
}

function publicOrder(db: QatafoDatabase, row: any) {
  const delivery = db.get<any>('SELECT status,expected_at,carrier,tracking_number FROM deliveries WHERE order_id=?', row.id);
  const history = db.all<any>('SELECT to_status,created_at FROM order_status_history WHERE order_id=? ORDER BY created_at DESC LIMIT 5', row.id);
  return {
    orderId: row.order_number,
    status: row.status,
    statusLabel: ORDER_LABELS[row.status] || row.status,
    paymentStatus: row.payment_status,
    depositStatus: row.deposit_status,
    trackingCode: row.tracking_code || delivery?.tracking_number || '',
    carrier: delivery?.carrier || '',
    expectedAt: delivery?.expected_at || null,
    updatedAt: row.updated_at,
    history: history.map((item) => ({
      status: item.to_status,
      label: ORDER_LABELS[item.to_status] || item.to_status,
      at: item.created_at,
    })),
  };
}

function getOrderStatus(input: any, context: AssistantToolContext): AssistantToolExecution {
  const requestedId = cleanText(input?.order_id, 120);
  if (!requestedId) {
    if (!context.customer) {
      return { modelResult: { success: false, code: 'ORDER_AND_PHONE_REQUIRED', message: 'Demandez le numéro de commande AYROVI et le téléphone de livraison.' } };
    }
    const orders = context.db.all<any>('SELECT * FROM orders WHERE account_id=? ORDER BY created_at DESC LIMIT 5', context.customer.id);
    if (!orders.length) return { modelResult: { success: true, orders: [], message: 'Aucune commande trouvée sur ce compte.' }, presentation: { orders: [] } };
    const data = orders.map((row) => publicOrder(context.db, row));
    return { modelResult: { success: true, orders: data }, presentation: { orders: data } };
  }

  const row = context.db.get<any>('SELECT * FROM orders WHERE id=? OR UPPER(order_number)=UPPER(?) LIMIT 1', requestedId, requestedId);
  if (!row) return { modelResult: { success: false, code: 'ORDER_NOT_FOUND', message: 'Commande introuvable. Vérifiez la référence.' } };
  const ownedByAccount = Boolean(context.customer && row.account_id === context.customer.id);
  if (context.customer && !ownedByAccount) {
    return { modelResult: { success: false, code: 'NOT_ORDER_OWNER', message: 'Cette commande n’est pas associée au compte connecté. Ne révélez aucune donnée.' } };
  }
  const suppliedPhone = normalizedPhone(input?.phone);
  const phoneMatches = Boolean(suppliedPhone && suppliedPhone === normalizedPhone(row.phone));
  if (!ownedByAccount && !phoneMatches) {
    return {
      modelResult: {
        success: false,
        code: suppliedPhone ? 'ORDER_NOT_FOUND_OR_PHONE_MISMATCH' : 'PHONE_REQUIRED',
        message: suppliedPhone
          ? 'La référence ou le téléphone ne correspond pas. Ne révélez aucune donnée de commande.'
          : 'Demandez le téléphone de livraison pour vérifier la propriété de la commande.',
      },
    };
  }
  const order = publicOrder(context.db, row);
  return { modelResult: { success: true, order }, presentation: { order } };
}

function calculateRealPrice(input: any, context: AssistantToolContext): AssistantToolExecution {
  const price = Number(input?.product_price);
  const currency = cleanText(input?.currency, 3).toUpperCase();
  const quantity = input?.quantity == null ? 1 : Number(input.quantity);
  const express = input?.express === true;
  if (!Number.isFinite(price) || price <= 0 || price > 1_000_000 || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
    return { modelResult: { success: false, code: 'INVALID_PRICE_INPUT', message: 'Prix ou quantité invalide.' } };
  }
  const breakdown = calculatePrice(context.db.getPricingRules(), price, currency, { quantity, express });
  if (!breakdown) return { modelResult: { success: false, code: 'UNSUPPORTED_CURRENCY', message: 'Devise non prise en charge.' } };
  return { modelResult: { success: true, breakdown }, presentation: { breakdown } };
}

function quoteCandidate(candidate: AyrovixCandidate): AyrovixCandidate {
  const status: AyrovixQuoteStatus = candidate.kind === 'catalog' ? 'VERIFIED' : 'PENDING_MANUAL';
  return {
    ...candidate,
    priceVerificationStatus: status,
    priceToken: candidate.price != null && candidate.currency
      ? createAyrovixPriceToken({ price: candidate.price, currency: candidate.currency, title: candidate.title, referenceUrl: candidate.sourceUrl, status })
      : null,
  };
}

async function searchRealProducts(input: any, context: AssistantToolContext): Promise<AssistantToolExecution> {
  const query = cleanText(input?.query, 200);
  if (query.length < 2) return { modelResult: { success: false, code: 'SEARCH_QUERY_REQUIRED', message: 'Demandez une description plus précise du produit.' } };
  const local = catalogSearch(context.db, null, query, 5)
    .map((candidate) => ({ ...candidate, match: scoreCandidate(null, query, candidate) }));
  const external = await anthropicExternalSearch(query, 6).catch(() => []);
  const seen = new Set<string>();
  const candidates = [...local, ...external]
    .map((candidate) => ({ ...candidate, match: scoreCandidate(null, query, candidate) }))
    .filter((candidate) => {
      const key = `${candidate.sourceUrl}|${candidate.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.match - left.match)
    .slice(0, 8)
    .map(quoteCandidate);
  const modelItems = candidates.map(({ priceToken: _token, images: _images, ...candidate }) => candidate);
  return {
    modelResult: {
      success: true,
      query,
      products: modelItems,
      instruction: candidates.length
        ? 'Present these real results only. External stock and price may require opening the merchant page. The UI displays product cards.'
        : 'No real matching product was found. Do not invent alternatives.',
    },
    presentation: { query, products: candidates },
  };
}

function escalateToHuman(input: any, context: AssistantToolContext): AssistantToolExecution {
  const reason = cleanText(input?.reason, 1000);
  if (reason.length < 5) return { modelResult: { success: false, code: 'ESCALATION_REASON_REQUIRED', message: 'Précisez la raison du transfert.' } };
  const contact = validContact(input?.contact) || validContact(context.customer?.phone) || validContact(context.customer?.email);
  if (!context.customer && !contact) return { modelResult: { success: false, code: 'CONTACT_REQUIRED', message: 'Demandez au visiteur un numéro tunisien ou un e-mail valide avant de créer le ticket.' } };
  // Conversation ownership is server-derived; never trust a model-supplied identifier.
  const conversationId = context.conversationId;
  const guestHash = context.customer ? '' : createHash('sha256').update(context.sessionId).digest('hex');
  const ownerWhere = context.customer ? 'account_id=?' : 'guest_session_hash=?';
  const ownerValue = context.customer?.id || guestHash;
  const existing = context.db.get<any>(`SELECT * FROM assistant_support_tickets
    WHERE conversation_id=? AND ${ownerWhere} AND status IN ('PENDING','IN_PROGRESS') ORDER BY created_at DESC LIMIT 1`, conversationId, ownerValue);
  if (existing) {
    const ticket = { id: existing.id, status: existing.status, createdAt: existing.created_at, duplicate: true };
    return { modelResult: { success: true, ticket }, presentation: { ticket } };
  }
  const priority = input?.priority === 'HIGH' ? 'HIGH' : 'NORMAL';
  const contextExcerpt = context.messages.slice(-8).map((line) => `${line.role === 'user' ? 'Client' : 'AYROVI'}: ${cleanText(line.text, 700)}`).join('\n').slice(0, 5000);
  const id = `assistant_ticket_${randomUUID()}`;
  const now = new Date().toISOString();
  context.db.run(`INSERT INTO assistant_support_tickets
    (id,conversation_id,account_id,guest_session_hash,contact,reason,context_excerpt,status,priority,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,'PENDING',?,?,?)`,
  id, conversationId, context.customer?.id || null, guestHash, contact, reason, contextExcerpt, priority, now, now);
  context.db.run(`INSERT INTO admin_notifications (id,type,title,message,action_url,created_at)
    VALUES (?,'SYSTEM',?,?,?,?)`, `notification_${randomUUID()}`, 'Nouvelle demande de support IA',
  reason.slice(0, 220), `/admin?section=assistant-support&ticket=${encodeURIComponent(id)}`, now);
  const ticket = { id, status: 'PENDING', priority, createdAt: now, duplicate: false };
  return { modelResult: { success: true, ticket }, presentation: { ticket } };
}

export async function executeAssistantTool(
  name: string,
  input: any,
  context: AssistantToolContext,
): Promise<AssistantToolExecution> {
  if (name === 'get_order_status') return getOrderStatus(input, context);
  if (name === 'calculate_price') return calculateRealPrice(input, context);
  if (name === 'search_products') return searchRealProducts(input, context);
  if (name === 'escalate_to_human') return escalateToHuman(input, context);
  return { modelResult: { success: false, code: 'UNKNOWN_TOOL', message: 'Outil non reconnu.' } };
}
