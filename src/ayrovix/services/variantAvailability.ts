/*
 * RÉSOLUTION RÉELLE DE LA DISPONIBILITÉ PAR VARIANTE (décision client 25/09/2026).
 *
 * Constat du prototype 2 : la forme la plus fréquente chez SerpApi,
 * `product_results.sizes`, ne contient AUCUN champ de stock — chaque pointure
 * ressortait donc « unknown », et la règle « on ne suppose jamais la disponibilité »
 * rendait le produit non commandable. Le client a tranché : OPTION 1 —
 * chaque variante porte son propre `product_id` / `serpapi_link`, on va DEMANDER
 * son stock à la source, puis on met le résultat en cache.
 *
 * Garde-fous, parce qu'un appel par variante coûte :
 *   • cache disque par variante avec TTL (un appel par variante et par période) ;
 *   • budget maximal d'appels par produit (au-delà : la variante reste « unknown ») ;
 *   • concurrence limitée, délai d'attente court ;
 *   • aucune clé API / erreur / temps dépassé ⇒ « unknown », JAMAIS « available ».
 *
 * Ce module porte aussi le CONTRAT DE COMMANDE : ce que le serveur a réellement
 * établi pour un produit, relu au moment d'ajouter au panier (une réponse HTTP
 * n'est jamais une preuve — le client pourrait la falsifier).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { buildProductCard, type Availability, type ProductCard } from './productVariants';

export interface ResolvableVariant {
  value: string;
  /** Identifiant propre à la variante chez la source (c'est lui qui rend l'appel possible). */
  productId?: string;
  serpapiLink?: string;
  /** État déjà connu par la première réponse (évite un appel inutile). */
  known: Availability;
  knownReason: string;
}

export interface ResolvedVariant {
  value: string;
  availability: Availability;
  reason: string;
  /** « source » = 1ʳᵉ réponse · « lookup » = appel dédié · « cache » · « budget » · « error ». */
  origin: 'source' | 'lookup' | 'cache' | 'budget' | 'error' | 'disabled';
}

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;      // 6 h : un stock plus vieux n'est plus une preuve
const DEFAULT_MAX_LOOKUPS = 8;                   // budget par produit
const DEFAULT_CONCURRENCY = 3;
const LOOKUP_TIMEOUT_MS = 6000;

function cacheDir(): string {
  return process.env.AYROVI_VARIANT_CACHE_DIR || path.resolve(process.cwd(), 'data', 'variant-availability');
}

