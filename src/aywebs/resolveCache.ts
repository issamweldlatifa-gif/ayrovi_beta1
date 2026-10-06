import type { AyWebsSourceProduct } from './adapters/contract';

/**
 * AYWEBs — CACHE DE RÉSOLUTION PRODUIT (05/10/2026).
 *
 * Le problème mesuré : le même produit était relu chez le marchand à CHAQUE
 * appel — ouverture de la fiche, ouverture de la feuille de variantes, ajout au
 * panier par lien, réouverture depuis « produits récents ». Chaque relecture
 * repasse la chaîne réseau complète (7 s + 6 s + 18 s + 18 s de budgets
 * cumulés), d'où une attente « de plus de vingt secondes » avant qu'un produit
 * chiffré apparaisse — pour une page que le client venait d'ouvrir.
 *
 * Ce que ce cache fait, et ce qu'il ne fait pas :
 *  • il mémorise la LECTURE de la fiche (titre, images, prix source, devise,
 *    variantes publiées) par (boutique + URL normalisée) pendant une durée
 *    courte et configurable ;
 *  • il ne sert JAMAIS un prix : le devis AYROVI est recalé à chaque appel par
 *    le moteur de tarification, côté serveur (§45) ;
 *  • il est toujours annonçable : l'appelant reçoit `fromCache` + l'âge réel de
 *    la lecture, et peut forcer une relecture fraîche (`refresh`) — c'est ce que
 *    fait la re-vérification du panier (§18, §29) ;
 *  • il ne mémorise pas un échec : une fiche non lue (prix 0) n'est jamais
 *    servie depuis le cache, sinon un incident passager bloquerait le client
 *    pendant toute la durée de vie ;
 *  • un seul vol en cours par clé (single-flight) : deux appels simultanés pour
 *    le même produit — feuille + cartes de variantes, ou deux clients — ne
 *    déclenchent qu'UNE lecture marchande ;
 *  • la mémoire est PORTÉE PAR LA SOURCE DE LECTURE (le scraper du contexte) :
 *    deux contextes AYWEBs indépendants — tests, environnements, adaptateurs
 *    distincts — ne partagent jamais une lecture. Aucune donnée produit ne
 *    traverse une frontière de configuration.
 *
 * Réglages :
 *   AYWEBS_RESOLVE_CACHE_TTL_MS   durée de vie (défaut 300 000 ; 0 = désactivé)
 *   AYWEBS_RESOLVE_CACHE_MAX      nombre d'entrées (défaut 400)
 */

export interface AyWebsResolveCacheHit {
  sourceProduct: AyWebsSourceProduct;
  /** Âge réel de la lecture mémorisée (ms). */
  ageMs: number;
  storedAt: number;
  /**
   * SWR (Phase 1, 06/10/2026) : `true` quand la lecture mémorisée a dépassé son
   * TTL mais reste dans la fenêtre de rattrapage. Elle est alors servie —
   * marquée comme telle — pendant qu'une remise à jour se fait en arrière-plan.
   */
  stale: boolean;
}

const DEFAULT_TTL_MS = 300_000;
const MAX_TTL_MS = 6 * 60 * 60 * 1000;
/** Fenêtre de rattrapage SWR après expiration (0 = SWR désactivé). */
const DEFAULT_STALE_MS = 30 * 60_000;
const MAX_STALE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MAX_ENTRIES = 400;
const MAX_MAX_ENTRIES = 5_000;

/**
 * Paramètres de suivi des URLs : ils ne changent pas le produit lu mais
 * changent la chaîne de caractères, donc la clé. Les laisser produirait un
 * cache inutile (le même article ouvert depuis deux liens différents).
 */
const TRACKING_PARAMS = [
  /^ref$/i, /^ref_$/i, /^tag$/i, /^th$/i, /^psc$/i, /^qid$/i, /^sr$/i, /^_encoding$/i,
  /^content-id$/i, /^smid$/i, /^dib$/i, /^dib_tag$/i, /^sprefix$/i, /^crid$/i, /^language$/i,
  /^pd_rd_/i, /^pf_rd_/i, /^utm_/i, /^gclid$/i, /^fbclid$/i, /^spm$/i, /^scm$/i, /^aff_/i,
];

interface CacheEntry {
  sourceProduct: AyWebsSourceProduct;
  storedAt: number;
}

