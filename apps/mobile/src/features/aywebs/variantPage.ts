/**
 * Adresse de la page du choix (ASIN d'une variante Amazon), si elle n'est pas la page affichée.
 * Fonction pure : pas d'appel réseau, pas d'effet de bord.
 *
 * Le twister Amazon ne publie pas toujours l'ASIN de la COMBINAISON exacte : les
 * pastilles de couleur portent l'ASIN de « cette couleur, à la taille affichée ».
 * Exiger l'égalité parfaite (couleur + taille) rendait toute lecture impossible,
 * et l'ajout d'une autre couleur finissait en `STOCK_UNKNOWN` (23/10/2026).
 * On prend donc, à défaut, la valeur qui couvre le PLUS de dimensions choisies —
 * et on ne lit que SA page, une fois, au moment de l'ajout.
 *
 * Retourne `null` quand aucune relecture n'est nécessaire ou possible :
 *   • boutique autre qu'Amazon ;
 *   • aucun choix fait ;
 *   • aucune option choisie n'a d'ASIN valide ;
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

const lower = (value: unknown): string => String(value ?? '').trim().toLowerCase();

export function variantPageUrlFor(input: VariantPageInput): string | null {
  if (input.storeId !== 'amazon') return null;
  const chosen = Object.keys(input.selection);
  if (!chosen.length) return null;

  const pageAsin = /\/dp\/([A-Z0-9]{10})/i.exec(input.sourceUrl)?.[1]?.toUpperCase() ?? null;

  /* Nombre de dimensions choisies que cette option couvre, avec la MÊME valeur.
     La page COURANTE est écartée des candidates : la relire ne prouverait rien
     de plus, et occuperait la place d'une page qui, elle, montre le choix. */
  const covered = input.options.map((option) => {
    let hits = 0;
    for (const name of chosen) {
      const published = Object.entries(option.attributes || {})
        .find(([key]) => lower(key) === lower(name));
      if (published && lower(published[1]) === lower(input.selection[name])) hits += 1;
    }
    const asin = ASIN_SHAPE.test(option.sourceVariantId) ? option.sourceVariantId.toUpperCase() : '';
    return { option, hits, asin };
  }).filter((entry) => entry.hits > 0 && entry.asin && entry.asin !== pageAsin);
  covered.sort((a, b) => b.hits - a.hits);
  const best = covered[0];
  if (!best) return null;
  const asin = best.asin;

  try {
    return `https://${new URL(input.sourceUrl).host}/dp/${asin}`;
  } catch {
    return null;
  }
}
