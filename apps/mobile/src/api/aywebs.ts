/**
 * AYWEBs API — native mobile client.
 *
 * No imports from `client/`: the mobile app talks to the existing server
 * contract through the shared API transport and always carries its persistent
 * `x-session-id`. Prices, availability and quotes are server-owned facts.
 */
import { ApiError } from './errors';
import {
  apiGetEnvelope,
  apiGetText,
  apiSendEnvelope,
  type RequestOptions,
} from './client';

export const AYWEBS_API = '/api/v1/aywebs';
/** Cold product reads can take longer than ordinary mobile API requests. */
export const AYWEBS_RESOLVE_TIMEOUT_MS = 30_000;

export type AyWebsAvailabilityState = 'AVAILABLE' | 'LOW_STOCK' | 'OUT_OF_STOCK' | 'UNKNOWN';
export type AyWebsCaptureSource = 'json_ld' | 'microdata' | 'meta' | 'dom' | 'dom_accessibility';

export interface AyWebsStore {
  id: string;
  name: string;
  displayName: string;
  domains: string[];
  country: string;
  currency: string;
  logo: string;
  enabled: boolean;
  captureSupported: boolean;
  operational: boolean;
  operationalReason: string;
  integrationType: string;
  capabilities: string[];
  canBrowse: boolean;
  browserMode: 'embedded' | 'external';
  homeUrl: string;
  searchUrlTemplate: string;
  categories: string[];
  popular: boolean;
  phase: number | null;
  purchaseMode: string;
}

export interface AyWebsFeatures {
  enabled: boolean;
  captureEnabled: boolean;
  aiExtractionEnabled: boolean;
  purchaseIntegrationEnabled: boolean;
}

export interface AyWebsRecentProduct {
  productId: string;
  storeId: string;
  storeName: string;
  title: string;
  image: string;
  price: number | null;
  currency: string;
  availability: AyWebsAvailabilityState;
  pricingTnd: number | null;
  sourceUrl: string;
  resolvedAt: string;
}

export interface AyWebsHome {
  stores: AyWebsStore[];
  popularStores: AyWebsStore[];
  recentProducts: AyWebsRecentProduct[];
  cart: { itemsCount: number; units: number; subtotalTnd: number | null };
  features: AyWebsFeatures;
}

export interface AyWebsPageAnalysis {
  url: string;
  storeId: string | null;
  storeName: string;
  integrationType: string;
  registered: boolean;
  browseAllowed: boolean;
  captureAllowed: boolean;
  pageType: string;
  isProductPage: boolean;
  productDetected: boolean;
  customerActionRequired: string;
  browserMode: string;
  fallback: string;
  reason: string;
}

export interface AyWebsVariantGroup {
  attribute: string;
  values: string[];
}

export interface AyWebsVariantPrice {
  sourceVariantId: string;
  attributes: Record<string, string>;
  label: string;
  availability: AyWebsAvailabilityState;
  availabilityReason: string;
  priceTnd: number | null;
}

export interface AyWebsProduct {
  productId: string;
  storeId: string;
  storeName: string;
  sourceUrl: string;
  sourceDomain: string;
  title: string;
  description: string;
  brand: string;
  images: string[];
  sourcePrice: number | null;
  currency: string;
  priceVerified: boolean;
  currencyVerified: boolean;
  variantGroups: AyWebsVariantGroup[];
  variantPrices: AyWebsVariantPrice[];
  selectedVariant: Record<string, string>;
  availability: AyWebsAvailabilityState;
  availabilityReason: string;
  condition: string;
  seller: string;
  ayroviPriceTnd: number | null;
  purchaseMode: string;
  integrationType: string;
}

export interface AyWebsCapture {
  v: 1;
  url: string;
  canonicalUrl: string | null;
  title: string | null;
  brand: string | null;
  priceCandidates: Array<{ text: string; source: AyWebsCaptureSource }>;
  currencyText: string | null;
  availabilityText: string | null;
  addToCartText: string | null;
  conditionText: string | null;
  selectedVariantTexts: string[];
  variantTexts: string[];
  images: string[];
  capturedAt: string;
  pageLang: string | null;
}

export interface AyWebsResolvedProduct {
  captureId: string;
  status: string;
  missing: string[];
  quoteToken: string;
  quoteExpiresAt: number | null;
  captureUsed: boolean;
  captureRejection: string;
  product: AyWebsProduct;
}

