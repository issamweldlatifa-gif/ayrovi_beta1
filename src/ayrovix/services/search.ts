import type { QatafoDatabase } from '../../db/database';
import type { AyrovixCandidate, AyrovixIdentification } from '../types';
import { estimateWithDb } from './currency';
import { filterDisplayableCandidates, filterWithFallback, hasValidProductUrl, withDisplayRating } from './candidatePolicy';
import { getAyroviAiCore } from '../../ai-core/core';
import { isAiFeatureEnabled } from '../../ai-core/config';
import { readLimitedText } from '../../services/safeUrl';

/**
 * AYROVIX owns product discovery for text, QR/barcodes and Lens fallback.
 * SerpApi Google Shopping is the primary product provider when its server-side
 * key exists; ZAYROVI AI Core remains a no-price link fallback.
 */

const STOPWORDS = new Set(['the', 'and', 'pour', 'avec', 'les', 'des', 'une', 'femme', 'homme', 'femmes', 'hommes', 'new', 'style', 'mode', 'de', 'du', 'en', 'au', 'aux']);
const EXTERNAL_CACHE_TTL_MS = 5 * 60_000;
const externalSearchCache = new Map<string, { at: number; results: AyrovixCandidate[] }>();
const externalSearchInFlight = new Map<string, Promise<AyrovixCandidate[]>>();

function searchBudgetMs(): number {
  const configured = Number(process.env.AYROVIX_SEARCH_TIMEOUT_MS);
  return Number.isFinite(configured) ? Math.min(8_000, Math.max(1_200, configured)) : 4_200;
}

function serpApiKey(): string | null {
  // Keep both aliases aligned with Google Lens and product enrichment.
  return process.env.SERPAPI_KEY?.trim() || process.env.SERPAPI_API_KEY?.trim() || null;
}

function serpApiShoppingEnabled(): boolean {
  return Boolean(serpApiKey());
}

function aiCoreWebSearchEnabled(): boolean {
  return isAiFeatureEnabled('web-search')
    && getAyroviAiCore().responses().isConfigured();
}

function externalWebSearchEnabled(): boolean {
  return serpApiShoppingEnabled() || aiCoreWebSearchEnabled();
}

function remainingSearchMs(deadline: number, perRequestMax: number): number {
  return Math.max(50, Math.min(perRequestMax, deadline - Date.now()));
}

function searchHasTime(deadline: number, minimum = 100): boolean {
  return deadline - Date.now() > minimum;
}

const tokenize = (value: string): string[] => value.toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .split(/[^a-z0-9]+/)
  .filter((token) => token.length > 1 && !STOPWORDS.has(token));

function clampMatch(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}

export function scoreCandidate(
  identification: AyrovixIdentification | null,
  query: string,
  candidate: { title: string; brand?: string | null },
): number {
  if (!identification) {
    const queryTokens = tokenize(query);
    if (!queryTokens.length) return 0;
    const candidateTokens = new Set(tokenize(`${candidate.brand || ''} ${candidate.title}`));
    const overlap = queryTokens.filter((token) => candidateTokens.has(token)).length / queryTokens.length;
    return clampMatch(45 + overlap * 50);
  }
  let score = 28 * identification.confidence;
  const title = `${candidate.brand || ''} ${candidate.title}`.toLowerCase();
  const titleTokens = new Set(tokenize(title));
  const modelCode = identification.possible_model_codes[0]?.toLowerCase();
  if (modelCode && title.includes(modelCode)) score += 42;
  if (identification.brand && tokenize(identification.brand).some((token) => titleTokens.has(token))) score += 18;
  if (identification.model) {
    const modelTokens = tokenize(identification.model);
    if (modelTokens.some((token) => titleTokens.has(token))) score += 12;
  }
  score += Math.min(2, identification.color.filter((color) => title.includes(color.toLowerCase())).length) * 5;
  const queryTokens = tokenize(query || `${identification.brand || ''} ${identification.model || ''} ${identification.category}`);
  if (queryTokens.length) score += (queryTokens.filter((token) => titleTokens.has(token)).length / queryTokens.length) * 12;
  return clampMatch(score);
}

