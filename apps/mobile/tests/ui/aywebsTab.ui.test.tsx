// Onglet AYWEBs : il ouvre la page Stores seule (ni collage de lien, ni carte panier).
import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View } from 'react-native';

import type { AyWebsCategory, AyWebsStore } from '@/api/aywebs';
import AyWebsScreen from '../../app/(tabs)/aywebs';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: () => null },
}));
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

describe('onglet AYWEBs — page Stores', () => {
  it('affiche la page Stores (cartes des boutiques) à la place du collage de lien', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-store-store-0')).toBeTruthy(), { timeout: 5000 });
    expect(screen.getByText('Stores')).toBeTruthy();
    expect(screen.queryByTestId('aywebs-analyze')).toBeNull();
    expect(screen.queryByTestId('aywebs-resolve')).toBeNull();
  });

  it('n\'affiche pas la carte panier dans l\'onglet', async () => {
    renderTab();
    await waitFor(() => expect(screen.getByTestId('aywebs-store-store-0')).toBeTruthy(), { timeout: 5000 });
    expect(screen.queryByTestId('aywebs-open-cart')).toBeNull();
    expect(screen.queryByText('Panier d’achat')).toBeNull();
  });
});
