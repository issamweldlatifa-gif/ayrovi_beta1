import { createHash, randomUUID } from 'node:crypto';
import type { QatafoDatabase } from '../db/database';
import type { CustomerIdentity } from '../customer/auth';
import type { SmartLinkScraper } from '../scraper/scraper';
import { calculatePrice } from '../services/pricing';
import { createAyrovixPriceToken, type AyrovixQuoteStatus } from '../ayrovix/priceQuote';
import { extractProductFromUrl, sanitizeProductUrl } from '../ayrovix/services/product';
import { anthropicExternalSearch, catalogSearch, scoreCandidate } from '../ayrovix/services/search';
import { serpApiVisualSearch, serpApiVisualSearchUrl } from '../ayrovix/services/visualSearch';
import { scanCodeFromImage, type AyrovixScannedCode } from '../ayrovix/services/codeScanner';
import type { AyrovixCandidate, AyrovixProduct } from '../ayrovix/types';

export type AssistantToolName = 'get_order_status' | 'calculate_price' | 'search_products' | 'lens_search' | 'escalate_to_human';

export interface AssistantImageAttachment {
  id: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  data?: string;
  url?: string;
}

export interface AssistantConversationLine {
  role: 'user' | 'assistant';
  text: string;
  attachments?: AssistantImageAttachment[];
}

