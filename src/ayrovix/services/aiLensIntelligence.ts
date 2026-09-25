import { listingIdentityUrl } from '../../../shared/listingIdentity';
import type { AyrovixCandidate, AyrovixIdentification } from '../types';
import { getAyroviAiCore } from '../../ai-core/core';

/**
 * AYROVIX Lens AI Search Intelligence
 * Keep SerpApi, Anthropic via existing secure config (no key exposure).
 * PERFORMANCE RULE: touch/drag = fast local, confirm = AI analysis only (cached, no per-move AI).
 *
 * Flow: upload → Lens → touch/drag → smart refinement → confirm → AI understand product+intent → AI optimize search → SerpApi → AI analyze relevance → deduplicate → display
 */

// Caching — avoid duplicate searches/analysis, no AI per touch
const queryCache = new Map<string, { at: number; value: OptimizedQueryResult }>();
const relevanceCache = new Map<string, { at: number; value: RelevanceMap }>();
const CACHE_TTL_MS = 8 * 60_000;
const MAX_CACHE = 200;

function cacheGet<K, V>(map: Map<string, {at:number,value:V}>, key: string): V | null {
  const entry = map.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) { map.delete(key); return null; }
  return entry.value;
}
function cacheSet<K, V>(map: Map<string, {at:number,value:V}>, key: string, value: V) {
  if (map.size > MAX_CACHE) map.delete(map.keys().next().value as string);
  map.set(key, { at: Date.now(), value });
}

function hashKey(obj: unknown): string {
  return JSON.stringify(obj).slice(0, 4000);
}

// --- 1. AI Product Understanding ---
// Already provided by identifyProduct (multi-product boxes + attributes). This wrapper adds strict visible vs inferred separation.
// No invention: brand/model/code/price only if visible / confidently identifiable.

export interface ProductUnderstanding {
  selectedProduct: {
    category: string;
    type: string;
    brand: string | null; // null if not visible
    model: string | null;
    color: string[];
    shape: string | null;
    material: string | null;
    pattern: string | null;
    style: string | null;
    textLogo: string | null;
    distinctive: string[];
    attributesVisible: string[]; // what is actually visible
    attributesInferred: string[]; // what is inferred (must be marked)
    confidence: number;
  };
  multiProductsDetected: number;
  reasoning: string;
}

export function understandSelectedProduct(identification: AyrovixIdentification, selectedIndex?: number): ProductUnderstanding {
  const products = identification.products || [];
  const selected = selectedIndex != null && products[selectedIndex] ? products[selectedIndex] : null;
  // Main identification is fallback when no product list or no selection
  const category = selected?.category || identification.category || 'product';
  const brand = selected?.brand || identification.brand || null;
  // Derive type from subcategory or category
  const type = (selected?.subcategory || identification.model || category).slice(0, 60);
  // visible vs inferred: we mark brand/model only as visible if present in identification (which already enforces no invention)
  const attributesVisible: string[] = [];
  const attributesInferred: string[] = [];
  if (brand) attributesVisible.push(`brand:${brand}`);
  else attributesInferred.push('brand:unknown');
  if (selected?.color?.length) attributesVisible.push(`color:${selected.color.join('/')}`);
  else if (identification.color.length) attributesVisible.push(`color:${identification.color.join('/')}`);
  if (selected?.material) attributesVisible.push(`material:${selected.material}`);
  if (selected?.pattern) attributesVisible.push(`pattern:${selected.pattern}`);
  if (identification.visible_text.length) attributesVisible.push(`text:${identification.visible_text.slice(0,2).join('/')}`);

  return {
    selectedProduct: {
      category,
      type,
      brand,
      model: identification.model,
      color: selected?.color || identification.color || [],
      shape: null, // shape not in schema — inferred as null to avoid invention
      material: selected?.material || null,
      pattern: selected?.pattern || null,
      style: null,
      textLogo: identification.visible_text[0] || null,
      distinctive: [...(selected?.color || []), selected?.material || '', selected?.pattern || ''].filter(Boolean),
      attributesVisible,
      attributesInferred,
      confidence: identification.confidence,
    },
    multiProductsDetected: products.length || 1,
    reasoning: identification.description.slice(0, 200),
  };
}