interface CacheNamespace {
  entries: Map<string, CacheEntry>;
  inFlight: Map<string, Promise<AyWebsSourceProduct>>;
}

/** Objet stable identifiant la source de lecture (le scraper du contexte). */
export type AyWebsResolveCacheScope = object;

const namespaces = new WeakMap<object, CacheNamespace>();
const liveNamespaces = new Set<CacheNamespace>();

function namespaceOf(scope: AyWebsResolveCacheScope): CacheNamespace {
  const existing = namespaces.get(scope);
  if (existing) return existing;
  const created: CacheNamespace = { entries: new Map(), inFlight: new Map() };
  namespaces.set(scope, created);
  liveNamespaces.add(created);
  return created;
}

let hits = 0;
let staleHits = 0;
let misses = 0;
let writes = 0;
let evictions = 0;
let staleEvictions = 0;

function integerEnv(key: string, fallback: number, min: number, max: number): number {
  const configured = Number(process.env[key]);
  if (!Number.isFinite(configured)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(configured)));
}

/** TTL effectif (ms) ; 0 = cache désactivé. */
export function ayWebsResolveCacheTtlMs(): number {
  return integerEnv('AYWEBS_RESOLVE_CACHE_TTL_MS', DEFAULT_TTL_MS, 0, MAX_TTL_MS);
}

/**
 * Durée pendant laquelle une lecture expirée peut encore être servie (SWR).
 * Le client reçoit alors `served_stale: true` : rien n'est caché, la fiche est
 * simplement servie pendant qu'une relecture se fait derrière.
 */
export function ayWebsResolveStaleMs(): number {
  return integerEnv('AYWEBS_RESOLVE_STALE_MS', DEFAULT_STALE_MS, 0, MAX_STALE_MS);
}

export function ayWebsResolveCacheMaxEntries(): number {
  return integerEnv('AYWEBS_RESOLVE_CACHE_MAX', DEFAULT_MAX_ENTRIES, 1, MAX_MAX_ENTRIES);
}

export function ayWebsResolveCacheEnabled(): boolean {
  return ayWebsResolveCacheTtlMs() > 0;
}

/**
 * Clé de lecture : boutique + URL normalisée (hôte en minuscules, fragment
 * retiré, paramètres de suivi écartés). La normalisation ne touche jamais au
 * chemin ni aux paramètres qui identifient le produit (`/dp/ASIN`, `?variant=`).
 */
export function ayWebsResolveCacheKey(storeId: string, rawUrl: string): string {
  let normalized = String(rawUrl || '').trim();
  try {
    const url = new URL(normalized);
    url.hash = '';
    const removable: string[] = [];
    for (const key of url.searchParams.keys()) {
      if (TRACKING_PARAMS.some((pattern) => pattern.test(key))) removable.push(key);
    }
    for (const key of removable) url.searchParams.delete(key);
    url.hostname = url.hostname.toLowerCase();
    url.protocol = 'https:';
    normalized = url.toString();
  } catch {
    // URL illisible : la clé reste la chaîne brute — la garde d'entrée refusera
    // de toute façon la résolution avant tout réseau.
  }
  return `${String(storeId || '').toLowerCase()}|${normalized}`;
}

/**
 * Lecture en cache, ou null si absent/expiré/désactivé.
 * `allowStale: true` autorise la fenêtre de rattrapage SWR (voir
 * `ayWebsResolveStaleMs`) : la valeur est rendue avec `stale: true` au lieu
 * d'être jetée, ce qui évite au client d'attendre une lecture quand une autre
 * est déjà possible — mais l'appelant DOIT relancer une relecture derrière.
 */
export function readAyWebsResolveCache(
  scope: AyWebsResolveCacheScope,
  key: string,
  options: { allowStale?: boolean } = {},
): AyWebsResolveCacheHit | null {
  const ttl = ayWebsResolveCacheTtlMs();
  if (ttl <= 0) {
    misses += 1;
    return null;
  }
  const { entries } = namespaceOf(scope);
  const entry = entries.get(key);
  if (!entry) {
    misses += 1;
    return null;
  }
  const ageMs = Date.now() - entry.storedAt;
  if (ageMs > ttl) {
    const staleMs = ayWebsResolveStaleMs();
    if (options.allowStale && staleMs > 0 && ageMs <= ttl + staleMs) {
      // SWR : servie périmée, mais étiquetée. L'appelant relance une lecture.
      entries.delete(key);
      entries.set(key, entry);
      staleHits += 1;
      return { sourceProduct: entry.sourceProduct, ageMs, storedAt: entry.storedAt, stale: true };
    }
    entries.delete(key);
    staleEvictions += 1;
    misses += 1;
    return null;
  }
  // Réinsertion : la Map conserve l'ordre d'insertion, donc les entrées les
  // moins récemment utilisées sortent en premier (comportement LRU simple).
  entries.delete(key);
  entries.set(key, entry);
  hits += 1;
  return { sourceProduct: entry.sourceProduct, ageMs, storedAt: entry.storedAt, stale: false };
}

