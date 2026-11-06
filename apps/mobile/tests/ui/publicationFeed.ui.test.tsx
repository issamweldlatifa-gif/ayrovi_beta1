import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { PublicationFeedScreen } from '@/features/publications/PublicationFeedScreen';
import { PublicationCard } from '@/features/publications/PublicationCard';
import type { FeedPost } from '@/api/publicationFeed';

const mockSession = { status: 'signedIn', account: { id: 'ui-owner' } };
const mockSend = jest.fn();
const mockQuery = jest.fn();
const mockSetQueries = jest.fn();
const mockRefetch = jest.fn();
const mockFetchNext = jest.fn();
const mockRouter = { push: jest.fn(), setParams: jest.fn(), canGoBack: jest.fn(), replace: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockRouter.push(...args), setParams: (...args: unknown[]) => mockRouter.setParams(...args), canGoBack: () => mockRouter.canGoBack(), replace: (...args: unknown[]) => mockRouter.replace(...args), back: () => mockRouter.back() }, useFocusEffect: jest.fn(), useLocalSearchParams: () => ({}) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('@tanstack/react-query', () => ({ useInfiniteQuery: (...args: unknown[]) => mockQuery(...args), useQueryClient: () => ({ setQueriesData: mockSetQueries }) }));
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
beforeEach(() => { jest.clearAllMocks(); mockSession.status = 'signedIn'; mockSession.account.id = `owner-${Math.random()}`; mockQuery.mockReturnValue(feed); });

describe('Publication Phase 1 UI', () => {
  it('renders actual content, custom reaction and explicit AI label without fake products', async () => {
    await mount();
    expect(screen.getByTestId('publication-feed-list')).toBeTruthy();
    expect(screen.getByText('Inspiration réelle')).toBeTruthy();
    expect(screen.getByText('Création visuelle IA')).toBeTruthy();
    expect(screen.queryByText('Voir les produits')).toBeNull();
    expect(screen.getByRole('button', { name: 'Enregistrer — prochaine phase' })).toBeDisabled();
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
    expect(screen.getByTestId('publication-like-ui-post')).toBeDisabled();
    fireEvent.press(screen.getByText('Connectez-vous pour aimer et commenter'));
    expect(mockRouter.push).toHaveBeenCalledWith('/sign-in'); expect(mockSend).not.toHaveBeenCalled();
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
});
