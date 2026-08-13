import type { QatafoDatabase } from '../../db/database';
import type { AyrovixCandidate, AyrovixIdentification } from '../types';
import { estimateTnd } from './currency';

/**
 * AYROVIX · Search layer — fournisseurs interchangeables V2 (Free Tier Support)
 * V1 : (1) catalogue AYROVI (toujours actif), (2) Google Shopping via SerpAPI
 * V2 (NEW - Free): (3) Brave Search (free 2000/mo) si BRAVE_API_KEY, (4) DuckDuckGo HTML scraping 100% gratuit sans clé
 * Toutes les couches sont optionnelles — le catalogue reste la base.
 */

const STOPWORDS = new Set(['the', 'and', 'pour', 'avec', 'les', 'des', 'une', 'femme', 'homme', 'femmes', 'hommes', 'new', 'style', 'mode', 'de', 'du', 'en', 'au', 'aux']);

const tokenize = (value: string): string[] =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));

function clampMatch(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}

export function scoreCandidate(identification: AyrovixIdentification | null, query: string, candidate: { title: string; brand?: string | null }): number {
  if (!identification) {
    const qTokens = tokenize(query);
    if (!qTokens.length) return 0;
    const cTokens = new Set(tokenize(`${candidate.brand || ''} ${candidate.title}`));
    const overlap = qTokens.filter((t) => cTokens.has(t)).length / qTokens.length;
    return clampMatch(45 + overlap * 50);
  }
  let score = 28 * identification.confidence;
  const titleNorm = `${candidate.brand || ''} ${candidate.title}`.toLowerCase();
  const idCode = identification.possible_model_codes[0]?.toLowerCase();
  if (idCode && titleNorm.includes(idCode)) score += 42;
  if (identification.brand && tokenize(identification.brand).some((t) => tokenize(titleNorm).includes(t))) score += 18;
  if (identification.model) {
    const modelTokens = tokenize(identification.model);
    const titleTokens = new Set(tokenize(titleNorm));
    if (modelTokens.length && modelTokens.some((t) => titleTokens.has(t))) score += 12;
  }
  const colorHits = identification.color.filter((c) => titleNorm.includes(c.toLowerCase())).length;
  score += Math.min(2, colorHits) * 5;
  const qTokens = tokenize(query || `${identification.brand || ''} ${identification.model || ''} ${identification.category}`);
  const candidateTokens = new Set(tokenize(titleNorm));
  if (qTokens.length) score += (qTokens.filter((t) => candidateTokens.has(t)).length / qTokens.length) * 12;
  return clampMatch(score);
}

/** Fournisseur 1 — catalogue AYROVI (stock & produits actifs). Toujours gratuit. */
export function catalogSearch(db: QatafoDatabase, identification: AyrovixIdentification | null, query: string, limit = 6): AyrovixCandidate[] {
  const rules = db.getPricingRules();
  const rows = db.all<any>(
    `SELECT id, name, brand_name, image, source_url, source_platform, stock_status,
            original_price, currency, final_price
     FROM products WHERE status='ACTIVE' ORDER BY updated_at DESC LIMIT 400`,
  );
  const scored = rows
    .map((row) => {
      const title = `${row.brand_name ? `${row.brand_name} ` : ''}${row.name}`;
      const match = scoreCandidate(identification, query, { title: row.name, brand: row.brand_name });
      const tnd = estimateTnd(rules, Number(row.original_price) || null, String(row.currency || 'EUR'));
      return {
        id: `cat_${row.id}`,
        kind: 'catalog' as const,
        title,
        brand: row.brand_name || null,
        model: null as string | null,
        colors: [] as string[],
        sizes: [] as string[],
        source: 'AYROVI Stock',
        sourceUrl: row.source_url || '',
        image: row.image || '',
        price: Number(row.original_price) || null,
        currency: row.currency || null,
        priceTnd: Number(row.final_price) > 0 ? Number(row.final_price) : (tnd?.priceTnd ?? null),
        match,
      } satisfies AyrovixCandidate;
    })
    .filter((candidate) => candidate.match >= 35);
  return scored.sort((a, b) => b.match - a.match).slice(0, limit);
}

