/**
 * Remise affichée — logique PURE (aucun import natif, lisible par vitest).
 *
 * Règle de vérité (tâche 14) : on n'invente jamais une remise. Un prix
 * d'origine n'est montré que s'il est STRICTEMENT supérieur au prix payé, et le
 * pourcentage est arrondi à l'entier comme sur la référence « -45 % ».
 * Un écart de moins de 1 % (arrondis de conversion) ou une remise absurde
 * (≥ 98 %, souvent un prix d'origine mal lu) ne s'affiche pas.
 */

export interface SaleSummary {
  /** Vrai seulement si l'origine est fiable et supérieure au prix. */
  discounted: boolean;
  /** Pourcentage entier de remise (1–97), ou `null`. */
  percent: number | null;
}

const NONE: SaleSummary = { discounted: false, percent: null };

const finitePositive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export function saleSummary(price: number | null | undefined, original: number | null | undefined): SaleSummary {
  if (!finitePositive(price) || !finitePositive(original)) return NONE;
  if (original <= price * 1.01) return NONE;
  const percent = Math.round(((original - price) / original) * 100);
  if (percent < 1 || percent >= 98) return NONE;
  return { discounted: true, percent };
}

/** Libellé de la pastille : « -45% » (le signe moins typographique reste ASCII pour les lecteurs d'écran). */
export function saleBadgeLabel(percent: number): string {
  return `-${Math.round(percent)}%`;
}