/**
 * Mémorise une lecture EXPLOITABLE. Une lecture sans prix n'est jamais
 * mémorisée : servir un échec passager pendant cinq minutes serait un mensonge
 * silencieux envers le client (la fiche reste relue à chaque demande).
 */
export function writeAyWebsResolveCache(
  scope: AyWebsResolveCacheScope,
  key: string,
  sourceProduct: AyWebsSourceProduct,
): boolean {
  if (!ayWebsResolveCacheEnabled()) return false;
  if (!(Number(sourceProduct?.price) > 0)) return false;
  const { entries } = namespaceOf(scope);
  const max = ayWebsResolveCacheMaxEntries();
  if (entries.size >= max) {
    const oldest = entries.keys().next().value as string | undefined;
    if (oldest !== undefined) {
      entries.delete(oldest);
      evictions += 1;
    }
  }
  try {
    entries.set(key, { sourceProduct: structuredClone(sourceProduct), storedAt: Date.now() });
  } catch {
    // Objet non clonable : on préfère ne rien mémoriser plutôt que de risquer
    // une donnée partagée et mutable entre deux résolutions.
    return false;
  }
  writes += 1;
  return true;
}

/**
 * Single-flight : deux appels simultanés pour la même clé partagent UNE lecture
 * marchande. Le résultat est mémorisé par l'appelant (writeAyWebsResolveCache).
 */
export function runAyWebsResolveOnce(
  scope: AyWebsResolveCacheScope,
  key: string,
  task: () => Promise<AyWebsSourceProduct>,
): Promise<AyWebsSourceProduct> {
  const { inFlight } = namespaceOf(scope);
  const running = inFlight.get(key);
  if (running) return running;
  const started = task().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, started);
  return started;
}

/** Diagnostics (§46) : nombres réels, jamais estimés. */
export function ayWebsResolveCacheStats(): {
  enabled: boolean;
  ttl_ms: number;
  entries: number;
  max_entries: number;
  in_flight: number;
  hits: number;
  stale_hits: number;
  stale_ttl_ms: number;
  misses: number;
  writes: number;
  evictions: number;
  stale_evictions: number;
} {
  let entries = 0;
  let inFlight = 0;
  for (const namespace of [...liveNamespaces]) {
    if (!namespace.entries.size && !namespace.inFlight.size) {
      liveNamespaces.delete(namespace);
      continue;
    }
    entries += namespace.entries.size;
    inFlight += namespace.inFlight.size;
  }
  return {
    enabled: ayWebsResolveCacheEnabled(),
    ttl_ms: ayWebsResolveCacheTtlMs(),
    entries,
    max_entries: ayWebsResolveCacheMaxEntries(),
    in_flight: inFlight,
    hits,
    stale_hits: staleHits,
    stale_ttl_ms: ayWebsResolveStaleMs(),
    misses,
    writes,
    evictions,
    stale_evictions: staleEvictions,
  };
}

