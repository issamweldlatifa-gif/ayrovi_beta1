// Onglet AYWEBs : il ouvre la page Stores seule (ni collage de lien, ni carte panier).
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';

import type { AyWebsCategory, AyWebsStore } from '@/api/aywebs';
import AyWebsScreen from '../../app/(tabs)/aywebs';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

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

describe('onglet AYWEBs — accueil', () => {
  it('affiche la recherche, les catégories, la reprise et les magasins sans footer promotionnel', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-store-card-store-0')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByTestId('aywebs-home-content')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-search')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-category-marketplace')).toBeTruthy();
    expect(screen.getByTestId('aywebs-home-resume')).toBeTruthy();
    const storeCard = screen.getByTestId('aywebs-home-store-card-store-0');
    expect(storeCard).toBeTruthy();
    expect(StyleSheet.flatten(storeCard.props.style).width).toBeLessThanOrEqual(280);
    expect(StyleSheet.flatten(screen.getByTestId('aywebs-home-store-media-store-0').props.style).flex).toBe(1);
    expect(screen.queryByTestId('aywebs-home-promo')).toBeNull();
    expect(screen.queryByTestId('aywebs-analyze')).toBeNull();
    expect(screen.queryByTestId('aywebs-resolve')).toBeNull();
  });

  it('does not add a separate cart card to the home body', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-home-content')).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByTestId('aywebs-open-cart')).toBeNull();
    expect(screen.queryByText('Panier d’achat')).toBeNull();
  });
});