export interface AyWebsCartAddResult {
  item: {
    id: string;
    title: string;
    image: string;
    storeName: string;
    variantLabel: string;
    quantity: number;
    unitPrice: number | null;
    currency: string;
    lineTotalTnd: number | null;
  };
  linkedToAyrovi: boolean;
  linkReason: string;
}

export interface AyWebsVariantResponse {
  productId: string;
  groups: AyWebsVariantGroup[];
  variants: AyWebsVariantPrice[];
  selectionRequired: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;
const bool = (value: unknown): boolean => value === true;
const record = (value: unknown): Record<string, unknown> => isRecord(value) ? value : {};
const stringList = (value: unknown, limit = 100): string[] =>
  Array.isArray(value)
    ? value.slice(0, limit).filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean)
    : [];

function malformed(description: string): ApiError {
  return new ApiError('malformed', `Réponse AYWEBs illisible : ${description}`);
}

function requiredText(value: unknown, description: string): string {
  const result = text(value);
  if (!result) throw malformed(description);
  return result;
}

function apiPayload(value: unknown, description: string): Record<string, unknown> {
  if (!isRecord(value) || value.success !== true) throw malformed(description);
  return value;
}

function parseAvailability(value: unknown): AyWebsAvailabilityState {
  return value === 'AVAILABLE' || value === 'LOW_STOCK' || value === 'OUT_OF_STOCK' || value === 'UNKNOWN'
    ? value
    : 'UNKNOWN';
}

function parseVariantGroups(value: unknown): AyWebsVariantGroup[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const attribute = text(entry.attribute);
    const values = stringList(entry.values, 100);
    return attribute && values.length ? [{ attribute, values }] : [];
  });
}

function parseVariantPrices(value: unknown): AyWebsVariantPrice[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 200).flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const attrs = record(entry.attributes);
    const attributes = Object.fromEntries(
      Object.entries(attrs)
        .filter(([, item]) => typeof item === 'string')
        .slice(0, 20)
        .map(([key, item]) => [key, String(item).slice(0, 100)]),
    );
    const pricing = record(entry.ayrovi_pricing);
    return [{
      sourceVariantId: text(entry.source_variant_id),
      attributes,
      label: text(entry.label),
      availability: parseAvailability(entry.availability),
      availabilityReason: text(entry.availability_reason),
      priceTnd: numberOrNull(pricing.total_tnd),
    }];
  });
}

function parseStore(value: unknown): AyWebsStore {
  if (!isRecord(value)) throw malformed('magasin');
  const id = requiredText(value.id, 'identifiant du magasin');
  const name = requiredText(value.display_name ?? value.name, 'nom du magasin');
  const can = record(value.can);
  const browserMode = value.browser_mode === 'embedded' ? 'embedded' : 'external';
  return {
    id,
    name: text(value.name) || name,
    displayName: name,
    domains: stringList(value.domains, 60).map((domain) => domain.toLowerCase()),
    country: text(value.country),
    currency: text(value.currency).toUpperCase(),
    logo: text(value.logo),
    enabled: bool(value.enabled),
    captureSupported: bool(value.capture_supported),
    operational: bool(value.operational),
    operationalReason: text(value.operational_reason),
    integrationType: text(value.integration_type),
    capabilities: stringList(value.capabilities, 40),
    canBrowse: typeof can.browse === 'boolean' ? can.browse : stringList(value.capabilities).includes('browse'),
    browserMode,
    homeUrl: text(value.home_url),
    searchUrlTemplate: text(value.search_url_template),
    categories: stringList(value.categories, 40),
    popular: bool(value.popular),
    phase: numberOrNull(value.phase),
    purchaseMode: text(value.purchase_mode),
  };
}

function parseHomeProduct(value: unknown): AyWebsRecentProduct | null {
  if (!isRecord(value)) return null;
  const productId = text(value.product_id);
  const sourceUrl = text(value.source_url);
  const title = text(value.title);
  if (!productId || !sourceUrl || !title) return null;
  return {
    productId,
    storeId: text(value.store_id),
    storeName: text(value.store_name),
    title,
    image: text(value.image),
    price: numberOrNull(value.price),
    currency: text(value.currency).toUpperCase(),
    availability: parseAvailability(value.availability),
    pricingTnd: numberOrNull(value.pricing_tnd),
    sourceUrl,
    resolvedAt: text(value.resolved_at),
  };
}

