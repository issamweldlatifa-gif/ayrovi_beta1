/**
 * STOCK ET TAILLES VIVANTS — le lien SerpApi devient une source (01/10/2026).
 *
 * Constat : Google Lens rend un titre, une boutique, un prix parfois, et un
 * LIEN. La grille affichait donc `sizes: []` et une disponibilité devinée,
 * parce que personne n'allait voir ce qu'il y avait derrière le lien. Le lien
 * est pourtant la meilleure source du catalogue : la page produit du marchand.
 *
 * Ce module va donc la lire, avec EXACTEMENT les garde-fous qui rendent une
 * dépense acceptable dans ce projet — les mêmes que la ligne descriptive :
 *
 *   • BUDGET   : seules les premières fiches sont visitées (4 par défaut). Le
 *                reste de la grille reste tel quel, JAMAIS inventé ;
 *   • CACHE    : 6 h sur disque, par URL. Un stock plus vieux n'est plus une
 *                preuve ; le payer deux fois serait du gâchis ;
 *   • ÉCHÉANCE : l'enrichissement ne retarde JAMAIS la réponse. À 2,5 s on
 *                rend ce qu'on a — une fiche sans stock vérifié vaut mieux
 *                qu'un client qui attend devant un écran qui ne dit rien ;
 *   • PREUVE   : aucun fait n'est posé sur un produit dont le titre ne
 *                recouvre pas fortement celui de la page lue. Le stock d'un
 *                autre produit est pire que pas de stock ;
 *   • SILENCE  : une page muette laisse `unknown`. Ici comme partout ailleurs,
 *                un silence n'est pas une disponibilité.
 *
 * `AYROVI_LENS_LIVE_STOCK=false` coupe la dépense sans redéploiement.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pruneDiskCache } from '../../services/diskCache';
import { allowsMerchantVariantChoice } from '../../../shared/variantPolicy';
import type { AyrovixCandidate } from '../types';
import { titleOverlap } from './lensEnrichment';
import { recordVariantContract } from './variantAvailability';
import type { ParsedProductPage } from '../../scraper/productPageParser';
import { hostAllowsProbe, recordProbeFailure, recordProbeSuccess } from '../../scraper/hostCircuit';

const DEFAULT_BUDGET = 4;
const DEFAULT_DEADLINE_MS = 2500;
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_MATCH_THRESHOLD = 0.6;
const MAX_IMAGES = 12;
const MAX_SIZES = 40;

/** Lecture d'une page marchand — injectée par l'appelant (tests : fictive). */
export type LiveStockFetcher = (url: string) => Promise<ParsedProductPage | null>;

/** État d'une variante, tel que la source le publie (jamais déduit). */
export interface LiveStockVariant {
  value: string;
  color: string | null;
  availability: 'available' | 'unavailable' | 'unknown';
}

/** Ce qu'une page marchande nous a appris, mémorisé tel quel (preuve datée). */
export interface LiveStockEntry {
  availability: NonNullable<AyrovixCandidate['availability']>;
  sizes: string[];
  colors: string[];
  images: string[];
  /** Stock PAR variante, quand la source le publie. */
  variants: LiveStockVariant[];
  /** Horodatage de la lecture — un stock sans date n'est pas une preuve. */
  at: number;
}

/** Réponse d'une relecture fraîche (bouton « vérifier le stock »). */
export interface LiveStockResult {
  url: string;
  availability: NonNullable<AyrovixCandidate['availability']>;
  sizes: string[];
  colors: string[];
  images: string[];
  /** Contrat de variantes enregistré : c'est lui qui autorise une commande. */
  variants: LiveStockVariant[];
  /** Horodatage ISO de la lecture qui fonde ce résultat. */
  checkedAt: string;
  /** Pourquoi ce résultat, en une ligne lisible (journal + transparence client). */
  reason: string;
}

/** Ce que l'appelant peut journaliser : la dépense réelle, jamais cachée. */
export interface LiveStockReport {
  /** Fiches réellement visitées sur le réseau (les autres viennent du cache). */
  fetched: number;
  cacheHits: number;
  /** Résultats effectivement enrichis d'au moins un fait. */
  applied: number;
  budget: number;
  deadlineMs: number;
}

function enabled(): boolean {
  return process.env.AYROVI_LENS_LIVE_STOCK !== 'false';
}

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function cacheDir(): string {
  return process.env.AYROVI_LENS_LIVE_CACHE_DIR || path.resolve(process.cwd(), 'data', 'lens-live-stock');
}

function ttlMs(): number {
  return envInt('AYROVI_LENS_LIVE_TTL_MS', DEFAULT_TTL_MS, 60_000, 7 * 24 * 60 * 60 * 1000);
}

