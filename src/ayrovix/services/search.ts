import type { QatafoDatabase } from '../../db/database';
import type { AyrovixCandidate, AyrovixIdentification } from '../types';
import { estimateTnd } from './currency';
import { fetchSafeRemote, readLimitedText } from '../../services/safeUrl';

/**
 * AYROVIX Search V3 — Google Lens style: free tier + enriched details (image, sizes, colors, link)
 * Fixes from logs Aug 13:
 * - DuckDuckGo fetch failed (AbortError, network) → retry with lite + brave scrape fallback
 * - Missing sizes/colors/link → enrich candidates via OG + JSON-LD scrape
 * - Gemini now SUCCESS with gemini-3-flash-preview, DuckDuckGo is the bottleneck
 */

const STOPWORDS = new Set(['the', 'and', 'pour', 'avec', 'les', 'des', 'une', 'femme', 'homme', 'femmes', 'hommes', 'new', 'style', 'mode', 'de', 'du', 'en', 'au', 'aux']);
const EXTERNAL_CACHE_TTL_MS = 5 * 60_000;
const externalSearchCache = new Map<string, { at: number; results: AyrovixCandidate[] }>();
const externalSearchInFlight = new Map<string, Promise<AyrovixCandidate[]>>();

function searchBudgetMs(): number {
  const configured = Number(process.env.AYROVIX_SEARCH_TIMEOUT_MS);
  return Number.isFinite(configured) ? Math.min(10_000, Math.max(1_500, configured)) : 4_000;
}

function remainingSearchMs(deadline: number, perRequestMax: number): number {
  return Math.max(50, Math.min(perRequestMax, deadline - Date.now()));
}

function searchHasTime(deadline: number, minimum = 100): boolean {
  return deadline - Date.now() > minimum;
}
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
        source: 'Collection AYROVI',
        sourceUrl: row.source_url || '',
        image: row.image || '',
        price: Number(row.original_price) || null,
        currency: row.currency || null,
        priceTnd: Number(row.final_price) > 0 ? Number(row.final_price) : (tnd?.priceTnd ?? null),
        match,
      } satisfies AyrovixCandidate;
    })
    .filter((c) => c.match >= 35);
  return scored.sort((a, b) => b.match - a.match).slice(0, limit);
}

export async function serpSearch(query: string, limit = 6, deadline = Date.now() + searchBudgetMs()): Promise<AyrovixCandidate[]> {
  const key = process.env.SERPAPI_KEY?.trim();
  if (!key || !searchHasTime(deadline)) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remainingSearchMs(deadline, 3_500));
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
        source: 'Marché International Vérifié',
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

export async function braveSearch(query: string, limit = 6, deadline = Date.now() + searchBudgetMs()): Promise<AyrovixCandidate[]> {
  const key = process.env.BRAVE_API_KEY?.trim() || process.env.BRAVE_SEARCH_API_KEY?.trim();
  if (!key || !searchHasTime(deadline)) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), remainingSearchMs(deadline, 2_500));
  try {
    const params = new URLSearchParams({ q: query, count: String(limit), safesearch: 'moderate' });
    const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
      signal: controller.signal,
      headers: { 'X-Subscription-Token': key, 'Accept': 'application/json' },
    });
    if (!res.ok) return [];
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
      source: 'Réseau Partenaires',
      sourceUrl: String(item.url || ''),
      image: '',
      price: null,
      currency: null,
      priceTnd: null,
      match: clampMatch(75 - idx*5),
    } satisfies AyrovixCandidate));
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

