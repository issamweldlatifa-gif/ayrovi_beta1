/**
 * ENRICHISSEMENT DES RÉSULTATS LENS — la ligne descriptive (25/09/2026).
 *
 * Défaut connu et enfin traité : Google Lens rend un titre, une boutique et un
 * prix, mais **aucune description**. La carte affichait donc un titre tronqué et
 * une ligne grise vide, et nous avions interdit — à raison — de fabriquer ce
 * texte à partir du titre.
 *
 * La seule façon honnête d'obtenir une description est de la DEMANDER : un appel
 * `google_shopping` par produit. C'est un appel payant, donc il est encadré :
 *
 *   • BUDGET  : seuls les premiers résultats sont enrichis (4 par défaut) — ce
 *               sont les seuls que l'œil lit vraiment ;
 *   • CACHE   : 7 jours sur disque, par titre normalisé. Une description ne
 *               change pas comme un prix ; la payer deux fois serait du gâchis ;
 *   • ÉCHÉANCE: l'enrichissement ne retarde JAMAIS la réponse. S'il n'est pas
 *               prêt, on répond sans lui — une ligne grise vide vaut mieux
 *               qu'un client qui attend ;
 *   • PREUVE  : une description n'est retenue que si la fiche trouvée correspond
 *               vraiment au produit (recouvrement de mots fort). Sinon rien :
 *               décrire un produit avec le texte d'un autre est pire que se taire.
 *
 * `AYROVI_LENS_ENRICH=false` coupe la dépense sans redéploiement.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AyrovixCandidate } from '../types';

const DEFAULT_BUDGET = 4;
const DEFAULT_DEADLINE_MS = 3500;
const DEFAULT_TIMEOUT_MS = 3000;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CONCURRENCY = 2;
/** En dessous de ce recouvrement de mots, la fiche trouvée décrit un AUTRE produit. */
const MATCH_THRESHOLD = 0.6;

function enabled(): boolean {
  return process.env.AYROVI_LENS_ENRICH !== 'false' && Boolean(serpApiKey());
}

function serpApiKey(): string {
  return (process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY || '').trim();
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function cacheDir(): string {
  return process.env.AYROVI_LENS_ENRICH_CACHE_DIR || path.resolve(process.cwd(), 'data', 'lens-descriptions');
}

/* ── Correspondance : on ne décrit un produit qu'avec SON texte ───────────── */

export function normalizeTitle(title: string): string {
  return title
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function titleOverlap(a: string, b: string): number {
  const left = new Set(normalizeTitle(a).split(' ').filter((word) => word.length > 2));
  const right = new Set(normalizeTitle(b).split(' ').filter((word) => word.length > 2));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / left.size;
}

/* ── Cache disque ─────────────────────────────────────────────────────────── */

interface CachedDescription { description: string | null; at: number; }

function cacheFile(title: string): string {
  const key = crypto.createHash('sha256').update(normalizeTitle(title)).digest('hex').slice(0, 32);
  return path.join(cacheDir(), `${key}.json`);
}

function readCache(title: string, now: number): CachedDescription | null {
  try {
    const entry = JSON.parse(fs.readFileSync(cacheFile(title), 'utf8')) as CachedDescription;
    const ttl = envInt('AYROVI_LENS_ENRICH_TTL_MS', DEFAULT_TTL_MS, 60_000, 30 * 24 * 60 * 60 * 1000);
    return now - entry.at <= ttl ? entry : null;
  } catch {
    return null;
  }
}

function writeCache(title: string, description: string | null, now: number): void {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(cacheFile(title), JSON.stringify({ description, at: now } as CachedDescription), 'utf8');
  } catch {
    /* un cache qui n'écrit pas reste un cache */
  }
}

/* ── Appel réseau, isolé pour être remplaçable dans les tests ─────────────── */

export type DescriptionFetcher = (title: string) => Promise<{ title: string; description: string } | null>;

async function defaultFetcher(title: string): Promise<{ title: string; description: string } | null> {
  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: title.slice(0, 120),
    api_key: serpApiKey(),
    num: '5',
  });
  const response = await fetch(`https://serpapi.com/search.json?${params.toString()}`, {
    signal: AbortSignal.timeout(envInt('AYROVI_LENS_ENRICH_TIMEOUT_MS', DEFAULT_TIMEOUT_MS, 800, 10_000)),
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  const payload = await response.json() as any;
  const rows: any[] = Array.isArray(payload?.shopping_results) ? payload.shopping_results : [];
  for (const row of rows) {
    const rowTitle = String(row?.title || '').trim();
    const snippet = String(row?.snippet || '').trim()
      || (Array.isArray(row?.extensions) ? row.extensions.filter((value: unknown) => typeof value === 'string').join(' · ') : '');
    if (!rowTitle || !snippet) continue;
    return { title: rowTitle, description: snippet };
  }
  return null;
}

/* ── Enrichissement d'un lot ──────────────────────────────────────────────── */

async function describe(title: string, fetcher: DescriptionFetcher, now: number): Promise<string | null> {
  const cached = readCache(title, now);
  if (cached) return cached.description;
  try {
    const found = await fetcher(title);
    // La preuve avant le texte : sans recouvrement fort, la fiche parle d'autre chose.
    const description = found && titleOverlap(title, found.title) >= MATCH_THRESHOLD
      ? found.description.slice(0, 300)
      : null;
    writeCache(title, description, now);
    return description;
  } catch {
    // Un échec n'est PAS mémorisé : la recherche suivante réessaiera.
    return null;
  }
}

export async function enrichCandidateDescriptions(
  candidates: AyrovixCandidate[],
  options: { fetcher?: DescriptionFetcher; now?: number } = {},
): Promise<AyrovixCandidate[]> {
  if (!candidates.length || !enabled()) return candidates;

  const fetcher = options.fetcher ?? defaultFetcher;
  const now = options.now ?? Date.now();
  const budget = envInt('AYROVI_LENS_ENRICH_BUDGET', DEFAULT_BUDGET, 0, 10);
  const deadline = envInt('AYROVI_LENS_ENRICH_DEADLINE_MS', DEFAULT_DEADLINE_MS, 500, 15_000);

  // Seuls les résultats SANS description et réellement visibles justifient une dépense.
  const targets = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => !candidate.description?.trim() && candidate.title.trim().length >= 8)
    .slice(0, budget);
  if (!targets.length) return candidates;

  const output = candidates.map((candidate) => ({ ...candidate }));
  const queue = [...targets];

  const worker = async (): Promise<void> => {
    for (;;) {
      const next = queue.shift();
      if (!next) return;
      const description = await describe(next.candidate.title, fetcher, now);
      if (description) output[next.index].description = description;
    }
  };

  const work = Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  // L'enrichissement ne retarde jamais la réponse : à l'échéance, on rend ce qu'on a.
  await Promise.race([work, new Promise<void>((resolve) => setTimeout(resolve, deadline))]);
  return output;
}