/**
 * Interrupteur du catalogue ZAYROVI dans les recherches (Lens, assistant, liens).
 * DÉSACTIVÉ : aucune recherche ni résultat n'interroge le catalogue tant que le
 * propriétaire ne l'a pas réactivé explicitement.
 */
export const AYROVI_CATALOG_SEARCH_ENABLED = false;

export function catalogSearch(
  db: QatafoDatabase,
  identification: AyrovixIdentification | null,
  query: string,
  limit = 6,
): AyrovixCandidate[] {
  if (!AYROVI_CATALOG_SEARCH_ENABLED) return [];
  const rows = db.all<any>(
    `SELECT id, name, brand_name, image, source_url, source_platform, stock_status,
            original_price, currency, final_price
     FROM products WHERE status='ACTIVE' AND visibility='CATALOG' ORDER BY updated_at DESC LIMIT 400`,
  );
  const candidates = rows.map((row) => {
    const title = `${row.brand_name ? `${row.brand_name} ` : ''}${row.name}`;
    const match = scoreCandidate(identification, query, { title: row.name, brand: row.brand_name });
    const estimated = estimateWithDb(db, Number(row.original_price) || null, String(row.currency || 'EUR'));
    return {
      id: `cat_${row.id}`,
      kind: 'catalog' as const,
      title,
      brand: row.brand_name || null,
      model: null,
      colors: [],
      sizes: [],
      source: 'Collection ZAYROVI',
      sourceUrl: row.source_url || '',
      image: row.image || '',
      // An ACTIVE catalog listing is not proof of stock: use its recorded status.
      availability: row.stock_status === 'AVAILABLE' ? 'in_stock'
        : row.stock_status === 'LIMITED' ? 'limited'
          : row.stock_status === 'OUT_OF_STOCK' ? 'out_of_stock' : 'unknown',
      price: Number(row.original_price) || null,
      currency: row.currency || null,
      priceTnd: estimated?.promo
        ? estimated.priceTnd // promo active : le prix remisé du moteur fait foi
        : (Number(row.final_price) > 0 ? Number(row.final_price) : (estimated?.priceTnd ?? null)),
      promo: estimated?.promo ?? null,
      match,
    } satisfies AyrovixCandidate;
  }).filter((candidate) => candidate.match >= 35);
  const displayable = filterDisplayableCandidates(candidates, limit);
  /* Keep recorded stock truth available to callers of the catalogue reader.
     Presentation-level filters may hide sold-out rows later, but this boundary
     must not turn an explicit OUT_OF_STOCK record into a missing product. */
  const soldOut = candidates
    .filter((candidate) => candidate.availability === 'out_of_stock')
    .map(withDisplayRating)
    .sort((left, right) => right.match - left.match);
  return [...displayable, ...soldOut].slice(0, limit);
}

function merchantLabel(sourceUrl: string): string {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '');
    const known: Record<string, string> = {
      'amazon.com': 'Amazon', 'amazon.fr': 'Amazon', 'amazon.co.uk': 'Amazon',
      'ebay.com': 'eBay', 'stockx.com': 'StockX', 'nike.com': 'Nike',
      'adidas.com': 'Adidas', 'shein.com': 'SHEIN', 'temu.com': 'TEMU',
      'aliexpress.com': 'AliExpress', 'zara.com': 'Zara',
    };
    if (known[host]) return known[host];
    const parts = host.split('.');
    const label = parts.length > 1 ? parts[parts.length - 2] : parts[0];
    return label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Marché International';
  } catch {
    return 'Marché International';
  }
}

