import type { QatafoDatabase } from '../../db/database';
import type { AyrovixCandidate, AyrovixIdentification } from '../types';
import { estimateTnd } from './currency';
import { filterDisplayableCandidates } from './candidatePolicy';
import { getAyroviAiCore } from '../../ai-core/core';

/**
 * AYROVIX owns text discovery for links, QR/barcodes and Lens fallback.
 * Provider web-search wire details stay behind AYROVI AI Core.
 */

const STOPWORDS = new Set(['the', 'and', 'pour', 'avec', 'les', 'des', 'une', 'femme', 'homme', 'femmes', 'hommes', 'new', 'style', 'mode', 'de', 'du', 'en', 'au', 'aux']);
const EXTERNAL_CACHE_TTL_MS = 5 * 60_000;
const externalSearchCache = new Map<string, { at: number; results: AyrovixCandidate[] }>();
const externalSearchInFlight = new Map<string, Promise<AyrovixCandidate[]>>();

function searchBudgetMs(): number {
  const configured = Number(process.env.AYROVIX_SEARCH_TIMEOUT_MS);
  return Number.isFinite(configured) ? Math.min(12_000, Math.max(1_500, configured)) : 7_000;
}

function externalWebSearchEnabled(): boolean {
  // Keep the legacy feature flag during migration; provider selection belongs
  // exclusively to AI Core and cannot be changed by this service.
  return process.env.AYROVIX_ANTHROPIC_WEB_SEARCH !== 'false'
    && getAyroviAiCore().responses().isConfigured();
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

export function catalogSearch(
  db: QatafoDatabase,
  identification: AyrovixIdentification | null,
  query: string,
  limit = 6,
): AyrovixCandidate[] {
  const rules = db.getPricingRules();
  const rows = db.all<any>(
    `SELECT id, name, brand_name, image, source_url, source_platform, stock_status,
            original_price, currency, final_price
     FROM products WHERE status='ACTIVE' ORDER BY updated_at DESC LIMIT 400`,
  );
  const candidates = rows.map((row) => {
    const title = `${row.brand_name ? `${row.brand_name} ` : ''}${row.name}`;
    const match = scoreCandidate(identification, query, { title: row.name, brand: row.brand_name });
    const estimated = estimateTnd(rules, Number(row.original_price) || null, String(row.currency || 'EUR'));
    return {
      id: `cat_${row.id}`,
      kind: 'catalog' as const,
      title,
      brand: row.brand_name || null,
      model: null,
      colors: [],
      sizes: [],
      source: 'Collection AYROVI',
      sourceUrl: row.source_url || '',
      image: row.image || '',
      price: Number(row.original_price) || null,
      currency: row.currency || null,
      priceTnd: Number(row.final_price) > 0 ? Number(row.final_price) : (estimated?.priceTnd ?? null),
      match,
    } satisfies AyrovixCandidate;
  }).filter((candidate) => candidate.match >= 35);
  return filterDisplayableCandidates(candidates, limit);
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

/** Provider-neutral server-side Web Search: one search at most per query. */
export async function providerWebSearch(
  query: string,
  limit = 6,
  deadline = Date.now() + searchBudgetMs(),
): Promise<AyrovixCandidate[]> {
  const provider = getAyroviAiCore().responses();
  if (!externalWebSearchEnabled() || !searchHasTime(deadline, 500)) return [];
  try {
    const result = await provider.complete({
      workload: 'research',
      modelClass: 'fast',
      instructions: 'You are AYROVI shopping search. Always run exactly one web search. Prefer direct merchant product pages. Exclude news, reviews and generic search pages. Keep the final answer very short.',
      messages: [{
        role: 'user',
        content: [{ type: 'text', text: `Find direct product pages selling this exact item or code: ${query.slice(0, 200)}` }],
      }],
      maxOutputTokens: 384,
      temperature: 0,
      webSearch: { enabled: true, maxUses: 1 },
    }, AbortSignal.timeout(remainingSearchMs(deadline, 7_500)));

    const candidates: AyrovixCandidate[] = [];
    for (const item of result.webResults) {
      const sourceUrl = String(item.url || '').trim();
      const title = String(item.title || '').replace(/\s+/g, ' ').trim();
      if (!/^https?:\/\//i.test(sourceUrl) || title.length < 5) continue;
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
    console.log(`[AYROVIX provider-search] ${candidates.length} candidates, searches=${result.usage?.webSearchCalls || 0}`);
    return candidates;
  } catch (error: any) {
    console.warn(`[AYROVIX provider-search] ${error?.code === 'PROVIDER_TIMEOUT' || error?.name === 'TimeoutError' ? 'timeout' : 'unavailable'}`);
    return [];
  }
}

/** Backward-compatible Phase 1 alias; new business code uses providerWebSearch. */
export const anthropicWebSearch = providerWebSearch;

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
export const anthropicExternalSearch = externalProductSearch;

export async function searchCandidates(
  db: QatafoDatabase,
  identification: AyrovixIdentification,
  query: string,
  visualCandidates: AyrovixCandidate[] = [],
): Promise<AyrovixCandidate[]> {
  const catalog = catalogSearch(db, identification, query);
  const deadline = Date.now() + searchBudgetMs();
  // A real visual match is more useful than another text-only web search.
  const external = visualCandidates.length
    ? visualCandidates
    : await externalProductSearch(query, 6, deadline);
  const rules = db.getPricingRules();
  const rescored = external.map((candidate) => {
    const estimated = estimateTnd(rules, candidate.price, candidate.currency || 'EUR');
    return {
      ...candidate,
      priceTnd: candidate.priceTnd ?? estimated?.priceTnd ?? null,
      match: Math.max(candidate.match, scoreCandidate(identification, query, candidate)),
    };
  });
  return filterDisplayableCandidates(
    [...catalog, ...rescored].filter((candidate) => candidate.match >= 20),
    8,
  );
}

export interface ProviderSearchHealth {
  configured: boolean;
  model: string;
  maxUsesPerQuery: number;
  timeoutMs: number;
}

export function checkProviderSearchHealth(): ProviderSearchHealth {
  const provider = getAyroviAiCore().responses();
  return {
    configured: externalWebSearchEnabled(),
    model: provider.resolveModel('research', 'fast'),
    maxUsesPerQuery: 1,
    timeoutMs: searchBudgetMs(),
  };
}

/** Backward-compatible admin exports for Phase 1. */
export type AnthropicSearchHealth = ProviderSearchHealth;
export const checkAnthropicSearchHealth = checkProviderSearchHealth;
