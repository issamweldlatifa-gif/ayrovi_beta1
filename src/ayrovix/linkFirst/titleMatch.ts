/**
 * CORRESPONDANCE DE TITRES — la preuve qu'une page parle bien du produit attendu.
 *
 * Module PUR, sans réseau ni clé : il sert aussi bien au moteur « liens d'abord »
 * (la page lue derrière un lien Lens est-elle bien CE produit ?) qu'à l'ancien
 * enrichissement SerpApi (`legacy/`). Il vivait dans `lensEnrichment` ; en le
 * sortant, le moteur neuf n'a plus aucune raison d'importer le code legacy.
 */
export function normalizeTitle(title: string): string {
  return title
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06ff\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Part des mots (>2 lettres) de `a` retrouvés dans `b`, de 0 à 1. */
export function titleOverlap(a: string, b: string): number {
  const left = new Set(normalizeTitle(a).split(' ').filter((word) => word.length > 2));
  const right = new Set(normalizeTitle(b).split(' ').filter((word) => word.length > 2));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / left.size;
}
