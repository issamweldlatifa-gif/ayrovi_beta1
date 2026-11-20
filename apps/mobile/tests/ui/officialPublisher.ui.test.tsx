import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { FlatList } from 'react-native';
import { router } from 'expo-router';
import PublisherScreen from '../../app/publisher/zayrovi-team';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { searchCatalog, type CatalogProduct, type CatalogSearchPage } from '@/api/catalog';
import { ReelPublisher } from '@/features/reels/ReelPublisher';

let mockArrival: string | undefined;
const mockToggle = jest.fn();
const mockFollow = jest.fn();
let mockSignedIn = false;
jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ arrivalId: mockArrival }), router: { push: jest.fn() } }));
jest.mock('@/design/motion', () => ({ ...jest.requireActual('@/design/motion'), useReduceMotion: () => true }));
jest.mock('@/state/session', () => ({ useSession: () => ({ status: mockSignedIn ? 'signedIn' : 'signedOut' }) }));
jest.mock('@/features/reels/useProductFavorites', () => ({ useProductFavorites: () => ({ isFavorite: () => mockSignedIn, toggle: mockToggle }) }));
jest.mock('@/features/publications/usePublisherFollow', () => ({ usePublisherFollow: (id: string, onAuth: () => void) => ({
  state: 'idle', disabled: false, press: () => mockSignedIn ? mockFollow(id) : onAuth(),
}) }));
jest.mock('@/api/catalog', () => ({ ...jest.requireActual('@/api/catalog'), searchCatalog: jest.fn(), fetchCatalogArrivals: jest.fn(async () => [{ id: 'arr_1', name: 'Arrivage' }]) }));
const item = (id: string): CatalogProduct => ({ id, name: `Produit ${id}`, finalPrice: 25, image: '/media/example.jpg' } as CatalogProduct);
const page = (rows: CatalogProduct[], total = rows.length, nextOffset: number | null = null): CatalogSearchPage => ({
  items: rows, total, nextOffset, facets: null, updatedAt: '2026-11-19T09:44:00.000Z',
});
let client: QueryClient;
beforeEach(() => {
  mockArrival = undefined;
  mockSignedIn = false;
  jest.clearAllMocks();
  jest.mocked(searchCatalog).mockResolvedValue(page([item('p1'), item('p2')]));
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => client.clear());
function mount(node = <PublisherScreen />) {
  return render(<QueryClientProvider client={client}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, bottom: 24, left: 0, right: 0 } }}>
      <PrefsProvider><I18nProvider><ThemeProvider>{node}</ThemeProvider></I18nProvider></PrefsProvider>
    </SafeAreaProvider>
  </QueryClientProvider>);
}
const grid = () => screen.UNSAFE_getByType(FlatList);

it('opens the publisher directly from the Zayrovi Team identity on a Reel', async () => {
  mount(<ReelPublisher onMedia />);
  await act(async () => {});
  fireEvent.press(screen.getByTestId('reel-publisher-avatar', { includeHiddenElements: true }));
  expect(router.push).toHaveBeenCalledWith('/publisher/zayrovi-team');
});

it('displays real collection metadata, toggles 3-column grid/list and opens a product', async () => {
  mount();
  expect(await screen.findByText('2 produits')).toBeTruthy();
  expect(screen.getByText(/^Mis à jour le /)).toBeTruthy();
  expect(grid().props.numColumns).toBe(3);
  fireEvent.press(screen.getByRole('button', { name: 'Vue liste' }));
  expect(grid().props.numColumns).toBe(1);
  expect(screen.getByText('Produit p1')).toBeTruthy();
  fireEvent.press(screen.getByRole('link', { name: 'Produit p1' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: 'p1' } });
});

