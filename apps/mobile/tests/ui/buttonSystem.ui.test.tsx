/**
 * Système de boutons, champs et filets de section.
 * - Les boutons sont en pastille (radius.cta) ; le mode « quiet » a un contour encre épais.
 * - Marque : `tone="main"` garde le CTA violet hors AYWEBs ; `tone="commerce"` est la variante
 *   jaune, limitée aux actions d'achat AYWEBs ; le bouton par défaut reste plein ENCRE ; le
 *   bouton par défaut est plein ENCRE ; le secondaire est blanc + noir ; champ blanc, contour
 *   gris, contour violet au focus. Le sélecteur segmenté choisi : violet clair + filet violet.
 * - Le filet entre sections est présent sur l'accueil et utilise la couleur de trait du thème.
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Button, BUTTON_OUTLINE_WIDTH, Field, FIELD_FOCUS_WIDTH, Segmented } from '@/design/ui';
import { SectionBreak, sectionBreakHeight } from '@/design/SectionRule';
import { ThemeProvider, useTheme } from '@/design/theme';
import { OPACITY } from '@/design/tokens.mobile';
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
  it('uses the shared heading scale and locks heading/button weights to their roles', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<ThemeProbe onTheme={(t) => { theme = t; }} />));
    expect(theme!.text('display').fontSize).toBe(38);
    expect(theme!.text('h1').fontSize).toBe(32);
    expect(theme!.text('h2').fontSize).toBe(28);
    expect(theme!.text('h3').fontSize).toBe(22);
    expect(theme!.text('h1').fontFamily).toBe(theme!.text('h2').fontFamily);
    expect(theme!.text('h2').fontFamily).toBe(theme!.text('h3').fontFamily);
    expect(theme!.text('button').fontSize).toBe(14);
    expect(theme!.text('button').fontFamily).toBe(theme!.font('semibold'));
    expect(theme!.text('bodyStrong').fontSize).toBe(16);
    expect(theme!.text('captionStrong').fontSize).toBe(12);
    expect(theme!.text('bodyStrong').fontFamily).toBe(theme!.font('semibold'));
    expect(theme!.text('price').fontVariant).toContain('tabular-nums');
  });

  it('le bouton principal et le contour sont en pastille (radius.cta)', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><Button label="Découvrir" onPress={() => {}} tone="quiet" /></>));
    const btn = screen.getByRole('button', { name: 'Découvrir' });
    const style = Array.isArray(btn.props.style) ? Object.assign({}, ...btn.props.style.map((s: unknown) => (typeof s === 'function' ? {} : s))) : btn.props.style;
    expect(theme).not.toBeNull();
    expect(style.borderRadius).toBe(theme!.radius.cta);
    expect(style.borderWidth).toBe(BUTTON_OUTLINE_WIDTH);
    expect(style.borderColor).toBe(theme!.colors.ink);
    const label = StyleSheet.flatten(screen.getByText('Découvrir').props.style);
    expect(label.fontSize).toBe(theme!.text('button').fontSize);
    expect(label.fontFamily).toBe(theme!.text('button').fontFamily);
    expect(label.fontWeight).toBe('normal');
  });

  it('le CTA d’achat (commerce) est le jaune « Za. », avec un libellé encre lisible', () => {
    render(wrap(<Button label="Ajouter au panier" onPress={() => {}} tone="commerce" />));
    const btn = StyleSheet.flatten(screen.getByRole('button', { name: 'Ajouter au panier' }).props.style);
    expect(btn.backgroundColor).toBe('#F2AE00');
    expect(btn.borderColor).toBe('#F2AE00');
    expect(StyleSheet.flatten(screen.getByText('Ajouter au panier').props.style).color).toBe('#0A0A0A');
  });

  it('le bouton plein reste sans contour visible', () => {
    render(wrap(<Button label="Continuer" onPress={() => {}} />));
    const btn = screen.getByRole('button', { name: 'Continuer' });
    const flat = Array.isArray(btn.props.style) ? Object.assign({}, ...btn.props.style.map((s: unknown) => (typeof s === 'function' ? {} : s))) : btn.props.style;
    expect(flat.borderRadius).toBeGreaterThan(100);
  });
});

describe('couleurs de l’identité (encre · blanc · jaune d’achat)', () => {
  it('l’action principale (tone="main") est ENCRE pleine, libellé blanc (18/11 : plus de bleu)', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><Button label="Commander" tone="main" onPress={() => {}} /></>));
    const btn = StyleSheet.flatten(screen.getByRole('button', { name: 'Commander' }).props.style);
    expect(theme!.colors.action).toBe('#0A0A0A');
    expect(btn.backgroundColor).toBe(theme!.colors.action);
    expect(btn.borderColor).toBe(theme!.colors.action);
    expect(StyleSheet.flatten(screen.getByText('Commander').props.style).color).toBe('#FFFFFF');
  });

  it('le bouton par défaut est plein encre (le violet reste rare), libellé blanc', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><Button label="Découvrir" onPress={() => {}} /></>));
    const btn = StyleSheet.flatten(screen.getByRole('button', { name: 'Découvrir' }).props.style);
    expect(btn.backgroundColor).toBe(theme!.colors.ink);
    expect(btn.backgroundColor).toBe('#0A0A0A');
    expect(btn.borderColor).toBe('#0A0A0A');
    expect(StyleSheet.flatten(screen.getByText('Découvrir').props.style).color).toBe('#FFFFFF');
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
    render(wrap(<Button label="Payer" tone="main" onPress={() => {}} disabled />));
    const btn = StyleSheet.flatten(screen.getByRole('button', { name: 'Payer' }).props.style);
    expect(btn.backgroundColor).toBe('#0A0A0A');
    // 27/10/2026 : l'opacité d'un élément désactivé vient de `OPACITY.disabled`
    // (0.4) et non plus d'un 0.5 posé dans le bouton — le stepper du panier,
    // l'option de variante et le bouton disaient trois choses différentes.
    expect(btn.opacity).toBe(OPACITY.disabled);
  });

  it('le champ est blanc, contour gris au repos, contour ENCRE épaissi au focus', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><Field accessibilityLabel="Nom" value="" onChangeText={() => {}} /></>));
    const idle = StyleSheet.flatten(screen.getByLabelText('Nom').props.style);
    expect(idle.backgroundColor).toBe('#FFFFFF');
    expect(idle.borderColor).toBe(theme!.colors.lineControl);
    fireEvent(screen.getByLabelText('Nom'), 'focus');
    const focused = StyleSheet.flatten(screen.getByLabelText('Nom').props.style);
    expect(focused.borderColor).toBe('#0A0A0A');
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

describe('sélecteur segmenté (v4.2.0)', () => {
  it('le segment choisi : fond gris clair, libellé noir en gras, filet encre ; les autres restent neutres', () => {
    render(wrap(
      <Segmented
        options={[{ value: 'shop', label: 'Boutique' }, { value: 'arrival', label: 'Arrivage' }]}
        value="shop"
        onChange={() => {}}
      />,
    ));
    const [chosen, other] = screen.getAllByRole('button');
    const chosenStyle = StyleSheet.flatten(chosen.props.style);
    const otherStyle = StyleSheet.flatten(other.props.style);
    expect(chosenStyle.backgroundColor).toBe('#F2F2F2');
    expect(otherStyle.backgroundColor).toBe('transparent');
    expect(chosen.props.accessibilityState).toMatchObject({ selected: true });
    const label = StyleSheet.flatten(screen.getByText('Boutique').props.style);
    expect(label.color).toBe('#0A0A0A');
    expect(String(label.fontFamily)).toMatch(/Bold/);
    const indicator = StyleSheet.flatten(screen.getByTestId('segment-indicator-shop').props.style);
    expect(indicator.backgroundColor).toBe('#0A0A0A');
    expect(indicator.position).toBe('absolute');
    expect(screen.queryByTestId('segment-indicator-arrival')).toBeNull();
  });
});

describe('respiration de section (15/11 : sans filet)', () => {
  it('sépare par l’espace seul : 16 + espaceur + 16 = 48 dp, sans couleur de trait', () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    render(wrap(<><ThemeProbe onTheme={(t) => { theme = t; }} /><SectionBreak /></>));
    const gap = screen.getByTestId('section-break', { includeHiddenElements: true });
    expect(gap.props.style.height).toBe(sectionBreakHeight(theme!.space));
    expect(gap.props.style.height + 2 * theme!.space[3]).toBe(48);
    expect(gap.props.style.backgroundColor).toBeUndefined();
    expect(screen.queryByTestId('section-rule')).toBeNull();
  });
});


it('gives shared Fields consistent horizontal and vertical breathing room, including focus', () => {
  render(wrap(<Field testID="padded-field" multiline placeholder="Message" />));
  const input = screen.getByTestId('padded-field');
  for (const phase of ['initial', 'focused']) {
    if (phase === 'focused') fireEvent(input, 'focus', { nativeEvent: {} });
    const style = StyleSheet.flatten(input.props.style);
    expect(style.paddingHorizontal + style.borderWidth).toBeCloseTo(12 + StyleSheet.hairlineWidth);
    expect(style.paddingVertical + style.borderWidth).toBeCloseTo(10 + StyleSheet.hairlineWidth);
  }
});
