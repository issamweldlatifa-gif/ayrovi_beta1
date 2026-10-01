/**
 * MOTEUR « LIENS D'ABORD » — du lien SerpApi à la fiche prête à acheter.
 *
 *   lien ──► page marchande ──► faits (prix, photos, stock, options)
 *        ──► preuve (c'est bien CE produit ?) ──► moteur de prix AYROVI
 *        ──► contrat de commande ──► fiche (carte puis grande carte)
 *
 * Garde-fous, les mêmes qui rendent une dépense acceptable ailleurs dans le projet :
 *   • BUDGET     — seuls les premiers liens sont visités ;
 *   • ÉCHÉANCE   — à l'expiration on rend ce qui est prêt : jamais d'attente sans fin ;
 *   • CACHE      — un prix lu il y a quelques minutes n'est pas relu ; mais un
 *                  prix a une durée de vie courte (1 h par défaut), bien plus
 *                  courte qu'une galerie ;
 *   • PREUVE     — la page lue doit parler du produit annoncé par le lien
 *                  (recouvrement de titres). Sinon, aucun fait n'est posé ;
 *   • SILENCE    — une page sans prix, ou un prix que le moteur AYROVI ne sait
 *                  pas convertir, ne fait PAS de carte. Pas de prix inventé,
 *                  pas de « prix SerpApi » de secours : ce serait réintroduire
 *                  l'ancien système par la fenêtre ;
 *   • COUPE-CIRCUIT — un marchand qui nous bloque est mis au repos.
 *
 * `AYROVI_LENS_SOURCE=legacy` rend l'ancien système (voir `legacy/`).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { QatafoDatabase } from '../../db/database';
import { pruneDiskCache } from '../../services/diskCache';
import { hostAllowsProbe, recordProbeFailure, recordProbeSuccess } from '../../scraper/hostCircuit';
import type { ParsedProductPage } from '../../scraper/productPageParser';
import type { AyrovixCandidate } from '../types';
import { recordVariantContract } from '../services/variantAvailability';
import { factsFromPage, toContractAvailability, type ProductFacts } from './pageFacts';
import { linkId, type LensLink } from './linkSource';
import { priceOffer, priceVariants } from './pricingEngine';
import { titleOverlap } from './titleMatch';

/** Lecture d'une page marchande — injectée par l'appelant (tests : fictive). */
export type PageFetcher = (url: string) => Promise<ParsedProductPage | null>;

export interface LinkEngineReport {
  links: number;
  visited: number;
  fetched: number;
  cacheHits: number;
  /** Fiches complètes produites. */
  verified: number;
  /** Liens écartés, avec la raison — jamais silencieux. */
  rejected: { hostResting: number; unreadable: number; noPrice: number; wrongProduct: number; noQuote: number };
  budget: number;
  deadlineMs: number;
  deadlineHit: boolean;
}

const DEFAULT_BUDGET = 8;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_DEADLINE_MS = 8_000;
const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MATCH_THRESHOLD = 0.5;
/** Une option épuisée pèse moins dans le classement, sans disparaître. */
const OUT_OF_STOCK_PENALTY = 20;

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(max, Math.max(min, Math.round(raw)));
}

function matchThreshold(): number {
  const raw = Number(process.env.AYROVI_LINKS_MATCH_THRESHOLD);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : DEFAULT_MATCH_THRESHOLD;
}

/* ── Cache disque des faits, par lien ────────────────────────────────────── */

function cacheDir(): string {
  return process.env.AYROVI_LINKS_CACHE_DIR || path.resolve(process.cwd(), 'data', 'lens-link-facts');
}

function cacheFile(url: string): string {
  return path.join(cacheDir(), `${crypto.createHash('sha256').update(`link-facts|${url}`).digest('hex').slice(0, 32)}.json`);
}

function cacheEnabled(): boolean {
  // Même règle que le cache de reconnaissance : un test décrit le système, pas
  // l'historique de la machine — sous test, le cache n'existe que s'il est isolé.
  if (process.env.AYROVI_LINKS_CACHE === 'false') return false;
  if (process.env.VITEST || process.env.NODE_ENV === 'test') return Boolean(process.env.AYROVI_LINKS_CACHE_DIR);
  return true;
}

function readFacts(url: string, now: number): ProductFacts | null {
  if (!cacheEnabled()) return null;
  try {
    const facts = JSON.parse(fs.readFileSync(cacheFile(url), 'utf8')) as ProductFacts;
    if (!facts || typeof facts.at !== 'number' || !(facts.price > 0)) return null;
    const ttl = envInt('AYROVI_LINKS_TTL_MS', DEFAULT_TTL_MS, 60_000, 24 * 60 * 60 * 1000);
    return now - facts.at <= ttl ? facts : null; // périmé = plus une preuve
  } catch {
    return null;
  }
}

function writeFacts(url: string, facts: ProductFacts): void {
  if (!cacheEnabled()) return;
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(cacheFile(url), JSON.stringify(facts), 'utf8');
    pruneDiskCache(cacheDir(), { maxBytes: 64 * 1024 * 1024, maxFiles: 10_000 });
  } catch {
    /* un cache qui n'écrit pas reste un cache */
  }
}

/* ── Contrat de commande : c'est lui qui autorisera « ajouter au panier » ─── */