function parseHome(value: unknown): AyWebsHome {
  const payload = apiPayload(value, 'réponse accueil');
  const data = record(payload.data);
  if (!Array.isArray(data.stores)) throw malformed('liste des magasins');
  const stores = data.stores.map(parseStore);
  const popularStores = Array.isArray(data.popular_stores)
    ? data.popular_stores.map(parseStore)
    : stores.filter((store) => store.popular);
  const cart = record(data.cart);
  const features = record(payload.features);
  const recentProducts = Array.isArray(data.recent_products)
    ? data.recent_products.map(parseHomeProduct).filter((item): item is AyWebsRecentProduct => item !== null)
    : [];
  return {
    stores,
    popularStores,
    recentProducts,
    cart: {
      itemsCount: numberOrNull(cart.items_count) ?? 0,
      units: numberOrNull(cart.units) ?? 0,
      subtotalTnd: numberOrNull(cart.subtotal_tnd),
    },
    features: {
      enabled: bool(features.enabled),
      captureEnabled: bool(features.capture_enabled),
      aiExtractionEnabled: bool(features.ai_extraction_enabled),
      purchaseIntegrationEnabled: bool(features.purchase_integration_enabled),
    },
  };
}

function parsePageAnalysis(value: unknown): AyWebsPageAnalysis {
  const payload = apiPayload(value, 'analyse de page');
  const data = record(payload.data);
  return {
    url: requiredText(data.url, 'URL analysée'),
    storeId: text(data.store_id) || null,
    storeName: text(data.store_name),
    integrationType: text(data.integration_type),
    registered: bool(data.registered),
    browseAllowed: bool(data.browse_allowed),
    captureAllowed: bool(data.capture_allowed),
    pageType: text(data.page_type),
    isProductPage: bool(data.is_product_page),
    productDetected: bool(data.product_detected),
    customerActionRequired: text(data.customer_action_required),
    browserMode: text(data.browser_mode),
    fallback: text(data.fallback),
    reason: text(data.reason),
  };
}

function parseProduct(value: unknown): AyWebsProduct {
  if (!isRecord(value)) throw malformed('fiche produit');
  const pricing = record(value.ayrovi_pricing);
  const availability = record(value.availability);
  const variant = record(value.selected_variant);
  const selectedAttrs = record(variant.attributes);
  const selectedVariant = Object.fromEntries(
    Object.entries(selectedAttrs)
      .filter(([, item]) => typeof item === 'string')
      .map(([key, item]) => [key, String(item)]),
  );
  const url = requiredText(value.source_url, 'URL produit');
  let sourceDomain = text(value.source_domain);
  if (!sourceDomain) {
    try { sourceDomain = new URL(url).hostname.toLowerCase(); } catch { sourceDomain = ''; }
  }
  const images = stringList(value.images, 12).filter((image) => {
    try { return ['http:', 'https:'].includes(new URL(image).protocol); } catch { return false; }
  });
  return {
    productId: requiredText(value.product_id, 'identifiant produit'),
    storeId: requiredText(value.store_id, 'identifiant magasin produit'),
    storeName: text(value.store_name),
    sourceUrl: url,
    sourceDomain,
    title: requiredText(value.title, 'nom produit'),
    description: text(value.description).slice(0, 1200),
    brand: text(value.brand),
    images,
    sourcePrice: numberOrNull(value.price),
    currency: text(value.currency).toUpperCase(),
    priceVerified: bool(value.price_verified),
    currencyVerified: bool(value.currency_verified),
    variantGroups: parseVariantGroups(value.variant_groups),
    variantPrices: parseVariantPrices(value.variant_details),
    selectedVariant,
    availability: parseAvailability(availability.state),
    availabilityReason: text(availability.reason),
    condition: text(value.condition),
    seller: text(value.seller),
    ayroviPriceTnd: numberOrNull(pricing.total_tnd),
    purchaseMode: text(value.purchase_mode),
    integrationType: text(value.integration_type),
  };
}

function parseResolvedProduct(value: unknown): AyWebsResolvedProduct {
  const payload = apiPayload(value, 'réponse produit');
  const capture = record(payload.capture);
  return {
    captureId: text(payload.capture_id),
    status: text(payload.status) || 'READY',
    missing: stringList(payload.missing, 20),
    quoteToken: text(payload.quote_token),
    quoteExpiresAt: numberOrNull(payload.quote_expires_at),
    captureUsed: bool(capture.used),
    captureRejection: text(capture.rejection),
    product: parseProduct(payload.data),
  };
}

