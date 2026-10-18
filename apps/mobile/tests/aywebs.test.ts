import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addAyWebsCartItem,
  AYWEBS_RESOLVE_TIMEOUT_MS,
  buildAyWebsCaptureInjection,
  fetchAyWebsHome,
  parseAyWebsCapture,
  resolveAyWebsProduct,
  type AyWebsCapture,
  type AyWebsProduct,
  type AyWebsStore,
} from '../src/api/aywebs';
import { ApiError } from '../src/api/errors';
import type { Translate } from '../src/i18n';
import {
  isAllowedAyWebsMerchantUrl,
  normalizeAyWebsUrl,
  parseAyWebsCaptureMessage,
  safeAyWebsStartUrl,
  storeForAyWebsUrl,
} from '../src/features/aywebs/merchantSecurity';
import { ayWebsLinkMessage } from '../src/features/aywebs/errors';
import { ayWebsAddReadiness } from '../src/features/aywebs/variantLogic';

const amazon: AyWebsStore = {
  id: 'amazon', name: 'Amazon', displayName: 'Amazon',
  domains: ['amazon.com', 'amazon.fr'], country: 'US', currency: 'USD', logo: '',
  enabled: true, captureSupported: true, operational: true, operationalReason: '',
  integrationType: 'PARTIALLY_SUPPORTED', capabilities: ['browse', 'product'], canBrowse: true,
  browserMode: 'external', homeUrl: 'https://www.amazon.com/',
  searchUrlTemplate: 'https://www.amazon.com/s?k={query}', categories: [], popular: true,
  phase: 1, purchaseMode: 'MANUAL_REVIEW',
};

const product: AyWebsProduct = {
  productId: 'p-1', storeId: 'amazon', storeName: 'Amazon',
  sourceUrl: 'https://www.amazon.com/dp/0123456789', sourceDomain: 'www.amazon.com',
  title: 'Product', description: '', brand: '', images: [], sourcePrice: 15, currency: 'USD',
  priceVerified: true, currencyVerified: true, variantGroups: [], variantPrices: [], selectedVariant: {},
  availability: 'AVAILABLE', availabilityReason: '', condition: '', seller: '', ayroviPriceTnd: 52,
  purchaseMode: 'MANUAL_REVIEW', integrationType: 'PARTIALLY_SUPPORTED',
};

const capture: AyWebsCapture = {
  v: 1,
  url: 'https://www.amazon.com/dp/0123456789',
  canonicalUrl: null,
  title: 'Product',
  brand: null,
  priceCandidates: [{ text: '$15.00', source: 'json_ld' as const }],
  currencyText: 'USD',
  availabilityText: 'In stock',
  addToCartText: 'Add to Cart',
  conditionText: null,
  selectedVariantTexts: [],
  variantTexts: [],
  images: ['https://images.example.test/product.jpg'],
  capturedAt: '2026-10-17T10:00:00.000Z',
  pageLang: 'en-US',
};

const jsonResponse = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), {
  status,
  headers: { 'content-type': 'application/json' },
});

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('AYWEBs — URL et WebView marchand sécurisés', () => {
  it('normalise un domaine collé et n’accepte que HTTPS sans identifiants ni port spécial', () => {
    expect(normalizeAyWebsUrl('  www.amazon.com/dp/1  ')).toBe('https://www.amazon.com/dp/1');
    expect(normalizeAyWebsUrl('http://www.amazon.com/dp/1')).toBeNull();
    expect(normalizeAyWebsUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeAyWebsUrl('https://user:pass@amazon.com/item')).toBeNull();
    expect(normalizeAyWebsUrl('https://amazon.com:8443/item')).toBeNull();
  });

  it('l’hôte doit correspondre à la boutique, jamais à un simple suffixe ressemblant', () => {
    expect(isAllowedAyWebsMerchantUrl('https://www.amazon.com/dp/1', amazon)).toBe(true);
    expect(isAllowedAyWebsMerchantUrl('https://amazon.fr/item', amazon)).toBe(true);
    expect(isAllowedAyWebsMerchantUrl('https://amazon.com.attacker.test/item', amazon)).toBe(false);
    expect(isAllowedAyWebsMerchantUrl('https://notamazon.com/item', amazon)).toBe(false);
    expect(isAllowedAyWebsMerchantUrl('http://amazon.com/item', amazon)).toBe(false);
    expect(safeAyWebsStartUrl('https://www.amazon.com/dp/1', amazon)).toBe('https://www.amazon.com/dp/1');
    expect(storeForAyWebsUrl('amazon.com/dp/1', [amazon])?.id).toBe('amazon');
    expect(storeForAyWebsUrl('https://evil.test/dp/1', [amazon])).toBeNull();
  });

  it('le pont du WebView ne reçoit qu’un message borné et une capture v1', () => {
    const message = JSON.stringify({ type: 'aywebs_capture', requestId: 'req-1', payload: JSON.stringify(capture) });
    expect(parseAyWebsCaptureMessage(message)).toEqual({ ok: true, requestId: 'req-1', capture });
    expect(parseAyWebsCaptureMessage('{')).toEqual({ ok: false, requestId: '', code: 'NOT_JSON' });
    expect(parseAyWebsCaptureMessage(JSON.stringify({ type: 'aywebs_capture_error', requestId: 'req-2' })))
      .toEqual({ ok: false, requestId: 'req-2', code: 'SCRIPT_ERROR' });
    expect(parseAyWebsCaptureMessage(JSON.stringify([])).ok).toBe(false);
  });

  it('valide les bornes de la capture et injecte le script avec un ID de requête', () => {
    expect(parseAyWebsCapture(capture)).toEqual(capture);
    expect(() => parseAyWebsCapture({ ...capture, v: 2 })).toThrow(ApiError);
    const amazonPair = {
      ...capture,
      priceCandidates: [
        { text: '$15.00', source: 'dom' as const },
        { text: '$15.00', source: 'dom_accessibility' as const },
      ],
    };
    expect(parseAyWebsCapture(amazonPair).priceCandidates).toEqual(amazonPair.priceCandidates);
    const fiveCandidates = { ...capture, priceCandidates: Array(5).fill(capture.priceCandidates[0]) };
    expect(parseAyWebsCapture(fiveCandidates).priceCandidates).toHaveLength(5);
    expect(() => parseAyWebsCapture({ ...capture, priceCandidates: Array(6).fill(capture.priceCandidates[0]) })).toThrow(ApiError);
    const injection = buildAyWebsCaptureInjection('(function(){return "{}";})();', 'request-token');
    expect(injection).toContain('request-token');
    expect(injection).toContain('ReactNativeWebView.postMessage');
  });
});

