import { AYWEBS_STORES } from '../../../../shared/aywebsStores';
import type { ScrapedProduct } from '../../types';
import { getSessionId } from '../../utils/session';

export interface AyWebsStore {
  id: string;
  name: string;
  display_name?: string;
  country?: string;
  currency?: string;
  logo?: string;
  integration_type?: string;
  capabilities?: string[];
  categories?: string[];
  popular?: boolean;
  domains: string[];
  enabled: boolean;
  capture_supported: boolean;
  adapter: string;
  status: 'active' | 'beta' | 'planned';
  browser_mode: 'embedded' | 'external';
  home_url: string;
  search_url_template: string;
  phase: 1 | 2;
}

export interface AyWebsFeatures {
  enabled: boolean;
  capture_enabled: boolean;
  ai_extraction_enabled: boolean;
}

export interface AyWebsCaptureResponse {
  success: true;
  capture_id: string;
  status: 'READY';
  product: ScrapedProduct;
  normalized_product: Record<string, unknown>;
}

export class AyWebsApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: string,
    readonly missing: string[] = [],
  ) {
    super(message);
    this.name = 'AyWebsApiError';
  }
}

const fallbackStores: AyWebsStore[] = AYWEBS_STORES.filter((store) => store.enabled).map((store) => ({
  id: store.id,
  name: store.name,
  domains: [...store.domains],
  enabled: store.enabled,
  capture_supported: store.captureSupported,
  adapter: store.adapter,
  status: store.status,
  browser_mode: store.browserMode,
  home_url: store.homeUrl,
  search_url_template: store.searchUrlTemplate,
  phase: store.phase,
}));

export async function getAyWebsStores(signal?: AbortSignal): Promise<{ stores: AyWebsStore[]; features: AyWebsFeatures; offline: boolean }> {
  try {
    const response = await fetch('/api/v1/aywebs/stores', { credentials: 'same-origin', signal });
    const payload = await response.json();
    if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
      throw new Error(String(payload?.error || 'AYWEBS_STORES_UNAVAILABLE'));
    }
    return {
      stores: payload.data,
      features: payload.features,
      offline: false,
    };
  } catch (error: any) {
    if (error?.name === 'AbortError') throw error;
    return {
      stores: fallbackStores,
      features: {
        enabled: true,
        capture_enabled: true,
        ai_extraction_enabled: false,
      },
      offline: true,
    };
  }
}

export type AyWebsEvent =
  | 'aywebs_open'
  | 'store_selected'
  | 'product_page_detected'
  | 'capture_started'
  | 'capture_succeeded'
  | 'capture_failed'
  | 'add_to_cart_clicked'
  | 'add_to_cart_succeeded';

export function trackAyWebsEvent(event: AyWebsEvent, detail: { store?: string; capture_id?: string; code?: string } = {}): void {
  void fetch('/api/v1/aywebs/events', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
    body: JSON.stringify({ event, ...detail }),
  }).catch(() => undefined);
}

export async function captureAyWebsProduct(url: string, store: string, signal?: AbortSignal): Promise<AyWebsCaptureResponse> {
  const response = await fetch('/api/v1/aywebs/capture', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
    body: JSON.stringify({ url, store }),
    signal,
  });
  let payload: any = null;
  try { payload = await response.json(); } catch { /* mapped below */ }
  if (!response.ok || !payload?.success) {
    throw new AyWebsApiError(
      String(payload?.error || 'Impossible de capturer ce produit.'),
      String(payload?.code || 'CAPTURE_FAILED'),
      String(payload?.status || 'FAILED'),
      Array.isArray(payload?.missing) ? payload.missing.map(String) : [],
    );
  }
  return payload as AyWebsCaptureResponse;
}

/* ================================================================== *
 * AYWEBs — surface d'achat (§6, §9, §12, §15-§23)
 *
 * Tout vient du serveur : prix, disponibilité, frais, statuts. Le client
 * n'envoie jamais un montant ni un statut (§45), et chaque refus arrive avec
 * son contrat d'erreur (§44) que l'écran sait afficher et proposer une sortie.
 * ================================================================== */

export interface AyWebsErrorContract {
  errorCode: string;
  userMessage: string;
  technicalMessage: string;
  recoverable: boolean;
  retryAllowed: boolean;
  requiredAction: string;
}