// Enrich candidate with Open Graph image, price, sizes, colors via lightweight fetch (no Puppeteer)
async function enrichCandidate(candidate: AyrovixCandidate, deadline: number): Promise<AyrovixCandidate> {
  if ((candidate.image && candidate.price != null) || !searchHasTime(deadline, 300)) return candidate;
  try {
    const res = await fetchSafeRemote(candidate.sourceUrl, {
      signal: AbortSignal.timeout(remainingSearchMs(deadline, 1_500)),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return candidate;
    const html = await readLimitedText(res);

    // og:image
    let image = candidate.image;
    if (!image) {
      const ogMatch = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
      if (ogMatch) image = ogMatch[1].trim();
    }

    // price from JSON-LD or meta
    let price = candidate.price;
    let currency = candidate.currency;
    if (price == null) {
      const priceMatch = html.match(/"price"\s*:\s*"?([\d.]+)"?/) ||
                         html.match(/product:price:amount["'][^>]*content=["']([\d.]+)["']/i) ||
                         html.match(/\$([\d]+\.[\d]{2})/);
      if (priceMatch) {
        const p = parseFloat(priceMatch[1]);
        if (Number.isFinite(p) && p>0 && p<100000) {
          price = p;
          // try currency
          if (!currency) {
            const currMatch = html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/) || html.match(/product:price:currency["'][^>]*content=["']([A-Z]{3})["']/i);
            currency = currMatch ? currMatch[1] : 'USD';
          }
        }
      }
    }

    // sizes/colors heuristic
    let sizes: string[] = candidate.sizes;
    let colors: string[] = candidate.colors;
    if (!sizes.length) {
      const sizeMatch = html.match(/sizes?["':\s]+\[([^\]]+)\]/i);
      if (sizeMatch) {
        const raw = sizeMatch[1];
        const found = raw.match(/\"([A-Z0-9\/]+)\"/g)?.map(s=>s.replace(/"/g,'')).slice(0,6) || [];
        if (found.length) sizes = found;
      } else {
        // look for common sizes in page
        const sizeList = ['XS','S','M','L','XL','XXL','2XL','3XL','36','37','38','39','40','41','42','43','44','45'];
        const found: string[] = [];
        for (const s of sizeList) if (new RegExp(`\\b${s}\\b`).test(html)) found.push(s);
        if (found.length >=2 && found.length <=8) sizes = found.slice(0,6);
      }
    }
    if (!colors.length) {
      const colorKeywords = ['black','white','blue','navy','red','green','yellow','grey','gray','beige','brown','pink','purple','orange'];
      const foundColors: string[] = [];
      const lowerHtml = html.toLowerCase();
      for (const c of colorKeywords) if (lowerHtml.includes(c)) foundColors.push(c);
      if (foundColors.length) colors = [...new Set(foundColors)].slice(0,3);
    }

    return { ...candidate, image: image || candidate.image, price: price ?? candidate.price, currency: currency ?? candidate.currency, sizes, colors };
  } catch {
    return candidate;
  }
}

export async function duckDuckGoSearch(query: string, limit = 6, deadline = Date.now() + searchBudgetMs()): Promise<AyrovixCandidate[]> {
  const endpoints = [
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query + ' buy shopping')}`,
    `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query + ' shopping')}`,
  ];

  for (const url of endpoints) {
    if (!searchHasTime(deadline)) break;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), remainingSearchMs(deadline, 2_000));
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr,en-US;q=0.9,en;q=0.8',
          'Referer': 'https://duckduckgo.com/',
        },
      });
      if (!res.ok) {
        console.warn(`[AYROVIX duckduckgo] ${url} HTTP ${res.status}`);
        continue;
      }
      const html = await readLimitedText(res);
      const candidates: AyrovixCandidate[] = [];
      const linkRegex = /<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi;
      const urlRegex = /uddg=([^&"]+)/;
      let match;
      let idx = 0;
      while ((match = linkRegex.exec(html)) !== null && candidates.length < limit) {
        let rawUrl = match[1] || '';
        let title = (match[2] || '').replace(/<[^>]*>/g, '').trim();
        if (!title) continue;
        const uddgMatch = rawUrl.match(urlRegex);
        if (uddgMatch) {
          try { rawUrl = decodeURIComponent(uddgMatch[1]); } catch {}
        }
        if (rawUrl.includes('duckduckgo.com')) continue;
        if (!rawUrl.startsWith('http')) continue;
        if (title.length < 5) continue;
        candidates.push({
          id: `ddg_${idx}_${Buffer.from(rawUrl).toString('base64url').slice(0,8)}`,
          kind: 'external' as const,
          title: title.slice(0,160),
          brand: null,
          model: null,
          colors: [],
          sizes: [],
          source: 'Réseau Partenaires',
          sourceUrl: rawUrl,
          image: '',
          price: null,
          currency: null,
          priceTnd: null,
          match: clampMatch(70 - idx*5),
        } satisfies AyrovixCandidate);
        idx++;
      }

      if (candidates.length) {
        console.log(`[AYROVIX duckduckgo] found ${candidates.length} via ${url} for "${query}"`);
        // Enrichment is best-effort and shares the same bounded search deadline.
        const enriched = await Promise.all(
          candidates.slice(0,2).map(c => enrichCandidate(c, deadline))
        );
        const rest = candidates.slice(2);
        return [...enriched, ...rest];
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        console.warn(`[AYROVIX duckduckgo] AbortError ${url} — retrying next endpoint`);
      } else {
        console.warn(`[AYROVIX duckduckgo] error ${url}: ${e?.message||e}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  // Final bounded fallback: try Brave HTML only if budget remains.
  try {
    if (!searchHasTime(deadline)) return [];
    const braveUrl = `https://search.brave.com/search?q=${encodeURIComponent(query + ' buy shopping')}`;
    const controller = new AbortController();
    const timeout = setTimeout(()=>controller.abort(), remainingSearchMs(deadline, 1_500));
    const res = await fetch(braveUrl, { signal: controller.signal, headers: { 'User-Agent':'Mozilla/5.0' } });
    clearTimeout(timeout);
    if (res.ok) {
      const html = await readLimitedText(res);
      // Very simple parse for Brave
      const linkRegex = /<a[^>]+href="(https:\/\/[^"]+)"[^>]*class="[^"]*result[^"]*">([^<]{10,120})<\/a>/gi;
      const candidates: AyrovixCandidate[] = [];
      let m, idx=0;
      while ((m = linkRegex.exec(html)) !== null && candidates.length < limit) {
        const rawUrl = m[1];
        const title = m[2].trim();
        if (rawUrl.includes('brave.com')) continue;
        candidates.push({
          id: `brave_scrape_${idx}_${Buffer.from(rawUrl).toString('base64url').slice(0,8)}`,
          kind: 'external' as const,
          title: title.slice(0,160),
          brand: null,
          model: null,
          colors: [],
          sizes: [],
          source: 'Réseau Partenaires',
          sourceUrl: rawUrl,
          image: '',
          price: null,
          currency: null,
          priceTnd: null,
          match: clampMatch(65 - idx*5),
        } satisfies AyrovixCandidate);
        idx++;
      }
      if (candidates.length) {
        console.log(`[AYROVIX brave-scrape] found ${candidates.length} for "${query}"`);
        return candidates;
      }
    }
  } catch {}

  console.warn(`[AYROVIX duckduckgo] all endpoints failed for "${query}"`);
  return [];
}

