/**
 * Contrats responsive des primitives de layout — sans React Native ni appareil.
 */
import { describe, expect, it } from 'vitest';
import { actionDirectionFor, responsiveMetricsFor, screenContentGap } from '../src/design/layoutLogic';

describe('géométrie responsive commune', () => {
  it.each([
    [320, 'compact', 1, 16],
    [392, 'regular', 1, 16],
    [599, 'regular', 1, 16],
    [600, 'wide', 2, 24],
    [768, 'tablet', 3, 32],
  ] as const)('largeur %i → %s, %i colonne(s), gouttière %i', (width, breakpoint, columns, gutter) => {
    expect(responsiveMetricsFor(width)).toEqual({ breakpoint, columns, gutter });
  });

  it('une largeur non mesurable retombe sur le palier le plus compact', () => {
    expect(responsiveMetricsFor(Number.NaN)).toEqual({ breakpoint: 'compact', columns: 1, gutter: 16 });
  });

  it('les groupes d’actions s’empilent sur mobile et ne passent en rangée qu’en espace large', () => {
    expect(actionDirectionFor(responsiveMetricsFor(392).breakpoint)).toBe('column');
    expect(actionDirectionFor(responsiveMetricsFor(599).breakpoint)).toBe('column');
    expect(actionDirectionFor(responsiveMetricsFor(600).breakpoint)).toBe('row');
    expect(actionDirectionFor(responsiveMetricsFor(768).breakpoint)).toBe('row');
  });

  it('AppScreen et SubScreen partagent le jeton d’espacement de section', () => {
    expect(screenContentGap([4, 8, 12, 16, 24, 32, 48, 64, 96])).toBe(12);
    expect(() => screenContentGap([4, 8])).toThrow('space[2]');
  });
});