function normalizeShoppingCurrency(raw: unknown): string | null {
  const value = String(raw || '').trim().toUpperCase();
  const known: Record<string, string> = {
    '$': 'USD', 'US$': 'USD', USD: 'USD',
    '€': 'EUR', EUR: 'EUR',
    '£': 'GBP', GBP: 'GBP',
    'د.ت': 'TND', DT: 'TND', TND: 'TND',
    'CA$': 'CAD', CAD: 'CAD',
    'AU$': 'AUD', AUD: 'AUD',
  };
  return known[value] || (/^[A-Z]{3}$/.test(value) ? value : null);
}

function shoppingCurrency(row: any): string | null {
  const explicit = normalizeShoppingCurrency(row?.currency ?? row?.price?.currency);
  if (explicit) return explicit;
  const rawPrice = typeof row?.price === 'string'
    ? row.price
    : String(row?.price?.raw ?? row?.price?.displayed_value ?? '');
  const upper = `${rawPrice} ${String(row?.snippet || '')}`.toUpperCase();
  // Specific dollar variants must be checked before the generic dollar sign.
  if (/\bCAD\b|CA\$/.test(upper)) return 'CAD';
  if (/\bAUD\b|AU\$/.test(upper)) return 'AUD';
  if (/\bTND\b|د\.ت|\bDT\b/.test(upper)) return 'TND';
  if (/\bEUR\b|€/.test(upper)) return 'EUR';
  if (/\bGBP\b|£/.test(upper)) return 'GBP';
  if (/\bUSD\b|US\$|\$/.test(upper)) return 'USD';
  return null;
}

function shoppingPrice(row: any): number | null {
  const direct = Number(row?.extracted_price ?? row?.price?.extracted_value ?? row?.price?.value);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return null;
}

function shoppingCandidates(payload: any, limit: number): AyrovixCandidate[] {
  const rows = Array.isArray(payload?.shopping_results) ? payload.shopping_results : [];
  const candidates: AyrovixCandidate[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const sourceUrl = [row?.link, row?.merchant?.link, row?.product_link]
      .map((value) => String(value || '').trim())
      .find((value) => hasValidProductUrl(value));
    const title = String(row?.title || '').replace(/\s+/g, ' ').trim();
    const price = shoppingPrice(row);
    const currency = shoppingCurrency(row);
    if (!sourceUrl || title.length < 4 || !price || !currency || seen.has(sourceUrl)) continue;
    seen.add(sourceUrl);
    const index = candidates.length;
    const image = String(row?.thumbnail || row?.image || '').trim();
    const rating = Number(row?.rating ?? row?.product_rating);
    const ratingCount = Number(row?.reviews ?? row?.reviews_count);
    candidates.push({
      id: `shopping_${index}_${Buffer.from(sourceUrl).toString('base64url').slice(0, 10)}`,
      kind: 'external',
      title: title.slice(0, 180),
      description: typeof row?.snippet === 'string' ? row.snippet.trim().slice(0, 500) || null : null,
      brand: typeof row?.brand === 'string' ? row.brand.trim().slice(0, 100) || null : null,
      model: null,
      colors: [],
      sizes: [],
      source: String(row?.source || row?.merchant?.name || merchantLabel(sourceUrl)).trim().slice(0, 80),
      sourceUrl,
      image: /^https?:\/\//i.test(image) ? image : '',
      images: /^https?:\/\//i.test(image) ? [image] : [],
      price,
      currency,
      priceTnd: null,
      priceOrigin: 'search',
      priceVerificationStatus: 'PENDING_MANUAL',
      availability: row?.in_stock === true ? 'in_stock'
        : row?.in_stock === false ? 'out_of_stock'
          : 'unknown',
      sourceCondition: typeof row?.condition === 'string' ? row.condition.trim().slice(0, 60) || null : null,
      rating: Number.isFinite(rating) && rating > 0 && rating <= 5 ? rating : null,
      ratingCount: Number.isFinite(ratingCount) && ratingCount >= 0 ? ratingCount : null,
      ratingKind: Number.isFinite(rating) && rating > 0 && rating <= 5 ? 'merchant' : 'match',
      match: clampMatch(94 - index * 2),
    });
    if (candidates.length >= limit) break;
  }
  return candidates;
}