describe('AYWEBs — validation des choix avant Add to Cart', () => {
  const group = { attribute: 'size', values: ['S', 'M'] };
  const available = {
    sourceVariantId: 'v-m', attributes: { size: 'M' }, label: 'M',
    availability: 'AVAILABLE' as const, availabilityReason: '', priceTnd: 60,
  };

  it('bloque sans choix, sans prix vérifié, sans stock confirmé ou sans devis', () => {
    const withOptions = { ...product, variantGroups: [group], variantPrices: [available] };
    const base = { product: withOptions, groups: [group], variants: [available], sessionId: 'session-123', quoteToken: 'quote' };
    expect(ayWebsAddReadiness({ ...base, selected: {} }).reason).toBe('VARIANT_REQUIRED');
    expect(ayWebsAddReadiness({ ...base, selected: { size: 'M' }, quoteToken: '' }).reason).toBe('QUOTE_MISSING');
    expect(ayWebsAddReadiness({ ...base, selected: { size: 'S' } }).reason).toBe('VARIANT_UNPUBLISHED');
    expect(ayWebsAddReadiness({ ...base, selected: { size: 'M' }, sessionId: '' }).reason).toBe('SESSION_REQUIRED');
  });

  it('n’accepte qu’une combinaison publiée, disponible et tarifée par le serveur', () => {
    const withOptions = { ...product, variantGroups: [group], variantPrices: [available] };
    const ready = ayWebsAddReadiness({
      product: withOptions, groups: [group], variants: [available], selected: { size: 'M' },
      sessionId: 'session-123', quoteToken: 'signed-quote',
    });
    expect(ready.ready).toBe(true);
    expect(ready.selectedVariant?.sourceVariantId).toBe('v-m');
    expect(ayWebsAddReadiness({
      product: withOptions, groups: [group], variants: [{ ...available, availability: 'UNKNOWN' }],
      selected: { size: 'M' }, sessionId: 'session-123', quoteToken: 'signed-quote',
    }).reason).toBe('AVAILABILITY_UNKNOWN');
  });

  it('les produits sans options demandent quand même un prix et un stock confirmés', () => {
    expect(ayWebsAddReadiness({
      product, groups: [], variants: [], selected: {}, sessionId: 'session-123', quoteToken: 'q',
    }).ready).toBe(true);
    expect(ayWebsAddReadiness({
      product: { ...product, availability: 'UNKNOWN' }, groups: [], variants: [], selected: {}, sessionId: 'session-123', quoteToken: 'q',
    }).reason).toBe('AVAILABILITY_UNKNOWN');
    expect(ayWebsAddReadiness({
      product: { ...product, priceVerified: false }, groups: [], variants: [], selected: {}, sessionId: 'session-123', quoteToken: 'q',
    }).reason).toBe('PRICE_UNVERIFIED');
  });
});