function parseVariantResponse(value: unknown): AyWebsVariantResponse {
  const payload = apiPayload(value, 'options produit');
  const data = record(payload.data);
  const productId = requiredText(data.product_id, 'identifiant produit/options');
  return {
    productId,
    groups: parseVariantGroups(data.variant_groups),
    variants: parseVariantPrices(data.variants),
    selectionRequired: bool(data.selection_required),
  };
}

function parseCartAdd(value: unknown): AyWebsCartAddResult {
  const payload = apiPayload(value, 'ajout panier');
  const data = record(payload.data);
  const item = record(data.item);
  if (!text(item.id)) throw malformed('ligne panier ajoutée');
  const ayrovi = record(data.ayrovi);
  return {
    item: {
      id: text(item.id),
      title: text(item.title),
      image: stringList(item.images, 1)[0] ?? '',
      storeName: text(item.store_name),
      variantLabel: text(item.variant_label),
      quantity: numberOrNull(item.quantity) ?? 1,
      unitPrice: numberOrNull(item.unit_price),
      currency: text(item.currency).toUpperCase(),
      lineTotalTnd: numberOrNull(item.line_total_tnd),
    },
    linkedToAyrovi: bool(ayrovi.linked),
    linkReason: text(ayrovi.reason),
  };
}

/** `GET /home`: stores, features, recent items and current AYWEBs cart count. */
export async function fetchAyWebsHome(
  sessionId: string,
  options: RequestOptions = {},
): Promise<AyWebsHome> {
  const raw = await apiGetEnvelope<unknown>(`${AYWEBS_API}/home`, {
    ...options,
    headers: { 'x-session-id': sessionId, ...(options.headers ?? {}) },
  });
  return parseHome(raw);
}

/** Server-side page analysis before opening a merchant in the in-app browser. */
export async function analyzeAyWebsPage(
  input: { url: string; sessionId: string },
  options: RequestOptions = {},
): Promise<AyWebsPageAnalysis> {
  const raw = await apiSendEnvelope<unknown>('POST', `${AYWEBS_API}/page/analyze`, {
    ...options,
    headers: { 'x-session-id': input.sessionId, ...(options.headers ?? {}) },
    body: { url: input.url },
    timeoutMs: AYWEBS_RESOLVE_TIMEOUT_MS,
  });
  return parsePageAnalysis(raw);
}

/** Load the server-owned, public WebView reader script (no embedded secret). */
export async function fetchAyWebsCaptureScript(options: RequestOptions = {}): Promise<string> {
  const script = await apiGetText(`${AYWEBS_API}/capture/script.js`, options);
  if (!script.trim() || script.length > 120_000) throw malformed('script de capture');
  return script;
}

/**
 * The WebView reports only bounded facts (never HTML, cookies or form values).
 * This parser rebuilds the allow-listed v1 shape before sending anything back.
 */
export function parseAyWebsCapture(value: unknown): AyWebsCapture {
  if (!isRecord(value) || Array.isArray(value)) throw malformed('capture non-objet');
  if (value.v !== 1) throw malformed('version de capture');
  const url = requiredText(value.url, 'URL de capture');
  const capturedAt = requiredText(value.capturedAt, 'date de capture');
  if (!Number.isFinite(Date.parse(capturedAt))) throw malformed('date de capture invalide');
  if (!Array.isArray(value.priceCandidates) || value.priceCandidates.length > 5) throw malformed('textes de prix');
  const priceCandidates = value.priceCandidates.flatMap((candidate) => {
    if (!isRecord(candidate)) return [];
    const candidateText = text(candidate.text).slice(0, 300);
    const source = candidate.source;
    if (!candidateText || !(source === 'json_ld' || source === 'microdata' || source === 'meta' || source === 'dom' || source === 'dom_accessibility')) return [];
    return [{ text: candidateText, source: source as AyWebsCaptureSource }];
  });
  const stringArray = (input: unknown, max: number, maxLength: number): string[] => {
    if (!Array.isArray(input) || input.length > max) return [];
    return input.flatMap((entry) => typeof entry === 'string' && entry.trim()
      ? [entry.trim().slice(0, maxLength)]
      : []);
  };
  const cleanText = (input: unknown, max = 300): string | null => {
    const result = text(input).slice(0, max);
    return result || null;
  };
  const images = stringArray(value.images, 4, 600).filter((image) => {
    try { return ['http:', 'https:'].includes(new URL(image).protocol); } catch { return false; }
  });
  return {
    v: 1,
    url: url.slice(0, 2_000),
    canonicalUrl: cleanText(value.canonicalUrl, 2_000),
    title: cleanText(value.title),
    brand: cleanText(value.brand, 60),
    priceCandidates,
    currencyText: cleanText(value.currencyText),
    availabilityText: cleanText(value.availabilityText),
    addToCartText: cleanText(value.addToCartText),
    conditionText: cleanText(value.conditionText),
    selectedVariantTexts: stringArray(value.selectedVariantTexts, 5, 60),
    variantTexts: stringArray(value.variantTexts, 30, 60),
    images,
    capturedAt,
    pageLang: cleanText(value.pageLang, 20),
  };
}