/** Remise à zéro (tests et redémarrage de configuration). */
export function clearAyWebsResolveCache(scope?: AyWebsResolveCacheScope): void {
  if (scope) {
    const namespace = namespaces.get(scope);
    namespace?.entries.clear();
    namespace?.inFlight.clear();
  } else {
    for (const namespace of liveNamespaces) {
      namespace.entries.clear();
      namespace.inFlight.clear();
    }
    liveNamespaces.clear();
  }
  hits = 0;
  misses = 0;
  writes = 0;
  evictions = 0;
  staleEvictions = 0;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * MÉMO « FICHE ILLISIBLE » (Phase 1 — 06/10/2026)
 *
 * Le cache ci-dessus refuse volontairement de mémoriser une lecture sans prix :
 * une fiche illisible ne doit pas être servie comme un succès. Mais une fiche
 * illisible COÛTE CHER : mesures du 06/10/2026, 13–17 s de sondes vouées à
 * l'échec à chaque appel, et un utilisateur qui réessaie paie ce prix à chaque
 * fois. Ce mémo — séparé, à TTL court, et JAMAIS confondu avec le cache de
 * lecture — réutilise la MÊME lecture ratée pendant `AYWEBS_RESOLVE_FAILURE_TTL_MS`
 * (défaut 90 s ; 0 = désactivé) pour répondre vite et honnêtement « prix non lu »
 * au lieu de relancer tout le chantier de sondes.
 *
 * Sécurité : seules les lectures SANS prix exploitable y entrent (garde
 * `price <= 0`), la durée est courte, et le résultat reste marqué
 * `cache_kind = "failure_memo"` côté API — jamais présenté comme une lecture fraîche.
 * ═══════════════════════════════════════════════════════════════════════════ */

const DEFAULT_FAILURE_TTL_MS = 90_000;
const MAX_FAILURE_TTL_MS = 10 * 60_000;
const DEFAULT_FAILURE_MAX_ENTRIES = 200;

const failureNamespaces = new WeakMap<object, Map<string, CacheEntry>>();
const liveFailureNamespaces = new Set<Map<string, CacheEntry>>();
let failureHits = 0;
let failureWrites = 0;
let failureEvictions = 0;

export function ayWebsResolveFailureTtlMs(): number {
  return integerEnv('AYWEBS_RESOLVE_FAILURE_TTL_MS', DEFAULT_FAILURE_TTL_MS, 0, MAX_FAILURE_TTL_MS);
}

function failureNamespaceOf(scope: AyWebsResolveCacheScope): Map<string, CacheEntry> {
  const existing = failureNamespaces.get(scope);
  if (existing) return existing;
  const created = new Map<string, CacheEntry>();
  failureNamespaces.set(scope, created);
  liveFailureNamespaces.add(created);
  return created;
}

/** Lecture mémorisée d'un ÉCHEC récent, ou null. */
export function readAyWebsResolveFailureCache(scope: AyWebsResolveCacheScope, key: string): AyWebsResolveCacheHit | null {
  const ttl = ayWebsResolveFailureTtlMs();
  if (ttl <= 0) return null;
  const entries = failureNamespaces.get(scope);
  const entry = entries?.get(key);
  if (!entry) return null;
  const ageMs = Date.now() - entry.storedAt;
  if (ageMs > ttl) {
    entries!.delete(key);
    return null;
  }
  failureHits += 1;
  return { sourceProduct: entry.sourceProduct, ageMs, storedAt: entry.storedAt, stale: false };
}

/** Mémorise un échec de lecture (prix non exploitable). Jamais un succès. */
export function writeAyWebsResolveFailureCache(
  scope: AyWebsResolveCacheScope,
  key: string,
  sourceProduct: AyWebsSourceProduct,
): boolean {
  if (ayWebsResolveFailureTtlMs() <= 0) return false;
  if (Number(sourceProduct?.price) > 0) return false;
  const entries = failureNamespaceOf(scope);
  if (entries.size >= DEFAULT_FAILURE_MAX_ENTRIES) {
    const oldest = entries.keys().next().value as string | undefined;
    if (oldest !== undefined) {
      entries.delete(oldest);
      failureEvictions += 1;
    }
  }
  try {
    entries.set(key, { sourceProduct: structuredClone(sourceProduct), storedAt: Date.now() });
  } catch {
    return false;
  }
  failureWrites += 1;
  return true;
}

export function ayWebsResolveFailureCacheStats(): {
  enabled: boolean; ttl_ms: number; entries: number; hits: number; writes: number; evictions: number;
} {
  let entries = 0;
  for (const namespace of [...liveFailureNamespaces]) {
    if (!namespace.size) {
      liveFailureNamespaces.delete(namespace);
      continue;
    }
    entries += namespace.size;
  }
  return {
    enabled: ayWebsResolveFailureTtlMs() > 0,
    ttl_ms: ayWebsResolveFailureTtlMs(),
    entries,
    hits: failureHits,
    writes: failureWrites,
    evictions: failureEvictions,
  };
}

export function clearAyWebsResolveFailureCache(scope?: AyWebsResolveCacheScope): void {
  if (scope) {
    failureNamespaces.get(scope)?.clear();
    return;
  }
  for (const namespace of liveFailureNamespaces) namespace.clear();
}
