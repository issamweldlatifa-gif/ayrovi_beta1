/**
 * Adresse de la page du choix (ASIN d'une variante Amazon), si elle n'est pas la page affichée.
 * Fonction pure : pas d'appel réseau, pas d'effet de bord.
 *
 * Retourne `null` quand aucune relecture n'est nécessaire ou possible :
 *   • boutique autre qu'Amazon ;
 *   • aucun choix fait ;
 *   • l'option choisie n'a pas d'ASIN valide ;
 *   • la page affichée est déjà celle du choix ;
 *   • l'URL source est invalide.
 */

export interface VariantPageInput {
  sourceUrl: string;
  storeId: string | null | undefined;
  selection: Record<string, string>;
  options: ReadonlyArray<{ attributes: Record<string, string>; sourceVariantId: string }>;
}

const ASIN_SHAPE = /^[A-Z0-9]{10}$/i;

export function variantPageUrlFor(input: VariantPageInput): string | null {
  if (input.storeId !== 'amazon') return null;
  const chosenNames = Object.keys(input.selection).sort();
  if (!chosenNames.length) return null;

  const option = input.options.find((candidate) => {
    const names = Object.keys(candidate.attributes).sort();
    return names.length === chosenNames.length && names.every((name, index) => name === chosenNames[index]
      && String(candidate.attributes[name]).toLowerCase() === String(input.selection[name]).toLowerCase());
  });
  const asin = option && ASIN_SHAPE.test(option.sourceVariantId) ? option.sourceVariantId.toUpperCase() : null;
  if (!asin) return null;

  const pageAsin = /\/dp\/([A-Z0-9]{10})/i.exec(input.sourceUrl)?.[1]?.toUpperCase() ?? null;
  if (pageAsin === asin) return null;

  try {
    return `https://${new URL(input.sourceUrl).host}/dp/${asin}`;
  } catch {
    return null;
  }
}
