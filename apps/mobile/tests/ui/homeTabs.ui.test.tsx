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
  router: { push: jest.fn() },
}));

async function renderTabs() {
  const view = render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <HomeTabs />
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

  it('affiche trois onglets texte, sans icône', async () => {
    await renderTabs();
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    // Texte seul : aucune icône Ionicons rendue dans la rangée.
    expect(screen.UNSAFE_queryAllByType(require('@expo/vector-icons/Ionicons').default)).toHaveLength(0);
  });

  it('garde une bande compacte, bordée et un soulignement fin', async () => {
    await renderTabs();
    const strip = StyleSheet.flatten(screen.getByTestId('home-tabs').props.style);
    expect(strip.borderTopWidth).toBe(1);
    expect(strip.borderBottomWidth).toBe(1);
    expect(StyleSheet.flatten(screen.getByTestId('home-tab-underline').props.style).height).toBe(1);
    for (const tab of screen.getAllByRole('tab')) {
      expect(StyleSheet.flatten(tab.props.style).minHeight).toBeGreaterThanOrEqual(44);
    }
  });

  it('chaque onglet ouvre une route de l’application (pas une URL de site)', async () => {
    await renderTabs();
    fireEvent.press(screen.getByRole('tab', { name: 'Nouveautés' }));
    fireEvent.press(screen.getByRole('tab', { name: 'Promotions' }));
    fireEvent.press(screen.getByRole('tab', { name: 'Magazine' }));
    expect(router.push).toHaveBeenNthCalledWith(1, '/catalog');
    expect(router.push).toHaveBeenNthCalledWith(2, '/promotions');
    expect(router.push).toHaveBeenNthCalledWith(3, '/publications');
  });
});