/** One paid Google Shopping request at most per product query. */
export async function serpApiShoppingSearch(
  query: string,
  limit = 6,
  deadline = Date.now() + searchBudgetMs(),
): Promise<AyrovixCandidate[]> {
  const key = serpApiKey();
  const normalizedQuery = query.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!key || normalizedQuery.length < 2 || !searchHasTime(deadline, 500)) return [];
  const configuredCountry = (process.env.AYROVIX_SHOPPING_COUNTRY || process.env.AYROVIX_LENS_COUNTRY || '').trim().toLowerCase();
  const country = /^[a-z]{2}$/.test(configuredCountry) ? configuredCountry : 'fr';
  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: normalizedQuery,
    hl: 'fr',
    gl: country,
    api_key: key,
    num: String(Math.max(1, Math.min(20, Math.floor(limit)))),
  });
  try {
    const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
      signal: AbortSignal.timeout(remainingSearchMs(deadline, 3_500)),
    });
    if (!response.ok) {
      console.warn(`[AYROVIX serpapi-shopping] HTTP ${response.status}`);
      return [];
    }
    const text = await readLimitedText(response, 2_000_000);
    let payload: any;
    try { payload = JSON.parse(text); } catch {
      console.warn('[AYROVIX serpapi-shopping] invalid JSON');
      return [];
    }
    if (payload?.error) {
      console.warn('[AYROVIX serpapi-shopping] API error');
      return [];
    }
    const candidates = shoppingCandidates(payload, limit);
    console.log(`[AYROVIX serpapi-shopping] ${candidates.length} priced candidates`);
    return candidates;
  } catch (error: any) {
    console.warn(`[AYROVIX serpapi-shopping] ${error?.name === 'TimeoutError' ? 'timeout' : 'unavailable'}`);
    return [];
  }
}

async function aiCoreWebSearch(
  query: string,
  limit: number,
  deadline: number,
): Promise<AyrovixCandidate[]> {
  const provider = getAyroviAiCore().responses();
  if (!aiCoreWebSearchEnabled() || !searchHasTime(deadline, 500)) return [];
  try {
    const result = await provider.complete({
      workload: 'research',
      modelClass: 'fast',
      instructions: 'You are ZAYROVI shopping search. Always run exactly one web search. Prefer direct merchant product pages. Exclude news, reviews and generic search pages. Keep the final answer very short.',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: `Find direct product pages selling this exact item or code: ${query.slice(0, 200)}` }],
      }],
      maxOutputTokens: 220,
      temperature: 0,
      webSearch: { enabled: true, maxUses: 1 },
    }, AbortSignal.timeout(remainingSearchMs(deadline, 4_200)));

    const candidates: AyrovixCandidate[] = [];
    for (const item of result.webResults) {
      const sourceUrl = String(item.url || '').trim();
      const title = String(item.title || '').replace(/\s+/g, ' ').trim();
      if (!hasValidProductUrl(sourceUrl) || title.length < 5) continue;
      const index = candidates.length;
      candidates.push({
        id: `web_${index}_${Buffer.from(sourceUrl).toString('base64url').slice(0, 10)}`,
        kind: 'external',
        title: title.slice(0, 160),
        brand: null,
        model: null,
        colors: [],
        sizes: [],
        source: merchantLabel(sourceUrl),
        sourceUrl,
        image: '',
        price: null,
        currency: null,
        priceTnd: null,
        match: clampMatch(86 - index * 3),
      });
      if (candidates.length >= limit) break;
    }
    console.log(`[AYROVIX ai-core-search] ${candidates.length} candidates, searches=${result.usage?.webSearchCalls || 0}`);
    return candidates;
  } catch (error: any) {
    console.warn(`[AYROVIX ai-core-search] ${error?.code === 'PROVIDER_TIMEOUT' || error?.name === 'TimeoutError' ? 'timeout' : 'unavailable'}`);
    return [];
  }
}