export interface AssistantToolContext {
  db: QatafoDatabase;
  scraper: SmartLinkScraper;
  customer: CustomerIdentity | null;
  sessionId: string;
  conversationId: string;
  messages: AssistantConversationLine[];
  imageAttachments: AssistantImageAttachment[];
  webSearchEnabled: boolean;
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
    name: 'lens_search',
    description: 'Run the complete AYROVIX Lens pipeline inside AYROVI: attached-image vision/OCR, Google Lens, product-link extraction, QR/barcode lookup, catalogue and secure quotes. Always pass a pasted merchant link as product_url. Never invent a result.',
    input_schema: {
      type: 'object',
      properties: {
        image_attachment_id: { type: 'string', description: 'Exact id shown beside the attached image.' },
        product_url: { type: 'string', description: 'Exact public product or merchant URL pasted by the customer or decoded from a QR code.' },
        code_value: { type: 'string', description: 'QR text, EAN/UPC/barcode digits or product code visibly decoded from the image.' },
        code_type: { type: 'string', enum: ['qr', 'barcode', 'product_code'] },
        query: { type: 'string', description: 'Precise product description, brand/model or product code extracted from the conversation/image.' },
        detected_title: { type: 'string', description: 'Product title visibly identified in the image, if any.' },
        detected_brand: { type: 'string', description: 'Brand visibly identified in the image, if any.' },
        visible_price: { type: 'number', description: 'Current product price visibly shown in the image. Never use a crossed-out old price.' },
        visible_currency: { type: 'string', enum: ['TND', 'EUR', 'USD', 'GBP', 'JPY'] },
      },
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

function withCalculatedTnd(candidate: AyrovixCandidate, db: QatafoDatabase): AyrovixCandidate {
  if (candidate.priceTnd != null || candidate.price == null || !candidate.currency) return candidate;
  const breakdown = calculatePrice(db.getPricingRules(), candidate.price, candidate.currency);
  return breakdown ? { ...candidate, priceTnd: breakdown.totalTND } : candidate;
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

function quoteProduct(product: AyrovixProduct): AyrovixProduct {
  const status: AyrovixQuoteStatus = product.priceVerified ? 'VERIFIED' : 'PENDING_MANUAL';
  const token = (price: number | null, currency: string | null) => price != null && currency
    ? createAyrovixPriceToken({ price, currency, title: product.title, referenceUrl: product.sourceUrl, status })
    : null;
  return {
    ...product,
    priceVerificationStatus: status,
    priceToken: token(product.price, product.currency),
    variantOptions: product.variantOptions?.map((option) => ({
      ...option,
      priceToken: token(option.price, option.currency),
    })),
  };
}

function modelProduct(product: AyrovixProduct) {
  const { priceToken: _token, images: _images, image: _image, variantOptions, ...safe } = product;
  return {
    ...safe,
    variants: variantOptions?.map(({ priceToken: _variantToken, ...option }) => option).slice(0, 40),
  };
}

function publicProductUrl(raw: unknown): string {
  const safe = sanitizeProductUrl(raw);
  if (!safe) return '';
  try {
    const parsed = new URL(safe);
    return parsed.username || parsed.password ? '' : parsed.toString();
  } catch { return ''; }
}

function productUrlFromText(raw: unknown): string {
  const text = cleanText(raw, 4096);
  const match = text.match(/https?:\/\/[^\s"'<>]+/i)?.[0]?.replace(/[).,;!?]+$/, '');
  return publicProductUrl(match || '');
}

async function searchByCode(value: string, context: AssistantToolContext): Promise<AyrovixCandidate[]> {
  const local = catalogSearch(context.db, null, value, 5)
    .map((candidate) => ({ ...candidate, match: scoreCandidate(null, value, candidate) }));
  const external = context.webSearchEnabled ? await anthropicExternalSearch(value, 8).catch(() => []) : [];
  const seen = new Set<string>();
  return [...local, ...external]
    .map((candidate) => ({ ...candidate, match: scoreCandidate(null, value, candidate) }))
    .filter((candidate) => {
      const key = `${candidate.sourceUrl}|${candidate.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.match - left.match)
    .slice(0, 8)
    .map((candidate) => quoteCandidate(withCalculatedTnd(candidate, context.db)));
}

async function searchRealProducts(input: any, context: AssistantToolContext): Promise<AssistantToolExecution> {
  const query = cleanText(input?.query, 200);
  if (query.length < 2) return { modelResult: { success: false, code: 'SEARCH_QUERY_REQUIRED', message: 'Demandez une description plus précise du produit.' } };
  const local = catalogSearch(context.db, null, query, 5)
    .map((candidate) => ({ ...candidate, match: scoreCandidate(null, query, candidate) }));
  const external = context.webSearchEnabled ? await anthropicExternalSearch(query, 6).catch(() => []) : [];
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
    .map((candidate) => quoteCandidate(withCalculatedTnd(candidate, context.db)));
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

async function lensSearch(input: any, context: AssistantToolContext): Promise<AssistantToolExecution> {
  const latestUser = context.messages.filter((message) => message.role === 'user').at(-1);
  const attachmentId = cleanText(input?.image_attachment_id, 120);
  const attachment = (attachmentId ? context.imageAttachments.find((item) => item.id === attachmentId) : undefined)
    || latestUser?.attachments?.at(-1);
  const rawQuery = cleanText(input?.query || [input?.detected_brand, input?.detected_title].filter(Boolean).join(' '), 220);
  const suppliedCode = cleanText(input?.code_value, 200);
  const possibleUrl = publicProductUrl(input?.product_url)
    || productUrlFromText(input?.product_url)
    || productUrlFromText(rawQuery)
    || productUrlFromText(latestUser?.text);
  // A direct image URL is already an image attachment and belongs to Google
  // Lens, not to the merchant-page extractor.
  const suppliedUrl = attachment?.url && possibleUrl === publicProductUrl(attachment.url) ? '' : possibleUrl;

  let scannedCode: AyrovixScannedCode | null = null;
  if (!suppliedUrl && attachment?.data) {
    // Server-side ZXing is authoritative for uploaded QR/barcodes; model-read
    // code text is only a fallback.
    scannedCode = await scanCodeFromImage(Buffer.from(attachment.data, 'base64'));
  }
  const scannedUrl = scannedCode?.kind === 'url' ? publicProductUrl(scannedCode.value) : '';
  const suppliedCodeUrl = publicProductUrl(suppliedCode) || productUrlFromText(suppliedCode);
  const productUrl = suppliedUrl || scannedUrl || suppliedCodeUrl;
  const urlCameFromQr = Boolean(scannedUrl || (suppliedCodeUrl && input?.code_type === 'qr'));

  if (productUrl) {
    try {
      const extracted = await extractProductFromUrl(context.db, context.scraper, productUrl);
      const product = quoteProduct(extracted.product);
      const products = extracted.alternates.slice(0, 8)
        .map((candidate) => quoteCandidate(withCalculatedTnd(candidate, context.db)));
      return {
        modelResult: {
          success: true,
          mode: urlCameFromQr ? 'qr_url' : 'url',
          product: modelProduct(product),
          alternatives: products.map(({ priceToken: _token, images: _images, image: _image, ...candidate }) => candidate),
          instruction: 'The exact pasted-link product and order form are rendered inside the chat. Ask the customer to confirm the mandatory exact link, variant, quantity and note there; never redirect them to Lens.',
        },
        presentation: { query: product.title, product, products, source: urlCameFromQr ? 'qr' : 'url' },
      };
    } catch {
      return { modelResult: { success: false, code: 'LENS_URL_FAILED', message: 'Le lien produit ne peut pas être analysé. Demandez un lien marchand public complet.' } };
    }
  }

  const codeValue = (scannedCode && scannedCode.kind !== 'url' ? scannedCode.value : '') || suppliedCode;
  if (codeValue) {
    const products = await searchByCode(codeValue, context);
    return {
      modelResult: {
        success: true,
        mode: scannedCode?.kind || cleanText(input?.code_type, 20) || 'product_code',
        code: codeValue,
        products: products.map(({ priceToken: _token, images: _images, image: _image, ...candidate }) => candidate),
        instruction: products.length ? 'Present only these decoded-code results. The UI renders the real product cards.' : 'No real product matched this code. Do not invent one.',
      },
      presentation: { query: codeValue, products, source: scannedCode?.kind || 'code' },
    };
  }

  if (!attachment && rawQuery.length < 2) {
    return { modelResult: { success: false, code: 'LENS_INPUT_REQUIRED', message: 'Demandez une image, un lien ou une description du produit.' } };
  }

  const visual = attachment?.data
    ? await serpApiVisualSearch(Buffer.from(attachment.data, 'base64'), 8).catch(() => [])
    : attachment?.url
      ? await serpApiVisualSearchUrl(attachment.url, 8).catch(() => [])
      : [];
  const query = rawQuery;
  const local = query.length >= 2
    ? catalogSearch(context.db, null, query, 5).map((candidate) => ({ ...candidate, match: scoreCandidate(null, query, candidate) }))
    : [];
  // Text web search remains a fallback after Lens/catalogue, never the visual matcher.
  const external = context.webSearchEnabled && query.length >= 2 && visual.length === 0 && !local.some((candidate) => candidate.match >= 55)
    ? await anthropicExternalSearch(query, 6).catch(() => [])
    : [];

  const visiblePrice = Number(input?.visible_price);
  const visibleCurrency = cleanText(input?.visible_currency, 3).toUpperCase();
  const detectedTitle = cleanText(input?.detected_title || query || 'Produit détecté par AYROVIX', 180);
  const detectedBrand = cleanText(input?.detected_brand, 100) || null;
  const visibleBreakdown = Number.isFinite(visiblePrice) && visiblePrice > 0
    ? calculatePrice(context.db.getPricingRules(), visiblePrice, visibleCurrency)
    : null;
  const detectedProduct: AyrovixProduct | null = visibleBreakdown ? quoteProduct({
    title: detectedTitle,
    brand: detectedBrand,
    model: null,
    description: 'Produit et prix courant lus dans l’image par AYROVI. Le lien marchand exact reste obligatoire.',
    image: visual[0]?.image || '',
    images: visual[0]?.images || [],
    source: 'AYROVIX Vision',
    sourceUrl: '',
    price: visiblePrice,
    currency: visibleCurrency,
    priceTnd: visibleBreakdown.totalTND,
    exchangeRate: visibleBreakdown.exchangeRate,
    colors: [],
    sizes: [],
    availability: 'unknown',
    priceVerified: false,
    priceVerificationStatus: 'PENDING_MANUAL',
  }) : null;

  const seen = new Set<string>();
  const products = [
    ...visual,
    ...local,
    ...external.map((candidate) => ({ ...candidate, match: scoreCandidate(null, query, candidate) })),
  ]
    .filter((candidate) => {
      const key = candidate.sourceUrl ? candidate.sourceUrl : `${candidate.source}|${candidate.title.toLowerCase()}|${candidate.price || ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => right.match - left.match)
    .slice(0, 8)
    .map((candidate) => quoteCandidate(withCalculatedTnd(candidate, context.db)));
  const strongCandidate = products.find((candidate) => candidate.match >= 80 && candidate.priceToken);
  const activeProduct = detectedProduct || (strongCandidate ? quoteProduct({
    title: strongCandidate.title,
    brand: strongCandidate.brand,
    model: strongCandidate.model,
    description: '',
    image: strongCandidate.image,
    images: strongCandidate.images || [],
    source: strongCandidate.source,
    sourceUrl: strongCandidate.sourceUrl,
    price: strongCandidate.price,
    currency: strongCandidate.currency,
    priceTnd: strongCandidate.priceTnd,
    exchangeRate: null,
    colors: strongCandidate.colors,
    sizes: strongCandidate.sizes,
    availability: strongCandidate.kind === 'catalog' ? 'in_stock' : 'unknown',
    priceVerified: strongCandidate.kind === 'catalog',
    priceVerificationStatus: strongCandidate.priceVerificationStatus,
  }) : null);

  const modelProducts = products.map(({ priceToken: _token, images: _images, image: _image, ...product }) => product);
  return {
    modelResult: {
      success: true,
      mode: 'image',
      query,
      imageAnalyzed: Boolean(attachment),
      detectedPrice: detectedProduct ? { price: detectedProduct.price, currency: detectedProduct.currency, totalTnd: detectedProduct.priceTnd } : null,
      products: modelProducts,
      instruction: products.length || activeProduct
        ? 'Use only these AYROVIX results. The product/order form is rendered inside chat when a reliable price exists; the customer confirms link, variant and quantity without opening Lens.'
        : 'AYROVIX found no real result. Do not invent a product, price, size or color.',
    },
    presentation: { query, product: activeProduct, products, source: 'image' },
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
  if (name === 'lens_search') return lensSearch(input, context);
  if (name === 'escalate_to_human') return escalateToHuman(input, context);
  return { modelResult: { success: false, code: 'UNKNOWN_TOOL', message: 'Outil non reconnu.' } };
}
