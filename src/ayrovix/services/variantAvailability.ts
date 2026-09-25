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
  variants: Array<{ value: string; availability: Availability; reason: string }>;
  at: number;
}

function contractFile(productKey: string): string {
  return path.join(cacheDir(), `contract-${crypto.createHash('sha256').update(productKey).digest('hex').slice(0, 32)}.json`);
}

/** Enregistre ce que le serveur a RÉELLEMENT établi lors de la préparation de la fiche. */
export function recordVariantContract(productKey: string, contract: Omit<VariantContract, 'at'>): void {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(contractFile(productKey), JSON.stringify({ ...contract, at: Date.now() } satisfies VariantContract));
  } catch { /* best-effort */ }
}

export function readVariantContract(productKey: string): VariantContract | null {
  try {
    const contract = JSON.parse(fs.readFileSync(contractFile(productKey), 'utf8')) as VariantContract;
    if (!contract || !Array.isArray(contract.variants)) return null;
    if (Date.now() - contract.at > ttlMs()) return null;
    return contract;
  } catch {
    return null;
  }
}

export type OrderGuardCode = 'ALLOWED' | 'NO_CONTRACT' | 'VARIANT_UNAVAILABLE' | 'VARIANT_AVAILABILITY_UNKNOWN' | 'VARIANT_NOT_FOUND';

export interface OrderGuardVerdict {
  allowed: boolean;
  code: OrderGuardCode;
  message: string;
}

const normalize = (value: string): string => value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();

/**
 * PORTE DE COMMANDE CÔTÉ SERVEUR.
 *
 * Elle ne s'applique QUE lorsque le serveur a établi un contrat pour ce produit :
 * sans contrat, le parcours historique (demande manuelle au prix général) continue
 * exactement comme avant — aucune régression. Mais dès que le serveur SAIT qu'une
 * variante est indisponible ou non confirmée, la commande est refusée, quoi que
 * le client envoie.
 */
export function guardVariantOrder(productKey: string, requestedValue: string | null | undefined): OrderGuardVerdict {
  const contract = readVariantContract(productKey);
  if (!contract || !contract.variants.length) {
    return { allowed: true, code: 'NO_CONTRACT', message: 'Aucun contrat de variante établi pour ce produit.' };
  }
  const wanted = normalize(String(requestedValue || ''));
  if (!wanted) {
    return { allowed: true, code: 'NO_CONTRACT', message: 'Aucune variante demandée.' };
  }
  const match = contract.variants.find((variant) => normalize(variant.value) === wanted);
  if (!match) {
    return {
      allowed: false, code: 'VARIANT_NOT_FOUND',
      message: `« ${requestedValue} » ne fait pas partie des ${contract.attribute.toLowerCase()}s publiées par le marchand.`,
    };
  }
  if (match.availability === 'unavailable') {
    return { allowed: false, code: 'VARIANT_UNAVAILABLE', message: `${contract.attribute} « ${match.value} » est indisponible chez le marchand.` };
  }
  if (match.availability === 'unknown') {
    return {
      allowed: false, code: 'VARIANT_AVAILABILITY_UNKNOWN',
      message: `Le stock de ${contract.attribute.toLowerCase()} « ${match.value} » n'est pas confirmé par le marchand : la commande est bloquée.`,
    };
  }
  return { allowed: true, code: 'ALLOWED', message: 'Variante confirmée disponible.' };
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
    recordVariantContract(productKey, { attribute: '', variants: [] });
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
    variants: primary.variants.map((variant) => ({ value: variant.value, availability: variant.availability, reason: variant.availabilityReason })),
  });
  return { card, resolved };
}