/**
 * Product search shared by mobile text, QR/barcode and assistant flows.
 * SerpApi is primary because Shopping returns actionable prices; AI Core is
 * only tried when Shopping is unavailable or returns no priced merchant page.
 */
export async function providerWebSearch(
  query: string,
  limit = 6,
  deadline = Date.now() + searchBudgetMs(),
): Promise<AyrovixCandidate[]> {
  if (!externalWebSearchEnabled() || !searchHasTime(deadline, 500)) return [];
  if (serpApiShoppingEnabled()) {
    const shopping = await serpApiShoppingSearch(query, limit, deadline);
    if (shopping.length) return shopping;
  }
  return aiCoreWebSearch(query, limit, deadline);
}

/** Backward-compatible Phase 1 alias; new business code uses providerWebSearch. */
/** Public AYROVIX service used by URL, image, QR and barcode flows. */
export async function externalProductSearch(
  query: string,
  limit = 6,
  deadline = Date.now() + searchBudgetMs(),
): Promise<AyrovixCandidate[]> {
  const cacheKey = `${query.trim().toLowerCase()}|${limit}`;
  const cached = externalSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < EXTERNAL_CACHE_TTL_MS) {
    return cached.results.map((item) => ({ ...item }));
  }
  const existing = externalSearchInFlight.get(cacheKey);
  if (existing) return (await existing).map((item) => ({ ...item }));

  const task = externalWebSearchEnabled()
    ? providerWebSearch(query, limit, deadline)
    : Promise.resolve([]);
  externalSearchInFlight.set(cacheKey, task);
  try {
    const results = await task;
    if (results.length) {
      externalSearchCache.set(cacheKey, { at: Date.now(), results });
      if (externalSearchCache.size > 200) externalSearchCache.delete(externalSearchCache.keys().next().value as string);
    }
    return results.map((item) => ({ ...item }));
  } finally {
    externalSearchInFlight.delete(cacheKey);
  }
}

/** Backward-compatible Phase 1 alias. */
export async function searchCandidates(
  db: QatafoDatabase,
  identification: AyrovixIdentification,
  query: string,
  visualCandidates: AyrovixCandidate[] = [],
): Promise<AyrovixCandidate[]> {
  // Une recherche visuelle avec des correspondances ne mélange ni catalogue
  // interne ni recherche texte : seuls ces liens passent ensuite à l'admission.
  const catalog = visualCandidates.length ? [] : catalogSearch(db, identification, query);
  const deadline = Date.now() + searchBudgetMs();
  // A real visual match is more useful than another text-only web search.
  const external = visualCandidates.length
    ? visualCandidates
    : await externalProductSearch(query, 6, deadline);
  const rescored = external.map((candidate) => {
    const estimated = candidate.price != null ? estimateWithDb(db, candidate.price, candidate.currency || 'EUR') : null;
    return {
      ...candidate,
      priceTnd: estimated?.promo ? estimated.priceTnd : (candidate.priceTnd ?? estimated?.priceTnd ?? null),
      promo: estimated?.promo ?? null,
      priceVerificationStatus: candidate.price != null ? candidate.priceVerificationStatus : ('PENDING_MANUAL' as const),
      match: Math.max(candidate.match, scoreCandidate(identification, query, candidate)),
    };
  });
  const pool = [...catalog, ...rescored].filter((candidate) => candidate.match >= 20);
  // Lens : l'admission PRODUCT partagée filtre et déduplique ensuite par URL.
  // Aucun « harvest » de liens à scraper et aucun regroupement par ressemblance.
  if (visualCandidates.length) return pool;
  return filterWithFallback(groupOffers(pool), 8);
}