function ttlMs(): number {
  const raw = Number(process.env.AYROVI_VARIANT_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_MS;
}

function maxLookups(): number {
  const raw = Number(process.env.AYROVI_VARIANT_MAX_LOOKUPS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_MAX_LOOKUPS;
}

function serpApiKey(): string {
  return (process.env.SERPAPI_KEY || process.env.SERPAPI_API_KEY || '').trim();
}

function cacheKey(productId: string): string {
  return crypto.createHash('sha256').update(`variant|${productId}`).digest('hex').slice(0, 32);
}

interface CacheEntry { availability: Availability; reason: string; at: number }

function readCache(productId: string): CacheEntry | null {
  try {
    const file = path.join(cacheDir(), `${cacheKey(productId)}.json`);
    const entry = JSON.parse(fs.readFileSync(file, 'utf8')) as CacheEntry;
    if (!entry || typeof entry.at !== 'number') return null;
    if (Date.now() - entry.at > ttlMs()) return null;        // périmé = plus une preuve
    return entry;
  } catch {
    return null;
  }
}

function writeCache(productId: string, entry: CacheEntry): void {
  try {
    const dir = cacheDir();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${cacheKey(productId)}.json`), JSON.stringify(entry));
  } catch { /* cache best-effort — jamais bloquant */ }
}

/* ── Lecture PURE d'une réponse « google_product » ─────────────────────────── */

/**
 * Traduit la réponse dédiée d'une variante en état de stock.
 * Volontairement conservateur :
 *   • au moins une offre marchande avec prix ⇒ disponible (preuve positive) ;
 *   • fiche valide mais AUCUNE offre ⇒ indisponible (preuve négative de Google) ;
 *   • texte explicite d'indisponibilité ⇒ indisponible ;
 *   • réponse inexploitable ⇒ unknown.
 */
export function readLookupPayload(payload: unknown): { availability: Availability; reason: string } {
  const root = (payload && typeof payload === 'object' ? payload : {}) as Record<string, any>;
  if (root.error) return { availability: 'unknown', reason: `la source a répondu une erreur (${String(root.error).slice(0, 60)})` };
  const product = (root.product_results && typeof root.product_results === 'object' ? root.product_results : null) as Record<string, any> | null;
  if (!product) return { availability: 'unknown', reason: 'réponse sans fiche produit exploitable' };

  const sellers = Array.isArray(root.sellers_results?.online_sellers) ? root.sellers_results.online_sellers : [];
  const texts: string[] = [];
  for (const seller of sellers) {
    for (const key of ['badge', 'tag', 'condition']) if (typeof seller?.[key] === 'string') texts.push(seller[key]);
    for (const detail of Array.isArray(seller?.details_and_offers) ? seller.details_and_offers : []) {
      if (typeof detail?.text === 'string') texts.push(detail.text);
    }
  }
  if (texts.some((text) => /out\s*of\s*stock|sold\s*out|rupture|[ée]puis[ée]|غير\s*متوفر/i.test(text))) {
    return { availability: 'unavailable', reason: 'appel dédié : le marchand annonce une rupture' };
  }
  const priced = sellers.filter((seller: any) => typeof seller?.base_price === 'string' || typeof seller?.total_price === 'string');
  if (priced.length) {
    return { availability: 'available', reason: `appel dédié : ${priced.length} offre(s) marchande(s) avec prix` };
  }
  return { availability: 'unavailable', reason: 'appel dédié : fiche valide mais aucune offre marchande pour cette variante' };
}

/* ── Appel réseau (isolé pour être remplaçable dans les tests) ─────────────── */

export type Fetcher = (productId: string, serpapiLink?: string) => Promise<unknown>;

async function defaultFetcher(productId: string, serpapiLink?: string): Promise<unknown> {
  const key = serpApiKey();
  if (!key) throw new Error('NO_API_KEY');
  let url: string;
  if (serpapiLink && /^https:\/\/serpapi\.com\//i.test(serpapiLink)) {
    const parsed = new URL(serpapiLink);
    parsed.searchParams.set('api_key', key);
    url = parsed.toString();
  } else {
    const params = new URLSearchParams({ engine: 'google_product', product_id: productId, api_key: key });
    url = `https://serpapi.com/search.json?${params.toString()}`;
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  return response.json();
}

/* ── Résolution complète d'un lot de variantes ─────────────────────────────── */

export async function resolveVariants(variants: ResolvableVariant[], fetcher: Fetcher = defaultFetcher): Promise<ResolvedVariant[]> {
  const resolved: ResolvedVariant[] = variants.map((variant) => ({
    value: variant.value,
    availability: variant.known,
    reason: variant.knownReason,
    origin: 'source',
  }));

  // Seules les variantes RÉELLEMENT inconnues ET identifiables justifient un appel.
  const pending = variants
    .map((variant, index) => ({ variant, index }))
    .filter(({ variant }) => variant.known === 'unknown' && Boolean(variant.productId || variant.serpapiLink));

  if (!pending.length) return resolved;

  const enabled = process.env.AYROVI_VARIANT_LOOKUP !== 'false' && Boolean(serpApiKey() || fetcher !== defaultFetcher);
  if (!enabled) {
    for (const { index } of pending) {
      resolved[index] = { ...resolved[index], origin: 'disabled', reason: 'résolution désactivée (pas de clé) — stock non confirmé' };
    }
    return resolved;
  }

  // (a) cache d'abord — un appel par variante et par période, pas plus.
  const toCall: typeof pending = [];
  for (const item of pending) {
    const id = item.variant.productId || item.variant.serpapiLink!;
    const cached = readCache(id);
    if (cached) {
      resolved[item.index] = { value: item.variant.value, availability: cached.availability, reason: cached.reason, origin: 'cache' };
      continue;
    }
    toCall.push(item);
  }

  // (b) budget : au-delà, la variante RESTE unknown — jamais supposée disponible.
  const budget = maxLookups();
  const allowed = toCall.slice(0, budget);
  for (const item of toCall.slice(budget)) {
    resolved[item.index] = {
      value: item.variant.value, availability: 'unknown', origin: 'budget',
      reason: `budget d'appels atteint (${budget}) — stock non confirmé, jamais supposé disponible`,
    };
  }

  // (c) appels dédiés, concurrence bornée.
  let cursor = 0;
  const workers = Array.from({ length: Math.min(DEFAULT_CONCURRENCY, allowed.length) }, async () => {
    while (cursor < allowed.length) {
      const item = allowed[cursor++];
      const id = item.variant.productId || item.variant.serpapiLink!;
      try {
        const payload = await fetcher(item.variant.productId || '', item.variant.serpapiLink);
        const verdict = readLookupPayload(payload);
        resolved[item.index] = { value: item.variant.value, availability: verdict.availability, reason: verdict.reason, origin: 'lookup' };
        if (verdict.availability !== 'unknown') writeCache(id, { ...verdict, at: Date.now() });
      } catch (error: any) {
        resolved[item.index] = {
          value: item.variant.value, availability: 'unknown', origin: 'error',
          reason: `appel dédié indisponible (${error?.message || 'erreur'}) — stock non confirmé`,
        };
      }
    }
  });
  await Promise.all(workers);
  return resolved;
}

/* ══════════════════════════════════════════════════════════════════════════
 * CONTRAT DE COMMANDE — la vérité du serveur, relue au moment du panier.
 * ════════════════════════════════════════════════════════════════════════ */

export interface VariantContract {
  /** Libellé de l'attribut requis (Pointure, Taille, Volume, Stockage…). */
  attribute: string;
  /** État global du produit issu de la même fiche marchande. */
  productAvailability: Availability;
  /** Variantes source-backed; an optional color keeps combinations distinct. */
  variants: Array<{ value: string; color?: string | null; availability: Availability; reason: string }>;
  source?: string | null;
  at: number;
}

/** URL key shared by product extraction, cart reads, add-to-cart and checkout. */
export function variantContractKey(raw: string): string {
  try {
    const url = new URL(raw);
    return `${url.hostname.toLowerCase().replace(/^www\./, '')}${url.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

function contractFile(productKey: string): string {
  return path.join(cacheDir(), `contract-${crypto.createHash('sha256').update(productKey).digest('hex').slice(0, 32)}.json`);
}

/** Enregistre ce que le serveur a RÉELLEMENT établi lors de la préparation de la fiche. */
export function recordVariantContract(productKey: string, contract: Omit<VariantContract, 'at'>, checkedAt?: string | number | null): void {
  try {
    const parsedAt = typeof checkedAt === 'number' ? checkedAt : typeof checkedAt === 'string' ? Date.parse(checkedAt) : NaN;
    const at = Number.isFinite(parsedAt) && parsedAt > 0 ? parsedAt : Date.now();
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(contractFile(variantContractKey(productKey)), JSON.stringify({ ...contract, at } satisfies VariantContract));
  } catch { /* best-effort */ }
}

export function readVariantContract(productKey: string): VariantContract | null {
  try {
    const contract = JSON.parse(fs.readFileSync(contractFile(variantContractKey(productKey)), 'utf8')) as VariantContract;
    if (!contract || !Array.isArray(contract.variants) || !['available', 'unavailable', 'unknown'].includes(contract.productAvailability)) return null;
    if (Date.now() - contract.at > ttlMs()) return null;
    return contract;
  } catch {
    return null;
  }
}

function expiredContractMeta(productKey: string): { checkedAt: string | null; source: string | null } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(contractFile(variantContractKey(productKey)), 'utf8')) as Partial<VariantContract>;
    if (typeof raw.at !== 'number' || Date.now() - raw.at <= ttlMs()) return null;
    return {
      // A legacy profile without a source timestamp must not acquire a fabricated
      // "checked at" date merely because its contract was written now.
      checkedAt: raw.at > Date.UTC(2000, 0, 1) ? new Date(raw.at).toISOString() : null,
      source: typeof raw.source === 'string' ? raw.source : null,
    };
  } catch {
    return null;
  }
}

export type OrderGuardCode = 'ALLOWED' | 'NO_CONTRACT' | 'VARIANT_UNAVAILABLE' | 'VARIANT_AVAILABILITY_UNKNOWN' | 'VARIANT_NOT_FOUND';

export interface OrderGuardVerdict {
  allowed: boolean;
  code: OrderGuardCode;
  message: string;
  availability: Availability;
  checkedAt: string | null;
  source: string | null;
}

const normalize = (value: string): string => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/** One conservative decision shared by product add, cart status and final checkout. */
export function inspectVariantOrder(productKey: string, requestedValue?: string | null, requestedColor?: string | null): OrderGuardVerdict {
  const contract = readVariantContract(productKey);
  const expired = contract ? null : expiredContractMeta(productKey);
  const checkedAt = contract ? new Date(contract.at).toISOString() : expired?.checkedAt || null;
  const source = contract?.source || expired?.source || null;
  const result = (allowed: boolean, code: OrderGuardCode, message: string, availability: Availability): OrderGuardVerdict => ({
    allowed, code, message, availability, checkedAt, source,
  });
  if (!contract) return expired
    ? result(false, 'VARIANT_AVAILABILITY_UNKNOWN', 'La vérification de disponibilité a expiré ; il faut relire la source.', 'unknown')
    : result(false, 'NO_CONTRACT', 'La disponibilité n’a pas été confirmée à la source.', 'unknown');
  if (contract.productAvailability === 'unavailable') {
    return result(false, 'VARIANT_UNAVAILABLE', 'Le produit est signalé indisponible par le marchand.', 'unavailable');
  }

  const wanted = normalize(String(requestedValue || ''));
  const color = normalize(String(requestedColor || ''));
  if (contract.variants.length && !wanted && !color) {
    return result(false, 'VARIANT_NOT_FOUND', `Choisissez une option publiée par le marchand (${contract.attribute}).`, 'unknown');
  }
  if (wanted || color) {
    let matches = contract.variants.filter((variant) =>
      (!wanted || normalize(variant.value) === wanted)
      && (!color || (variant.color && normalize(variant.color) === color)),
    );
    if (!matches.length) return result(false, 'VARIANT_NOT_FOUND', 'Cette option ne fait pas partie des choix publiés par le marchand.', 'unknown');
    const states = new Set(matches.map((variant) => variant.availability));
    const state: Availability = states.size === 1 ? matches[0].availability : 'unknown';
    if (state === 'unavailable') return result(false, 'VARIANT_UNAVAILABLE', 'Cette option est signalée indisponible par le marchand.', state);
    if (state === 'unknown') return result(false, 'VARIANT_AVAILABILITY_UNKNOWN', 'Le stock de cette option n’est pas confirmé par le marchand.', state);
    if (contract.productAvailability === 'unknown') {
      // A positive variant is stronger than a silent product-level field.
      return result(true, 'ALLOWED', 'Variante confirmée disponible par la source.', 'available');
    }
    return result(true, 'ALLOWED', 'Variante confirmée disponible par la source.', 'available');
  }

  if (contract.productAvailability === 'available') {
    return result(true, 'ALLOWED', 'Produit signalé disponible par le marchand.', 'available');
  }
  return result(false, 'VARIANT_AVAILABILITY_UNKNOWN', 'La disponibilité n’est pas confirmée par le marchand.', 'unknown');
}

export function guardVariantOrder(productKey: string, requestedValue?: string | null, requestedColor?: string | null): OrderGuardVerdict {
  const verdict = inspectVariantOrder(productKey, requestedValue, requestedColor);
  // Keep the historical manual-review path for products with no source contract.
  // This is NOT a positive stock assertion: GET /cart reports `unknown`, the
  // customer UI blocks checkout, and any known unknown/unavailable contract is refused.
  return verdict.code === 'NO_CONTRACT' ? { ...verdict, allowed: true } : verdict;
}

/* ══════════════════════════════════════════════════════════════════════════
 * ORCHESTRATION — JSON SerpApi → fiche comprise → stock résolu → contrat
 * ════════════════════════════════════════════════════════════════════════ */

/**
 * Chaîne complète, telle que validée par le prototype puis décidée par le client
 * (OPTION 1 : appel dédié par variante). Le contrat de commande est enregistré
 * ici, à la seule source de vérité : le serveur.
 */
export async function prepareVariantCard(
  payload: unknown,
  productKey: string,
  fetcher?: Fetcher,
): Promise<{ card: ProductCard; resolved: ResolvedVariant[] }> {
  const { card } = buildProductCard(payload);
  const primary = card.attributes.find((attribute) => attribute.role === 'primary');
  if (!primary) {
    recordVariantContract(productKey, { attribute: '', productAvailability: 'unknown', source: null, variants: [] });
    return { card, resolved: [] };
  }

  const resolved = await resolveVariants(primary.variants.map((variant) => ({
    value: variant.value,
    productId: variant.productId,
    serpapiLink: variant.serpapiLink,
    known: variant.availability,
    knownReason: variant.availabilityReason,
  })), fetcher);

  const byValue = new Map(resolved.map((item) => [item.value, item]));
  for (const variant of primary.variants) {
    const update = byValue.get(variant.value);
    if (!update) continue;
    variant.availability = update.availability;
    variant.availabilityReason = update.reason;
  }
  // La disponibilité globale suit les variantes réellement établies.
  card.availability = primary.variants.some((variant) => variant.availability === 'available') ? 'available'
    : primary.variants.every((variant) => variant.availability === 'unavailable') ? 'unavailable'
      : 'unknown';

  recordVariantContract(productKey, {
    attribute: primary.label,
    productAvailability: card.availability,
    source: null,
    variants: primary.variants.map((variant) => ({ value: variant.value, availability: variant.availability, reason: variant.availabilityReason })),
  });
  return { card, resolved };
}