function matchThreshold(): number {
  const raw = Number(process.env.AYROVI_LENS_LIVE_MATCH_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : DEFAULT_MATCH_THRESHOLD;
}

/* ── Cache disque, par URL ───────────────────────────────────────────────── */

function cacheFile(url: string): string {
  const key = crypto.createHash('sha256').update(`live-stock|${url}`).digest('hex').slice(0, 32);
  return path.join(cacheDir(), `${key}.json`);
}

function readCache(url: string, now: number): LiveStockEntry | null {
  try {
    const entry = JSON.parse(fs.readFileSync(cacheFile(url), 'utf8')) as LiveStockEntry;
    if (!entry || typeof entry.at !== 'number') return null;
    return now - entry.at <= ttlMs() ? entry : null; // périmé = plus une preuve
  } catch {
    return null;
  }
}

function writeCache(url: string, entry: LiveStockEntry): void {
  try {
    const dir = cacheDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cacheFile(url), JSON.stringify(entry), 'utf8');
    pruneDiskCache(dir, { maxBytes: 64 * 1024 * 1024, maxFiles: 10_000 });
  } catch {
    /* un cache qui n'écrit pas reste un cache */
  }
}

/* ── Lecture de la page → entrée mémorisable ─────────────────────────────── */

function cleanList(values: Array<string | null | undefined>, limit: number): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const key = value.toLocaleLowerCase('fr');
    if (!value || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
    if (output.length >= limit) break;
  }
  return output;
}

/**
 * Traduit une page marchande en entrée. Aucune interprétation : on recopie ce
 * que le marchand publie. Les tailles viennent des détails de variantes, filtrés
 * par `allowsMerchantVariantChoice` — la MÊME politique que le parseur, appliquée
 * ici une seconde fois par défense en profondeur : une taille que le marchand
 * marque explicitement indisponible n'entre jamais dans la liste. Repli sur la
 * liste publiée par la page.
 */
