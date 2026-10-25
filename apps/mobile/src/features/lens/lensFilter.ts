/**
 * Z Lens — filtres et tri des résultats (logique pure, sans React, testable).
 *
 * Pourquoi ce module : le serveur renvoie des cartes déjà ordonnées par
 * pertinence, mais l'application n'exposait AUCUN contrôle : les filtres
 * visibles ne changeaient rien. Toute la donnée normalisée existe pourtant sur
 * `LensCandidate` (marchand, marque, couleur, taille, prix TND, dispo, remise,
 * note, score visuel). On la filtre et on la trie ici, sur le téléphone.
 *
 * Règles d'honnêteté (même contrat que `lensView.ts`) :
 *  • Aucune conversion de devise sur l'appareil : les fourchettes de prix et
 *    les tris par prix n'utilisent QUE `priceTnd` calculé par le serveur.
 *    Une carte sans prix TND ne reçoit jamais un 0 inventé : elle descend en
 *    fin de tri et, quand une borne de prix est active, elle est écartée
 *    (impossible de prouver qu'elle est dans la fourchette).
 *  • Une valeur manquante n'est jamais égale à zéro.
 *  • La note n'est fiable qu'avec `ratingKind === 'merchant'`.
 *  • Une remise n'est reconnue que si elle est vérifiée (promo du serveur, ou
 *    calculée à partir de deux prix TND publiés par le marchand).
 *  • Tris déterministes : à égalité, l'ordre serveur d'origine est conservé.
 */
import type { LensAvailability, LensCandidate } from '@/api/lens';

export type LensSortKey =
  | 'relevance' // ordre serveur (score visuel), stable
  | 'match' // similarité visuelle (`match` 0..100)
  | 'price_asc'
  | 'price_desc'
  | 'discount' // plus forte remise vérifiée
  | 'rating'; // note marchand fiable uniquement

/** Au-dessus de ce score serveur, la fiche est traitée comme le produit exact. */
export const EXACT_MATCH_THRESHOLD = 80;

export interface LensPriceRange {
  min: number | null;
  max: number | null;
}

export interface LensFilterState {
  merchants: string[];
  brands: string[];
  colors: string[];
  sizes: string[];
  availability: LensAvailability[];
  priceTnd: LensPriceRange;
  discountOnly: boolean;
  /** Fiches dont le lien produit est vérifié (prêtes à l'achat). */
  verifiedOnly: boolean;
  /** Le modèle exact plutôt que des alternatives. */
  exactOnly: boolean;
}

export interface LensControls {
  sort: LensSortKey;
  filters: LensFilterState;
}

export interface LensFacetValue {
  value: string;
  count: number;
}

export interface LensFacets {
  merchants: LensFacetValue[];
  brands: LensFacetValue[];
  colors: LensFacetValue[];
  sizes: LensFacetValue[];
  availability: LensFacetValue[];
  hasPriceTnd: number;
  hasVerifiedDiscount: number;
  hasMerchantRating: number;
  exactMatchCount: number;
  verifiedCount: number;
}

const positiveFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

const normalizeKey = (value: string | null | undefined): string =>
  (value || '').trim().replace(/\s+/g, ' ').toLowerCase();

/** Prix TND comparable fourni par le serveur, sinon null (jamais de conversion inventée). */
export function comparableTnd(candidate: LensCandidate): number | null {
  return positiveFinite(candidate.priceTnd) ? candidate.priceTnd : null;
}

/** Remise vérifiée en pourcentage (0..100), ou null. */
export function verifiedDiscountPercent(candidate: LensCandidate): number | null {
  const explicit = positiveFinite(candidate.promo?.percent) ? (candidate.promo?.percent as number) : null;
  if (explicit != null) return Math.min(100, Math.round(explicit));
  const current = comparableTnd(candidate);
  const reference = positiveFinite(candidate.promo?.originalPriceTnd)
    ? candidate.promo?.originalPriceTnd as number
    : positiveFinite(candidate.originalPriceTnd)
      ? candidate.originalPriceTnd as number
      : null;
  if (current != null && reference != null && reference > current) {
    return Math.round((1 - current / reference) * 100);
  }
  return null;
}

