/**
 * AYWEBs — EMPREINTE DE LECTEUR FIXÉE PAR STORE (Phase 1, 06/10/2026).
 *
 * ── CE QUI EXISTAIT ─────────────────────────────────────────────────────────
 * Deux sondes directes (agent mobile + agent bureau) partaient EN MÊME TEMPS et
 * la première qui lisait un prix gagnait. Sur la même URL Amazon, les mesures
 * des 04–06/10/2026 donnent :
 *   • agent mobile  : fiche complète (693 Ko) contenant `a-price-whole` — un prix
 *     lisible (2 réussites sur 4 essais) ;
 *   • agent bureau  : 3 réponses de 3,8 Ko (coquilles) puis une vraie page de
 *     842 Ko **sans aucune ancre de prix** (`corePriceDisplay` vide, ni
 *     `a-price-whole` ni `priceAmount`) — 1 « succès » qui ne lit aucun prix.
 * Autrement dit : le store décide par empreinte, et le résultat changeait d'un
 * essai à l'autre sans qu'aucune ligne de code ne change. Deux requêtes
 * marchandes par lecture, dont une perdue — et une politique qui n'existe pas
 * n'est pas une politique : c'est un tirage au sort qui coûte double.
 *
 * ── CE QUI EXISTE MAINTENANT ────────────────────────────────────────────────
 *   • UNE empreinte fixée par store (documentée ci-dessous avec sa provenance),
 *     surchargeable sans redéploiement : `AYROVIX_READER_PROFILE_<STORE>` ou
 *     `AYROVIX_READER_PROFILE` (ex. `amazon=mobile`, `shein=desktop`) ;
 *   • l'autre empreinte reste disponible en repli DIFFÉRÉ : elle ne part que si
 *     la première n'a rien lu, jamais en même temps (voir `readerProbePlan`) ;
 *   • le lecteur Jina (et le rendu payant ensuite) part après ce repli gratuit,
 *     et non plus en parallèle de lui.
 *
 * Aucune décision métier ici : ce module ne dit pas quel prix est vrai, il dit
 * avec quelle empreinte on frappe à la porte — et pourquoi.
 */

export type ReaderProfile = 'mobile' | 'desktop';

/**
 * Profils d'en-têtes. Volontairement FIGÉS (gelés) : une empreinte qui change
 * toute seule n'est pas une empreinte, c'est une fuite de comportement.
 */
const MOBILE_READER_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 Version/17.4 Mobile/15E148 Safari/604.1',
  Accept: 'text/html,application/xhtml+xml',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
});

const DESKTOP_READER_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Upgrade-Insecure-Requests': '1',
});

const READER_PROFILES: Readonly<Record<ReaderProfile, Readonly<Record<string, string>>>> = Object.freeze({
  mobile: MOBILE_READER_HEADERS,
  desktop: DESKTOP_READER_HEADERS,
});

/**
 * Empreinte retenue par store + PROVENANCE (pourquoi celle-là, avec la mesure).
 * `mobile` n'est pas un choix esthétique : c'est la seule empreinte qui a rendu
 * un prix lisible sur Amazon dans cette infrastructure.
 */
const DEFAULT_PROFILE_BY_STORE: Readonly<Record<string, ReaderProfile>> = Object.freeze({
  amazon: 'mobile',
  shein: 'desktop',
  temu: 'desktop',
  aliexpress: 'desktop',
});

/** Empreinte des boutiques sans mesure propre (Shopify, WooCommerce, marques). */
const GENERIC_PROFILE: ReaderProfile = 'desktop';

const PROVENANCE: Readonly<Record<string, string>> = Object.freeze({
  amazon: 'Mesures 04–06/10/2026 : agent mobile → fiche 693 Ko avec a-price-whole (prix lu) ; agent bureau → 3 coquilles de 3,8 Ko + une page de 842 Ko sans aucune ancre de prix.',
  shein: 'Boutique rendue côté client : la lecture directe ne rend pas un prix (mesures 05/10 : coquilles JS). Profil bureau par défaut ; le prix dépend du lecteur Jina ou du rendu payant.',
  temu: 'Boutique rendue côté client : la lecture directe ne rend pas un prix. Profil bureau par défaut ; le prix dépend du lecteur Jina ou du rendu payant.',
  aliexpress: 'Accès produit non obtenu dans cette infrastructure (302 / coquille x5secdata). Profil bureau par défaut, sans revendication de succès.',
});