export function entryFromPage(page: ParsedProductPage, now: number): LiveStockEntry {
  const details = (Array.isArray(page.variants?.details) ? page.variants!.details! : [])
    .filter((detail) => allowsMerchantVariantChoice(detail));
  const variants: LiveStockVariant[] = [];
  const seenVariant = new Set<string>();
  for (const detail of details) {
    const value = String(detail.size || detail.color || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    if (!value) continue;
    const color = detail.color ? String(detail.color).trim().slice(0, 40) : null;
    const key = `${value.toLocaleLowerCase('fr')}|${(color || '').toLocaleLowerCase('fr')}`;
    if (seenVariant.has(key)) continue;
    seenVariant.add(key);
    variants.push({
      value,
      color: detail.size ? color : null,
      // `stock` est le drapeau PUBLIÉ ; null (silence) reste unknown.
      availability: detail.stock === true ? 'available' : detail.stock === false ? 'unavailable' : 'unknown',
    });
  }
  // Une taille publiée SANS détail de variante entre quand même au contrat :
  // le marchand l'a proposée, et son silence de stock doit se lire « unknown »
  // (option non confirmée) plutôt que disparaître des choix publiés.
  for (const size of cleanList(page.variants?.sizes || [], MAX_SIZES)) {
    const key = size.toLocaleLowerCase('fr');
    if (variants.some((variant) => variant.value.toLocaleLowerCase('fr') === key)) continue;
    variants.push({ value: size, color: null, availability: 'unknown' });
  }
  return {
    availability: page.availability,
    sizes: cleanList([...details.map((detail) => detail.size), ...(page.variants?.sizes || [])], MAX_SIZES),
    colors: cleanList([...details.map((detail) => detail.color), ...(page.variants?.colors || [])], 20),
    images: cleanList(page.images, MAX_IMAGES),
    variants: variants.slice(0, 60),
    at: now,
  };
}

/**
 * Notre vocabulaire d'affichage (`in_stock`/`limited`/`out_of_stock`/`unknown`)
 * vers celui du contrat de commande (`available`/`unavailable`/`unknown`).
 * `limited` reste positif : le marchand annonce du stock, pas une rupture.
 */
export function toContractAvailability(availability: LiveStockEntry['availability']): 'available' | 'unavailable' | 'unknown' {
  if (availability === 'in_stock' || availability === 'limited') return 'available';
  if (availability === 'out_of_stock') return 'unavailable';
  return 'unknown';
}

/** Une page qui ne dit RIEN ne mérite ni une ligne de cache ni une promesse. */
function hasAnyFact(entry: LiveStockEntry): boolean {
  return entry.availability !== 'unknown'
    || entry.sizes.length > 0
    || entry.colors.length > 0
    || entry.images.length > 0
    || entry.variants.length > 0;
}

/* ── Pose des faits sur LE candidat qui les a demandés ───────────────────── */

/**
 * Rien n'est deviné : une page muette laisse les champs tels qu'ils étaient, et
 * un fait déjà présent (le catalogue interne, par exemple) n'est jamais écrasé
 * par une source externe.
 */
export function applyLiveStock(candidate: AyrovixCandidate, entry: LiveStockEntry): boolean {
  let applied = false;
  if (entry.availability && entry.availability !== 'unknown') {
    candidate.availability = entry.availability;
    applied = true;
  }
  if (entry.sizes.length && !candidate.sizes?.length) {
    candidate.sizes = entry.sizes;
    applied = true;
  }
  if (entry.colors.length && !candidate.colors?.length) {
    candidate.colors = entry.colors;
    applied = true;
  }
  if (entry.images.length) {
    const merged = [...new Set([candidate.image, ...(candidate.images || []), ...entry.images].filter(Boolean))];
    candidate.images = merged.slice(0, MAX_IMAGES);
    if (!candidate.image && merged.length) candidate.image = merged[0];
    applied = true;
  }
  return applied;
}

/* ── Appel réseau, isolé pour être remplaçable dans les tests ────────────── */

async function fetchUrl(
  url: string,
  title: string,
  fetcher: LiveStockFetcher,
  now: number,
): Promise<LiveStockEntry | null> {
  const page = await fetcher(url);
  // La preuve avant les faits : sans recouvrement fort, la page parle d'autre chose.
  if (!page || titleOverlap(title, page.title) < matchThreshold()) return null;
  const entry = entryFromPage(page, now);
  if (!hasAnyFact(entry)) return null;
  // Un échec n'est PAS mémorisé : la recherche suivante réessaiera. Une page
  // muette non plus — mieux vaut rejouer la sonde que servir un silence vieux.
  writeCache(url, entry);
  return entry;
}

/* ── Enrichissement d'un lot ─────────────────────────────────────────────── */

export async function enrichCandidatesLiveStock(
  candidates: AyrovixCandidate[],
  options: { fetcher?: LiveStockFetcher; now?: number } = {},
): Promise<{ candidates: AyrovixCandidate[]; report: LiveStockReport }> {
  const budget = envInt('AYROVI_LENS_LIVE_BUDGET', DEFAULT_BUDGET, 0, 10);
  const deadline = envInt('AYROVI_LENS_LIVE_DEADLINE_MS', DEFAULT_DEADLINE_MS, 500, 15_000);
  const concurrency = envInt('AYROVI_LENS_LIVE_CONCURRENCY', DEFAULT_CONCURRENCY, 1, 8);
  const report: LiveStockReport = { fetched: 0, cacheHits: 0, applied: 0, budget, deadlineMs: deadline };

  const fetcher = options.fetcher;
  if (!candidates.length || !enabled() || !fetcher || !budget) {
    return { candidates, report };
  }
  const now = options.now ?? Date.now();

  // Seules les fiches externes avec un lien méritent une visite : le catalogue
  // interne porte déjà son stock, et une fiche sans lien n'a rien à montrer.
  const targets = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.kind === 'external' && /^https?:\/\//i.test(String(candidate.sourceUrl || '')))
    .slice(0, budget);
  if (!targets.length) return { candidates, report };

  const output = candidates.map((candidate) => ({ ...candidate }));
  const queue = [...targets];
  /** Posé à l'échéance : aucun travail nouveau n'est lancé, on rend ce qu'on a. */
  let closed = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (closed) return;
      const next = queue.shift();
      if (!next) return;
      const url = String(next.candidate.sourceUrl);
      // Un hôte qui nous bloque est mis au repos : on ne paie pas une sonde
      // par recherche pour un mur qui ne bougera pas.
      if (!hostAllowsProbe(url)) continue;
      try {
        const cached = readCache(url, now);
        const entry = cached ?? await fetchUrl(url, next.candidate.title, fetcher, now);
        if (entry) recordProbeSuccess(url);
        if (cached) report.cacheHits += 1;
        else if (entry) report.fetched += 1;
        if (entry && applyLiveStock(output[next.index], entry)) report.applied += 1;
      } catch {
        recordProbeFailure(url);
        // Un échec n'est PAS mémorisé : la recherche suivante réessaiera.
      }
    }
  };

  await Promise.race([
    Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker)),
    new Promise<void>((resolve) => {
      setTimeout(() => { closed = true; resolve(); }, deadline);
    }),
  ]);

  // On rend une COPIE : un fetch parti juste avant l'échéance pourrait encore
  // écrire dans `output` après le retour, et la réponse ne doit plus bouger.
  return { candidates: output.map((candidate) => ({ ...candidate })), report };
}