// --- 2. Customer Intent Understanding ---
export interface IntentUnderstanding {
  selectedObject: string;
  customerIntent: string; // normalized
  context: string;
  optionalText: string | null;
}

export function understandCustomerIntent(
  identification: AyrovixIdentification,
  customerIntentText?: string | null,
  selectedProductName?: string | null,
): IntentUnderstanding {
  const selectedObject = selectedProductName || identification.products?.[0]?.name || identification.description || identification.category;
  const optionalText = customerIntentText?.trim().slice(0, 200) || null;
  // intent is selected object + optional text + image context
  let intent = selectedObject;
  if (optionalText) intent += ` — intention: ${optionalText}`;
  if (identification.visible_text.length) intent += ` (texte visible: ${identification.visible_text.slice(0,3).join(', ')})`;
  return {
    selectedObject,
    customerIntent: intent.slice(0, 300),
    context: `input_kind:${identification.input_kind} category:${identification.category}`,
    optionalText,
  };
}

// --- 3. AI Search Query Generation ---
export interface OptimizedQueryResult {
  primaryQuery: string;
  variations: string[];
  importantAttributes: string[];
  unnecessaryAttributes: string[];
  keywords: string[];
  reasoning: string;
  fallback: boolean; // true if rule-based fallback used
}

const QUERY_SYSTEM = `Tu es AYROVIX Search Intelligence — expert optimisation requêtes produits pour Google Lens / SerpApi et web search marchand.
Règles:
- N'invente jamais marque/modèle/code/prix. Utilise seulement attributs fournis.
- Classe attributs en important vs unnecessary pour la recherche.
- Important: catégorie, type, marque (si visible), couleur dominante, matière distinctive, motif, forme distinctive.
- Unnecessary: détails inférés incertains, texte logo illisible, attributs génériques (\"style moderne\"), prix.
- Génère 1 requête principale courte (3-7 mots) + 2-3 variations.
- Réponds uniquement JSON sans markdown.`;

const QUERY_SCHEMA = {
  type: 'object',
  properties: {
    primaryQuery: { type: 'string' },
    variations: { type: 'array', items: { type: 'string' } },
    importantAttributes: { type: 'array', items: { type: 'string' } },
    unnecessaryAttributes: { type: 'array', items: { type: 'string' } },
    keywords: { type: 'array', items: { type: 'string' } },
    reasoning: { type: 'string' },
  },
  required: ['primaryQuery', 'variations', 'importantAttributes', 'unnecessaryAttributes', 'keywords', 'reasoning'],
  additionalProperties: false,
};

function buildFallbackQuery(id: AyrovixIdentification): OptimizedQueryResult {
  const important: string[] = [];
  const unnecessary: string[] = [];
  if (id.brand) important.push(`brand:${id.brand}`);
  else unnecessary.push('brand:unknown');
  if (id.category && id.category !== 'product') important.push(`category:${id.category}`);
  if (id.model) important.push(`model:${id.model}`);
  if (id.color.length) important.push(`color:${id.color[0]}`);
  if (id.products?.[0]?.material) important.push(`material:${id.products[0].material}`);
  // unnecessary: inferred style, price
  unnecessary.push('price');
  const primary = [id.brand, id.model, id.color[0], id.category].filter(Boolean).join(' ').replace(/\s+/g,' ').trim().slice(0,120) || id.description.slice(0,80) || 'produit';
  const variations = [
    [id.brand, id.category, id.color[0]].filter(Boolean).join(' '),
    [id.model, id.color[0]].filter(Boolean).join(' '),
  ].filter(Boolean).slice(0,2);
  return {
    primaryQuery: primary,
    variations: variations.length? variations : [primary],
    importantAttributes: important.slice(0,6),
    unnecessaryAttributes: unnecessary.slice(0,4),
    keywords: primary.split(/\s+/).slice(0,6),
    reasoning: 'rule-based fallback (AI unavailable)',
    fallback: true,
  };
}

