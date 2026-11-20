import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import PublicationsScreen from '../../app/publications';
import RetiredPublicationCollection from '../../app/publication-collection/[id]';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { fetchReferencePublications, parseReferencePublicationPage } from '@/api/referencePublications';

jest.mock('expo-router', () => ({ useIsFocused: () => true, Redirect: 'Redirect', router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('@/state/session', () => ({ useSession: () => ({ status: 'signedOut', account: null }) }));
const mockReduce = jest.fn(() => true);
jest.mock('@/design/motion', () => ({ ...jest.requireActual('@/design/motion'), useReduceMotion: () => mockReduce() }));
jest.mock('@/api/referencePublications', () => ({ ...jest.requireActual('@/api/referencePublications'), fetchReferencePublications: jest.fn() }));
const mockPlayer = { play: jest.fn(), pause: jest.fn(), muted: true, addListener: jest.fn(() => ({ remove: jest.fn() })) };
jest.mock('expo-video', () => ({ useVideoPlayer: () => mockPlayer, VideoView: 'VideoView' }));

const product = (id: string) => ({ id, name: `Produit ${id}`, price: 80, image: `/media/${id}.jpg` });
const fixture = (type: 'image' | 'video', width: number, height: number) => parseReferencePublicationPage({ nextCursor: null, items: [{
  id: 'publication_1', title: 'Sélection week-end', subtitle: 'Les nouveautés', channel_id: 'pub_zayrovi', sponsored: type === 'video', sponsor_name: 'Partenaire',
  media_json: [{ type, width, height, url: type === 'video' ? '/media/video.mp4' : '/media/cover.jpg', poster: '/media/cover.jpg' }], products: ['a', 'b', 'c', 'd'].map(product),
}] });

let client: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  mockReduce.mockReturnValue(true);
  (AppState as unknown as { currentState: string }).currentState = 'active';
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => client.clear());
const mount = () => render(<QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider><PublicationsScreen /></ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>);

it('keeps the white safe-area header and shows the empty state when no publication is live', async () => {
  jest.mocked(fetchReferencePublications).mockResolvedValueOnce({ items: [], nextCursor: null });
  mount();
  expect(await screen.findByText('Aucune publication pour le moment.')).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByTestId('publication-page').props.style)).toMatchObject({ paddingTop: 24, paddingBottom: 16 });
  expect(StyleSheet.flatten(screen.getByTestId('publication-header-bar').props.style).backgroundColor).toBe('#FFFFFF');
  expect(screen.queryByTestId('publication-blocks')).toBeNull();
});

it.each([
  ['image-cover', 'image', 600, 600], ['image-panoramic', 'image', 1200, 600],
  ['video-inset', 'video', 600, 1000], ['video-panoramic', 'video', 1200, 600],
] as const)('renders %s with consistent media/rail/caption order and a matching final Voir plus tile', async (layout, type, width, height) => {
  jest.mocked(fetchReferencePublications).mockResolvedValueOnce(fixture(type, width, height));
  mount();
  const media = await screen.findByTestId(`reference-media-${layout}`);
  const m = StyleSheet.flatten(media.props.style);
  expect(m.width / m.height).toBeCloseTo(layout === 'image-cover' ? 658 / 634 : 658 / 318);
  const rail = screen.getByTestId('reference-products-publication_1');
  const products = within(rail).getAllByTestId('reference-product-tile');
  const last = within(rail).getByTestId('reference-more-tile');
  const { width: railWidth, height: railHeight } = StyleSheet.flatten(last.props.style);
  expect(StyleSheet.flatten(products[0]?.props.style)).toMatchObject({ width: railWidth, height: railHeight });
  expect(products).toHaveLength(4);
  expect(within(screen.getByTestId('reference-publication-caption')).getByText('Sélection week-end')).toBeTruthy();
  expect(Boolean(screen.queryByTestId('reference-video-play'))).toBe(type === 'video');
  expect(Boolean(screen.queryByText('Sponsorisé'))).toBe(type === 'video');
  fireEvent.press(last);
  const sheet = within(screen.getByTestId('reference-publication-sheet-details'));
  expect(sheet.getAllByRole('link')).toHaveLength(4);
  fireEvent.press(sheet.getByRole('link', { name: 'Produit b' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: 'b' } });
});

