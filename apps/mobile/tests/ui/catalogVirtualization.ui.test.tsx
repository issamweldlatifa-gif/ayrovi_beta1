import { render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import CatalogScreen from '../../app/catalog';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({}), router: { push: jest.fn() } }));
jest.mock('../../src/api/catalog', () => ({ searchCatalog: jest.fn(async () => ({ items: [], total: 0, nextOffset: null, facets: null })), fetchCatalogArrivals: jest.fn(async () => []) }));
jest.mock('../../src/features/catalog/ProductCard', () => ({
  ProductCard: () => require('react').createElement(require('react-native').View, { testID: 'catalog-card' }),
}));
it('mounts only the initial window even with 2000 cached products', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const pages = Array.from({ length: 67 }, (_, page) => ({
    items: Array.from({ length: Math.min(30, 2000 - page * 30) }, (_, i) => ({ id: String(page * 30 + i) })),
    total: 2000, nextOffset: page < 66 ? (page + 1) * 30 : null, facets: null,
  }));
  client.setQueryData(['catalog', 'search', '', '', {}], { pages, pageParams: pages.map((_, page) => page * 30) });
  client.setQueryData(['catalog', 'arrivals'], []);
  const tree = render(<QueryClientProvider client={client}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, bottom: 24, left: 0, right: 0 } }}>
      <PrefsProvider><I18nProvider><ThemeProvider><CatalogScreen /></ThemeProvider></I18nProvider></PrefsProvider>
    </SafeAreaProvider>
  </QueryClientProvider>);
  expect(screen.getAllByTestId('catalog-card').length).toBeLessThanOrEqual(6);
  expect(screen.getAllByTestId('catalog-card').length).toBeGreaterThan(0);
  tree.unmount(); client.clear();
});