describe('AYWEBs — état de liaison du panier', () => {
  const keyEcho: Translate = (key) => key;

  it('traduit la cause de non-liaison sans exposer de code technique', () => {
    expect(ayWebsLinkMessage(true, 'SYNCED', keyEcho)).toBe('aywebs.add.linked');
    expect(ayWebsLinkMessage(false, 'BRIDGE_FAILED', keyEcho)).toBe('aywebs.add.linkFailed');
    expect(ayWebsLinkMessage(false, 'UNRECOGNIZED_SERVER_CODE', keyEcho)).toBe('aywebs.add.notLinked');
  });
});

describe('AYWEBs — contrat API mobile', () => {
  it('requiert x-session-id pour l’accueil et parse les magasins depuis le serveur', async () => {
    const fetchMock = vi.fn((_url: unknown, _init: RequestInit) => Promise.resolve(jsonResponse({
      success: true,
      data: {
        stores: [{
          id: 'amazon', name: 'Amazon', display_name: 'Amazon', domains: ['amazon.com'],
          enabled: true, capture_supported: true, operational: true,
          capabilities: ['browse'], can: { browse: true }, browser_mode: 'external',
          home_url: 'https://www.amazon.com/', search_url_template: '', popular: true,
        }],
        popular_stores: [], recent_products: [], cart: { items_count: 3, units: 4, subtotal_tnd: 99 },
      },
      features: { enabled: true, capture_enabled: true, ai_extraction_enabled: false },
    })));
    vi.stubGlobal('fetch', fetchMock);
    const home = await fetchAyWebsHome('session-123');
    expect(home.stores[0].id).toBe('amazon');
    expect(home.cart).toEqual({ itemsCount: 3, units: 4, subtotalTnd: 99 });
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers as HeadersInit);
    expect(headers.get('x-session-id')).toBe('session-123');
  });

  it('résout un produit avec le délai long et le devis signé du serveur', async () => {
    const fetchMock = vi.fn((_url: unknown, _init: RequestInit) => Promise.resolve(jsonResponse({
      success: true,
      capture_id: 'cap-1', status: 'READY', quote_token: 'signed-quote', quote_expires_at: 1_900_000_000_000,
      capture: { used: true, rejection: null },
      data: {
        product_id: 'p-1', store_id: 'amazon', store_name: 'Amazon', source_url: product.sourceUrl,
        source_domain: 'www.amazon.com', title: 'Product', description: '', brand: '', images: [],
        price: 15, currency: 'USD', price_verified: true, currency_verified: true,
        variants: [], variant_details: [], variant_groups: [], selected_variant: null,
        availability: { state: 'AVAILABLE', reason: '', source: 'merchant', checked_at: null },
        condition: null, seller: null, ayrovi_pricing: { total_tnd: 52 }, purchase_mode: 'MANUAL_REVIEW',
      },
    })));
    vi.stubGlobal('fetch', fetchMock);
    const result = await resolveAyWebsProduct({
      url: product.sourceUrl, storeId: 'amazon', sessionId: 'session-123', refresh: true,
    });
    expect(result.product.productId).toBe('p-1');
    expect(result.quoteToken).toBe('signed-quote');
    expect(result.captureUsed).toBe(true);
    expect(fetchMock.mock.calls[0]?.[1]?.signal).toBeDefined();
    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)).refresh).toBe(true);
    expect(AYWEBS_RESOLVE_TIMEOUT_MS).toBe(30_000);
  });

  it('l’ajout n’envoie aucun prix, devise ou disponibilité venant du téléphone', async () => {
    const fetchMock = vi.fn((_url: unknown, _init: RequestInit) => Promise.resolve(jsonResponse({
      success: true,
      data: {
        item: {
          id: 'line-1', title: 'Product', images: [], store_name: 'Amazon',
          variant_label: 'M', quantity: 2, unit_price: 15, currency: 'USD', line_total_tnd: 104,
        },
        ayrovi: { linked: true, reason: 'SYNCED' },
      },
    })));
    vi.stubGlobal('fetch', fetchMock);
    const result = await addAyWebsCartItem({
      productId: 'p-1', sourceUrl: product.sourceUrl, storeId: 'amazon', sessionId: 'session-123',
      variant: { size: 'M' }, quantity: 2, quoteToken: 'signed-quote', capture, requestId: 'intent-1',
    });
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const headers = new Headers(init.headers);
    expect(headers.get('x-session-id')).toBe('session-123');
    expect(headers.get('Idempotency-Key')).toBe('intent-1');
    expect(body).toMatchObject({ product_id: 'p-1', store_id: 'amazon', quantity: 2, quote_token: 'signed-quote' });
    expect(body).not.toHaveProperty('price');
    expect(body).not.toHaveProperty('currency');
    expect(body).not.toHaveProperty('availability');
    expect(result.linkedToAyrovi).toBe(true);
    expect(result.item.lineTotalTnd).toBe(104);
  });
});
