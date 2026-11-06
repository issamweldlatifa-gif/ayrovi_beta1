import { AppState, FlatList } from 'react-native';
import { PublicationProductPreview } from '@/features/publications/PublicationProductPreview';
import { PublicationMedia } from '@/features/publications/PublicationMedia';
import { DEFAULT_PUBLICATION_FEED_SETTINGS } from '../../../../shared/publicationFeed';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { PublicationFeedScreen } from '@/features/publications/PublicationFeedScreen';
import { PublicationCard } from '@/features/publications/PublicationCard';
import type { FeedPost } from '@/api/publicationFeed';

const mockSession = { status: 'signedIn', account: { id: 'ui-owner' } };
const mockCartAdd = jest.fn();
jest.mock('@/api/cart', () => ({ ...jest.requireActual('@/api/cart'), addCatalogToCart: (...args: unknown[]) => mockCartAdd(...args) }));
const mockPlayer = { play: jest.fn(), pause: jest.fn(), muted: true, addListener: jest.fn(() => ({ remove: jest.fn() })) };
const mockPreference = jest.fn(); const mockFollow = jest.fn();
const mockInvalidate = jest.fn();
const mockSend = jest.fn();
jest.mock('@/api/publicationFeed', () => ({ ...jest.requireActual('@/api/publicationFeed'), writePublicationPreference: (...args: unknown[]) => mockPreference(...args), followPublisher: (...args: unknown[]) => mockFollow(...args) }));
jest.mock('expo-video', () => ({ useVideoPlayer: () => mockPlayer, VideoView: 'VideoView' }));
const mockQuery = jest.fn();
const mockSettingsQuery = jest.fn();
const mockSetQueries = jest.fn();
const mockRefetch = jest.fn();
const mockFetchNext = jest.fn();
const mockRouter = { push: jest.fn(), setParams: jest.fn(), canGoBack: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouter.push(...args), setParams: (...args: unknown[]) => mockRouter.setParams(...args), canGoBack: () => mockRouter.canGoBack(), replace: (...args: unknown[]) => mockRouter.replace(...args), back: () => mockRouter.back() }, useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@tanstack/react-query', () => ({ useQuery: () => mockSettingsQuery(), useInfiniteQuery: (...args: unknown[]) => mockQuery(...args), useQueryClient: () => ({ setQueriesData: mockSetQueries, invalidateQueries: mockInvalidate }) }));
jest.mock('@/state/session', () => ({ useSession: () => mockSession }));
jest.mock('@/session/session', () => ({ useSessionId: () => 'ui-guest-session' }));
jest.mock('@/api/social', () => ({ sendInteraction: (...args: unknown[]) => mockSend(...args) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/features/social/Comments', () => ({ Comments: () => { const { Text } = require('react-native'); return <Text>Real Comments component slot</Text>; } }));
jest.mock('@/design/appImage', () => ({ AppImage: (props: any) => { const { View } = require('react-native'); return <View {...props} />; } }));
const post: FeedPost = { id: 'ui-post', title: 'Inspiration réelle', subtitle: 'Texte éditorial', imageUrl: '/photo.jpg', publishAt: '', channelId: 'official', channelName: 'ZAYROVI Official', category: 'beauty', generated: true, liked: false, likes: 2, comments: 1, product: null, products: [] };
const feed = { data: { pages: [{ items: [post], nextCursor: null }] }, isPending: false, isError: false, isFetching: false, isRefetching: false, isFetchingNextPage: false, isFetchNextPageError: false, hasNextPage: false, refetch: mockRefetch, fetchNextPage: mockFetchNext };
async function mount(child = <PublicationFeedScreen />) {
  const result = render(<PrefsProvider><I18nProvider><ThemeProvider>{child}</ThemeProvider></I18nProvider></PrefsProvider>);
  await act(async () => {}); return result;
}
beforeEach(() => { jest.clearAllMocks(); mockPreference.mockResolvedValue({}); mockFollow.mockResolvedValue({}); mockSession.status = 'signedIn'; mockSession.account.id = `owner-${Math.random()}`; mockQuery.mockReturnValue(feed); mockSettingsQuery.mockReturnValue({ data: DEFAULT_PUBLICATION_FEED_SETTINGS, isPending: false, isError: false, refetch: jest.fn() }); });

describe('Publication Phase 1 UI', () => {
  it('renders actual content and save without exposing internal provenance or fake products', async () => {
    await mount();
    expect(screen.getByTestId('publication-feed-list')).toBeTruthy();
    expect(screen.getByText('Inspiration réelle')).toBeTruthy();
    expect(screen.queryByText('Création visuelle IA')).toBeNull();
    expect(screen.queryByText('Voir les produits')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).not.toBeDisabled();
  });
  it('renders CRM title and ordered visible categories and applies the compact layout', async () => {
    mockSettingsQuery.mockReturnValue({ data: { ...DEFAULT_PUBLICATION_FEED_SETTINGS, titleFr: 'Découvrir ZAYROVI', layout: 'compact', categories: [...DEFAULT_PUBLICATION_FEED_SETTINGS.categories].reverse().map(c => ({ ...c, enabled: c.key !== 'beauty' })) }, isPending: false, isError: false });
    await mount();
    expect(screen.getByText('Découvrir ZAYROVI')).toBeTruthy();
    expect(screen.queryByTestId('publication-category-beauty')).toBeNull();
    expect(screen.getByTestId('publication-media-ui-post')).toHaveStyle({ aspectRatio: 4 / 5 });
  });
  it('shows a clear CMS-disabled state instead of cached posts', async () => {
    mockSettingsQuery.mockReturnValue({ data: { ...DEFAULT_PUBLICATION_FEED_SETTINGS, enabled: false }, isPending: false, isError: false });
    await mount();
    expect(screen.queryByText('Inspiration réelle')).toBeNull();
    expect(screen.getByText('Les publications sont temporairement indisponibles.')).toBeTruthy();
    expect(mockQuery.mock.calls.at(-1)?.[0].enabled).toBe(false);
  });
  it('changes the actual query category and opens the comments sheet', async () => {
    await mount(); fireEvent.press(screen.getByTestId('publication-category-beauty'));
    expect(mockQuery.mock.calls.at(-1)?.[0].queryKey).toContain('beauty');
    fireEvent.press(screen.getByRole('button', { name: 'Commentaires' }));
    expect(screen.getByText('Real Comments component slot')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Fermer' }));
    expect(mockRefetch).toHaveBeenCalled();
  });
  it('does not permit guest likes and offers the existing sign-in route', async () => {
    mockSession.status = 'signedOut'; await mount();
    expect(screen.getByTestId('publication-like-ui-post')).not.toBeDisabled();
    fireEvent.press(screen.getByTestId('publication-like-ui-post'));
    expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
    expect(mockRouter.push).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Se connecter' }));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in'); expect(mockSend).not.toHaveBeenCalled();
  });
  it('gates guest comments, save, follow and share with the branded sheet, without writes', async () => {
    mockSession.status = 'signedOut'; await mount();
    for (const name of ['Commentaires', 'Enregistrer', 'Suivre cet éditeur', 'Partager']) {
      fireEvent.press(screen.getByRole('button', { name }));
      expect(screen.getByTestId('publication-auth-sheet')).toBeTruthy();
      fireEvent.press(screen.getByRole('button', { name: 'Continuer à découvrir' }));
    }
    expect(mockSend).not.toHaveBeenCalled(); expect(mockPreference).not.toHaveBeenCalled(); expect(mockFollow).not.toHaveBeenCalled();
  });
  it('opens media-only black gallery without a visible header and closes via accessibility escape', async () => {
    await mount(); fireEvent.press(screen.getByText('Inspiration réelle'));
    const frame = within(screen.getByTestId('publication-reader')).getByTestId('publication-media-ui-post');
    fireEvent(frame, 'layout', { nativeEvent: { layout: { width: 360, height: 450 } } });
    fireEvent.press(within(screen.getByTestId('publication-reader')).getByRole('button', { name: 'Inspiration réelle' }));
    expect(screen.getByTestId('publication-lightbox')).toBeTruthy();
    expect(within(screen.getByTestId('publication-reader')).queryByText('Publication')).toBeNull();
    expect(within(screen.getByTestId('publication-lightbox')).queryByText('Texte éditorial')).toBeNull();
    act(() => screen.getByTestId('publication-lightbox-gesture').props.onAccessibilityEscape());
    expect(screen.queryByTestId('publication-lightbox')).toBeNull();
    expect(screen.getByTestId('publication-reader')).toBeTruthy();
  });
  it('optimistically likes, blocks duplicate taps, and rolls back a failed write', async () => {
    let reject!: (error: Error) => void;
    mockSend.mockReturnValue(new Promise((_, fail) => { reject = fail; }));
    await mount(<PublicationCard post={post} compact={false} onComments={() => undefined} onReaction={() => undefined} />);
    fireEvent.press(screen.getByTestId('publication-like-ui-post'));
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByTestId('publication-like-ui-post')).toBeDisabled();
    await act(async () => { reject(new Error('offline')); });
    await waitFor(() => expect(screen.getByText('2')).toBeTruthy());
    expect(screen.getByText('J’aime non enregistré. Réessayez.')).toBeTruthy();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
  it('uses confirmed server counts and updates cached feed state', async () => {
    const reaction = jest.fn(); mockSend.mockResolvedValue({ liked: true, likesCount: 9 });
    await mount(<PublicationCard post={post} compact={true} onComments={() => undefined} onReaction={reaction} />);
    fireEvent.press(screen.getByTestId('publication-like-ui-post'));
    await waitFor(() => expect(screen.getByText('9')).toBeTruthy());
    expect(reaction).toHaveBeenCalledWith('ui-post', true, 9);
  });
  it('persists save and follow through the authenticated API rather than cosmetic toggles', async () => {
    await mount();
    fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() => expect(mockPreference).toHaveBeenCalledWith('ui-post', { saved: true }));
    expect(screen.getByRole('button', { name: 'Retirer des enregistrements' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Options de la publication' }));
    fireEvent.press(screen.getByText('Suivre cet éditeur'));
    await waitFor(() => expect(mockFollow).toHaveBeenCalledWith('official', true));
  });
  it('opens and closes the existing-publication viewer', async () => {
    await mount(); fireEvent.press(screen.getByText('Inspiration réelle'));
    expect(screen.getByTestId('publication-reader')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Fermer la publication' })).toBeNull();
    expect(within(screen.getByTestId('publication-reader')).queryByText('Publication')).toBeNull();
    act(() => screen.getByTestId('publication-reader-gesture').props.onAccessibilityEscape());
    expect(screen.queryByTestId('publication-reader')).toBeNull();
  });
  it('expands real long description and renders genuine sponsored and verified metadata', async () => {
    const content = { type: 'editorial' as const, media: [], description: 'Long description '.repeat(30), descriptionPosition: 'above' as const, sponsored: true, sponsorName: 'ZAYROVI', audience: '', topic: '' };
    await mount(<PublicationCard post={{ ...post, content, publisherOfficial: true }} compact={false} onComments={() => undefined} onReaction={() => undefined} />);
    expect(screen.getByText('Sponsorisé · ZAYROVI')).toBeTruthy();
    expect(screen.getByLabelText('Éditeur officiel vérifié')).toBeTruthy();
    fireEvent.press(screen.getByText('Voir plus'));
    expect(screen.getByText('Voir moins')).toBeTruthy();
  });

  it('gives media a measured nonzero height and updates the actual swipe counter', async () => {
    const media = [{ type: 'image' as const, url: '/a.jpg', poster: '', alt: 'Photo A' }, { type: 'image' as const, url: '/b.jpg', poster: '', alt: 'Photo B' }];
    const content = { type: 'carousel' as const, media, description: '', descriptionPosition: 'below' as const, sponsored: false, sponsorName: '', audience: '', topic: '' };
    await mount(<PublicationMedia post={{ ...post, content }} />);
    fireEvent(screen.getByTestId('publication-media-ui-post'), 'layout', { nativeEvent: { layout: { width: 360, height: 450 } } });
    expect(screen.getByText('1/2')).toBeTruthy();
    expect(screen.UNSAFE_getByType(FlatList).props.renderItem({ item: media[0], index: 0 }).props.style).toEqual({ width: 360, height: 450 });
    fireEvent(screen.UNSAFE_getByType(FlatList), 'momentumScrollEnd', { nativeEvent: { contentOffset: { x: 360 } } });
    expect(screen.getByText('2/2')).toBeTruthy();
  });
  it('lets carousel thumbnails select the real slide and preserves its counter', async () => {
    const media = [{ type: 'image' as const, url: '/a.jpg', poster: '', alt: 'Photo A' }, { type: 'image' as const, url: '/b.jpg', poster: '', alt: 'Photo B' }];
    const content = { type: 'carousel' as const, template: 'carousel' as const, media, description: '', descriptionPosition: 'below' as const, sponsored: false, sponsorName: '', audience: '', topic: '' };
    await mount(<PublicationMedia post={{ ...post, content }} thumbnails />);
    fireEvent(screen.getByTestId('publication-media-ui-post'), 'layout', { nativeEvent: { layout: { width: 360, height: 450 } } });
    fireEvent.press(screen.getByTestId('publication-thumbnail-ui-post-1'));
    expect(screen.getByText('2/2')).toBeTruthy();
    expect(screen.getByTestId('publication-thumbnail-ui-post-1').props.accessibilityState).toMatchObject({ selected: true });
  });
  it('keeps authored CTA interactive in the split template instead of baking it into an image', async () => {
    const open = jest.fn();
    const content = { type: 'image' as const, template: 'split' as const, actionLabel: 'Découvrir', actionTarget: 'detail' as const, media: [], description: 'Design du quotidien', descriptionPosition: 'below' as const, sponsored: false, sponsorName: '', audience: '', topic: '' };
    await mount(<PublicationCard post={{ ...post, content }} compact={false} onOpen={open} onComments={() => undefined} onReaction={() => undefined} />);
    fireEvent.press(screen.getByRole('button', { name: 'Découvrir' })); expect(open).toHaveBeenCalledTimes(1);
  });
  it('starts muted and pauses the actual player when the video becomes inactive', async () => {
    AppState.currentState = 'active';
    const content = { type: 'video' as const, media: [{ type: 'video' as const, url: '/clip.mp4', poster: '/poster.jpg', alt: 'Clip' }], description: '', descriptionPosition: 'below' as const, sponsored: false, sponsorName: '', audience: '', topic: '' };
    const element = (active: boolean) => <PrefsProvider><I18nProvider><ThemeProvider><PublicationMedia post={{ ...post, content }} active={active} /></ThemeProvider></I18nProvider></PrefsProvider>;
    const result = render(element(true));
    fireEvent(screen.getByTestId('publication-media-ui-post'), 'layout', { nativeEvent: { layout: { width: 360, height: 450 } } });
    await waitFor(() => expect(mockPlayer.play).toHaveBeenCalled());
    expect(mockPlayer.muted).toBe(true);
    fireEvent.press(screen.getByRole('button', { name: 'Activer le son' }));
    expect(mockPlayer.muted).toBe(false);
    result.rerender(element(false));
    await waitFor(() => expect(mockPlayer.pause).toHaveBeenCalled());
  });

  it('chooses catalogue variants and adds through the existing Cart Core exactly once', async () => {
    let finish!: (result: object) => void;
    mockCartAdd.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const sheet = { purchasable: true, dimensions: [{ key: 'size', label: 'Taille', values: [{ value: 'M', available: true }, { value: 'L', available: false }] }, { key: 'color', label: 'Couleur', values: [{ value: 'Bleu', available: true }, { value: 'Rouge', available: false }] }], variants: [{ id: 'variant-1', size: 'M', color: 'Bleu', available: true }] };
    mockSettingsQuery.mockReturnValue({ data: { name: 'Produit actuel', image: '', brandName: 'Marque', finalPrice: 42, description: 'Catalogue', sheet }, isPending: false, isError: false, refetch: mockRefetch });
    await mount(<PublicationProductPreview id="product-1" onContinue={() => undefined} onBack={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Ajouter au panier' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Taille M' }));
    fireEvent.press(screen.getByRole('button', { name: 'Couleur Bleu' }));
    expect(screen.getByRole('button', { name: 'Taille L' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Ajouter au panier' }));
    expect(mockCartAdd).toHaveBeenCalledTimes(1);
    expect(mockCartAdd).toHaveBeenCalledWith({ productId: 'product-1', sessionId: 'ui-guest-session', quantity: 1, requestedSize: 'M', requestedColor: 'Bleu' });
    expect(screen.getByRole('button', { name: 'Ajout en cours…' })).toBeDisabled();
    await act(async () => finish({ totalItemsCount: 1 }));
    expect(screen.getByText('Article ajouté au panier')).toBeTruthy();
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['cart'] });
  });

});
