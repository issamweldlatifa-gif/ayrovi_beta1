/**
 * Lens — ordre des résultats et confiance marchande (28/10/2026).
 *
 * ── Les deux exigences du client, et ce qu'elles imposent ──────────────────
 *   • « روابط بطاقات هذه تكون لمتاجر الأكثر موثوقية » — les cartes doivent
 *     pointer vers les marchands les plus fiables : l'ordre met donc TOUJOURS
 *     les enseignes connues devant les boutiques inconnues, sans réglage ;
 *   • « نظلم الفلاتر كون فقط فلتر على عنوان » — un seul filtre, sur le TITRE
 *     du produit, et « أي فلاتر عدا هذا يتحيّد » : plus de tri, plus de
 *     « en stock », plus de puces par marchand. Le classement, lui, n'est plus
 *     un choix : il est la règle.
 *
 * ── Ce que « fiable » veut dire ici, et rien de plus ────────────────────────
 * Trois rangs, décidés par le DOMAINE de la fiche — pas par le libellé que le
 * fournisseur lui donne (il change de langue et d'orthographe) :
 *
 *   -1 · catalogue ZAYROVI : notre stock, notre prix, aucune page tierce ;
 *    0 · enseigne connue, à politique de retour publique (liste ci-dessous) ;
 *    1 · place de marché (vendeurs multiples, paiement connu) ;
 *    2 · domaine inconnu, boutique unique ou revendeur.
 *
 * Le rang n'invente JAMAIS une garantie : il ne dit pas « ce prix est vrai »,
 * il dit « cette enseigne est connue ». Le prix reste vérifié par la lecture
 * de la page (AYWEBS), comme avant.
 *
 * Aucune dépendance à React : le classement et le filtre se testent seuls.
 */
import type { LensCandidate } from '@/api/lens';
import { productTitle, titleMatches } from './lensTitle';

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

/**
 * Ordre d'affichage — la règle, pas un réglage.
 *
 *  1. le CATALOGUE ZAYROVI garde la tête : notre stock, notre prix ;
 *  2. puis le rang de confiance (0 avant 1 avant 2) ;
 *  3. puis la pertinence renvoyée par la recherche (`match`) ;
 *  4. à égalité : prix le plus bas, puis titre — un ordre stable, donc une
 *     grille qui ne « saute » pas d'un rendu à l'autre.
 */
export function rankCandidates(candidates: LensCandidate[]): LensCandidate[] {
  /* -1 = vente interne ZAYROVI : elle passe AVANT toute enseigne tierce.
     `number` et non `MerchantTier` : c'est un rang de priorité, pas une
     enseigne. */
  const tier = (candidate: LensCandidate): number =>
    candidate.kind === 'catalog' ? -1 : merchantTier(candidate.sourceUrl);
  const price = (candidate: LensCandidate): number =>
    candidate.priceTnd ?? Number.POSITIVE_INFINITY;
  const relevance = (candidate: LensCandidate): number => -(candidate.match ?? 0);
  const byTitle = (a: LensCandidate, b: LensCandidate): number =>
    productTitle(a.title, a).localeCompare(productTitle(b.title, b));

  return [...candidates].sort((a, b) => {
    const tierDelta = tier(a) - tier(b);
    if (tierDelta !== 0) return tierDelta;
    return relevance(a) - relevance(b) || price(a) - price(b) || byTitle(a, b);
  });
}

/**
 * Le SEUL filtre : le titre du produit.
 *
 * La comparaison porte sur le titre nettoyé (`productTitle`) — donc sur ce que
 * la carte affiche. Chercher « zalando » ne ramène plus toutes les cartes :
 * le nom de la boutique n'est pas un titre de produit.
 */
export function filterCandidatesByTitle(candidates: LensCandidate[], query: string): LensCandidate[] {
  const needle = query.trim();
  if (!needle) return candidates;
  return candidates.filter((candidate) => titleMatches(productTitle(candidate.title, candidate), needle));
}

/** Filtre par titre + classement de confiance, en une passe. */
export function applyLensFilters(candidates: LensCandidate[], query: string): LensCandidate[] {
  return rankCandidates(filterCandidatesByTitle(candidates, query));
}
