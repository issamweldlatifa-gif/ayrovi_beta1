/**
 * Système de boutons et filets de section.
 * - Les boutons sont en pastille (radius.cta) ; le mode « quiet » a un contour encre épais.
 * - Le filet entre sections est présent sur l'accueil et utilise la couleur de trait du thème.
 */
import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { Button, BUTTON_OUTLINE_WIDTH } from '@/design/ui';
import { SectionRule, SECTION_RULE_WIDTH } from '@/design/SectionRule';
import { ThemeProvider, useTheme } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

function wrap(node: React.ReactNode) {
  return <PrefsProvider><I18nProvider><ThemeProvider>{node}</ThemeProvider></I18nProvider></PrefsProvider>;
}

function ThemeProbe({ onTheme }: { onTheme: (t: ReturnType<typeof useTheme>) => void }) {
  onTheme(useTheme());
  return null;
}

describe('système de boutons', () => {
  it('le bouton principal et le contour sont en pastille (radius.cta)', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><Button label="Découvrir" onPress={() => {}} tone="quiet" /></>));
    const btn = screen.getByRole('button', { name: 'Découvrir' });
    const style = Array.isArray(btn.props.style) ? Object.assign({}, ...btn.props.style.map((s: unknown) => (typeof s === 'function' ? {} : s))) : btn.props.style;
    expect(theme).not.toBeNull();
    expect(style.borderRadius).toBe(theme!.radius.cta);
    expect(style.borderWidth).toBe(BUTTON_OUTLINE_WIDTH);
    expect(style.borderColor).toBe(theme!.colors.ink);
  });

  it('le bouton plein reste sans contour visible', () => {
    render(wrap(<Button label="Continuer" onPress={() => {}} />));
    const btn = screen.getByRole('button', { name: 'Continuer' });
    const flat = Array.isArray(btn.props.style) ? Object.assign({}, ...btn.props.style.map((s: unknown) => (typeof s === 'function' ? {} : s))) : btn.props.style;
    expect(flat.borderRadius).toBeGreaterThan(100);
  });
});

describe('filet de section', () => {
  it('rend un filet fin à la couleur de trait du thème', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><SectionRule /></>));
    const rule = screen.getByTestId('section-rule');
    expect(rule.props.style.height).toBe(SECTION_RULE_WIDTH);
    expect(rule.props.style.backgroundColor).toBe(theme!.colors.line);
  });
});
