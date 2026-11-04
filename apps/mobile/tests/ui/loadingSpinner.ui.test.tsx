/**
 * Cercle d'attente (`LoadingSpinner`) : il doit tourner quand le système n'a PAS demandé
 * moins d'animations. Régression : le test `theme.motion.reduced === 0` était toujours vrai
 * (ce jeton est une durée, 0 ms), donc le cercle restait figé.
 */
import type { ReactNode } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { render, screen } from '@testing-library/react-native';

import { LoadingSpinner } from '../../src/design/LoadingSpinner';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

const wrap = (node: ReactNode) => (
  <PrefsProvider><I18nProvider><ThemeProvider>{node}</ThemeProvider></I18nProvider></PrefsProvider>
);

afterEach(() => {
  jest.restoreAllMocks();
});

describe('LoadingSpinner', () => {
  it('lance la rotation en boucle quand les animations ne sont pas réduites', () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const loop = jest.spyOn(Animated, 'loop');
    render(wrap(<LoadingSpinner testID="spin" />));
    expect(screen.getByTestId('spin', { includeHiddenElements: true })).toBeTruthy();
    expect(loop).toHaveBeenCalled();
  });
});