function integerEnv(key: string, fallback: number, min: number, max: number): number {
  const configured = Number(process.env[key]);
  if (!Number.isFinite(configured)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(configured)));
}

function normalizeStore(storeType: unknown): string {
  return String(storeType || '').trim().toLowerCase();
}

/**
 * Empreinte PRIMAIRE d'un store. Priorité : surcharge propre au store, puis
 * surcharge globale, puis la mesure par défaut, puis le profil générique.
 * Une valeur inconnue n'écrase rien : on retombe sur la mesure documentée.
 */
export function readerProfileForStore(storeType: unknown): ReaderProfile {
  const store = normalizeStore(storeType);
  const scoped = store ? process.env[`AYROVIX_READER_PROFILE_${store.toUpperCase()}`] : undefined;
  const global = process.env.AYROVIX_READER_PROFILE;
  for (const candidate of [scoped, global]) {
    const value = String(candidate || '').trim().toLowerCase();
    if (value === 'mobile' || value === 'desktop') return value;
  }
  return DEFAULT_PROFILE_BY_STORE[store] || GENERIC_PROFILE;
}

/** Pourquoi cette empreinte — texte court, affichable dans un diagnostic. */
export function readerProfileProvenance(storeType: unknown): string {
  const store = normalizeStore(storeType);
  return PROVENANCE[store] || 'Aucune mesure propre à ce store : profil générique (bureau), repli mobile différé.';
}

/** En-têtes du profil demandé (objet gelé, partagé : aucune mutation possible). */
export function readerHeaders(profile: ReaderProfile): Readonly<Record<string, string>> {
  return READER_PROFILES[profile === 'mobile' ? 'mobile' : 'desktop'];
}

/** Délai avant le repli (empreinte secondaire) : il ne part que si rien n'est lu. */
export function readerFallbackDelayMs(): number {
  return integerEnv('AYROVIX_READER_FALLBACK_MS', 2_500, 0, 15_000);
}

/**
 * Départ du lecteur Jina : APRÈS le repli gratuit, pour ne pas dépenser un appel
 * externe (et 13–28 s d'attente) quand l'autre empreinte aurait suffi.
 */
export function readerJinaHeadstartMs(): number {
  return integerEnv('AYROVIX_JINA_HEADSTART_MS', readerFallbackDelayMs() + 500, 0, 10_000);
}

export interface ReaderProbeStep {
  /** Identité de la sonde — conservée (`direct_mobile` / `direct_desktop`) pour les journaux. */
  id: 'direct_mobile' | 'direct_desktop';
  profile: ReaderProfile;
  /** 0 pour l'empreinte primaire ; différé pour le repli. */
  delayMs: number;
}

/**
 * Plan de sondes directes pour un store : l'empreinte fixée part en premier,
 * l'autre n'est qu'un repli différé. Déterministe : deux appels identiques
 * rendent le même plan, dans le même ordre.
 */
export function readerProbePlan(storeType: unknown): ReaderProbeStep[] {
  const primary = readerProfileForStore(storeType);
  const secondary: ReaderProfile = primary === 'mobile' ? 'desktop' : 'mobile';
  const step = (profile: ReaderProfile, delayMs: number): ReaderProbeStep => ({
    id: profile === 'mobile' ? 'direct_mobile' : 'direct_desktop',
    profile,
    delayMs,
  });
  return [step(primary, 0), step(secondary, readerFallbackDelayMs())];
}

/** Vue de diagnostic : empreinte active par store + provenance (jamais estimée). */
export function readerFingerprintReport(storeTypes: string[]): {
  fallback_delay_ms: number;
  jina_headstart_ms: number;
  stores: Array<{ store: string; profile: ReaderProfile; provenance: string }>;
} {
  return {
    fallback_delay_ms: readerFallbackDelayMs(),
    jina_headstart_ms: readerJinaHeadstartMs(),
    stores: storeTypes.map((store) => ({
      store,
      profile: readerProfileForStore(store),
      provenance: readerProfileProvenance(store),
    })),
  };
}