/** Fournisseur 2 — Google Shopping via SerpAPI (payant, mais free tier 100/mois) */
export async function serpSearch(query: string, limit = 6): Promise<AyrovixCandidate[]> {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const params = new URLSearchParams({ engine: 'google_shopping', q: query, api_key: key, num: String(limit * 2), hl: 'fr' });
    const response = await fetch(`https://serpapi.com/search.json?${params}`, { signal: controller.signal });
    if (!response.ok) return [];
    const payload: any = await response.json();
    const results: any[] = Array.isArray(payload?.shopping_results) ? payload.shopping_results : [];
    return results.slice(0, limit).map((item, index) => {
      const price = typeof item.extracted_price === 'number' ? item.extracted_price : null;
      const currency = typeof item.price === 'string' && item.price.includes('€') ? 'EUR' : 'USD';
      return {
        id: `ext_${index}_${Buffer.from(String(item.link || item.title || index)).toString('base64url').slice(0, 10)}`,
        kind: 'external' as const,
        title: String(item.title || 'Produit').slice(0, 160),
        brand: null,
        model: null,
        colors: [],
        sizes: [],
        source: String(item.source || 'Google Shopping').slice(0, 40),
        sourceUrl: String(item.link || ''),
        image: String(item.thumbnail || ''),
        price,
        currency: price ? currency : null,
        priceTnd: null,
        match: clampMatch(88 - index * 4),
      } satisfies AyrovixCandidate;
    });
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Fournisseur 3 — Brave Search API (FREE 2000/mois, sans carte) — https://brave.com/search/api/ */
export async function braveSearch(query: string, limit = 6): Promise<AyrovixCandidate[]> {
  const key = process.env.BRAVE_API_KEY?.trim() || process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const params = new URLSearchParams({ q: query, count: String(limit), safesearch: 'moderate' });
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      signal: controller.signal,
      headers: { 'X-Subscription-Token': key, 'Accept': 'application/json' },
    });
    if (!res.ok) {
      console.warn(`[AYROVIX brave] HTTP ${res.status}`);
      return [];
    }
    const payload: any = await res.json();
    const results: any[] = Array.isArray(payload?.web?.results) ? payload.web.results : [];
    return results.slice(0, limit).map((item, idx) => ({
      id: `brave_${idx}_${Buffer.from(String(item.url||idx)).toString('base64url').slice(0,8)}`,
      kind: 'external' as const,
      title: String(item.title || query).slice(0,160),
      brand: null,
      model: null,
      colors: [],
      sizes: [],
      source: 'Brave Web (Free)',
      sourceUrl: String(item.url || ''),
      image: '',
      price: null,
      currency: null,
      priceTnd: null,
      match: clampMatch(75 - idx*5),
    } satisfies AyrovixCandidate));
  } catch (e) {
    console.warn(`[AYROVIX brave] error ${e}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Fournisseur 4 — DuckDuckGo HTML scraping — 100% GRATUIT, sans aucune clé — FREE TIER WORKS */
export async function duckDuckGoSearch(query: string, limit = 6): Promise<AyrovixCandidate[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    // DuckDuckGo HTML lite endpoint — no JS, no key, reliable
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' buy shopping')}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr,en-US;q=0.9,en;q=0.8',
      },
    });
    if (!res.ok) {
      console.warn(`[AYROVIX duckduckgo] HTTP ${res.status}`);
      return [];
    }
    const html = await res.text();

    // Simple parsing without JSDOM — regex for result__a
    const candidates: AyrovixCandidate[] = [];
    // DuckDuckGo HTML has <a class="result__a" href="...">Title</a>
    const linkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
    const urlRegex = /uddg=([^&"]+)/; // DuckDuckGo redirects via /l/?uddg=encoded_url

    let match;
    let idx = 0;
    while ((match = linkRegex.exec(html)) !== null && candidates.length < limit) {
      let rawUrl = match[1] || '';
      let title = (match[2] || '').replace(/<[^>]*>/g, '').trim();
      if (!title) continue;
      // Decode DuckDuckGo redirect
      const uddgMatch = rawUrl.match(urlRegex);
      if (uddgMatch) {
        try { rawUrl = decodeURIComponent(uddgMatch[1]); } catch {}
      }
      // Filter out duckduckgo internal
      if (rawUrl.includes('duckduckgo.com')) continue;
      if (!rawUrl.startsWith('http')) continue;
      // Skip non-shopping noise
      if (title.length < 5) continue;

      candidates.push({
        id: `ddg_${idx}_${Buffer.from(rawUrl).toString('base64url').slice(0,8)}`,
        kind: 'external' as const,
        title: title.slice(0,160),
        brand: null,
        model: null,
        colors: [],
        sizes: [],
        source: 'DuckDuckGo Free',
        sourceUrl: rawUrl,
        image: '',
        price: null,
        currency: null,
        priceTnd: null,
        match: clampMatch(70 - idx*5),
      } satisfies AyrovixCandidate);
      idx++;
    }

    if (candidates.length) console.log(`[AYROVIX duckduckgo] found ${candidates.length} free results for "${query}"`);
    return candidates;
  } catch (e) {
    console.warn(`[AYROVIX duckduckgo] error ${e}`);
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

/** Recherche externe gratuite combinée — Brave si clé, sinon DuckDuckGo scraping 100% gratuit */
export async function freeExternalSearch(query: string, limit = 6): Promise<AyrovixCandidate[]> {
  // Try Brave first (free 2000/mo with key), then DuckDuckGo (no key at all)
  const brave = await braveSearch(query, limit);
  if (brave.length) return brave;
  const ddg = await duckDuckGoSearch(query, limit);
  return ddg;
}

/** Recherche fusionnée : catalogue (toujours) + SerpAPI (si clé) + Free External (Brave/DuckDuckGo) */
export async function searchCandidates(
  db: QatafoDatabase,
  identification: AyrovixIdentification,
  query: string,
): Promise<AyrovixCandidate[]> {
  const catalog = catalogSearch(db, identification, query);

  // Parallel external searches
  const [serp, freeExternal] = await Promise.all([
    serpSearch(query),
    freeExternalSearch(query, 6),
  ]);

  const allExternal = [...serp, ...freeExternal];

  const rescoredExternal = allExternal.map((candidate) => ({
    ...candidate,
    match: scoreCandidate(identification, query, candidate),
  }));

  const seen = new Set<string>();
  return [...catalog, ...rescoredExternal]
    .filter((candidate) => {
      const key = `${candidate.title.toLowerCase()}|${candidate.source.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return candidate.match >= 25; // lowered to 25 for free search to show more results
    })
    .sort((a, b) => b.match - a.match)
    .slice(0, 8);
}