/** Wrap the remote reader and forward only its JSON result through the bridge. */
export function buildAyWebsCaptureInjection(script: string, requestId = 'capture'): string {
  if (!script.trim() || script.length > 120_000) throw malformed('script de capture');
  const id = JSON.stringify(requestId.slice(0, 80));
  return `;(function(){try{var result=(0,eval)(${JSON.stringify(script)});window.ReactNativeWebView.postMessage(JSON.stringify({type:"aywebs_capture",requestId:${id},payload:result}));}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:"aywebs_capture_error",requestId:${id}}));}})();true;`;
}

/** Resolve from the server; the signed quote remains server-issued. */
export async function resolveAyWebsProduct(input: {
  url: string;
  storeId: string;
  sessionId: string;
  variant?: Record<string, string>;
  quantity?: number;
  capture?: AyWebsCapture | null;
  refresh?: boolean;
}, options: RequestOptions = {}): Promise<AyWebsResolvedProduct> {
  const raw = await apiSendEnvelope<unknown>('POST', `${AYWEBS_API}/product/resolve`, {
    ...options,
    headers: { 'x-session-id': input.sessionId, ...(options.headers ?? {}) },
    body: {
      url: input.url,
      store_id: input.storeId,
      ...(input.variant && Object.keys(input.variant).length ? { variant: input.variant } : {}),
      ...(input.quantity ? { quantity: input.quantity } : {}),
      ...(input.capture ? { capture: input.capture } : {}),
      ...(input.refresh ? { refresh: true } : {}),
    },
    timeoutMs: AYWEBS_RESOLVE_TIMEOUT_MS,
  });
  return parseResolvedProduct(raw);
}

/** Server-provided choices are an aid, not a source of invented availability. */
export async function fetchAyWebsVariants(input: {
  productId: string;
  sessionId: string;
}, options: RequestOptions = {}): Promise<AyWebsVariantResponse> {
  const raw = await apiSendEnvelope<unknown>('POST', `${AYWEBS_API}/product/variants`, {
    ...options,
    headers: { 'x-session-id': input.sessionId, ...(options.headers ?? {}) },
    body: { product_id: input.productId },
  });
  return parseVariantResponse(raw);
}

/**
 * Add a real AYWEBs cart line. The body contains intent + server-signed quote
 * + bounded capture only; it deliberately has no client price/currency/stock.
 */
export async function addAyWebsCartItem(input: {
  productId: string;
  sourceUrl: string;
  storeId: string;
  sessionId: string;
  variant: Record<string, string>;
  quantity: number;
  quoteToken: string;
  capture: AyWebsCapture | null;
  requestId: string;
}, options: RequestOptions = {}): Promise<AyWebsCartAddResult> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 99) {
    throw new ApiError('malformed', 'Quantité AYWEBs invalide (entier 1..99).');
  }
  if (!input.quoteToken) throw new ApiError('malformed', 'Devis serveur AYWEBs absent.');
  const raw = await apiSendEnvelope<unknown>('POST', `${AYWEBS_API}/cart/items`, {
    ...options,
    headers: {
      'x-session-id': input.sessionId,
      'Idempotency-Key': input.requestId,
      ...(options.headers ?? {}),
    },
    body: {
      product_id: input.productId,
      source_url: input.sourceUrl,
      store_id: input.storeId,
      variant: input.variant,
      quantity: input.quantity,
      quote_token: input.quoteToken,
      ...(input.capture ? { capture: input.capture } : {}),
    },
  });
  return parseCartAdd(raw);
}
