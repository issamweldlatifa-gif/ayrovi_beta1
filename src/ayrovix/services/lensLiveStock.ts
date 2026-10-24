/**
 * RELECTURE MARCHANDE À LA DEMANDE — pas d'enrichissement de la grille Lens.
 *
 * La recherche Lens s'arrête aux cartes de liens PRODUCT validées. Ce module ne
 * sert plus que les appels explicites `/live-stock` : il lit la page demandée,
 * reporte ses faits sans en inventer et enregistre le contrat de variantes
 * utilisé par le gardien de commande. L'ancien scraping groupé, son cache et
 * ses filtres d'achetabilité ont été supprimés avec leurs consommateurs.
 */
import { allowsMerchantVariantChoice } from '../../../shared/variantPolicy';
import type { AyrovixCandidate } from '../types';
import { recordVariantContract } from './variantAvailability';
import type { ParsedProductPage } from '../../scraper/productPageParser';
import { hostAllowsProbe, recordProbeFailure, recordProbeSuccess } from '../../scraper/hostCircuit';

const MAX_IMAGES = 12;
const MAX_SIZES = 40;
const MAX_REFRESH_URLS = 8;

/** Lecture d'une page marchand — injectée par l'appelant (tests : fictive). */
export type LiveStockFetcher = (url: string) => Promise<ParsedProductPage | null>;

/** État d'une variante, tel que la source le publie (jamais déduit). */
export interface LiveStockVariant {
  value: string;
  color: string | null;
  availability: 'available' | 'unavailable' | 'unknown';
}

/** Recalcul « tout inclus » d'un prix marchand — injecté par l'appelant (il a la base). */
export type LiveStockRepricer = (price: number, currency: string) => {
  priceTnd: number;
  promo?: AyrovixCandidate['promo'];
} | null;

/** Faits lus sur UNE page explicitement demandée. */
export interface LiveStockEntry {
  availability: NonNullable<AyrovixCandidate['availability']>;
  price?: number;
  currency?: string;
  originalPrice?: number | null;
  sizes: string[];
  colors: string[];
  images: string[];
  variants: LiveStockVariant[];
  at: number;
}

/** Réponse d'une relecture fraîche (bouton « vérifier le stock »). */
export interface LiveStockResult {
  url: string;
  availability: NonNullable<AyrovixCandidate['availability']>;
  price: number | null;
  currency: string | null;
  originalPrice: number | null;
  priceTnd: number | null;
  originalPriceTnd: number | null;
  sizes: string[];
  colors: string[];
  images: string[];
  variants: LiveStockVariant[];
  checkedAt: string;
  reason: string;
}

function enabled(): boolean {
  return process.env.AYROVI_LENS_LIVE_STOCK !== 'false';
}

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
 * Traduit une page marchande sans interprétation. Les options indisponibles
 * sont filtrées par la politique commune ; une option sans état publié reste
 * UNKNOWN, et un prix barré n'existe que s'il dépasse le prix courant.
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
      availability: detail.stock === true ? 'available' : detail.stock === false ? 'unavailable' : 'unknown',
    });
  }
  for (const size of cleanList(page.variants?.sizes || [], MAX_SIZES)) {
    const key = size.toLocaleLowerCase('fr');
    if (variants.some((variant) => variant.value.toLocaleLowerCase('fr') === key)) continue;
    variants.push({ value: size, color: null, availability: 'unknown' });
  }
  const price = Number(page.price);
  const currency = String(page.currency || '').trim().toUpperCase();
  const priceOk = Number.isFinite(price) && price > 0 && /^[A-Z]{3}$/.test(currency);
  const original = Number(page.originalPrice);
  return {
    availability: page.availability,
    price: priceOk ? price : 0,
    currency: priceOk ? currency : undefined,
    originalPrice: priceOk && Number.isFinite(original) && original > price ? original : null,
    sizes: cleanList([...details.map((detail) => detail.size), ...(page.variants?.sizes || [])], MAX_SIZES),
    colors: cleanList([...details.map((detail) => detail.color), ...(page.variants?.colors || [])], 20),
    images: cleanList(page.images, MAX_IMAGES),
    variants: variants.slice(0, 60),
    at: now,
  };
}

export function toContractAvailability(availability: LiveStockEntry['availability']): 'available' | 'unavailable' | 'unknown' {
  if (availability === 'in_stock' || availability === 'limited') return 'available';
  if (availability === 'out_of_stock') return 'unavailable';
  return 'unknown';
}

/** Une page qui ne dit RIEN ne fonde ni une réponse ni un contrat de variante. */
function hasAnyFact(entry: LiveStockEntry): boolean {
  return entry.availability !== 'unknown'
    || (entry.price ?? 0) > 0
    || entry.sizes.length > 0
    || entry.colors.length > 0
    || entry.images.length > 0
    || entry.variants.length > 0;
}

function signVariantContract(url: string, entry: LiveStockEntry, now: number): void {
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
}

/** Ligne d'explication tenant en une phrase — journalisable et affichable. */
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
 * Relit uniquement les URLs demandées, sans servir un ancien cache de grille.
 * Une page muette ou illisible rend UNKNOWN ; elle ne fabrique ni prix, ni
 * stock, ni variante. Le contrat signé reste celui du gardien de commande.
 */
export async function refreshLiveStock(
  urls: string[],
  options: { fetcher?: LiveStockFetcher; now?: number; reprice?: LiveStockRepricer } = {},
): Promise<{ results: LiveStockResult[] }> {
  const empty = (url: string): LiveStockResult => ({
    url, availability: 'unknown', price: null, currency: null, originalPrice: null, priceTnd: null, originalPriceTnd: null,
    sizes: [], colors: [], images: [], variants: [],
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
      if (!hasAnyFact(entry)) {
        recordProbeFailure(url);
        return { ...empty(url), checkedAt: new Date(now).toISOString() };
      }
      recordProbeSuccess(url);
      signVariantContract(url, entry, now);
      const freshPrice = (entry.price ?? 0) > 0 && entry.currency ? entry.price! : null;
      const repriced = freshPrice && options.reprice ? options.reprice(freshPrice, entry.currency!) : null;
      const repricedOriginal = freshPrice && entry.originalPrice && options.reprice ? options.reprice(entry.originalPrice, entry.currency!) : null;
      return {
        url,
        availability: entry.availability,
        price: freshPrice,
        currency: freshPrice ? entry.currency! : null,
        originalPrice: freshPrice ? entry.originalPrice ?? null : null,
        priceTnd: repriced ? repriced.promo?.priceTnd ?? repriced.priceTnd : null,
        originalPriceTnd: repricedOriginal ? repricedOriginal.priceTnd : null,
        sizes: entry.sizes,
        colors: entry.colors,
        images: entry.images,
        variants: entry.variants,
        checkedAt: new Date(now).toISOString(),
        reason: liveStockReason(entry, page),
      };
    } catch {
      recordProbeFailure(url);
      return { ...empty(url), checkedAt: new Date(now).toISOString() };
    }
  }));

  return { results };
}