/** Erreur AYWEBs typée : le contrat serveur est conservé tel quel pour l'UI. */
export class AyWebsRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly httpStatus: number,
    readonly contract: AyWebsErrorContract | null,
    readonly fallback: string[] = [],
    readonly payload: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AyWebsRequestError';
  }
}

/** Jeton CSRF du compte AYROVI connecté : fourni par l'app, jamais stocké ici. */
let ayWebsCsrfToken = '';
export function setAyWebsCsrfToken(token: string): void {
  ayWebsCsrfToken = token || '';
}

function ayWebsHeaders(method: string, contentType = true): Record<string, string> {
  const headers: Record<string, string> = { 'x-session-id': getSessionId() };
  if (contentType) headers['Content-Type'] = 'application/json';
  if (ayWebsCsrfToken && !['GET', 'HEAD'].includes(method.toUpperCase())) headers['x-csrf-token'] = ayWebsCsrfToken;
  return headers;
}

async function ayWebsRequest<T>(path: string, init: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  const method = init.method || 'GET';
  const response = await fetch(`/api/v1/aywebs${path}`, {
    method,
    credentials: 'same-origin',
    headers: ayWebsHeaders(method, init.body !== undefined),
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    signal: init.signal,
  });
  let payload: any = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.success === false) {
    const contract: AyWebsErrorContract | null = payload?.error_contract || null;
    throw new AyWebsRequestError(
      String(payload?.error || contract?.userMessage || 'AYWEBS_REQUEST_FAILED'),
      String(payload?.code || contract?.errorCode || 'AYWEBS_REQUEST_FAILED'),
      response.status,
      contract,
      Array.isArray(payload?.fallback) ? payload.fallback.map(String) : [],
      (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>,
    );
  }
  return payload as T;
}

/* ---- Types serveur (miroir fidèle des payloads §43) ---- */

export interface AyWebsAvailabilityPayload {
  state: 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
  reason: string;
  checked_at: string | null;
  source: string;
  quantity_hint: number | null;
}

export interface AyWebsVariantOption {
  attribute: string;
  value: string;
  image: string | null;
}

export interface AyWebsVariantPriceOption {
  source_variant_id: string | null;
  attributes: Record<string, string>;
  label: string;
  price: number | null;
  currency: string | null;
  quoted_price: number | null;
  quoted_currency: string | null;
  price_source: 'VARIANT' | 'PRODUCT' | 'UNKNOWN';
  availability: string;
  availability_reason: string;
  image: string | null;
  ayrovi_pricing: { total_tnd: number; pricing_version: number } | null;
}

export interface AyWebsProductPayload {
  product_id: string;
  store_id: string;
  store_name: string;
  source_url: string;
  source_domain: string;
  source_product_id: string | null;
  title: string;
  description: string;
  brand: string;
  images: string[];
  price: number;
  currency: string;
  price_verified?: boolean;
  currency_verified?: boolean;
  variants: AyWebsVariantOption[];
  variant_details: AyWebsVariantPriceOption[];
  variant_groups: Array<{ attribute: string; values: string[] }>;
  /**
   * État publié par la source ('new' | 'used' | 'refurbished') ou `null`.
   * Jamais « new » par défaut : l'écran n'affiche que ce que le marchand publie.
   */
  condition: 'new' | 'used' | 'refurbished' | null;
  selected_variant: { variantId: string; attributes: Record<string, string>; quantity: number; metadata?: Record<string, string> | null } | null;
  availability: AyWebsAvailabilityPayload;
  merchant: Record<string, unknown>;
  purchase_mode: string;
  integration_type: string;
  captured_at: string;
  evidence_hash: string;
  ayrovi_pricing: {
    total_tnd: number;
    pricing_version: number;
    breakdown: Record<string, number>;
  } | null;
}

export interface AyWebsHomePayload {
  stores: AyWebsStore[];
  popular_stores: AyWebsStore[];
  categories: Array<{ id: string; labelFr?: string; labelAr?: string; label?: string; stores: string[] }>;
  recent_stores: Array<{ storeId: string; storeName?: string; visitedAt?: string; url?: string }>;
  recent_products: Array<{
    product_id: string; store_id: string; store_name: string; title: string;
    image: string | null; price: number; currency: string; availability: string;
    pricing_tnd: number; source_url: string; resolved_at: string;
  }>;
  cart: { id: string | null; items_count: number; units: number; subtotal_tnd: number; blocked_items: number; checkout_ready?: boolean };
  request_store_supported: boolean;
  request_purchase_supported: boolean;
  session: Record<string, unknown> | null;
}

