/**
 * Onglets sous le Hero — texte seul, sur fond blanc, sans icône ni cadre.
 *
 * Demande utilisateur (captures) : une rangée de libellés en gras, dans la police
 * principale. Chaque libellé ouvre un écran NATIF de l’application.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { HomeTabs } from '../../src/features/home/HomeTabs';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

jest.mock('expo-router', () => ({
  router: { navigate: jest.fn() },
}));

async function renderTabs(tint?: Parameters<typeof HomeTabs>[0]['tint']) {
  const view = render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <HomeTabs tint={tint} />
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
  // Laisse se terminer le chargement asynchrone des préférences (hors act sinon).
  await act(async () => {});
  return view;
}

describe('HomeTabs', () => {
  beforeEach(() => jest.clearAllMocks());

  it('affiche deux onglets texte, sans icône', async () => {
    await renderTabs();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(2);
    expect(tabs.map(tab => tab.props.accessibilityLabel)).toEqual(['Zayrovi News', 'Social Shopping']);
    // Texte seul : aucune icône Ionicons rendue dans la rangée.
    expect(screen.UNSAFE_queryAllByType(require('@expo/vector-icons/Ionicons').default)).toHaveLength(0);
  });

  it('garde une bande compacte avec un seul séparateur discret', async () => {
    await renderTabs();
    const strip = StyleSheet.flatten(screen.getByTestId('home-tabs').props.style);
    expect(strip.borderTopWidth).toBeUndefined();
    expect(strip.borderBottomWidth).toBe(StyleSheet.hairlineWidth);
    for (const tab of screen.getAllByRole('tab')) {
      expect(StyleSheet.flatten(tab.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('places the Hero tint behind the strip without consuming navigation taps', async () => {
    await renderTabs({ colors: ['#DDEEFF'], tabColors: ['#FFE1B0', '#DDEEFF'], progress: null });
    const tint = screen.getByTestId('home-tabs-hero-tint', { includeHiddenElements: true });
    expect(tint.props.pointerEvents).toBe('none');
    expect(StyleSheet.flatten(tint.props.children[0].props.style).backgroundColor).toBe('#FFE1B0');
    fireEvent.press(screen.getByRole('tab', { name: 'Zayrovi News' }));
    expect(router.navigate).toHaveBeenCalledWith('/zayrovi-news');
  });

  it('chaque onglet ouvre une route de l’application (pas une URL de site)', async () => {
    await renderTabs();
    fireEvent.press(screen.getByRole('tab', { name: 'Social Shopping' }));
    expect(router.navigate).toHaveBeenNthCalledWith(1, { pathname: '/(tabs)/social', params: { filter: 'all' } });
    fireEvent.press(screen.getByRole('tab', { name: 'Zayrovi News' }));
    expect(router.navigate).toHaveBeenNthCalledWith(2, '/zayrovi-news');
  });
});
