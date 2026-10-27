/**
 * Lens — classement et confiance marchande (28/10/2026).
 *
 * ── Le problème que ce fichier règle ─────────────────────────────────────────
 * Une recherche par mots-clés ou par lien ramenait des cartes dans l'ordre du
 * fournisseur : une boutique inconnue pouvait passer devant Amazon, et le
 * client ne savait pas si l'appui allait ouvrir une page fiable. Deux
 * exigences, formulées le 28/10/2026 :
 *
 *   • « روابط بطاقات هذه تكون لمتاجر الأكثر موثوقية » — les cartes doivent
 *     pointer vers les marchands les plus fiables ;
 *   • « ضغط لي بطاقات هذي يهزنا داخل إضافة AYWEBs » — l'appui ouvre la page
 *     du marchand dans AYWEBs (voir `lensOpen.ts`, inchangé).
 *
 * ── Ce que « fiable » veut dire ici, et rien de plus ─────────────────────────
 * Trois rangs, décidés par le DOMAINE de la fiche — pas par le libellé que le
 * fournisseur lui donne (il change de langue et d'orthographe) :
 *
 *   0 · enseigne connue, à politique de retour publique (liste ci-dessous) ;
 *   1 · place de marché ou enseigne connue mais non listée (eBay, AliExpress…) ;
 *   2 · domaine inconnu, boutique unique ou revendeur.
 *
 * Le rang n'invente JAMAIS une garantie : il ne dit pas « ce prix est vrai »,
 * il dit « cette enseigne est connue ». Le prix, lui, reste vérifié par la
 * lecture de la page (AYWEBS), comme avant.
 *
 * Aucune dépendance à React : le classement se teste tout seul.
 */
import type { LensCandidate } from '@/api/lens';

/** Rangs de confiance — 0 = le plus fiable. */
export type MerchantTier = 0 | 1 | 2;

/**
 * Enseignes de rang 0. Liste FERMÉE et assumée : ce sont les marchands dont la
 * page produit est lisible par la capture AYWEBs et qui publient des retours.
 * Ajouter un domaine ici est une décision commerciale, pas une correction de
 * bug — d'où la liste, et non une heuristique du type « .com = fiable ».
 */
export const TRUSTED_MERCHANTS: readonly string[] = [
  'amazon',
  'zalando',
  'zara',
  'hm',
  'asos',
  'nike',
  'adidas',
  'sephora',
  'decathlon',
  'ikea',
  'fnac',
  'cdiscount',
  'shein',
  'temu',
  'aliexpress',
  'noon',
  'jumia',
  'ebay',
];

/** Places de marché connues : fiables pour payer, mais vendeurs multiples. */
const MARKETPLACES: readonly string[] = ['ebay', 'aliexpress', 'temu', 'shein', 'noon', 'jumia', 'cdiscount'];

/** Hôtes de suivi/redirection : le vrai domaine est ailleurs dans l'URL. */
const WRAPPER_HOSTS = ['google.', 'bing.', 'duckduckgo.', 'l.facebook.', 'lm.facebook.', 't.co', 'bit.ly'];

/** Hôte normalisé d'une fiche : `www.zalando.fr` → `zalando`. */
export function merchantKey(sourceUrl: string): string {
  try {
    const host = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, '');
    /* Un lien de suivi (`google.com/url?q=…`) porte le vrai domaine dans un
       paramètre : on le préfère, sinon on classerait Google comme marchand. */
    if (WRAPPER_HOSTS.some((wrapper) => host.startsWith(wrapper))) {
      const inner = new URL(sourceUrl).searchParams.get('q') || new URL(sourceUrl).searchParams.get('url') || '';
      if (inner) return merchantKey(inner);
    }
    /* L'enseigne peut être n'importe où dans l'hôte : `zalando.fr`,
       `amazon.co.uk`, mais aussi `fr.shein.com`. On cherche donc un label
       connu, du plus à gauche au plus à droite ; à défaut, le label qui porte
       le domaine (`boutique.tn` → `boutique`). */
    const labels = host.split('.');
    const known = labels.find((label) => TRUSTED_MERCHANTS.includes(label) || MARKETPLACES.includes(label));
    if (known) return known;
    return labels.length >= 2 ? labels[labels.length - 2] : host;
  } catch {
    return '';
  }
}

/** Rang de confiance d'une fiche. */
export function merchantTier(sourceUrl: string): MerchantTier {
  const key = merchantKey(sourceUrl);
  if (!key) return 2;
  if (MARKETPLACES.includes(key)) return 1;
  if (TRUSTED_MERCHANTS.includes(key)) return 0;
  return 2;
}

/** Libellé lisible d'un marchand inconnu (`shop-pas-cher.fr` → `shop-pas-cher`). */
export function merchantLabel(candidate: { source: string; sourceUrl: string }): string {
  const source = String(candidate.source || '').trim();
  if (source) return source;
  const key = merchantKey(candidate.sourceUrl);
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}