export interface AyWebsCartItemPayload {
  id: string;
  item_number: string;
  store_id: string;
  store_name: string;
  source_url: string;
  title: string;
  images: string[];
  unit_price: number;
  currency: string;
  variant_snapshot: { variantId: string; attributes: Record<string, string>; quantity: number } | null;
  variant_label: string;
  quantity: number;
  availability: string;
  price_snapshot: Record<string, unknown> | null;
  pricing_tnd: number;
  line_total_tnd: number;
  evidence_hash: string;
  status: string;
  status_reason: string;
  customer_note: string;
  purchase_mode: string;
  checkout_ready: boolean;
  /** Panier unifié : la ligne vit déjà dans le panier AYROVI (synchronisée). */
  linked_to_ayrovi?: boolean;
}

export interface AyWebsCartPayload {
  cart: { id: string; status: string; currency: string; items_count: number } | null;
  items: AyWebsCartItemPayload[];
  groups: Array<{ store_id: string; store_name: string; integration_type: string; subtotal_tnd: number; blocked_items: number; items: AyWebsCartItemPayload[] }>;
  totals: { units: number; product_subtotal_tnd: number; currency: string; blocked_items: number; checkout_ready: boolean; unlinked_units?: number };
  blockers: Array<{ itemId: string; code: string; message: string; action: string }>;
  offline_notice: string | null;
}

export interface AyWebsFeePayload {
  kind: string; code: string; label: string; label_ar?: string; amount_tnd: number;
  uncertain?: boolean; detail?: Record<string, unknown>;
}

export interface AyWebsCheckoutPayload {
  currency: 'TND';
  lines: Array<{
    item_id: string; item_number: string; store_name: string; title: string; variant_label: string;
    quantity: number; source_unit_price: number; source_currency: string; product_amount_tnd: number;
    service_fee_tnd: number; import_fee_tnd: number; shipping_estimate_tnd: number; line_total_tnd: number;
    availability: string; checkout_ready: boolean; restricted: boolean; uncertain: boolean;
    category_label?: string;
  }>;
  fees: AyWebsFeePayload[];
  totals: {
    product_subtotal_tnd: number; service_fee_tnd: number; import_fee_tnd: number;
    shipping_estimate_tnd: number; other_fee_tnd: number; payable_tnd: number; units: number; weight_kg?: number;
  };
  pricing_version: number;
  blockers: Array<{ itemId: string; code: string; message: string; action: string }>;
  warnings: Array<{ code: string; message: string }>;
  computed_at: string;
}

export interface AyWebsOrderPayload {
  id: string;
  order_number: string;
  status: string;
  master_stage: string;
  exception_state: string | null;
  exception_reason: string;
  currency: string;
  totals: {
    product_subtotal_tnd: number; service_fee_tnd: number; import_fee_tnd: number;
    shipping_estimate_tnd: number; other_fee_tnd: number; payable_tnd: number;
  };
  fees: AyWebsFeePayload[];
  pricing_version: number;
  payment_status: string;
  payment_method: string;
  payment_reference: string;
  paid_at: string | null;
  submitted_at: string | null;
  notes: string;
  items: Array<{
    id: string; store_id: string; store_name: string; source_url: string; source_product_id: string | null;
    title: string; images: string[]; unit_price: number; currency: string; quantity: number;
    variant_label: string; line_total_tnd: number; purchase_status: string; purchase_reason: string;
    warehouse_state: string;
  }>;
  timeline: Array<{ key: string; state: 'done' | 'current' | 'pending' }>;
  created_at: string;
  updated_at: string;
}

export interface AyWebsPurchaseRequestPayload {
  id: string;
  request_number: string;
  store_id: string;
  store_name: string;
  product_url: string;
  source_domain: string;
  quantity: number;
  product_name: string;
  variant_attributes: Record<string, string> | null;
  requirements: string;
  customer_notes: string;
  status: string;
  reason: string | null;
  decision_note: string;
  decided_at: string | null;
  order_id: string | null;
  next_action: string;
  created_at: string;
}