/* ── Relecture fraîche : le bouton « vérifier le stock » ─────────────────── */

const MAX_REFRESH_URLS = 8;

/** Ligne d'explication tenant en une phrase — journalisable, montrable telle quelle. */
export function liveStockReason(entry: LiveStockEntry, page: ParsedProductPage): string {
  const source = page.priceSource === 'none' ? 'page marchande' : `page marchande (${page.priceSource})`;
  if (entry.availability === 'out_of_stock') return `${source} : rupture annoncée par le marchand.`;
  if (entry.availability === 'limited') return `${source} : stock limité annoncé.`;
  if (entry.availability === 'in_stock') return `${source} : disponibilité annoncée.`;
  const stocked = entry.variants.filter((variant) => variant.availability !== 'unknown').length;
  if (stocked) return `${source} : disponibilité par taille publiée pour ${stocked} taille(s).`;
  if (entry.sizes.length) return `${source} : tailles publiées, stock non annoncé.`;
  return `${source} : aucune disponibilité publiée.`;
}

/**
 * Relit les pages À LA DEMANDE, sans jamais servir le cache : c'est la preuve
 * fraîche qu'une commande attend. Chaque lecture alimente aussi le contrat de
 * variantes (`inspectVariantOrder`) — sans ce contrat, le gardien de commande
 * refuse une fiche dont la disponibilité n'a pas été confirmée à la source.
 *
 * Même garde-fou de preuve que la grille : une page qui parle d'un autre produit
 * ne fonde RIEN, et une page muette laisse `unknown` plutôt qu'une promesse.
 */
export async function refreshLiveStock(
  urls: string[],
  options: { fetcher?: LiveStockFetcher; now?: number } = {},
): Promise<{ results: LiveStockResult[] }> {
  const empty = (url: string): LiveStockResult => ({
    url, availability: 'unknown', sizes: [], colors: [], images: [], variants: [],
    checkedAt: new Date().toISOString(), reason: 'Page illisible ou sans lien exploitable.',
  });
  const fetcher = options.fetcher;
  const targets = (Array.isArray(urls) ? urls : [])
    .filter((url): url is string => typeof url === 'string' && /^https?:\/\//i.test(url))
    .slice(0, MAX_REFRESH_URLS);
  if (!fetcher || !targets.length || !enabled()) return { results: targets.map(empty) };

  const now = options.now ?? Date.now();
  const results = await Promise.all(targets.map(async (url): Promise<LiveStockResult> => {
    if (!hostAllowsProbe(url)) {
      return { ...empty(url), checkedAt: new Date(now).toISOString(), reason: 'Marchand momentanément indisponible ; réessayez plus tard.' };
    }
    try {
      const page = await fetcher(url);
      if (!page) {
        recordProbeFailure(url);
        return { ...empty(url), checkedAt: new Date(now).toISOString() };
      }
      const entry = entryFromPage(page, now);
      // La preuve avant les faits : sans recouvrement fort, la page parle d'autre chose.
      if (!hasAnyFact(entry)) {
        recordProbeFailure(url);
        return { ...empty(url), checkedAt: new Date(now).toISOString() };
      }
      recordProbeSuccess(url);
      writeCache(url, entry);
      // Le contrat de commande : c'est lui qui autorisera « ajouter au panier ».
      recordVariantContract(url, {
        attribute: entry.variants.length ? 'taille' : 'option',
        productAvailability: toContractAvailability(entry.availability),
        source: null,
        variants: entry.variants.map((variant) => ({
          value: variant.value,
          color: variant.color,
          availability: variant.availability,
          reason: variant.availability === 'available'
            ? 'Disponibilité positive publiée par la source.'
            : variant.availability === 'unavailable'
              ? 'Indisponibilité publiée par la source.'
              : 'Aucune disponibilité par variante publiée par la source.',
        })),
      }, now);
      return {
        url,
        availability: entry.availability,
        sizes: entry.sizes,
        colors: entry.colors,
        images: entry.images,
        variants: entry.variants,
        checkedAt: new Date(now).toISOString(),
        reason: liveStockReason(entry, page),
      };
    } catch {
      recordProbeFailure(url);
      // Un échec n'est PAS mémorisé : la tentative suivante rejouera la sonde.
      return { ...empty(url), checkedAt: new Date(now).toISOString() };
    }
  }));

  return { results };
}