export type LensSort = 'relevance' | 'price' | 'trust';

export interface LensFilters {
  sort: LensSort;
  /** Seulement les fiches dont le prix a été lu sur la page (`VERIFIED`). */
  priced: boolean;
  /** Seulement les fiches en stock. */
  inStock: boolean;
  /** Seulement les enseignes de rang 0. */
  trustedOnly: boolean;
  /** Enseignes cochées (`merchantKey`) ; vide = toutes. */
  merchants: string[];
}

export const DEFAULT_FILTERS: LensFilters = {
  sort: 'relevance',
  priced: false,
  inStock: false,
  trustedOnly: false,
  merchants: [],
};

/** Au moins un filtre est-il actif (hors tri) ? Sert au bouton « tout effacer ». */
export function filtersAreActive(filters: LensFilters): boolean {
  return filters.priced || filters.inStock || filters.trustedOnly || filters.merchants.length > 0;
}

/** Une fiche est-elle retenue par les filtres actifs ? */
export function matchesFilters(candidate: LensCandidate, filters: LensFilters): boolean {
  if (filters.priced && candidate.priceVerificationStatus !== 'VERIFIED') return false;
  if (filters.inStock && candidate.availability !== 'in_stock' && candidate.availability !== 'limited') return false;
  if (filters.trustedOnly && merchantTier(candidate.sourceUrl) !== 0) return false;
  if (filters.merchants.length > 0) {
    const key = merchantKey(candidate.sourceUrl) || merchantLabel(candidate);
    if (!filters.merchants.includes(key)) return false;
  }
  return true;
}

/**
 * Ordre d'affichage.
 *
 *  1. le CATALOGUE ZAYROVI garde la tête : c'est notre stock, notre prix,
 *     aucune page tierce à ouvrir (décision du 23/10/2026, inchangée) ;
 *  2. puis le rang de confiance (0 avant 1 avant 2) ;
 *  3. puis le critère choisi : pertinence (`match`), prix en dinars, ou
 *     confiance stricte ;
 *  4. à égalité : prix le plus bas, puis titre — un ordre stable, donc une
 *     grille qui ne « saute » pas d'un rendu à l'autre.
 */
export function rankCandidates(candidates: LensCandidate[], sort: LensSort = 'relevance'): LensCandidate[] {
  /* -1 = vente interne ZAYROVI : elle passe AVANT toute enseigne tierce, quel
     que soit son rang de confiance (notre stock, notre prix, aucune page à
     ouvrir). `number` et non `MerchantTier` : c'est un rang de priorité, pas
     une enseigne. */
  const tier = (candidate: LensCandidate): number =>
    candidate.kind === 'catalog' ? -1 : merchantTier(candidate.sourceUrl);
  const price = (candidate: LensCandidate): number =>
    candidate.priceTnd ?? Number.POSITIVE_INFINITY;
  const relevance = (candidate: LensCandidate): number => -(candidate.match ?? 0);
  const byTitle = (a: LensCandidate, b: LensCandidate): number => a.title.localeCompare(b.title);

  return [...candidates].sort((a, b) => {
    const tierDelta = tier(a) - tier(b);
    if (tierDelta !== 0) return tierDelta;
    if (sort === 'price') {
      const delta = price(a) - price(b);
      if (delta !== 0) return delta;
      return relevance(a) - relevance(b) || byTitle(a, b);
    }
    if (sort === 'trust') return relevance(a) - relevance(b) || price(a) - price(b) || byTitle(a, b);
    return relevance(a) - relevance(b) || price(a) - price(b) || byTitle(a, b);
  });
}

/**
 * Filtres + tri, en une passe. La grille n'appelle que ceci : une seule
 * vérité pour l'affichage ET pour le compteur du titre.
 */
export function applyLensFilters(candidates: LensCandidate[], filters: LensFilters): LensCandidate[] {
  return rankCandidates(candidates.filter((candidate) => matchesFilters(candidate, filters)), filters.sort);
}

/**
 * Enseignes présentes dans le résultat, pour les puces de filtre.
 * Rang 0 d'abord, puis par nombre de fiches : les puces utiles d'abord.
 */
export function presentMerchants(candidates: LensCandidate[]): Array<{ key: string; label: string; count: number; tier: MerchantTier }> {
  const seen = new Map<string, { key: string; label: string; count: number; tier: MerchantTier }>();
  for (const candidate of candidates) {
    if (candidate.kind === 'catalog') continue;
    const key = merchantKey(candidate.sourceUrl) || merchantLabel(candidate);
    if (!key) continue;
    const existing = seen.get(key);
    if (existing) existing.count += 1;
    else seen.set(key, {
      key,
      label: merchantLabel(candidate),
      count: 1,
      tier: merchantTier(candidate.sourceUrl),
    });
  }
  return [...seen.values()].sort((a, b) => a.tier - b.tier || b.count - a.count || a.label.localeCompare(b.label));
}
