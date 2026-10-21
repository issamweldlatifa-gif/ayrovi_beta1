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
  /** Exact merchant price is present only when the server marks this variant quote as verified. */
  sourcePrice?: number | null;
  currency?: string;
  priceVerified?: boolean;
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
    const quotedPrice = numberOrNull(entry.quoted_price);
    const quotedCurrency = text(entry.quoted_currency).toUpperCase();
    const priceVerified = entry.price_source === 'VARIANT'
      && quotedPrice !== null
      && quotedPrice > 0
      && /^[A-Z]{3}$/.test(quotedCurrency);
    return [{
      sourceVariantId: text(entry.source_variant_id),
      attributes,
      label: text(entry.label),
      availability: parseAvailability(entry.availability),
      availabilityReason: text(entry.availability_reason),
      priceTnd: numberOrNull(pricing.total_tnd),
      sourcePrice: priceVerified ? quotedPrice : null,
      currency: priceVerified ? quotedCurrency : '',
      priceVerified,
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
