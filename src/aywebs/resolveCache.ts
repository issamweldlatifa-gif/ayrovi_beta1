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
}

const DEFAULT_TTL_MS = 300_000;
const MAX_TTL_MS = 6 * 60 * 60 * 1000;
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

/** Lecture en cache, ou null si absent/expiré/désactivé. */
export function readAyWebsResolveCache(scope: AyWebsResolveCacheScope, key: string): AyWebsResolveCacheHit | null {
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
  return { sourceProduct: entry.sourceProduct, ageMs, storedAt: entry.storedAt };
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
