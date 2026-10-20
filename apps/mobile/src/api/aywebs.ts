/**
 * AYWEBs API — native mobile client.
 *
 * No imports from `client/`: the mobile app talks to the existing server
 * contract through the shared API transport and always carries its persistent
 * `x-session-id`. Prices, availability and quotes are server-owned facts.
 */
import { ApiError } from './errors';
import {
  apiGetData,
  apiGetEnvelope,
  apiGetText,
  apiSendData,
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
  domains?: string[];
  country: string;
  currency: string;
  logo: string;
  enabled: boolean;
  captureSupported: boolean;
  operational: boolean;
  operationalReason: string;
  adapter?: string;
  status?: string;
  integrationType: string;
  capabilities: string[];
  canBrowse?: boolean;
  browserMode: string;
  homeUrl: string;
  searchUrlTemplate?: string;
  categories: string[];
  popular: boolean;
  phase?: number | null;
  purchaseMode: string;
  description?: string;
}

export interface AyWebsCategory {
  id: string;
  labelFr: string;
  labelAr: string;
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

export interface AyWebsCapturedVariantGroup {
  attribute: string;
  sourceKey: string;
  label: string;
  values: string[];
  valueStates?: Array<{ value: string; state: 'AVAILABLE' | 'UNAVAILABLE' | 'SELECTED' | 'UNKNOWN' }>;
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
  variantGroups: AyWebsCapturedVariantGroup[];
  selectedVariantAttributes: Record<string, string>;
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
    adapter: text(value.adapter),
    status: text(value.status),
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
    description: text(value.description),
  };
}

export function parseAyWebsStores(payload: unknown): AyWebsStore[] {
  if (!Array.isArray(payload)) throw malformed('liste des boutiques');
  return payload.map(parseStore);
}

export function parseAyWebsCategories(payload: unknown): AyWebsCategory[] {
  if (!Array.isArray(payload)) return [];
  return payload.flatMap((entry) => {
    if (!isRecord(entry) || !text(entry.id)) return [];
    return [{ id: text(entry.id), labelFr: text(entry.labelFr), labelAr: text(entry.labelAr) }];
  });
}

export async function fetchAyWebsStores(options: RequestOptions = {}): Promise<AyWebsStore[]> {
  const data = await apiGetData<unknown>(`${AYWEBS_API}/stores`, options);
  return parseAyWebsStores(data);
}