/** Note marchand fiable, sinon null (les notes de similarité ne sont pas des avis). */
export function trustedRating(candidate: LensCandidate): number | null {
  return candidate.ratingKind === 'merchant' && positiveFinite(candidate.rating) ? candidate.rating as number : null;
}

export function isVerifiedProduct(candidate: LensCandidate): boolean {
  return candidate.productLinkStatus === 'VERIFIED';
}

export function isExactMatch(candidate: LensCandidate): boolean {
  return positiveFinite(candidate.match) && (candidate.match as number) >= EXACT_MATCH_THRESHOLD;
}

export function defaultFilters(): LensFilterState {
  return {
    merchants: [],
    brands: [],
    colors: [],
    sizes: [],
    availability: [],
    priceTnd: { min: null, max: null },
    discountOnly: false,
    verifiedOnly: false,
    exactOnly: false,
  };
}

export function defaultControls(): LensControls {
  return { sort: 'relevance', filters: defaultFilters() };
}

function countBy(values: ReadonlyArray<string | null | undefined>): LensFacetValue[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const value = (raw || '').trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Facettes calculées sur l'ENSEMBLE des résultats (avant filtrage) pour que les
 * options proposées reposent toujours sur de la donnée réelle. Une valeur absente
 * du jeu n'est jamais exposée.
 */
export function deriveFacets(candidates: readonly LensCandidate[]): LensFacets {
  const merchants = countBy(candidates.map((c) => c.source));
  const brands = countBy(candidates.map((c) => c.brand));
  const colors = countBy(candidates.flatMap((c) => c.colors));
  const sizes = countBy(candidates.flatMap((c) => c.sizes));
  const availability = countBy(candidates.map((c) => c.availability));
  return {
    merchants,
    brands,
    colors,
    sizes,
    availability,
    hasPriceTnd: candidates.filter((c) => comparableTnd(c) != null).length,
    hasVerifiedDiscount: candidates.filter((c) => verifiedDiscountPercent(c) != null).length,
    hasMerchantRating: candidates.filter((c) => trustedRating(c) != null).length,
    exactMatchCount: candidates.filter(isExactMatch).length,
    verifiedCount: candidates.filter(isVerifiedProduct).length,
  };
}

/**
 * Nombre de DIMENSIONS de filtre actives (chaque famille compte pour 1, quel
 * que soit le nombre de valeurs choisies) : c'est le chiffre lisible sur la
 * pastille du bouton Filtres, pas le détail des options cochées.
 */
export function countActiveFilters(filters: LensFilterState): number {
  let count = 0;
  if (filters.merchants.length) count += 1;
  if (filters.brands.length) count += 1;
  if (filters.colors.length) count += 1;
  if (filters.sizes.length) count += 1;
  if (filters.availability.length) count += 1;
  if (filters.priceTnd.min != null || filters.priceTnd.max != null) count += 1;
  if (filters.discountOnly) count += 1;
  if (filters.verifiedOnly) count += 1;
  if (filters.exactOnly) count += 1;
  return count;
}

function includesNormalized(list: ReadonlyArray<string>, wanted: string): boolean {
  const target = normalizeKey(wanted);
  return list.some((entry) => normalizeKey(entry) === target);
}

function matchesAny(list: ReadonlyArray<string>, selected: ReadonlyArray<string>): boolean {
  if (selected.length === 0) return true;
  return selected.some((wanted) => includesNormalized(list, wanted));
}

/** Applique les filtres ; le tri est géré à part pour rester composable. */
export function filterCandidates(
  candidates: readonly LensCandidate[],
  filters: LensFilterState,
): LensCandidate[] {
  const priceActive = filters.priceTnd.min != null || filters.priceTnd.max != null;
  const min = positiveFinite(filters.priceTnd.min) ? filters.priceTnd.min as number : null;
  const max = positiveFinite(filters.priceTnd.max) ? filters.priceTnd.max as number : null;

  return candidates.filter((candidate) => {
    if (filters.merchants.length && !includesNormalized(filters.merchants, candidate.source)) return false;
    if (filters.brands.length && (!candidate.brand || !includesNormalized(filters.brands, candidate.brand))) return false;
    if (filters.colors.length && !matchesAny(candidate.colors, filters.colors)) return false;
    if (filters.sizes.length && !matchesAny(candidate.sizes, filters.sizes)) return false;
    if (filters.availability.length && !filters.availability.includes(candidate.availability)) return false;
    if (filters.discountOnly && verifiedDiscountPercent(candidate) == null) return false;
    if (filters.verifiedOnly && !isVerifiedProduct(candidate)) return false;
    if (filters.exactOnly && !isExactMatch(candidate)) return false;
    if (priceActive) {
      const price = comparableTnd(candidate);
      if (price == null) return false; // aucune preuve qu'elle soit dans la fourchette
      if (min != null && price < min) return false;
      if (max != null && price > max) return false;
    }
    return true;
  });
}

/**
 * Tri stable et déterministe. Les cartes non comparables (prix / remise / note
 * manquants) descendent en fin de liste en conservant leur ordre relatif ; elles
 * ne sont jamais traitées comme un zéro.
 */
export function sortCandidates(candidates: readonly LensCandidate[], sort: LensSortKey): LensCandidate[] {
  const decorated = candidates.map((candidate, index) => ({ candidate, index }));
  const compare = (a: typeof decorated[number], b: typeof decorated[number]): number => {
    switch (sort) {
      case 'match': {
        const ma = positiveFinite(a.candidate.match) ? a.candidate.match as number : -1;
        const mb = positiveFinite(b.candidate.match) ? b.candidate.match as number : -1;
        return mb - ma || a.index - b.index;
      }
      case 'price_asc': {
        const pa = comparableTnd(a.candidate);
        const pb = comparableTnd(b.candidate);
        if (pa == null && pb == null) return a.index - b.index;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pa - pb || a.index - b.index;
      }
      case 'price_desc': {
        const pa = comparableTnd(a.candidate);
        const pb = comparableTnd(b.candidate);
        if (pa == null && pb == null) return a.index - b.index;
        if (pa == null) return 1;
        if (pb == null) return -1;
        return pb - pa || a.index - b.index;
      }
      case 'discount': {
        const da = verifiedDiscountPercent(a.candidate) ?? -1;
        const db = verifiedDiscountPercent(b.candidate) ?? -1;
        return db - da || a.index - b.index;
      }
      case 'rating': {
        const ra = trustedRating(a.candidate);
        const rb = trustedRating(b.candidate);
        if (ra == null && rb == null) return a.index - b.index;
        if (ra == null) return 1;
        if (rb == null) return -1;
        if (ra !== rb) return rb - ra;
        const ca = positiveFinite(a.candidate.ratingCount) ? a.candidate.ratingCount as number : -1;
        const cb = positiveFinite(b.candidate.ratingCount) ? b.candidate.ratingCount as number : -1;
        return cb - ca || a.index - b.index;
      }
      case 'relevance':
      default:
        return a.index - b.index;
    }
  };
  return decorated.sort(compare).map((entry) => entry.candidate);
}

export interface LensAppliedResults {
  facets: LensFacets;
  visible: LensCandidate[];
  total: number;
  filteredCount: number;
  activeFilterCount: number;
  isDefault: boolean;
}

/** Point d'entrée unique de l'écran : facettes (jeu complet) + filtre + tri. */
export function applyLensControls(candidates: readonly LensCandidate[], controls: LensControls): LensAppliedResults {
  const facets = deriveFacets(candidates);
  const filtered = filterCandidates(candidates, controls.filters);
  const visible = sortCandidates(filtered, controls.sort);
  const activeFilterCount = countActiveFilters(controls.filters);
  return {
    facets,
    visible,
    total: candidates.length,
    filteredCount: visible.length,
    activeFilterCount,
    isDefault: controls.sort === 'relevance' && activeFilterCount === 0,
  };
}
