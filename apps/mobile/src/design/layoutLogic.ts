/**
 * Decisions de layout pures : pas de React Native, donc vérifiables sans appareil.
 * Les primitives `layout.tsx` et `ui.tsx` consomment ces décisions au lieu de
 * redéfinir chacune ses seuils et ses espacements.
 */
import { SPACE } from './tokens.generated';

export const BREAKPOINTS = { compactMax: 360, wideMin: 600, tabletMin: 768 } as const;

export type Breakpoint = 'compact' | 'regular' | 'wide' | 'tablet';
export type ActionDirection = 'column' | 'row';

export interface ResponsiveMetrics {
  breakpoint: Breakpoint;
  columns: number;
  gutter: number;
}

/** Géométrie responsive de référence, basée uniquement sur la largeur utile. */
export function responsiveMetricsFor(width: number): ResponsiveMetrics {
  const safeWidth = Number.isFinite(width) ? Math.max(0, width) : 0;
  const breakpoint: Breakpoint =
    safeWidth <= BREAKPOINTS.compactMax
      ? 'compact'
      : safeWidth < BREAKPOINTS.wideMin
        ? 'regular'
        : safeWidth < BREAKPOINTS.tabletMin
          ? 'wide'
          : 'tablet';
  const table: Record<Breakpoint, Omit<ResponsiveMetrics, 'breakpoint'>> = {
    compact: { columns: 1, gutter: SPACE[3] },
    regular: { columns: 1, gutter: SPACE[3] },
    wide: { columns: 2, gutter: SPACE[4] },
    tablet: { columns: 3, gutter: SPACE[5] },
  };
  return { breakpoint, ...table[breakpoint] };
}

/** Deux actions ne partagent une rangée que lorsque la largeur est suffisante. */
export function actionDirectionFor(breakpoint: Breakpoint): ActionDirection {
  return breakpoint === 'wide' || breakpoint === 'tablet' ? 'row' : 'column';
}

/** Un seul espacement vertical entre blocs, partagé par AppScreen et SubScreen. */
export function screenContentGap(space: readonly number[]): number {
  const gap = space[2];
  if (typeof gap !== 'number' || !Number.isFinite(gap) || gap < 0) {
    throw new Error('Le jeton d’espacement `space[2]` est requis pour les écrans.');
  }
  return gap;
}