it('pins the compact toolbar after the cover and preserves position when switching display', async () => {
  mount();
  await screen.findByText('2 produits');
  fireEvent(screen.getByTestId('publisher-cover'), 'layout', { nativeEvent: { layout: { width: 390, height: 380 } } });
  const scroll = (y: number) => fireEvent.scroll(screen.getByTestId('publisher-products'), {
    nativeEvent: { contentOffset: { x: 0, y }, contentSize: { width: 390, height: 1400 }, layoutMeasurement: { width: 390, height: 810 } },
  });
  scroll(350);
  expect(screen.queryByTestId('publisher-compact-header')).toBeNull();
  scroll(410);
  const toolbar = within(screen.getByTestId('publisher-compact-header'));
  expect(toolbar.getByText('Sélection produits')).toBeTruthy();
  expect(toolbar.getByRole('button', { name: 'Partager le profil' })).toBeTruthy();
  expect(toolbar.getByTestId('publisher-compact-follow')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Vue liste' }));
  expect(grid().props.contentOffset).toEqual({ x: 0, y: 410 });
  scroll(0);
  expect(screen.queryByTestId('publisher-compact-header')).toBeNull();
});

it('opens a dismissible info sheet with actual collection and account rules', async () => {
  mount();
  await screen.findByText('2 produits');
  fireEvent.press(screen.getByRole('button', { name: 'À propos de la sélection' }));
  const sheet = within(screen.getByTestId('publisher-info-sheet'));
  expect(sheet.getByText('Comment cette sélection est présentée')).toBeTruthy();
  expect(sheet.getByText(/La liste est la même pour tout le monde/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('publisher-info-close'));
  await waitFor(() => expect(screen.queryByTestId('publisher-info-sheet')).toBeNull(), { timeout: 2000 });
});

it('shows only published price and promo data in list view and opens the standard buy flow', async () => {
  jest.mocked(searchCatalog).mockResolvedValue(page([
    { ...item('deal'), brandName: 'Atelier', category: 'Mode', finalPrice: 25, compareAtPrice: 35, stockStatus: 'AVAILABLE' },
    { ...item('sold'), stockStatus: 'SOLD_OUT', compareAtPrice: 15 },
  ]));
  mount();
  await screen.findByText('2 produits');
  fireEvent.press(screen.getByRole('button', { name: 'Vue liste' }));
  const deal = within(screen.getByTestId('publisher-product-deal'));
  expect(deal.getByText('Atelier')).toBeTruthy();
  expect(deal.getByText('Promo')).toBeTruthy();
  const sold = within(screen.getByTestId('publisher-product-sold'));
  expect(sold.queryByText('Promo')).toBeNull();
  expect(sold.queryByRole('button', { name: 'Ajouter Produit sold au panier' })).toBeNull();
  fireEvent.press(deal.getByRole('button', { name: 'Ajouter Produit deal au panier' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: 'deal', add: '1' } });
});

it('filters the full collection on the server and preserves an incoming arrival ID', async () => {
  mockArrival = 'arr_1';
  mount();
  expect(await screen.findByText('Arrivage')).toBeTruthy();
  fireEvent.press(await screen.findByTestId('publisher-filter'));
  fireEvent.press(await screen.findByText('Stock confirmé', { exact: true }));
  fireEvent.press(screen.getByTestId('catalog-filters-apply'));
  await waitFor(() => expect(searchCatalog).toHaveBeenLastCalledWith({ arrivalId: 'arr_1', available: true, offset: 0 }, expect.anything()));
});

it('paginates with the server cursor and deduplicates overlapping products', async () => {
  jest.mocked(searchCatalog).mockImplementation(async ({ offset }) => offset === 0 ? page([item('p1')], 2, 30) : page([item('p1'), item('p2')], 2));
  mount();
  await screen.findByTestId('publisher-product-p1');
  act(() => grid().props.onEndReached());
  expect(await screen.findByTestId('publisher-product-p2')).toBeTruthy();
  expect(screen.getAllByTestId('publisher-product-p1')).toHaveLength(1);
  expect(searchCatalog).toHaveBeenLastCalledWith({ arrivalId: '', offset: 30 }, expect.anything());
});

it('opens sign-in for guest writes and uses real publisher/product keys when signed in', async () => {
  const guest = mount();
  await screen.findByTestId('publisher-product-p1');
  fireEvent.press(screen.getByRole('button', { name: 'Enregistrer Produit p1' }));
  expect(await screen.findByTestId('publication-auth-sheet')).toBeTruthy();
  expect(mockToggle).not.toHaveBeenCalled();
  guest.unmount();
  mockSignedIn = true;
  mount();
  await screen.findByTestId('publisher-product-p1');
  fireEvent.press(screen.getByRole('button', { name: 'Retirer Produit p1 des favoris' }));
  expect(mockToggle).toHaveBeenCalledWith('p1');
  fireEvent.press(screen.getByTestId('publisher-follow'));
  expect(mockFollow).toHaveBeenCalledWith('pub_zayrovi');
});

it('mounts only an initial window even with 2000 cached products', async () => {
  const pages = Array.from({ length: 67 }, (_, i) => page(
    Array.from({ length: Math.min(30, 2000 - i * 30) }, (_, j) => item(`${i * 30 + j}`)), 2000, i < 66 ? (i + 1) * 30 : null,
  ));
  client.setQueryData(['publisher-products', 'pub_zayrovi', '', {}], { pages, pageParams: pages.map((_, i) => i * 30) });
  mount();
  await act(async () => {});
  expect(screen.getAllByTestId(/^publisher-product-/)).toHaveLength(6);
});
