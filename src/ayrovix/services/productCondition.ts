/**
 * FILTRE « NEUF UNIQUEMENT » (demande client 24/09/2026) :
 * Un produit AFFICHABLE doit être neuf. Les annonces d'occasion (leboncoin,
 * Vinted, Back Market, particuliers…) livrent toujours des données incomplètes
 * (une seule photo, pas de fiche, pas de disponibilité) et cassent l'isolation
 * d'arrière-plan — on les écarte à la source, avant tout affichage et tout travail.
 *
 * Détection HONNÊTE et gratuite : signaux explicites dans titre + description +
 * URL (marchés d'occasion connus, mots-clés FR/AR/EN). Sans signal explicite,
 * la fiche marchand standard est considérée neuve (défaut de l'e-commerce).
 */
import type { AyrovixCandidate } from '../types';

export type ProductCondition = 'new' | 'used' | 'unknown';

/** Places dont le modèle EST l'occasion (revente entre particuliers / reconditionné). */
const USED_HOSTS = [
  'leboncoin.fr', 'vinted.', 'backmarket.', 'backmarket.', 'refurbed.', 'swappa.com',
  'poshmark.', 'depop.com', 'vestiairecollective.com', 'olx.', 'toutvendre.',
  'ebay-kleinanzeigen', 'kleinanzeigen.de', 'gumtree.com', 'mercadolibre.',
  'avito.', 'jumia-deals', 'facebook.com/marketplace',
];

const USED_PATTERNS: RegExp[] = [
  // FR
  /\b(?:occasion|occasions|seconde?\s*main|2(?:[eè]me)?\s*main|usag[ée]e?|pr[ée]-?poss[ée]d[ée]e?|reconditionn[ée]e?|recondition|bon\s+[ée]tat|tr[èe]s\s+bon\s+[ée]tat|[ée]tat\s+correct|vendu\s+en\s+l'[ée]tat|d[ée]faut(?:ueux|s)?\b|kilo\s?shop|friperie)/i,
  // EN
  /\b(?:used|pre-?owned|pre-?loved|second[-\s]?hand|2nd\s*hand|refurbished|open[-\s]?box|well[\s-]used|signs\s+of\s+wear|for\s+parts|as[-\s]is|vintage\s+condition)/i,
  // AR
  /مستعمل|مستعمَل|ثاني\s*يد|شبه\s*جديد|معار\s*بيع|مجدَّد|بحالة\s*جيدة|بحالة\s*مستعملة/,
];

/** Mots-clés qui, au contraire, AFFIRMENT le neuf (levée de doute : « neuf sous blister »…). */
const NEW_EVIDENCE: RegExp = /\b(?:neuf|nouveaut[ée]|new|brand[\s-]?new|sous\s+blister|jamais\s+port[ée]|with\s+tags|bnwt|جديد|جديدة|بكرتونة|لم\s*يُستعمل|لم\s*يستعمل)/i;

function hostIsUsedMarketplace(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return USED_HOSTS.some((marker) => host.includes(marker));
  } catch {
    return false;
  }
}

export function detectProductCondition(input: {
  title?: string | null;
  description?: string | null;
  sourceUrl?: string | null;
}): ProductCondition {
  const haystack = `${input.title || ''} ${input.description || ''}`;
  const hostUsed = input.sourceUrl ? hostIsUsedMarketplace(input.sourceUrl) : false;
  const usedWords = USED_PATTERNS.some((pattern) => pattern.test(haystack));
  if (hostUsed) {
    // « Neuf avec étiquettes » chez un revendeur reste audible, mais par défaut : occasion.
    return NEW_EVIDENCE.test(haystack) ? 'unknown' : 'used';
  }
  if (usedWords) {
    return NEW_EVIDENCE.test(haystack) ? 'unknown' : 'used';
  }
  return 'unknown';
}

/**
 * Politique d'affichage : on n'écarte que ce qui est EXPLICITEMENT d'occasion.
 * Une fiche marchand standard (Zalando, marque, boutique…) sans signal d'occasion
 * reste affichée — on ne perd jamais un produit neuf faute de mention « new ».
 */
export function isUsedListing(input: { title?: string | null; description?: string | null; sourceUrl?: string | null }): boolean {
  return detectProductCondition(input) === 'used';
}

export function filterOutUsedCandidates(candidates: AyrovixCandidate[]): AyrovixCandidate[] {
  return candidates.filter((candidate) => !isUsedListing({
    title: candidate.title,
    description: candidate.description,
    sourceUrl: candidate.sourceUrl,
  }));
}
