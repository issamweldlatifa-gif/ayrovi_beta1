/**
 * Contrats responsive des primitives de layout — sans React Native ni appareil.
 */
import { describe, expect, it } from 'vitest';
import {
  actionDirectionFor, responsiveMetricsFor, rowDirectionFor, screenContentGap, startAlignFor,
} from '../src/design/layoutLogic';

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

  it('le miroir RTL ne touche que les rangées larges, jamais la pile mobile', () => {
    // Sans `I18nManager.forceRTL`, RN garde `row` physique en LTR : le miroir
    // doit être explicite, et il ne concerne que l'ordre horizontal.
    expect(actionDirectionFor(responsiveMetricsFor(392).breakpoint, true)).toBe('column');
    expect(actionDirectionFor(responsiveMetricsFor(600).breakpoint, true)).toBe('row-reverse');
    expect(actionDirectionFor(responsiveMetricsFor(768).breakpoint, true)).toBe('row-reverse');
    expect(actionDirectionFor(responsiveMetricsFor(600).breakpoint, false)).toBe('row');
  });

  it('rowDirectionFor garde le premier enfant du côté de la lecture', () => {
    expect(rowDirectionFor(false)).toBe('row');
    expect(rowDirectionFor(true)).toBe('row-reverse');
  });

  it('startAlignFor épingle le début de lecture : gauche en LTR, droite en RTL', () => {
    expect(startAlignFor(false)).toBe('flex-start');
    expect(startAlignFor(true)).toBe('flex-end');
  });

  it('AppScreen et SubScreen partagent le jeton d’espacement de section', () => {
    expect(screenContentGap([4, 8, 12, 16, 24, 32, 48, 64, 96])).toBe(12);
    expect(() => screenContentGap([4, 8])).toThrow('space[2]');
  });
});