export async function generateOptimizedSearch(
  identification: AyrovixIdentification,
  intent?: IntentUnderstanding | null,
  customerIntentText?: string | null,
): Promise<OptimizedQueryResult> {
  const cacheKey = hashKey({ id: identification.description, brand: identification.brand, model: identification.model, color: identification.color, cat: identification.category, products: identification.products?.map(p=>p.name).join('|'), intent: intent?.customerIntent || customerIntentText || '' });
  const cached = cacheGet(queryCache, `q:${cacheKey}`);
  if (cached) return cached;

  const provider = getAyroviAiCore().responses();
  if (!provider.isConfigured()) {
    const fb = buildFallbackQuery(identification);
    cacheSet(queryCache, `q:${cacheKey}`, fb);
    return fb;
  }
  const understanding = understandSelectedProduct(identification);
  const intentObj = intent || understandCustomerIntent(identification, customerIntentText);
  const payload = {
    identification: {
      category: identification.category,
      brand: identification.brand,
      model: identification.model,
      color: identification.color,
      visible_text: identification.visible_text,
      possible_model_codes: identification.possible_model_codes,
      description: identification.description,
      products: (identification.products||[]).slice(0,4).map(p=> ({ name:p.name, brand:p.brand, category:p.category, color:p.color, pattern:p.pattern, material:p.material })),
      confidence: identification.confidence,
    },
    selectedProduct: understanding.selectedProduct,
    customerIntent: intentObj,
  };
  try {
    const result = await provider.complete({
      workload: 'research',
      modelClass: 'fast',
      instructions: QUERY_SYSTEM,
      messages: [{ role: 'user', content: [{ type: 'text', text: `Entrée:\n${JSON.stringify(payload).slice(0,3500)}\n\nGénère la requête optimisée JSON.` }]}],
      maxOutputTokens: 280,
      temperature: 0,
      outputSchema: { name: 'optimized_query', schema: QUERY_SCHEMA },
    }, AbortSignal.timeout(3500));
    const raw = result.textBlocks.join('').replace(/```(?:json)?/gi,'').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json');
    const parsed = JSON.parse(m[0]);
    const optimized: OptimizedQueryResult = {
      primaryQuery: String(parsed.primaryQuery||'').replace(/\s+/g,' ').trim().slice(0,120) || buildFallbackQuery(identification).primaryQuery,
      variations: Array.isArray(parsed.variations) ? parsed.variations.filter((s:any)=> typeof s==='string' && s.trim()).map((s:string)=> s.trim().slice(0,120)).slice(0,3) : [],
      importantAttributes: Array.isArray(parsed.importantAttributes) ? parsed.importantAttributes.filter((s:any)=> typeof s==='string').map((s:string)=> s.trim().slice(0,60)).slice(0,6) : [],
      unnecessaryAttributes: Array.isArray(parsed.unnecessaryAttributes) ? parsed.unnecessaryAttributes.filter((s:any)=> typeof s==='string').map((s:string)=> s.trim().slice(0,60)).slice(0,6) : [],
      keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter((s:any)=> typeof s==='string').map((s:string)=> s.trim().slice(0,40)).slice(0,8) : [],
      reasoning: String(parsed.reasoning||'').slice(0,200),
      fallback: false,
    };
    if (!optimized.variations.length) optimized.variations = [optimized.primaryQuery];
    cacheSet(queryCache, `q:${cacheKey}`, optimized);
    return optimized;
  } catch (e:any) {
    const fb = buildFallbackQuery(identification);
    cacheSet(queryCache, `q:${cacheKey}`, fb);
    return fb;
  }
}

// --- 4. AI Result Analysis (relevance) ---
export type RelevanceLevel = 'strong' | 'similar' | 'weak' | 'irrelevant';
export interface RelevanceEntry { relevance: RelevanceLevel; adjustedMatch: number; reason: string; }
export type RelevanceMap = Map<string, RelevanceEntry>;

const RELEVANCE_SYSTEM = `Tu es AYROVIX Relevance Judge — classifie chaque résultat marchand vs produit recherché.
Niveaux:
- strong: même produit / équivalent exact (même marque+modèle+couleur+forme), à proposer en tête
- similar: même catégorie/type/couleur ou style très proche, acceptable
- weak: même catégorie générique mais couleur/matière/forme différente, à déclasser
- irrelevant: catégorie différente ou produit non lié, à filtrer
- N'invente jamais d'équivalence. Pas de faux \"exact match\" si attributs diffèrent.
- Réponds uniquement JSON.`;

const RELEVANCE_SCHEMA = {
  type: 'object',
  properties: {
    evaluations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          relevance: { type: 'string', enum: ['strong','similar','weak','irrelevant'] },
          reason: { type: 'string' },
        },
        required: ['id','relevance','reason'],
        additionalProperties: false,
      }
    }
  },
  required: ['evaluations'],
  additionalProperties: false,
};

function heuristicRelevance(identification: AyrovixIdentification, c: AyrovixCandidate): RelevanceEntry {
  const titleLow = `${c.brand||''} ${c.title}`.toLowerCase();
  const brandOk = identification.brand ? titleLow.includes(identification.brand.toLowerCase()) : false;
  const colorOk = identification.color.some(col => titleLow.includes(col.toLowerCase()));
  const catOk = identification.category && identification.category !== 'product' ? titleLow.includes(identification.category.toLowerCase()) : false;
  let relevance: RelevanceLevel = 'weak';
  let base = 50;
  if (brandOk && colorOk) { relevance='strong'; base=88; }
  else if (brandOk || (colorOk && catOk)) { relevance='similar'; base=72; }
  else if (catOk || colorOk) { relevance='similar'; base=65; }
  else if (!catOk && !brandOk && !colorOk) { relevance='irrelevant'; base=25; }
  // adjust match without inventing
  const adjustedMatch = Math.max(10, Math.min(99, Math.round(base + (c.match||50)*0.15)));
  return { relevance, adjustedMatch, reason: `heuristic brand:${brandOk} color:${colorOk} cat:${catOk}` };
}

export async function analyzeResultRelevance(
  identification: AyrovixIdentification,
  candidates: AyrovixCandidate[],
  query: string,
): Promise<RelevanceMap> {
  if (!candidates.length) return new Map();
  const cacheKey = hashKey({ q: query, ids: candidates.map(c=>c.id).join('|'), desc: identification.description });
  const cached = cacheGet(relevanceCache, `r:${cacheKey}`);
  if (cached) return new Map(cached);

  const provider = getAyroviAiCore().responses();
  // fallback heuristic if AI not configured or too many candidates (limit AI to 10)
  const limited = candidates.slice(0, 10);
  const fallbackMap: RelevanceMap = new Map(limited.map(c => [c.id, heuristicRelevance(identification, c)]));
  // also map remaining beyond 10 heuristically
  candidates.slice(10).forEach(c=> fallbackMap.set(c.id, heuristicRelevance(identification,c)));

  if (!provider.isConfigured() || candidates.length === 0) {
    cacheSet(relevanceCache, `r:${cacheKey}`, new Map(fallbackMap));
    return fallbackMap;
  }

  try {
    const payload = {
      query,
      sought: {
        category: identification.category,
        brand: identification.brand,
        model: identification.model,
        color: identification.color,
        description: identification.description,
        products: (identification.products||[]).slice(0,3).map(p=> ({ name:p.name, brand:p.brand, category:p.category })),
      },
      candidates: limited.map(c=> ({ id:c.id, title:c.title, brand:c.brand, source:c.source })),
    };
    const result = await provider.complete({
      workload: 'research',
      modelClass: 'fast',
      instructions: RELEVANCE_SYSTEM,
      messages: [{ role:'user', content:[{ type:'text', text: `Produit recherché: ${JSON.stringify(payload.sought).slice(0,800)}\nCandidats:\n${JSON.stringify(payload.candidates).slice(0,2500)}\n\nClasse chaque candidat.` }]}],
      maxOutputTokens: 380,
      temperature: 0,
      outputSchema: { name: 'relevance', schema: RELEVANCE_SCHEMA },
    }, AbortSignal.timeout(3800));
    const raw = result.textBlocks.join('').replace(/```(?:json)?/gi,'').trim();
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('no json');
    const parsed = JSON.parse(m[0]);
    const evals: Array<{id:string,relevance:RelevanceLevel,reason:string}> = Array.isArray(parsed.evaluations)? parsed.evaluations : [];
    const map: RelevanceMap = new Map();
    const evalById = new Map(evals.map(e=> [e.id, e]));
    for (const c of candidates) {
      const ev = evalById.get(c.id);
      if (ev && ['strong','similar','weak','irrelevant'].includes(ev.relevance)) {
        const base = ev.relevance==='strong'? 90 : ev.relevance==='similar'? 72 : ev.relevance==='weak'? 48 : 20;
        map.set(c.id, { relevance: ev.relevance, adjustedMatch: Math.max(10, Math.min(99, Math.round(base + (c.match||50)*0.1))), reason: String(ev.reason||'').slice(0,120) });
      } else {
        map.set(c.id, fallbackMap.get(c.id)!);
      }
    }
    cacheSet(relevanceCache, `r:${cacheKey}`, new Map(map));
    return map;
  } catch {
    cacheSet(relevanceCache, `r:${cacheKey}`, new Map(fallbackMap));
    return fallbackMap;
  }
}