/* ---- Appels (§43) ---- */

export async function getAyWebsHome(signal?: AbortSignal): Promise<{ data: AyWebsHomePayload; features: AyWebsFeatures }> {
  const payload = await ayWebsRequest<any>('/home', { signal });
  return { data: payload.data as AyWebsHomePayload, features: (payload.features || {}) as AyWebsFeatures };
}

export async function analyzeAyWebsPage(url: string, signal?: AbortSignal) {
  const payload = await ayWebsRequest<any>('/page/analyze', { method: 'POST', body: { url }, signal });
  return payload.data as {
    url: string; store_id: string | null; store_name: string; integration_type: string;
    registered: boolean; browse_allowed: boolean; capture_allowed: boolean;
    page_type: string; is_product_page: boolean; product_detected: boolean;
    customer_action_required: string; browser_mode: string; fallback: string; reason: string;
  };
}

export async function resolveAyWebsProduct(payload: {
  url: string; store?: string | null; variant?: Record<string, string> | null; quantity?: number;
}, signal?: AbortSignal) {
  const response = await ayWebsRequest<any>('/product/resolve', { method: 'POST', body: payload, signal });
  return {
    captureId: String(response.capture_id || ''),
    status: String(response.status || 'READY'),
    product: response.data as AyWebsProductPayload,
    missing: Array.isArray(response.missing) ? response.missing.map(String) : [],
    /** Devis signé (Phase 1) — à renvoyer tel quel à `addAyWebsCartItem`. */
    quoteToken: String(response.quote_token || ''),
    /** Origine réelle de la lecture : cache, mémo d'échec, ou lecture fraîche. */
    cacheKind: response.cache_kind ? String(response.cache_kind) : null,
    /** SWR : fiche servie périmée pendant qu'une relecture se fait derrière. */
    servedStale: response.served_stale === true,
    quoteExpiresAt: Number(response.quote_expires_at || 0) || null,
    scrapedProduct: response.product as ScrapedProduct,
  };
}

export async function getAyWebsVariants(payload: { product_id?: string; url?: string; store?: string }, signal?: AbortSignal) {
  const response = await ayWebsRequest<any>('/product/variants', { method: 'POST', body: payload, signal });
  return response.data as {
    product_id: string; store_id: string; source_url: string;
    variant_groups: Array<{ attribute: string; values: string[] }>;
    variants: AyWebsVariantPriceOption[];
    selection_required: boolean; availability: string; availability_reason: string; resolved_at: string;
  };
}

export async function getAyWebsCart(signal?: AbortSignal): Promise<AyWebsCartPayload> {
  const payload = await ayWebsRequest<any>('/cart', { signal });
  return payload.data as AyWebsCartPayload;
}

export async function addAyWebsCartItem(body: {
  source_url?: string; product_id?: string; store_id?: string;
  variant_attributes?: Record<string, string> | null; quantity?: number; customer_note?: string;
  /** Stable across a retry of this one user intention; a later Add gets a new key. */
  request_id?: string;
  /**
   * Devis signé renvoyé par `/product/resolve` : l'ajout n'a plus à relire la
   * fiche marchande (15–22 s → quelques ms). Le serveur reste seul juge : jeton
   * invalide, périmé ou ne correspondant pas à la ligne ⇒ relecture complète.
   */
  quote_token?: string;
}) {
  const payload = await ayWebsRequest<any>('/cart/items', { method: 'POST', body });
  return {
    item: payload.data.item as AyWebsCartItemPayload,
    cart: payload.cart as AyWebsCartPayload,
    idempotentReplay: Boolean(payload.data.idempotent_replay),
    /** Transparence : l'ajout a-t-il utilisé le devis signé, ou relu le marchand ? */
    quoteUsed: Boolean(payload.data.quote_used),
    sourceReread: Boolean(payload.data.source_reread),
    rereadReason: payload.data.reread_reason ? String(payload.data.reread_reason) : null,
    /**
     * Liaison immédiate vers le panier AYROVI (point sûr : après persistance).
     * `linked: true` ⇒ l'article figure déjà dans le panier AYROVI de l'app.
     * `linked: false` ⇒ il reste dans le panier AYWEBs, la raison est donnée.
     */
    ayrovi: (payload.data.ayrovi || null) as { linked: boolean; cart_item_id: string | null; quantity: number | null; reason: string } | null,
  };
}

