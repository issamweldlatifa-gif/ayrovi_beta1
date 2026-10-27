// Onglet AYWEBs : trois sections, dans l'ordre — catégories, sponsorisé, boutiques.
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import type { AyWebsCategory, AyWebsStore } from '@/api/aywebs';
import AyWebsScreen from '../../app/(tabs)/aywebs';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { MEDIA_RATIO } from '@/design/tokens.mobile';

jest.mock('expo-router', () => {
  const React = jest.requireActual('react');
  return {
    router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
    useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
    useLocalSearchParams: () => ({}),
    useFocusEffect: (effect: () => void | (() => void)) => React.useEffect(effect, [effect]),
    Stack: { Screen: () => null },
  };
});
jest.mock('@/session/session', () => ({ useSessionId: () => 'mob_1234567890123456' }));
jest.mock('@/features/shell/AppHeader', () => ({
  AppHeader: () => null,
}));

const mockCategories: AyWebsCategory[] = [
  { id: 'marketplace', labelFr: 'Marketplace', labelAr: 'Marketplace' },
];
const mockStores: AyWebsStore[] = Array.from({ length: 4 }, (_, i) => ({
  id: `store-${i}`,
  name: `store-${i}`,
  displayName: `Boutique ${i}`,
  country: '',
  currency: '',
  enabled: false,
  captureSupported: false,
  operational: false,
  operationalReason: '',
  adapter: 'generic',
  status: 'planned',
  integrationType: 'URL_REQUEST',
  capabilities: [],
  browserMode: 'external',
  homeUrl: `https://www.store${i}.example`,
  logo: '',
  purchaseMode: '',
  popular: false,
  categories: ['marketplace'],
  description: '',
}));

jest.mock('@/api/aywebs', () => {
  const actual = jest.requireActual('@/api/aywebs');
  return {
    ...actual,
    fetchAyWebsStoreCatalog: jest.fn(async () => ({ stores: mockStores, categories: mockCategories })),
    fetchAyWebsCart: jest.fn(async () => ({ items: [], units: 0, totalTND: 0 })),
  };
});

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
        <PrefsProvider>
          <I18nProvider>
            <ThemeProvider>
              <View style={{ flex: 1 }}>
                <AyWebsScreen />
              </View>
            </ThemeProvider>
          </I18nProvider>
        </PrefsProvider>
      </SafeAreaProvider>
    </QueryClientProvider>,
  );
}

describe('onglet AYWEBs — accueil en trois sections', () => {
  afterEach(() => { jest.clearAllMocks(); });

  it('affiche les catégories, le bloc sponsorisé et les boutiques — sans reprise ni footer promotionnel', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-store-card-store-0')).toBeTruthy(), { timeout: 5000 });

    expect(screen.getByTestId('aywebs-home-content')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-search')).toBeTruthy();

    // 1 — catégories
    expect(screen.getByTestId('aywebs-home-section-categories')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-category-marketplace')).toBeTruthy();

    // 2 — sponsorisé : visuel, titre et bouton contour
    expect(screen.getByTestId('aywebs-home-section-sponsor')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-sponsor-art')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-sponsor-cta')).toBeTruthy();

    // 3 — boutiques : quatre cartes + l'entrée vers la liste complète
    expect(screen.getByTestId('aywebs-home-section-stores')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-all-stores')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();

    // Les anciennes pièces ont quitté la page : trois sections, rien d'autre.
    expect(screen.queryByTestId('aywebs-home-resume')).toBeNull();
    expect(screen.queryByTestId('aywebs-home-promo')).toBeNull();
    expect(screen.queryByTestId('aywebs-analyze')).toBeNull();
    expect(screen.queryByTestId('aywebs-resolve')).toBeNull();
  });

  it('les cartes sont grandes et carrées, en deux colonnes', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-store-card-store-0')).toBeTruthy(), { timeout: 5000 });

    const card = screen.getByTestId('aywebs-home-store-card-store-0');
    expect(StyleSheet.flatten(card.props.style).width).toBe('48%');

    const media = screen.getByTestId('aywebs-home-store-media-store-0');
    const mediaStyle = StyleSheet.flatten(media.props.style);
    expect(mediaStyle.aspectRatio).toBe(MEDIA_RATIO.storeCard);
    expect(mediaStyle.width).toBe('100%');
    // 24 pt de réserve : le logo ne touche jamais le bord, donc jamais rogné.
    expect(mediaStyle.padding).toBe(24);

    const category = screen.getByTestId('aywebs-home-category-marketplace');
    expect(StyleSheet.flatten(category.props.style).width).toBe('48%');
  });

  it('« Toutes les boutiques » mène à la liste complète', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-all-stores')).toBeTruthy(), { timeout: 5000 });
    fireEvent.press(screen.getByTestId('aywebs-home-all-stores'));
    expect(router.push).toHaveBeenCalledWith('/aywebs/stores');
  });

  it('does not add a separate cart card to the home body', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-content')).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByTestId('aywebs-open-cart')).toBeNull();
    expect(screen.queryByText('Panier d’achat')).toBeNull();
  });
});