export async function freeExternalSearch(
  query: string,
  limit = 6,
  deadline = Date.now() + searchBudgetMs(),
): Promise<AyrovixCandidate[]> {
  const cacheKey = `${query.trim().toLowerCase()}|${limit}`;
  const cached = externalSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < EXTERNAL_CACHE_TTL_MS) return cached.results.map((item) => ({ ...item }));
  const existing = externalSearchInFlight.get(cacheKey);
  if (existing) return (await existing).map((item) => ({ ...item }));

  const task = (async () => {
    const brave = await braveSearch(query, limit, deadline);
    const results = brave.length ? brave : await duckDuckGoSearch(query, limit, deadline);
    if (results.length) {
      externalSearchCache.set(cacheKey, { at: Date.now(), results });
      if (externalSearchCache.size > 200) externalSearchCache.delete(externalSearchCache.keys().next().value as string);
    }
    return results;
  })();
  externalSearchInFlight.set(cacheKey, task);
  try {
    return (await task).map((item) => ({ ...item }));
  } finally {
    externalSearchInFlight.delete(cacheKey);
  }
}

export async function searchCandidates(
  db: QatafoDatabase,
  identification: AyrovixIdentification,
  query: string,
): Promise<AyrovixCandidate[]> {
  const catalog = catalogSearch(db, identification, query);
  const deadline = Date.now() + searchBudgetMs();
  const [serp, freeExternal] = await Promise.all([
    serpSearch(query, 6, deadline),
    freeExternalSearch(query, 6, deadline),
  ]);
  const allExternal = [...serp, ...freeExternal];
  const rescoredExternal = allExternal.map((c) => ({
    ...c,
    match: scoreCandidate(identification, query, c),
  }));
  const seen = new Set<string>();
  return [...catalog, ...rescoredExternal]
    .filter((c) => {
      const key = `${c.title.toLowerCase()}|${c.source.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return c.match >= 20;
    })
    .sort((a, b) => b.match - a.match)
    .slice(0, 8);
}

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
  let duckDuckGoAvailable = true;
  try {
    const controller = new AbortController();
    setTimeout(()=>controller.abort(), 3000);
    const res = await fetch('https://html.duckduckgo.com/html/?q=test', { signal: controller.signal, headers: { 'User-Agent':'Mozilla/5.0' } });
    duckDuckGoAvailable = res.ok;
  } catch { duckDuckGoAvailable = false; }
  return { braveConfigured, duckDuckGoAvailable };
}