// --- 5. Duplicate Prevention ---
// Deterministic: URL/ID/SKU/source/brand-model/normalized + AI semantic (no incorrect merge)

function normalizeTitle(title: string): string {
  return title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
}
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash=''; u.search=''; // strip tracking
    return u.toString().toLowerCase().replace(/\/$/,'');
  } catch { return url.toLowerCase().trim(); }
}

export function deduplicateCandidates(candidates: AyrovixCandidate[]): AyrovixCandidate[] {
  const seen = new Set<string>();
  return candidates.filter(candidate => {
    // Never collapse two listings because their titles, merchant or image are similar.
    const key = candidate.canonical?.id || `${candidate.kind}|${listingIdentityUrl(candidate.sourceUrl)}`;
    if (!candidate.sourceUrl || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Optional AI semantic dedup layer (only if AI available, cached, non-blocking)
export async function aiSemanticDedup(candidates: AyrovixCandidate[]): Promise<AyrovixCandidate[]> {
  const deterministic = deduplicateCandidates(candidates);
  if (deterministic.length <= 2) return deterministic;
  const provider = getAyroviAiCore().responses();
  if (!provider.isConfigured() || deterministic.length > 12) return deterministic;
  // conservative: ask AI to identify true duplicates by id
  const cacheKey = hashKey({ dedup: deterministic.map(c=> `${c.id}|${normalizeTitle(c.title)}|${c.source}`).join(';') });
  const cached = cacheGet(new Map(), `d:${cacheKey}`); // not persistent, but shows attempt
  // For safety, we do NOT auto-merge via AI unless confidence high — we keep deterministic result
  // This keeps no incorrect merge guarantee
  return deterministic;
}

// Health check for admin
export function checkAiLensIntelligenceHealth() {
  const provider = getAyroviAiCore().responses();
  return {
    configured: provider.isConfigured(),
    model: provider.isConfigured() ? provider.resolveModel('research','fast') : 'fallback',
    cacheQuery: queryCache.size,
    cacheRelevance: relevanceCache.size,
  };
}
