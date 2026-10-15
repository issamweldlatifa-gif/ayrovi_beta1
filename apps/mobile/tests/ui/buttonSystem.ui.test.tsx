/**
 * Système de boutons, champs et filets de section.
 * - Les boutons sont en pastille (radius.cta) ; le mode « quiet » a un contour encre épais.
 * - Identité 15/10/2026 : bouton principal VIOLET (#571EF6) + libellé blanc ; bouton
 *   secondaire blanc + noir ; champ blanc, contour gris, contour violet au focus.
 * - Le filet entre sections est présent sur l'accueil et utilise la couleur de trait du thème.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button, BUTTON_OUTLINE_WIDTH, Field, FIELD_FOCUS_WIDTH } from '@/design/ui';
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

describe('couleurs de l’identité (violet · blanc · noir)', () => {
  it('le bouton principal est violet plein, libellé blanc', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><Button label="Commander" onPress={() => {}} /></>));
    const btn = StyleSheet.flatten(screen.getByRole('button', { name: 'Commander' }).props.style);
    expect(theme!.colors.action).toBe('#571EF6');
    expect(btn.backgroundColor).toBe(theme!.colors.action);
    expect(btn.borderColor).toBe(theme!.colors.action);
    expect(StyleSheet.flatten(screen.getByText('Commander').props.style).color).toBe('#FFFFFF');
  });

  it('le bouton secondaire est blanc, contour et libellé noirs', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><Button label="Retour" tone="quiet" onPress={() => {}} /></>));
    const btn = StyleSheet.flatten(screen.getByRole('button', { name: 'Retour' }).props.style);
    expect(btn.backgroundColor).toBe(theme!.colors.canvas);
    expect(btn.borderColor).toBe('#0A0A0A');
    expect(StyleSheet.flatten(screen.getByText('Retour').props.style).color).toBe('#0A0A0A');
  });

  it('le bouton désactivé garde sa couleur et baisse son opacité', () => {
    render(wrap(<Button label="Payer" onPress={() => {}} disabled />));
    const btn = StyleSheet.flatten(screen.getByRole('button', { name: 'Payer' }).props.style);
    expect(btn.backgroundColor).toBe('#571EF6');
    expect(btn.opacity).toBe(0.5);
  });

  it('le champ est blanc, contour gris au repos, contour violet épaissi au focus', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><Field accessibilityLabel="Nom" value="" onChangeText={() => {}} /></>));
    const idle = StyleSheet.flatten(screen.getByLabelText('Nom').props.style);
    expect(idle.backgroundColor).toBe('#FFFFFF');
    expect(idle.borderColor).toBe(theme!.colors.lineControl);
    fireEvent(screen.getByLabelText('Nom'), 'focus');
    const focused = StyleSheet.flatten(screen.getByLabelText('Nom').props.style);
    expect(focused.borderColor).toBe('#571EF6');
    expect(focused.borderWidth).toBe(FIELD_FOCUS_WIDTH);
    // La taille extérieure ne bouge pas : le contour épaissi est pris sur le padding.
    expect(focused.paddingHorizontal + focused.borderWidth).toBeCloseTo(idle.paddingHorizontal + idle.borderWidth, 5);
    fireEvent(screen.getByLabelText('Nom'), 'blur');
    expect(StyleSheet.flatten(screen.getByLabelText('Nom').props.style).borderColor).toBe(theme!.colors.lineControl);
  });

  it('un champ non modifiable prend le fond « désactivé »', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><Field accessibilityLabel="Code" value="1234" editable={false} /></>));
    const style = StyleSheet.flatten(screen.getByLabelText('Code').props.style);
    expect(style.backgroundColor).toBe(theme!.colors.disabled);
    expect(style.color).toBe(theme!.colors.muted);
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