it('plays only the active video, starts muted and honors pause and deselection', async () => {
  mockReduce.mockReturnValue(false);
  const data = fixture('video', 500, 900);
  jest.mocked(fetchReferencePublications).mockResolvedValueOnce(data);
  mount();
  await screen.findByTestId('reference-video-play');
  const feed = screen.UNSAFE_getByType(FlatList);
  expect(mockPlayer.play).not.toHaveBeenCalled();
  act(() => feed.props.onViewableItemsChanged({ viewableItems: [{ item: data.items[0], isViewable: true }] }));
  expect(mockPlayer.play).toHaveBeenCalledTimes(1);
  expect(mockPlayer.muted).toBe(true);
  fireEvent.press(screen.getByTestId('reference-video-mute'));
  expect(mockPlayer.muted).toBe(false);
  fireEvent.press(screen.getByTestId('reference-video-play'));
  expect(mockPlayer.pause).toHaveBeenCalled();
  act(() => feed.props.onViewableItemsChanged({ viewableItems: [] }));
  expect(screen.getByTestId('reference-video-play').props.accessibilityLabel).toBe('Lire');
});

it('continues to redirect bookmarks to the retired block collection', () => {
  expect(RetiredPublicationCollection().props.href).toBe('/publications');
});

const campaign = (layout: string) => parseReferencePublicationPage({ nextCursor: null, items: [{
  id: 'color_campaign', template_id: layout, title: 'Une sélection', subtitle: 'Chaque effort compte.',
  channel_id: 'pub_zayrovi', sponsored: 1, sponsor_name: 'Partenaire', action_label: 'BlackFriday',
  products: [{ ...product('a'), brand: 'Atelier', compareAtPrice: 120 }, { ...product('b'), brand: 'Maison' }],
}] });

it.each([
  ['campaign_orange', '#F2631F', '#F6A178'], ['campaign_red', '#DB2436', '#831520'],
])('renders %s with the measured panels, portrait photos, honest badges and a working publisher follow', async (layout, headline, body) => {
  jest.mocked(fetchReferencePublications).mockResolvedValueOnce(campaign(layout));
  mount();
  expect(await screen.findByTestId(layout)).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByTestId('publication-campaign-headline').props.style).backgroundColor).toBe(headline);
  expect(StyleSheet.flatten(screen.getByTestId('publication-campaign-body').props.style).backgroundColor).toBe(body);
  const photo = StyleSheet.flatten(screen.getAllByTestId('publication-campaign-photo')[0]?.props.style);
  expect(photo.width / photo.height).toBeCloseTo(298 / 430);
  const deal = within(screen.getByTestId('publication-campaign-product-a'));
  expect(deal.getByText('Promo')).toBeTruthy();
  expect(deal.getByText('120.00 TND')).toBeTruthy();
  expect(within(screen.getByTestId('publication-campaign-product-b')).queryByText('Promo')).toBeNull();
  fireEvent.press(screen.getByTestId('publication-campaign-follow'));
  expect(await screen.findByTestId('publication-auth-sheet')).toBeTruthy();
});

it('uses the campaign toolbar for search, favorites and cart and filters only linked products', async () => {
  jest.mocked(fetchReferencePublications).mockResolvedValueOnce(campaign('campaign_orange'));
  mount();
  const header = within(await screen.findByTestId('publication-campaign-header'));
  fireEvent.press(header.getByRole('button', { name: 'Mes favoris' }));
  expect(router.push).toHaveBeenLastCalledWith('/account/favorites');
  fireEvent.press(header.getByRole('button', { name: 'Panier' }));
  expect(router.push).toHaveBeenLastCalledWith('/(tabs)/cart');
  fireEvent.press(header.getByRole('button', { name: 'Rechercher un article' }));
  const search = await screen.findByTestId('publication-campaign-search');
  fireEvent.changeText(search, 'Maison');
  expect(screen.queryByTestId('publication-campaign-product-a')).toBeNull();
  expect(screen.getByTestId('publication-campaign-product-b')).toBeTruthy();
  fireEvent.changeText(search, '');
  fireEvent.press(screen.getByTestId('publication-campaign-filters'));
  fireEvent.press(screen.getByRole('button', { name: 'Promo' }));
  expect(screen.getByTestId('publication-campaign-product-a')).toBeTruthy();
  expect(screen.queryByTestId('publication-campaign-product-b')).toBeNull();
});