export async function updateAyWebsCartItem(itemId: string, body: { quantity?: number; customer_note?: string; variant_attributes?: Record<string, string> | null }) {
  const payload = await ayWebsRequest<any>(`/cart/items/${encodeURIComponent(itemId)}`, { method: 'PATCH', body });
  return { item: (payload.data?.item || null) as AyWebsCartItemPayload | null, cart: payload.cart as AyWebsCartPayload };
}

export async function removeAyWebsCartItem(itemId: string) {
  const payload = await ayWebsRequest<any>(`/cart/items/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
  return payload.cart as AyWebsCartPayload;
}

export async function acceptAyWebsCartPrice(itemId: string) {
  const payload = await ayWebsRequest<any>(`/cart/items/${encodeURIComponent(itemId)}/accept-price`, { method: 'POST', body: {} });
  return { item: payload.data.item as AyWebsCartItemPayload, cart: payload.cart as AyWebsCartPayload };
}

export async function verifyAyWebsCart(recheckSource = false) {
  const payload = await ayWebsRequest<any>('/cart/verify', { method: 'POST', body: { recheck_source: recheckSource } });
  return {
    changes: Array.isArray(payload.data?.changes) ? payload.data.changes as Array<{ itemId: string; code: string; message: string }> : [],
    cart: payload.cart as AyWebsCartPayload,
  };
}

/** §2/§16 : pont vers le panier AYROVI existant (réponse en camelCase, comme le service). */
export async function bridgeAyWebsCartToAyrovi(itemIds?: string[]) {
  const payload = await ayWebsRequest<any>('/cart/bridge-to-ayrovi', { method: 'POST', body: { item_ids: itemIds || [] } });
  return payload.data as {
    moved: Array<{ aywebsItemId: string; aywebsItemNumber: string; cartItemId: string; store: string; title: string; quantity: number; priceTnd: number; duplicate: boolean; synced: boolean }>;
    skipped: Array<{ aywebsItemId: string; code: string; message: string }>;
    totalItemsCount: number; totalTnd: number; deliveryTnd: number; message: string;
  };
}

export async function previewAyWebsCheckout(body: { express?: boolean; include_local_delivery?: boolean } = {}) {
  const payload = await ayWebsRequest<any>('/checkout/preview', { method: 'POST', body });
  return payload.data as AyWebsCheckoutPayload;
}

export interface AyWebsShippingAddress { name: string; phone: string; city: string; line: string }

export async function createAyWebsOrder(body: {
  notes?: string;
  express?: boolean;
  include_local_delivery?: boolean;
  shipping_address?: AyWebsShippingAddress;
} = {}) {
  const payload = await ayWebsRequest<any>('/orders', { method: 'POST', body });
  return {
    order: payload.data as AyWebsOrderPayload,
    preview: payload.preview as AyWebsCheckoutPayload | undefined,
    purchaseIntegration: String(payload.purchase_integration || 'PENDING_INTEGRATION'),
  };
}

export async function listAyWebsOrders(signal?: AbortSignal): Promise<AyWebsOrderPayload[]> {
  const payload = await ayWebsRequest<any>('/orders', { signal });
  return payload.data as AyWebsOrderPayload[];
}

export async function getAyWebsOrder(orderId: string, signal?: AbortSignal): Promise<AyWebsOrderPayload> {
  const payload = await ayWebsRequest<any>(`/orders/${encodeURIComponent(orderId)}`, { signal });
  return payload.data as AyWebsOrderPayload;
}

export async function submitAyWebsOrder(orderId: string): Promise<AyWebsOrderPayload> {
  const payload = await ayWebsRequest<any>(`/orders/${encodeURIComponent(orderId)}/submit`, { method: 'POST', body: {} });
  return payload.data as AyWebsOrderPayload;
}

/** §20 : les moyens viennent de la configuration commerciale AYROVI existante. */
export async function getAyWebsPaymentMethods(signal?: AbortSignal) {
  const payload = await ayWebsRequest<any>('/payments/methods', { signal });
  return payload.data as { methods: string[]; card_gateway_available: boolean; note: string };
}

export async function createAyWebsPaymentIntent(body: { order_id: string; method: string }) {
  const payload = await ayWebsRequest<any>('/payments/intents', { method: 'POST', body });
  return payload.data as {
    paymentId: string; paymentNumber: string; orderId: string; orderNumber: string;
    method: string; status: string; amountTnd: number; payUrl: string; provider: string;
    providerReference: string;
    transferInstructions: { available: boolean; label: string; details: string };
    nextAction: 'REDIRECT_TO_GATEWAY' | 'UPLOAD_TRANSFER_PROOF' | 'WAIT_FOR_VERIFICATION' | 'NONE';
  };
}

/**
 * §20 : la confirmation relit la passerelle AYROVI, elle ne décrète rien.
 * La route renvoie `{ success, data: { payment }, order }` — l'ordre est au
 * niveau racine, en snake_case comme le reste de la surface publique.
 */
export async function confirmAyWebsPayment(body: { order_id: string; payment_id?: string }) {
  const payload = await ayWebsRequest<any>('/payments/confirm', { method: 'POST', body });
  return {
    payment: (payload.data?.payment || {}) as Record<string, unknown>,
    order: (payload.order || null) as AyWebsOrderPayload | null,
  };
}

/**
 * Justificatif de virement / mandat postal (§20) : envoi multipart vers la route
 * existante, qui vérifie la signature du fichier avant de l'écrire dans un
 * dossier privé. Aucun chemin n'est choisi côté client.
 */
export async function uploadAyWebsTransferProof(orderId: string, file: File, transferReference: string) {
  const form = new FormData();
  form.append('proof', file);
  // Référence obligatoire côté serveur : sans elle, la preuve est refusée
  // (PURCHASE_REQUEST_INVALID) et aucun paiement ne passe en revue.
  form.append('transfer_reference', transferReference);
  const response = await fetch(`/api/v1/aywebs/orders/${encodeURIComponent(orderId)}/payments/transfer-proof`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: ayWebsHeaders('POST', false),
    body: form,
  });
  let payload: any = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok || payload?.success === false) {
    const contract: AyWebsErrorContract | null = payload?.error_contract || null;
    throw new AyWebsRequestError(
      String(payload?.error || contract?.userMessage || 'PROOF_UPLOAD_FAILED'),
      String(payload?.code || contract?.errorCode || 'PROOF_UPLOAD_FAILED'),
      response.status,
      contract,
      Array.isArray(payload?.fallback) ? payload.fallback.map(String) : [],
      (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>,
    );
  }
  return payload.data as { payment: Record<string, unknown> };
}

export async function listAyWebsPurchaseRequests(signal?: AbortSignal): Promise<AyWebsPurchaseRequestPayload[]> {
  const payload = await ayWebsRequest<any>('/purchase-requests', { signal });
  return payload.data as AyWebsPurchaseRequestPayload[];
}

export async function createAyWebsPurchaseRequest(body: {
  product_url: string; quantity?: number; product_name?: string;
  variant_attributes?: Record<string, string> | null; requirements?: string; customer_notes?: string; store_id?: string | null;
}) {
  const payload = await ayWebsRequest<any>('/purchase-requests', { method: 'POST', body });
  return payload.data as AyWebsPurchaseRequestPayload;
}

export async function createAyWebsStoreRequest(body: { store_url: string; store_name?: string; intent?: string; notes?: string }) {
  const payload = await ayWebsRequest<any>('/store-requests', { method: 'POST', body });
  return payload.data as { id: string; request_number?: string; store_name: string; store_url: string; status: string };
}

/** §39 : événements de funnel additionnels du parcours d'achat. */
export type AyWebsShoppingEvent =
  | 'store_opened' | 'variant_selected' | 'cart_opened' | 'checkout_previewed'
  | 'order_created' | 'order_submitted' | 'purchase_request_submitted' | 'store_request_submitted';

export function trackAyWebsShoppingEvent(event: AyWebsShoppingEvent, detail: { store?: string; code?: string } = {}): void {
  void fetch('/api/v1/aywebs/events', {
    method: 'POST',
    credentials: 'same-origin',
    keepalive: true,
    headers: { 'Content-Type': 'application/json', 'x-session-id': getSessionId() },
    body: JSON.stringify({ event, ...detail }),
  }).catch(() => undefined);
}