/**
 * GLOBAL DISCOVERY — un même produit proposé par plusieurs sources du web mondial
 * devient UN candidat avec plusieurs offres, jamais quatre doublons à la suite.
 *
 * Identité produit par signaux disponibles : marque + recouvrement des tokens du
 * titre (Jaccard ≥ 0.6 ; le modèle/GTIN, quand il est dans le titre, participe
 * naturellement aux tokens). Le catalogue ZAYROVI reste à part : c'est l'offre
 * propre de ZAYROVI, pas une offre externe à regrouper.
 */
export function groupOffers(candidates: AyrovixCandidate[]): AyrovixCandidate[] {
  const passthrough = candidates.filter((candidate) => candidate.kind !== 'external');
  const groups: Array<{ rep: AyrovixCandidate; tokens: Set<string>; brand: string; members: AyrovixCandidate[] }> = [];
  for (const candidate of candidates) {
    if (candidate.kind !== 'external') continue;
    const tokens = new Set(tokenize(`${candidate.brand || ''} ${candidate.title}`));
    const brand = String(candidate.brand || '').toLowerCase().trim();
    const group = tokens.size >= 2
      ? groups.find((entry) => {
          if (entry.brand !== brand) return false;
          const inter = [...tokens].filter((token) => entry.tokens.has(token)).length;
          const union = new Set([...tokens, ...entry.tokens]).size;
          return union > 0 && inter / union >= 0.6;
        })
      : undefined;
    if (group) {
      group.members.push(candidate);
      const repHasPrice = group.rep.priceTnd != null;
      const candHasPrice = candidate.priceTnd != null;
      if (candidate.match > group.rep.match || (!repHasPrice && candHasPrice && candidate.match >= group.rep.match)) group.rep = candidate;
    } else {
      groups.push({ rep: candidate, tokens, brand, members: [candidate] });
    }
  }
  return [
    ...passthrough,
    ...groups.map(({ rep, members }) => {
      if (members.length === 1) return rep;
      const offers = members
        .map((member) => ({ source: member.source, sourceUrl: member.sourceUrl, price: member.price, currency: member.currency, priceTnd: member.priceTnd, promo: member.promo ?? null }))
        .sort((a, b) => (a.priceTnd ?? Number.POSITIVE_INFINITY) - (b.priceTnd ?? Number.POSITIVE_INFINITY));
      return { ...rep, offerCount: members.length, offers };
    }),
  ];
}

export interface ProviderSearchHealth {
  configured: boolean;
  model: string;
  primary: 'serpapi-google-shopping' | 'ayrovi-ai-core' | null;
  serpApiConfigured: boolean;
  aiCoreConfigured: boolean;
  maxUsesPerQuery: number;
  timeoutMs: number;
}

export function checkProviderSearchHealth(): ProviderSearchHealth {
  const provider = getAyroviAiCore().responses();
  const serpApiConfigured = serpApiShoppingEnabled();
  const aiCoreConfigured = aiCoreWebSearchEnabled();
  return {
    configured: serpApiConfigured || aiCoreConfigured,
    model: serpApiConfigured ? 'serpapi/google_shopping' : provider.resolveModel('research', 'fast'),
    primary: serpApiConfigured ? 'serpapi-google-shopping' : aiCoreConfigured ? 'ayrovi-ai-core' : null,
    serpApiConfigured,
    aiCoreConfigured,
    // One Shopping query, then at most one AI Core fallback when no priced row exists.
    maxUsesPerQuery: Number(serpApiConfigured) + Number(aiCoreConfigured),
    timeoutMs: searchBudgetMs(),
  };
}

/** Backward-compatible admin exports for Phase 1. */
export type AnthropicSearchHealth = ProviderSearchHealth;
export const checkAnthropicSearchHealth = checkProviderSearchHealth;
