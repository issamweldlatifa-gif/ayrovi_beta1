/**
 * Géométrie PURE du cercle d'attente (`LoadingSpinner`) — sans `react-native`,
 * pour être testée par les tests de logique.
 */

/**
 * Découpe du cercle en fractions de la circonférence : [trait, vide, trait, vide, …].
 * Dans le sens de la rotation : un point, deux tirets qui grandissent, puis le
 * long arc plein qui mène. La somme fait exactement un tour.
 */
export const SPINNER_PATTERN = [0.005, 0.06, 0.06, 0.065, 0.11, 0.07, 0.56, 0.07] as const;

/** Un tour complet, à vitesse constante. */
export const SPINNER_TURN_MS = 900;

/**
 * Deux tailles seulement : dans une ligne ou un bouton (`sm`, la taille du logo
 * Google), seul dans un bloc (`md`). Trait FIN, comme la référence.
 */
export const SPINNER_SIZES = {
  sm: { box: 20, stroke: 1.5 },
  md: { box: 36, stroke: 2 },
} as const;

export type SpinnerSize = keyof typeof SPINNER_SIZES;

/** Longueurs du pointillé (en points) pour un cercle de rayon `radius`. */
export function spinnerDashes(radius: number): number[] {
  const circumference = 2 * Math.PI * radius;
  return SPINNER_PATTERN.map((part) => Math.round(part * circumference * 100) / 100);
}