/** Health checks */
export interface SerpApiHealth { configured: boolean; reachable: boolean; valid: boolean; plan?: string; searchesLeft?: number | null; }
export interface FreeSearchHealth { braveConfigured: boolean; duckDuckGoAvailable: boolean; }

let serpHealthCache: { at: number; result: SerpApiHealth } | null = null;

export async function checkSerpApiHealth(force = false): Promise<SerpApiHealth> {
  if (serpHealthCache && !force && Date.now() - serpHealthCache.at < 60_000) return serpHealthCache.result;
  const key = process.env.SERPAPI_KEY?.trim();
  const base: SerpApiHealth = { configured: Boolean(key), reachable: false, valid: false };
  if (!key) { serpHealthCache = { at: Date.now(), result: base }; return base; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(`https://serpapi.com/account.json?api_key=${encodeURIComponent(key)}`, { signal: controller.signal });
    const payload: any = await response.json().catch(() => ({}));
    const result: SerpApiHealth = {
      configured: true, reachable: true, valid: response.ok && !payload?.error,
      plan: typeof payload?.plan_name === 'string' ? payload.plan_name : undefined,
      searchesLeft: Number.isFinite(Number(payload?.total_searches_left)) ? Number(payload.total_searches_left) : null,
    };
    serpHealthCache = { at: Date.now(), result };
    return result;
  } catch {
    const result: SerpApiHealth = { configured: true, reachable: false, valid: false };
    serpHealthCache = { at: Date.now(), result };
    return result;
  } finally { clearTimeout(timeout); }
}

export async function checkFreeSearchHealth(): Promise<FreeSearchHealth> {
  const braveConfigured = Boolean(process.env.BRAVE_API_KEY?.trim() || process.env.BRAVE_SEARCH_API_KEY?.trim());
  // Quick check DuckDuckGo reachable
  let duckDuckGoAvailable = true;
  try {
    const controller = new AbortController();
    setTimeout(()=>controller.abort(), 3000);
    const res = await fetch('https://html.duckduckgo.com/html/?q=test', { signal: controller.signal, headers: { 'User-Agent':'Mozilla/5.0' } });
    duckDuckGoAvailable = res.ok;
  } catch { duckDuckGoAvailable = false; }
  return { braveConfigured, duckDuckGoAvailable };
}