export async function fetchAyWebsStoreCatalog(
  options: RequestOptions = {},
): Promise<{ stores: AyWebsStore[]; categories: AyWebsCategory[] }> {
  const payload = await apiGetEnvelope<unknown>(`${AYWEBS_API}/stores`, options);
  const body = isRecord(payload) ? payload : {};
  return {
    stores: parseAyWebsStores(body.data),
    categories: parseAyWebsCategories(body.categories),
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
  const dimensionAttributes: Record<string, string> = {
    size_name: 'size', ring_size: 'size', color_name: 'color', style_name: 'style',
    pattern_name: 'pattern', flavor_name: 'flavor', capacity: 'capacity', format_name: 'format',
    model_name: 'model', material_name: 'material', item_type_name: 'type',
    length_name: 'length', volume_name: 'volume',
  };
  const rawGroups = value.variantGroups ?? [];
  if (!Array.isArray(rawGroups) || rawGroups.length > 12) throw malformed('groupes de variantes');
  const variantGroups: AyWebsCapturedVariantGroup[] = [];
  const seenAttributes = new Set<string>();
  for (const rawGroup of rawGroups) {
    if (!isRecord(rawGroup)) continue;
    const sourceKey = text(rawGroup.sourceKey).toLowerCase();
    const attribute = text(rawGroup.attribute).toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    const derived = dimensionAttributes[sourceKey] ?? sourceKey.replace(/_name$/, '').replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    if (!/^[a-z0-9_]{1,40}$/.test(sourceKey) || !attribute || attribute !== derived
      || ['__proto__', 'prototype', 'constructor'].includes(attribute) || seenAttributes.has(attribute)) continue;
    if (!Array.isArray(rawGroup.values) || rawGroup.values.length > 30) throw malformed('valeurs de variante');
    const values = [...new Set(rawGroup.values.flatMap((item) => {
      const candidate = text(item).slice(0, 60);
      return candidate ? [candidate] : [];
    }))];
    if (!values.length) continue;
    const valueStates: NonNullable<AyWebsCapturedVariantGroup['valueStates']> = [];
    if (rawGroup.valueStates !== undefined) {
      if (!Array.isArray(rawGroup.valueStates) || rawGroup.valueStates.length > 30) throw malformed('états de variante');
      for (const rawState of rawGroup.valueStates) {
        if (!isRecord(rawState)) continue;
        const stateValue = text(rawState.value).slice(0, 60);
        const publishedValue = values.find((candidate) => candidate.toLowerCase() === stateValue.toLowerCase());
        const state = text(rawState.state).toUpperCase();
        if (publishedValue && ['AVAILABLE', 'UNAVAILABLE', 'SELECTED', 'UNKNOWN'].includes(state)) {
          valueStates.push({ value: publishedValue, state: state as NonNullable<AyWebsCapturedVariantGroup['valueStates']>[number]['state'] });
        }
      }
    }
    variantGroups.push({
      attribute,
      sourceKey,
      label: text(rawGroup.label).slice(0, 60) || attribute,
      values,
      ...(valueStates.length ? { valueStates } : {}),
    });
    seenAttributes.add(attribute);
  }
  const selectedVariantAttributes: Record<string, string> = {};
  const rawSelected = value.selectedVariantAttributes;
  if (rawSelected !== undefined && !isRecord(rawSelected)) throw malformed('sélection de variante');
  if (isRecord(rawSelected) && Object.keys(rawSelected).length > 12) throw malformed('sélection de variante');
  for (const group of variantGroups) {
    const candidate = isRecord(rawSelected) ? text(rawSelected[group.attribute]).slice(0, 60) : '';
    const selectedValue = group.values.find((item) => item.toLowerCase() === candidate.toLowerCase());
    if (selectedValue) selectedVariantAttributes[group.attribute] = selectedValue;
  }
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
    variantGroups,
    selectedVariantAttributes,
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

/**
 * Ask the merchant page to apply the exact visible selection, then run a fresh
 * capture. Option labels are matched exactly; no variant price or stock is
 * copied from another choice.
 */
export function buildAyWebsVariantSelectionInjection(
  script: string,
  requestId: string,
  groups: AyWebsCapturedVariantGroup[],
  selection: Record<string, string>,
): string {
  if (!script.trim() || script.length > 120_000) throw malformed('script de capture');
  if (!Array.isArray(groups) || groups.length > 12 || !selection || typeof selection !== 'object') throw malformed('sélection de variante');
  const entries = Object.entries(selection);
  if (!entries.length || entries.length > 12) throw malformed('sélection de variante');
  const plan = entries.map(([attribute, rawValue]) => {
    const group = groups.find((candidate) => candidate.attribute === attribute);
    const value = text(rawValue).slice(0, 60);
    if (!group || !value || !/^[a-z0-9_]{1,40}$/.test(group.sourceKey)) throw malformed('sélection de variante');
    const exact = group.values.find((candidate) => candidate.toLowerCase() === value.toLowerCase());
    if (!exact) throw malformed('valeur de variante non publiée');
    const state = group.valueStates?.find((candidate) => candidate.value.toLowerCase() === exact.toLowerCase())?.state;
    if (state === 'UNAVAILABLE') throw malformed('variante publiée indisponible');
    return { attribute: group.attribute, sourceKey: group.sourceKey, value: exact };
  });
  const id = JSON.stringify(requestId.slice(0, 80));
  const planJson = JSON.stringify(plan);
  const scriptJson = JSON.stringify(script);
  return String.raw`;(function(){
    var requestId=${id}, plan=${planJson}, reader=${scriptJson};
    function norm(value){return String(value||"").replace(/\s+/g," ").trim().toLowerCase();}
    function postError(){try{window.ReactNativeWebView.postMessage(JSON.stringify({type:"aywebs_capture_error",requestId:requestId}));}catch(e){}}
    function isAmazon(){return /(^|\.)amazon\.[a-z]{2,3}(?:\.[a-z]{2})?$/i.test(String(location.hostname||""));}
    function isNavigation(node){
      for(var n=node,h=0;n&&h<6;h++,n=n.parentNode){
        var tag=String(n.tagName||"").toLowerCase();
        var descriptor=String((n.id||"")+" "+(n.className||"")).toLowerCase();
        if(tag==="header"||tag==="nav"||/navbar|nav-|search|department/.test(descriptor))return true;
        if(n.getAttribute&&n.getAttribute("role")==="search")return true;
      }
      return false;
    }
    function dimensionForText(raw){
      var value=String(raw||"").toLowerCase().replace(/[_-]+/g," ");
      var rules=[
        ["size",/\b(size|sizes|taille|tailles|pointure|pointures|shoe size|größe|gr[oö]sse)\b/i],
        ["color",/\b(color|colour|couleur|couleurs|farbe|coloris)\b/i],
        ["capacity",/\b(capacity|capacite|capacité|volume|contenance)\b/i],
        ["storage",/\b(storage|stockage|memory|mémoire|ram|ssd)\b/i],
        ["model",/\b(model|modèle|modele|variant|variante)\b/i],
        ["style",/\b(style|coupe|fit)\b/i],
        ["pattern",/\b(pattern|motif|print)\b/i],
        ["material",/\b(material|matière|matiere|fabric|tissu)\b/i],
        ["format",/\b(format|edition|édition|type|bundle|lot)\b/i],
        ["length",/\b(length|longueur)\b/i],
        ["width",/\b(width|largeur)\b/i]
      ];
      for(var r=0;r<rules.length;r++)if(rules[r][1].test(value))return rules[r][0];
      return "";
    }
    function genericDimension(node){
      var parts=[];
      for(var current=node,up=0;current&&up<3;up++,current=current.parentNode){
        if(!current.getAttribute)continue;
        var attrs=["data-attribute-name","data-attribute","data-dimension","data-dimension-name","data-variant-attribute","data-variant-name","aria-label","name","id","data-testid","class"];
        for(var a=0;a<attrs.length;a++){var value=current.getAttribute(attrs[a]);if(value)parts.push(value);}
        try{var labels=current.querySelectorAll("legend,label,[data-attribute-name],[data-dimension],[class*=title i],[class*=label i],[class*=name i]");for(var l=0;l<labels.length&&l<4;l++)if(labels[l].textContent)parts.push(labels[l].textContent);}catch(e){}
      }
      for(var p=0;p<parts.length;p++){var dimension=dimensionForText(parts[p]);if(dimension)return dimension;}
      return "";
    }
    function hasOptionControls(node){
      if(String(node.tagName||"").toLowerCase()==="select")return true;
      try{return node.querySelectorAll('select option,[role="option"],[role="radio"],[data-attribute-value],[data-value],button,li[title],.sku-item,input[type="radio"]').length>0;}catch(e){return false;}
    }
    function genericContainer(item){
      var root=document.querySelector('main,[role="main"],[itemtype*="Product" i]')||document.body;
      var selectors='select,fieldset,[role="group"],[data-attribute-name],[data-attribute],[data-dimension],[data-dimension-name],[data-variant-attribute],[data-variant-name],[class*="sku-property" i],[class*="sku-prop" i],[class*="goods-sku" i],[class*="variant" i],[class*="swatch" i],[class*="size" i],[class*="taille" i],[class*="color" i],[class*="colour" i],[class*="couleur" i],[data-testid*="size" i],[data-testid*="color" i],[data-testid*="variant" i]';
      var candidates=[];try{candidates=root.querySelectorAll(selectors);}catch(e){}
      for(var i=0;i<candidates.length;i++){
        var candidate=candidates[i];
        if(isNavigation(candidate)||genericDimension(candidate)!==item.attribute||!hasOptionControls(candidate))continue;
        return candidate;
      }
      return null;
    }
    function getContainer(item){
      if(isAmazon()){
        var productRoot=document.querySelector('#dp-container')||document.querySelector('#ppd')||document.querySelector('#dp')||document.querySelector('#centerCol');
        var root=productRoot&&productRoot.querySelector('#twister_feature_div,[data-feature-name="twister"]');
        if(!root)return null;
        var container=root.querySelector('[id="variation_'+item.sourceKey+'"]');
        if(container)return container;
        try{
          container=root.querySelector('[data-dimension="'+item.sourceKey+'"],[data-dimension-name="'+item.sourceKey+'"]');
          if(container)return container;
        }catch(e){}
        var current=root.querySelector('[id="inline-twister-expanded-dimension-text-'+item.sourceKey+'"]');
        return current&&current.parentNode?current.parentNode:null;
      }
      return genericContainer(item);
    }
    function labels(node){
      var values=[];
      if(!node)return values;
      var attrs=isAmazon()?["title","aria-label","data-attribute-value","data-value"]:["title","aria-label","data-attribute-value","data-value","data-size","data-color"];
      for(var a=0;a<attrs.length;a++){var attr=node.getAttribute&&node.getAttribute(attrs[a]);if(attr)values.push(attr);}
      var labelledBy=node.getAttribute&&node.getAttribute("aria-labelledby");
      if(labelledBy){var ref=document.getElementById(labelledBy.split(" ")[0]);if(ref)values.push(ref.textContent);}
      try{var textNode=node.querySelector(".a-button-text,.swatchText,[class*=dimension-text i],label");if(textNode)values.push(textNode.textContent);}catch(e){}
      if(!isAmazon()&&String(node.tagName||"").toLowerCase()==="input"){
        try{var parent=node.parentNode;if(parent&&String(parent.tagName||"").toLowerCase()==="label")values.push(parent.textContent);}catch(e){}
      }
      if(node.textContent)values.push(node.textContent);
      return values;
    }
    function textMatches(node,value){var wanted=norm(value), candidates=labels(node);for(var i=0;i<candidates.length;i++){if(norm(candidates[i])===wanted)return true;}return false;}
    function disabled(node){
      if(!node)return true;
      var aria=node.getAttribute&&node.getAttribute("aria-disabled");
      var klass=String(node.className||"").toLowerCase();
      return node.disabled===true||aria==="true"||(node.getAttribute&&node.getAttribute("disabled")!==null)
        ||(isAmazon()?/a-button-disabled|unavailable|out.of.stock/.test(klass):/disabled|sold.?out|unavailable|out.of.stock/.test(klass));
    }
    function selected(node){
      if(!node)return false;
      if(node.selected===true)return true;
      var aria=node.getAttribute&&node.getAttribute("aria-checked");
      var ariaSelected=node.getAttribute&&node.getAttribute("aria-selected");
      var ariaPressed=node.getAttribute&&node.getAttribute("aria-pressed");
      var dataSelected=node.getAttribute&&node.getAttribute("data-selected");
      var klass=String(node.className||"").toLowerCase();
      if(isAmazon())return aria==="true"||ariaSelected==="true"||/selected|swatchselect/.test(klass);
      return aria==="true"||ariaSelected==="true"||ariaPressed==="true"||dataSelected==="true"||/(^|[ _-])(selected|active|current|is-checked|checked)([ _-]|$)|swatchselect/.test(klass);
    }
    function findSelected(container,item){
      var candidates=[];
      var selector=isAmazon()?'select option:checked,[aria-checked="true"],[aria-selected="true"],.a-button-selected,li[class*="selected" i],button[class*="selected" i]':'select option:checked,input[type="radio"]:checked,[aria-checked="true"],[aria-selected="true"],[aria-pressed="true"],[data-selected="true"],.a-button-selected,[class*="selected" i],[class*="active" i]';
      try{candidates=container.querySelectorAll(selector);}catch(e){}
      for(var i=0;i<candidates.length;i++){if(textMatches(candidates[i],item.value))return true;}
      return false;
    }
    function selectValue(item){
      var container=getContainer(item);if(!container)return false;
      var selects=[];try{if(!isAmazon()&&String(container.tagName||"").toLowerCase()==="select")selects=[container];else selects=container.querySelectorAll("select");}catch(e){}
      for(var s=0;s<selects.length;s++){
        var options=selects[s].options||[];
        for(var o=0;o<options.length;o++){
          if(!textMatches(options[o],item.value))continue;
          if(disabled(options[o]))return false;
          if(options[o].selected)return true;
          selects[s].selectedIndex=o;
          try{selects[s].dispatchEvent(new Event("input",{bubbles:true}));selects[s].dispatchEvent(new Event("change",{bubbles:true}));}catch(e){}
          return true;
        }
      }
      var candidates=[];
      var choiceSelector=isAmazon()?'li,[role="radio"],[role="option"],button,.a-button,[data-attribute-value],[data-value]':'li,[role="radio"],[role="option"],input[type="radio"],button,.a-button,[data-attribute-value],[data-value]';
      try{candidates=container.querySelectorAll(choiceSelector);}catch(e){}
      for(var c=0;c<candidates.length;c++){
        var candidate=candidates[c];if(!textMatches(candidate,item.value))continue;
        if(disabled(candidate))return false;
        if(selected(candidate))return true;
        try{candidate.click();return true;}catch(e){return false;}
      }
      return findSelected(container,item);
    }
    try{
      for(var p=0;p<plan.length;p++){if(!selectValue(plan[p])){postError();return true;}}
      var attempts=0;
      function captureAfterSelection(){
        var ready=true;
        for(var q=0;q<plan.length;q++){var box=getContainer(plan[q]);if(!box||!findSelected(box,plan[q])){ready=false;break;}}
        if(ready){setTimeout(function(){try{var result=(0,eval)(reader);window.ReactNativeWebView.postMessage(JSON.stringify({type:"aywebs_capture",requestId:requestId,payload:result}));}catch(e){postError();}},350);return;}
        attempts++;if(attempts<24){setTimeout(captureAfterSelection,150);return;}postError();
      }
      setTimeout(captureAfterSelection,150);
    }catch(e){postError();}
    return true;
  })();true;`;
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

export interface AyWebsSessionOptions {
  sessionId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const sessionHeaders = (sessionId: string): Record<string, string> => ({
  'x-session-id': sessionId,
});

const attributesOf = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const name = String(rawKey ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    const strVal = typeof rawValue === 'string' ? rawValue.trim().slice(0, 120) : '';
    if (name && strVal) out[name] = strVal;
  }
  return out;
};

export interface AyWebsCartItem {
  id: string;
  itemNumber: string;
  productId: string;
  storeId: string;
  storeName: string;
  sourceUrl: string;
  title: string;
  images: string[];
  unitPrice: number | null;
  currency: string;
  variantLabel: string;
  quantity: number;
  availability: string;
  status: string;
  statusReason: string;
  customerNote: string;
  purchaseMode: string;
  checkoutReady: boolean;
  lineTotalTnd: number | null;
  linkedToAyrovi: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface AyWebsCartGroup {
  storeId: string;
  storeName: string;
  integrationType: string;
  subtotalTnd: number | null;
  blockedItems: number;
  items: AyWebsCartItem[];
}

export interface AyWebsCartTotals {
  units: number;
  productSubtotalTnd: number | null;
  currency: string;
  blockedItems: number;
  checkoutReady: boolean;
  unlinkedUnits: number | null;
}

export interface AyWebsCartBlocker {
  itemId: string;
  code: string;
  message: string;
  action: string;
}

export interface AyWebsCart {
  hasCart: boolean;
  items: AyWebsCartItem[];
  groups: AyWebsCartGroup[];
  totals: AyWebsCartTotals;
  blockers: AyWebsCartBlocker[];
}

export function parseAyWebsCartItem(entry: unknown): AyWebsCartItem {
  if (!isRecord(entry) || !text(entry.id)) throw malformed('ligne de panier');
  return {
    id: text(entry.id),
    itemNumber: text(entry.item_number),
    productId: text(entry.product_id),
    storeId: text(entry.store_id),
    storeName: text(entry.store_name),
    sourceUrl: text(entry.source_url),
    title: text(entry.title),
    images: stringList(entry.images),
    unitPrice: numberOrNull(entry.unit_price),
    currency: text(entry.currency),
    variantLabel: text(entry.variant_label),
    quantity: numberOrNull(entry.quantity) ?? 0,
    availability: text(entry.availability),
    status: text(entry.status),
    statusReason: text(entry.status_reason),
    customerNote: text(entry.customer_note),
    purchaseMode: text(entry.purchase_mode),
    checkoutReady: bool(entry.checkout_ready),
    lineTotalTnd: numberOrNull(entry.line_total_tnd),
    linkedToAyrovi: typeof entry.linked_to_ayrovi === 'boolean' ? entry.linked_to_ayrovi : null,
    createdAt: text(entry.created_at),
    updatedAt: text(entry.updated_at),
  };
}

export function parseAyWebsCart(payload: unknown): AyWebsCart {
  if (!isRecord(payload)) throw malformed('panier');
  const totals = isRecord(payload.totals) ? payload.totals : {};
  const groups = payload.groups === undefined || payload.groups === null
    ? []
    : Array.isArray(payload.groups)
      ? payload.groups.map((group) => {
        if (!isRecord(group) || !text(group.store_id)) throw malformed('groupe de panier');
        return {
          storeId: text(group.store_id),
          storeName: text(group.store_name),
          integrationType: text(group.integration_type),
          subtotalTnd: numberOrNull(group.subtotal_tnd),
          blockedItems: numberOrNull(group.blocked_items) ?? 0,
          items: Array.isArray(group.items) ? group.items.map(parseAyWebsCartItem) : [],
        };
      })
      : (() => { throw malformed('groupes de panier'); })();
  const blockers = payload.blockers === undefined || payload.blockers === null
    ? []
    : Array.isArray(payload.blockers)
      ? payload.blockers.map((blocker) => {
        if (!isRecord(blocker)) throw malformed('blocage de panier');
        return {
          itemId: text(blocker.itemId ?? blocker.item_id),
          code: text(blocker.code),
          message: text(blocker.message),
          action: text(blocker.action),
        };
      })
      : (() => { throw malformed('blocages de panier'); })();
  return {
    hasCart: isRecord(payload.cart),
    items: payload.items === undefined || payload.items === null
      ? []
      : Array.isArray(payload.items)
        ? payload.items.map(parseAyWebsCartItem)
        : (() => { throw malformed('lignes de panier'); })(),
    groups,
    totals: {
      units: numberOrNull(totals.units) ?? 0,
      productSubtotalTnd: numberOrNull(totals.product_subtotal_tnd),
      currency: text(totals.currency),
      blockedItems: numberOrNull(totals.blocked_items) ?? 0,
      checkoutReady: bool(totals.checkout_ready),
      unlinkedUnits: numberOrNull(totals.unlinked_units),
    },
    blockers,
  };
}

export async function fetchAyWebsCart(options: AyWebsSessionOptions): Promise<AyWebsCart> {
  const data = await apiGetData<unknown>(`${AYWEBS_API}/cart`, {
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  return parseAyWebsCart(data);
}

export async function updateAyWebsCartItem(
  itemId: string,
  changes: { quantity?: number; variant?: Record<string, string> | null; customerNote?: string },
  options: AyWebsSessionOptions,
): Promise<{ item: AyWebsCartItem | null; removed: boolean; cart: AyWebsCart }> {
  const body: Record<string, unknown> = {};
  if (typeof changes.quantity === 'number') body.quantity = changes.quantity;
  if (changes.variant) body.variant_attributes = changes.variant;
  if (changes.customerNote !== undefined) body.customer_note = changes.customerNote;
  const envelope = await apiSendEnvelope<Record<string, unknown>>(
    'PATCH',
    `${AYWEBS_API}/cart/items/${encodeURIComponent(itemId)}`,
    { body, headers: sessionHeaders(options.sessionId), signal: options.signal, timeoutMs: options.timeoutMs },
  );
  const data = isRecord(envelope.data) ? envelope.data : {};
  return {
    item: isRecord(data.item) ? parseAyWebsCartItem(data.item) : null,
    removed: bool(data.removed),
    cart: parseAyWebsCart(data.cart ?? envelope.cart),
  };
}

export async function removeAyWebsCartItem(itemId: string, options: AyWebsSessionOptions): Promise<AyWebsCart> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>(
    'DELETE',
    `${AYWEBS_API}/cart/items/${encodeURIComponent(itemId)}`,
    { headers: sessionHeaders(options.sessionId), signal: options.signal, timeoutMs: options.timeoutMs },
  );
  return parseAyWebsCart(envelope.cart);
}

export async function acceptAyWebsCartPriceChange(
  itemId: string,
  options: AyWebsSessionOptions,
): Promise<{ item: AyWebsCartItem; cart: AyWebsCart }> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>(
    'POST',
    `${AYWEBS_API}/cart/items/${encodeURIComponent(itemId)}/accept-price`,
    { body: {}, headers: sessionHeaders(options.sessionId), signal: options.signal, timeoutMs: options.timeoutMs },
  );
  const data = isRecord(envelope.data) ? envelope.data : {};
  return { item: parseAyWebsCartItem(data.item), cart: parseAyWebsCart(envelope.cart) };
}

export interface AyWebsCartChange {
  itemId: string;
  code: string;
  message: string;
}

export async function verifyAyWebsCart(
  options: AyWebsSessionOptions & { recheckSource?: boolean },
): Promise<{ changes: AyWebsCartChange[]; cart: AyWebsCart }> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>('POST', `${AYWEBS_API}/cart/verify`, {
    body: { recheck_source: options.recheckSource === true },
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  const data = isRecord(envelope.data) ? envelope.data : {};
  const changes = Array.isArray(data.changes)
    ? data.changes.filter(isRecord).map((change) => ({
      itemId: text(change.itemId ?? change.item_id),
      code: text(change.code),
      message: text(change.message),
    }))
    : [];
  return { changes, cart: parseAyWebsCart(envelope.cart) };
}

export interface AyWebsBridgeOutcome {
  moved: Array<{
    aywebsItemId: string; aywebsItemNumber: string; cartItemId: string; store: string;
    title: string; quantity: number; priceTnd: number | null; duplicate: boolean; synced: boolean;
  }>;
  skipped: Array<{ aywebsItemId: string; code: string; message: string }>;
  totalItemsCount: number;
  totalTnd: number | null;
  message: string;
}

export async function bridgeAyWebsCartToAyrovi(
  options: AyWebsSessionOptions & { itemIds?: string[] },
): Promise<AyWebsBridgeOutcome> {
  const envelope = await apiSendEnvelope<Record<string, unknown>>('POST', `${AYWEBS_API}/cart/bridge-to-ayrovi`, {
    body: { item_ids: options.itemIds ?? [] },
    headers: sessionHeaders(options.sessionId),
    signal: options.signal,
    timeoutMs: options.timeoutMs,
  });
  const data = isRecord(envelope.data) ? envelope.data : {};
  const moved = Array.isArray(data.moved) ? data.moved.filter(isRecord).map((line) => ({
    aywebsItemId: text(line.aywebsItemId ?? line.aywebs_item_id),
    aywebsItemNumber: text(line.aywebsItemNumber ?? line.aywebs_item_number),
    cartItemId: text(line.cartItemId ?? line.cart_item_id),
    store: text(line.store),
    title: text(line.title),
    quantity: numberOrNull(line.quantity) ?? 0,
    priceTnd: numberOrNull(line.priceTnd ?? line.price_tnd),
    duplicate: bool(line.duplicate),
    synced: bool(line.synced),
  })) : [];
  const skipped = Array.isArray(data.skipped) ? data.skipped.filter(isRecord).map((line) => ({
    aywebsItemId: text(line.aywebsItemId ?? line.aywebs_item_id),
    code: text(line.code),
    message: text(line.message),
  })) : [];
  return {
    moved,
    skipped,
    totalItemsCount: numberOrNull(data.totalItemsCount ?? data.total_items_count) ?? 0,
    totalTnd: numberOrNull(data.totalTnd ?? data.total_tnd),
    message: text(data.message),
  };
}

export const AYWEBS_SOURCE_VERIFICATION_REQUIRED = 'AYWEBS_SOURCE_VERIFICATION_REQUIRED';

export type AyWebsNextAction = 'WAIT_FOR_REVIEW' | 'PROVIDE_MORE_DETAILS' | 'VIEW_ORDER' | 'CONTACT_SUPPORT' | '';

export interface AyWebsPurchaseRequest {
  id: string;
  requestNumber: string;
  storeId: string;
  storeName: string;
  registeredStore: boolean;
  productUrl: string;
  sourceDomain: string;
  quantity: number;
  productName: string;
  variantAttributes: Record<string, string>;
  requirements: string;
  customerNotes: string;
  status: string;
  reason: string;
  decisionNote: string;
  decidedAt: string;
  orderId: string;
  nextAction: AyWebsNextAction;
  createdAt: string;
  updatedAt: string;
}

const nextActionOf = (value: unknown): AyWebsNextAction => {
  const str = text(value);
  return str === 'WAIT_FOR_REVIEW' || str === 'PROVIDE_MORE_DETAILS' || str === 'VIEW_ORDER' || str === 'CONTACT_SUPPORT'
    ? str
    : '';
};

export function parseAyWebsPurchaseRequest(entry: unknown): AyWebsPurchaseRequest {
  if (!isRecord(entry) || !text(entry.id) || !text(entry.request_number)) {
    throw malformed('demande d’achat');
  }
  return {
    id: text(entry.id),
    requestNumber: text(entry.request_number),
    storeId: text(entry.store_id),
    storeName: text(entry.store_name),
    registeredStore: bool(entry.registered_store),
    productUrl: text(entry.product_url),
    sourceDomain: text(entry.source_domain),
    quantity: numberOrNull(entry.quantity) ?? 0,
    productName: text(entry.product_name),
    variantAttributes: attributesOf(entry.variant_attributes),
    requirements: text(entry.requirements),
    customerNotes: text(entry.customer_notes),
    status: text(entry.status),
    reason: text(entry.reason),
    decisionNote: text(entry.decision_note),
    decidedAt: text(entry.decided_at),
    orderId: text(entry.order_id),
    nextAction: nextActionOf(entry.next_action),
    createdAt: text(entry.created_at),
    updatedAt: text(entry.updated_at),
  };
}

export interface AyWebsStoreRequest {
  id: string;
  storeUrl: string;
  storeName: string;
  sourceDomain: string;
  intent: string;
  notes: string;
  status: string;
  decisionNote: string;
  decidedAt: string;
  promotedStoreId: string;
  createdAt: string;
}

export function parseAyWebsStoreRequest(entry: unknown): AyWebsStoreRequest {
  if (!isRecord(entry) || !text(entry.id) || !text(entry.store_url)) {
    throw malformed('demande de boutique');
  }
  return {
    id: text(entry.id),
    storeUrl: text(entry.store_url),
    storeName: text(entry.store_name),
    sourceDomain: text(entry.source_domain),
    intent: text(entry.intent),
    notes: text(entry.notes),
    status: text(entry.status),
    decisionNote: text(entry.decision_note),
    decidedAt: text(entry.decided_at),
    promotedStoreId: text(entry.promoted_store_id),
    createdAt: text(entry.created_at),
  };
}

export async function createAyWebsPurchaseRequest(
  input: {
    productUrl: string;
    productName?: string;
    variant?: Record<string, string> | null;
    quantity?: number;
    requirements?: string;
    customerNotes?: string;
    storeId?: string;
  },
  options: AyWebsSessionOptions,
): Promise<AyWebsPurchaseRequest> {
  const body: Record<string, unknown> = { product_url: input.productUrl };
  if (input.productName) body.product_name = input.productName;
  if (input.variant && Object.keys(input.variant).length) body.variant_attributes = input.variant;
  if (typeof input.quantity === 'number' && input.quantity > 0) body.quantity = input.quantity;
  if (input.requirements) body.requirements = input.requirements;
  if (input.customerNotes) body.customer_notes = input.customerNotes;
  if (input.storeId) body.store_id = input.storeId;
  const data = await apiSendData<unknown>('POST', `${AYWEBS_API}/purchase-requests`, {
    body, headers: sessionHeaders(options.sessionId), signal: options.signal, timeoutMs: options.timeoutMs,
  });
  return parseAyWebsPurchaseRequest(data);
}

export async function fetchAyWebsPurchaseRequests(
  options: AyWebsSessionOptions & { limit?: number },
): Promise<AyWebsPurchaseRequest[]> {
  const limit = options.limit && options.limit > 0 ? `?limit=${Math.min(200, Math.floor(options.limit))}` : '';
  const data = await apiGetData<unknown>(`${AYWEBS_API}/purchase-requests${limit}`, {
    headers: sessionHeaders(options.sessionId), signal: options.signal, timeoutMs: options.timeoutMs,
  });
  if (!Array.isArray(data)) throw malformed('demandes d’achat');
  return data.map(parseAyWebsPurchaseRequest);
}

export async function createAyWebsStoreRequest(
  input: { storeUrl: string; storeName?: string; intent?: string; notes?: string },
  options: AyWebsSessionOptions,
): Promise<AyWebsStoreRequest> {
  const body: Record<string, unknown> = { store_url: input.storeUrl };
  if (input.storeName) body.store_name = input.storeName;
  if (input.intent) body.intent = input.intent;
  if (input.notes) body.notes = input.notes;
  const data = await apiSendData<unknown>('POST', `${AYWEBS_API}/store-requests`, {
    body, headers: sessionHeaders(options.sessionId), signal: options.signal, timeoutMs: options.timeoutMs,
  });
  return parseAyWebsStoreRequest(data);
}

export async function fetchAyWebsStoreRequests(
  options: AyWebsSessionOptions & { limit?: number },
): Promise<AyWebsStoreRequest[]> {
  const limit = options.limit && options.limit > 0 ? `?limit=${Math.min(200, Math.floor(options.limit))}` : '';
  const data = await apiGetData<unknown>(`${AYWEBS_API}/store-requests${limit}`, {
    headers: sessionHeaders(options.sessionId), signal: options.signal, timeoutMs: options.timeoutMs,
  });
  if (!Array.isArray(data)) throw malformed('demandes de boutique');
  return data.map(parseAyWebsStoreRequest);
}

export const ayWebsNeedsHumanRequest = (purchaseMode: string): boolean =>
  purchaseMode !== '' && purchaseMode !== 'SUPPORTED';

