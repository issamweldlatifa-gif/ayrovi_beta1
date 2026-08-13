import type { QatafoDatabase } from '../../db/database';
import type { AyrovixCandidate, AyrovixIdentification } from '../types';
import { estimateTnd } from './currency';

/**
 * AYROVIX · Search layer — fournisseurs interchangeables.
 * V1 : (1) catalogue AYROVI (toujours actif, zéro dépendance), (2) Google Shopping via
 * SerpAPI si SERPAPI_KEY est configurée. D'autres fournisseurs pourront s'ajouter sans
 * toucher au matching ni au scoring.
 */

const STOPWORDS = new Set(['the', 'and', 'pour', 'avec', 'les', 'des', 'une', 'femme', 'homme', 'femmes', 'hommes', 'new', 'style', 'mode', 'de', 'du', 'en', 'au', 'aux']);

const tokenize = (value: string): string[] =>
  value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOPWORDS.has(t));

function clampMatch(value: number): number {
  return Math.max(1, Math.min(99, Math.round(value)));
}

/**
 * Score déterministe 0..99 entre l'identification Vision et un candidat.
 * Code article = quasi-certitude, puis marque, modèle, couleurs, recouvrement lexical.
 */
export function scoreCandidate(identification: AyrovixIdentification | null, query: string, candidate: { title: string; brand?: string | null }): number {
  if (!identification) {
    // Mode URL/recherche libre : simple recouvrement lexical sur la requête.
    const qTokens = tokenize(query);
    if (!qTokens.length) return 0;
    const cTokens = new Set(tokenize(`${candidate.brand || ''} ${candidate.title}`));
    const overlap = qTokens.filter((t) => cTokens.has(t)).length / qTokens.length;
    return clampMatch(45 + overlap * 50);
  }
  let score = 28 * identification.confidence; // socle pondéré par la confiance Vision
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

/** Fournisseur 1 — catalogue AYROVI (stock & produits actifs). */
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

/** Fournisseur 2 — Google Shopping (optionnel, activé par SERPAPI_KEY). */
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
        brand: typeof item.source === 'string' ? null : null,
        model: null,
        colors: [],
        sizes: [],
        source: String(item.source || 'Web').slice(0, 40),
        sourceUrl: String(item.link || ''),
        image: String(item.thumbnail || ''),
        price,
        currency: price ? currency : null,
        priceTnd: null, // le TND est calculé à la sélection (couche currency)
        match: clampMatch(88 - index * 4),
      } satisfies AyrovixCandidate;
    });
  } catch {
    return []; // fournisseur optionnel : silencieux par conception, le catalogue reste la base
  } finally {
    clearTimeout(timeout);
  }
}

/** Recherche fusionnée : catalogue d'abord, externes ensuite, dédupliqués et re-scorés. */
export async function searchCandidates(
  db: QatafoDatabase,
  identification: AyrovixIdentification,
  query: string,
): Promise<AyrovixCandidate[]> {
  const catalog = catalogSearch(db, identification, query);
  const external = await serpSearch(query);
  const rescoredExternal = external.map((candidate) => ({
    ...candidate,
    match: scoreCandidate(identification, query, candidate),
  }));
  const seen = new Set<string>();
  return [...catalog, ...rescoredExternal]
    .filter((candidate) => {
      const key = `${candidate.title.toLowerCase()}|${candidate.source.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return candidate.match >= 35;
    })
    .sort((a, b) => b.match - a.match)
    .slice(0, 8);
}
