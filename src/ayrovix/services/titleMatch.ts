/**
 * CORRESPONDANCE DE TITRES — on ne pose un fait sur un produit qu'avec le texte
 * de SA page. `titleOverlap` mesure la part des mots du titre Lens retrouvés
 * dans le titre de la page lue ; sous le seuil, la page parle d'autre chose.
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

export function titleOverlap(a: string, b: string): number {
  const left = new Set(normalizeTitle(a).split(' ').filter((word) => word.length > 2));
  const right = new Set(normalizeTitle(b).split(' ').filter((word) => word.length > 2));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  return shared / left.size;
}
