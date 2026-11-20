import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppState, Dimensions, FlatList, StyleSheet } from 'react-native';
import { fetchFavorites } from '@/api/account';
import { fetchPublisherFollow, followPublisher } from '@/api/publisherFollow';
import { PublicationLookScreen } from '@/features/publications/PublicationLookScreen';
import { router } from 'expo-router';
import PublicationsScreen from '../../app/publications';
import RetiredPublicationCollection from '../../app/publication-collection/[id]';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { fetchReferencePublications, fetchPublicationLook, savePublicationLook, parseReferencePublicationPage, publicationLookKey } from '@/api/referencePublications';

jest.mock('expo-router', () => ({ useIsFocused: () => true, Redirect: 'Redirect', router: { push: jest.fn(), canGoBack: () => true, back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
const mockSession = jest.fn((): { status: string; account: { id: string } | null } => ({ status: 'signedOut', account: null }));
jest.mock('@/state/session', () => ({ useSession: () => mockSession() }));
const mockReduce = jest.fn(() => true);
jest.mock('@/design/motion', () => ({ ...jest.requireActual('@/design/motion'), useReduceMotion: () => mockReduce() }));
jest.mock('@/api/account', () => ({ ...jest.requireActual('@/api/account'), fetchFavorites: jest.fn() }));
jest.mock('@/api/publisherFollow');
jest.mock('@/api/referencePublications', () => ({ ...jest.requireActual('@/api/referencePublications'), fetchReferencePublications: jest.fn(), fetchPublicationLook: jest.fn(), savePublicationLook: jest.fn() }));
const mockPlayer = { play: jest.fn(), pause: jest.fn(), muted: true, currentTime: 0, duration: 20, status: 'readyToPlay', videoTrack: { size: { width: 720, height: 1280 } }, playbackRate: 1, addListener: jest.fn(() => ({ remove: jest.fn() })) };
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
  mockSession.mockReturnValue({ status: 'signedOut', account: null });
  mockPlayer.currentTime = 0;
  (AppState as unknown as { currentState: string }).currentState = 'active';
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
});
afterEach(() => client.clear());
const mount = (screen = <PublicationsScreen />) => render(<QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider>{screen}</ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>);

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
  fireEvent.press(within(rail).getByRole('link', { name: 'Produit b' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'b' } });
  if (type === 'image') {
    fireEvent.press(screen.getByTestId('reference-photo-open'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/publication-look/[id]', params: { id: 'publication_1' } });
    expect(screen.queryByTestId('reference-video-fullscreen')).toBeNull();
  } else {
    fireEvent.press(screen.getByTestId('reference-video-fullscreen'));
    expect(screen.getByTestId('publication-fullscreen-player')).toBeTruthy();
    fireEvent.press(screen.getByTestId('publication-player-exit'));
  }
  fireEvent.press(last);
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/publication-look/[id]', params: { id: 'publication_1', ...(type === 'image' ? { view: 'collection' } : {}) } });
  expect(screen.queryByTestId('reference-publication-sheet-details')).toBeNull();
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
  const regular = within(screen.getByTestId('publication-campaign-product-b'));
  expect(regular.queryByText('Promo')).toBeNull();
  fireEvent.press(regular.getByRole('link', { name: 'Produit b' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'b' } });
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


it('keeps the three entry points of the first video template independent', async () => {
  jest.mocked(fetchReferencePublications).mockResolvedValueOnce(fixture('video', 500, 900));
  mount();
  fireEvent.press(await screen.findByTestId('reference-video-fullscreen'));
  const player = within(screen.getByTestId('publication-fullscreen-player'));
  expect(router.push).not.toHaveBeenCalled();
  fireEvent.press(player.getByTestId('publication-player-play'));
  expect(mockPlayer.pause).toHaveBeenCalled();
  fireEvent.press(player.getByTestId('publication-player-mute'));
  expect(mockPlayer.muted).toBe(false);
  act(() => player.getByTestId('publication-player-seek').props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
  expect(mockPlayer.currentTime).toBe(5);
  fireEvent.press(player.getByTestId('publication-player-settings'));
  expect(player.getByText('720p')).toBeTruthy();
  fireEvent.press(player.getByText('Qualité'));
  expect(player.getByText('Automatique · 720p')).toBeTruthy();
  fireEvent.press(player.getByTestId('publication-player-speed'));
  fireEvent.press(player.getByRole('button', { name: '1.5×' }));
  expect(mockPlayer.playbackRate).toBe(1.5);
  fireEvent.press(player.getByTestId('publication-player-hide'));
  expect(player.queryByTestId('publication-player-play')).toBeNull();
  fireEvent.press(player.getByTestId('publication-player-surface'));
  fireEvent.press(player.getByTestId('publication-player-exit'));
  expect(screen.queryByTestId('publication-fullscreen-player')).toBeNull();
  fireEvent.press(screen.getByRole('link', { name: 'Produit a' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'a' } });
  fireEvent.press(screen.getByTestId('reference-more-tile'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/publication-look/[id]', params: { id: 'publication_1' } });
  expect(client.getQueryData(publicationLookKey('guest', 'publication_1'))).toMatchObject({ id: 'publication_1' });
});

it('renders the look as a full page with the original video above the real linked product rows', async () => {
  jest.mocked(fetchPublicationLook).mockResolvedValueOnce(fixture('video', 500, 900).items[0]!);
  mount(<PublicationLookScreen id="publication_1" />);
  const hero = await screen.findByTestId('publication-look-hero');
  expect(StyleSheet.flatten(hero.props.style).height).toBeGreaterThan(500);
  fireEvent.press(within(hero).getByTestId('publication-look-video'));
  expect(screen.getByTestId('publication-fullscreen-player')).toBeTruthy();
  fireEvent.press(screen.getByTestId('publication-player-exit'));
  expect(screen.getByRole('header', { name: 'Adoptez le look' })).toBeTruthy();
  expect(screen.getAllByText('80.00 TND')).toHaveLength(4);
  fireEvent.press(screen.getByRole('link', { name: 'Produit b' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'b' } });
  fireEvent.press(screen.getByTestId('publication-look-save'));
  expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
  expect(savePublicationLook).not.toHaveBeenCalled();
});

it('reports an unpublished look as unavailable instead of showing an unrelated post', async () => {
  jest.mocked(fetchPublicationLook).mockResolvedValueOnce(null);
  mount(<PublicationLookScreen id="publication_1" />);
  expect(await screen.findByText('Ce look n’est plus disponible.')).toBeTruthy();
  expect(screen.queryByTestId('publication-look-video')).toBeNull();
  fireEvent.press(screen.getByTestId('publication-look-back'));
  expect(router.back).toHaveBeenCalledTimes(1);
});


it('writes look saves and publisher follows through their existing account APIs', async () => {
  mockSession.mockReturnValue({ status: 'signedIn', account: { id: 'owner' } });
  jest.mocked(fetchPublicationLook).mockResolvedValueOnce(fixture('video', 500, 900).items[0]!);
  jest.mocked(fetchFavorites).mockResolvedValueOnce([]);
  jest.mocked(fetchPublisherFollow).mockResolvedValueOnce({ following: false });
  jest.mocked(followPublisher).mockResolvedValueOnce({ following: true });
  jest.mocked(savePublicationLook).mockResolvedValueOnce(true);
  mount(<PublicationLookScreen id="publication_1" />);
  await waitFor(() => expect(screen.getByTestId('publication-look-follow')).toBeEnabled());
  fireEvent.press(screen.getByTestId('publication-look-follow'));
  await waitFor(() => expect(followPublisher).toHaveBeenCalledWith('pub_zayrovi', true));
  const save = await screen.findByTestId('publication-look-save');
  fireEvent.press(save);
  expect(await screen.findByRole('button', { name: 'Retirer ce look des favoris' })).toBeTruthy();
  expect(savePublicationLook).toHaveBeenCalledWith('publication_1', true);
  expect(client.getQueryData(publicationLookKey('owner', 'publication_1'))).toMatchObject({ saved: true });
  expect(client.getQueryData(publicationLookKey('guest', 'publication_1'))).toBeUndefined();
});


it.each([false, true])('uses the same authored photo and linked products in the %s collection mode', async collection => {
  const detail = fixture('image', 600, 600).items[0]!;
  detail.products[0] = { ...detail.products[0]!, brand: 'Atelier', compareAtPrice: 100, isNew: true };
  jest.mocked(fetchPublicationLook).mockResolvedValueOnce(detail);
  mount(<PublicationLookScreen id="publication_1" collection={collection} />);
  const hero = await screen.findByTestId(collection ? 'publication-collection-hero' : 'publication-look-hero');
  const productList = screen.getByTestId(collection ? 'publication-collection-products' : 'publication-look-products');
  expect(screen.UNSAFE_getByType(FlatList).props.numColumns).toBe(collection ? 2 : 1);
  expect(screen.queryByTestId('publication-look-video')).toBeNull();
  expect(screen.getByRole('header', { name: 'Sélection week-end' })).toBeTruthy();
  expect(screen.getByText('Zayrovi Team')).toBeTruthy();
  expect(screen.getByTestId('publication-look-follow')).toBeTruthy();
  const width = Math.min(Dimensions.get('window').width, 600);
  expect(StyleSheet.flatten(hero.props.style).height).toBeCloseTo(collection ? (width - 24) * 318 / 658 : width * 1107 / 720);
  const row = within(screen.getByTestId('publication-look-product-a'));
  expect(row.getByText('Atelier')).toBeTruthy();
  expect(row.getByText('100.00 TND')).toBeTruthy();
  expect(row.queryByText('Nouveau') !== null).toBe(collection);
  expect(within(screen.getByTestId('publication-look-product-b')).queryByText('Prix de référence :')).toBeNull();
  fireEvent.press(row.getByRole('link', { name: 'Produit a' }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'a' } });
  if (collection) {
    fireEvent.press(screen.getByTestId('publication-collection-discover'));
    expect(router.push).toHaveBeenLastCalledWith({ pathname: '/publication-look/[id]', params: { id: 'publication_1' } });
  }
  fireEvent.scroll(productList, { nativeEvent: { contentOffset: { x: 0, y: 1000 }, contentSize: { width: 400, height: 1600 }, layoutMeasurement: { width: 400, height: 600 } } });
  expect(screen.getByTestId('publication-look-top')).toBeTruthy();
});