export function recordFactsContract(facts: ProductFacts): void {
  recordVariantContract(facts.url, {
    attribute: facts.optionLabel || 'option',
    productAvailability: toContractAvailability(facts.availability),
    source: facts.merchant || null,
    variants: facts.variants.map((variant) => ({
      value: variant.value,
      color: variant.color,
      availability: variant.availability,
      reason: variant.availability === 'available' ? 'Disponibilité positive publiée par la source.'
        : variant.availability === 'unavailable' ? 'Indisponibilité publiée par la source.'
          : 'Aucune disponibilité par variante publiée par la source.',
    })),
  }, facts.at);
}

/* ── Faits → carte ───────────────────────────────────────────────────────── */

export function candidateFromFacts(
  db: QatafoDatabase,
  facts: ProductFacts,
  link: LensLink,
  index: number,
): AyrovixCandidate | null {
  const offer = priceOffer(db, facts.price, facts.currency);
  if (!offer) return null;
  const rank = Math.max(72, 94 - index * 3);
  return {
    id: linkId(link.url, index),
    kind: 'external',
    title: facts.title,
    brand: facts.brand,
    model: null,
    description: facts.description,
    colors: facts.colors,
    sizes: facts.sizes,
    source: link.merchant || facts.merchant,
    sourceUrl: link.url,
    image: facts.images[0] || '',
    images: facts.images,
    colorImages: Object.keys(facts.colorImages).length ? facts.colorImages : null,
    price: facts.price,
    currency: facts.currency,
    priceTnd: offer.priceTnd,
    promo: offer.promo,
    availability: facts.availability,
    optionLabel: facts.optionLabel,
    variantOptions: priceVariants(db, facts),
    checkedAt: new Date(facts.at).toISOString(),
    dataSource: 'merchant-page',
    match: facts.availability === 'out_of_stock' ? Math.max(1, rank - OUT_OF_STOCK_PENALTY) : rank,
  };
}

/* ── Résolution d'un lot de liens ────────────────────────────────────────── */

export async function resolveLinks(
  links: LensLink[],
  options: { db: QatafoDatabase; fetcher: PageFetcher; now?: number },
): Promise<{ candidates: AyrovixCandidate[]; report: LinkEngineReport }> {
  const budget = envInt('AYROVI_LINKS_BUDGET', DEFAULT_BUDGET, 0, 20);
  const deadlineMs = envInt('AYROVI_LINKS_DEADLINE_MS', DEFAULT_DEADLINE_MS, 500, 20_000);
  const concurrency = envInt('AYROVI_LINKS_CONCURRENCY', DEFAULT_CONCURRENCY, 1, 8);
  const report: LinkEngineReport = {
    links: links.length, visited: 0, fetched: 0, cacheHits: 0, verified: 0,
    rejected: { hostResting: 0, unreadable: 0, noPrice: 0, wrongProduct: 0, noQuote: 0 },
    budget, deadlineMs, deadlineHit: false,
  };
  if (!links.length || !budget) return { candidates: [], report };

  const now = options.now ?? Date.now();
  const queue = links.slice(0, budget).map((link, index) => ({ link, index }));
  const resolved = new Map<number, AyrovixCandidate>();
  /** Posé à l'échéance : aucun travail nouveau n'est lancé, on rend ce qu'on a. */
  let closed = false;

  const worker = async (): Promise<void> => {
    for (;;) {
      if (closed) return;
      const next = queue.shift();
      if (!next) return;
      const { link, index } = next;
      report.visited += 1;
      let facts = readFacts(link.url, now);
      if (facts) {
        report.cacheHits += 1;
      } else {
        // Un marchand qui nous bloque est mis au repos : on ne paie pas une sonde
        // par recherche pour un mur qui ne bougera pas.
        if (!hostAllowsProbe(link.url)) { report.rejected.hostResting += 1; continue; }
        let page: ParsedProductPage | null = null;
        try {
          page = await options.fetcher(link.url);
        } catch {
          page = null;
        }
        if (!page) { recordProbeFailure(link.url); report.rejected.unreadable += 1; continue; }
        recordProbeSuccess(link.url);
        report.fetched += 1;
        // La preuve avant les faits : sans recouvrement fort, la page parle d'autre chose.
        if (page.title && titleOverlap(link.titleHint, page.title) < matchThreshold()) {
          report.rejected.wrongProduct += 1;
          continue;
        }
        facts = factsFromPage(link, page, now);
        if (!facts) { report.rejected.noPrice += 1; continue; }
        writeFacts(link.url, facts);
      }
      if (closed) return;
      const candidate = candidateFromFacts(options.db, facts, link, index);
      if (!candidate) { report.rejected.noQuote += 1; continue; }
      recordFactsContract(facts);
      resolved.set(index, candidate);
    }
  };

  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker)),
    new Promise<void>((resolve) => {
      timer = setTimeout(() => { closed = true; report.deadlineHit = true; resolve(); }, deadlineMs);
    }),
  ]);
  if (timer) clearTimeout(timer);
  closed = true;

  // Dans l'ordre de Google Lens (le plus ressemblant d'abord) ; le tri par
  // confiance et disponibilité se fait ensuite, avec la politique commune.
  const candidates = [...resolved.entries()].sort((a, b) => a[0] - b[0]).map(([, candidate]) => ({ ...candidate }));
  report.verified = candidates.length;
  return { candidates, report };
}
