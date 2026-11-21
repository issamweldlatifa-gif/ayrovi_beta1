import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { AppState, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import type { StoryEditorial } from '../../../../shared/storyEditorial';
import { useEditorialStory, type EditorialStory } from '@/api/storyEditorial';
import { EditorialStoryScreen } from '@/features/stories/EditorialStoryScreen';
import { StoryArticleScreen } from '@/features/stories/StoryArticleScreen';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

jest.mock('expo-router', () => ({ useIsFocused: () => true, router: { push: jest.fn(), dismissTo: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('@/state/session', () => ({ useSession: () => ({ status: 'signedOut', account: null }) }));
jest.mock('@/session/session', () => ({ useSessionId: () => 'story-guest' }));
jest.mock('@/api/social', () => ({ sendInteraction: jest.fn(async () => ({})) }));
jest.mock('@/api/hooks', () => ({ useStories: () => ({ data: [{ id: 'story-a', mediaType: 'IMAGE', mediaUrl: '/media/a.jpg' }, { id: 'related-story', title: 'Une autre histoire', mediaType: 'IMAGE', mediaUrl: '/media/related.jpg' }] }) }));
jest.mock('@/api/storyEditorial', () => ({ ...jest.requireActual('@/api/storyEditorial'), useEditorialStory: jest.fn() }));
jest.mock('@/features/publications/usePublisherFollow', () => ({ usePublisherFollow: (_id: string, press: () => void) => ({ state: 'idle', press }) }));
const mockReduced = jest.fn(() => true);
jest.mock('@/design/motion', () => ({ ...jest.requireActual('@/design/motion'), useReduceMotion: () => mockReduced() }));
const mockPlayer = { play: jest.fn(), pause: jest.fn(), muted: true, status: 'readyToPlay', duration: 8, addListener: () => ({ remove: jest.fn() }) };
jest.mock('expo-video', () => ({ VideoView: 'StoryVideoView', useVideoPlayer: () => mockPlayer }));

const blank = { text: '' };
const editorial: StoryEditorial = { version: 1, slides: [
  { layout: 'cover', title: { text: 'Édition studio' }, caption: blank, action: 'read', seconds: 3, media: { kind: 'image', url: '/media/first.jpg' } },
  { layout: 'product', title: { text: 'Un article' }, caption: blank, productId: 'sku-b', media: { kind: 'video', url: '/media/second.mp4' } },
  { layout: 'inset', title: { text: 'Dernier écran' }, caption: { text: 'Le texte' }, action: 'discover', media: { kind: 'gif', url: '/media/third.gif' } },
], article: { cover: '/media/cover.jpg', title: { text: 'Notre article' }, intro: { text: 'Introduction' }, author: 'Équipe créative',
  blocks: [{ type: 'text', content: { text: 'Paragraphe un' } }, { type: 'image', url: '/media/inside.jpg', alt: { text: 'Image éditoriale' } }], selectionTitle: blank } };
const story: EditorialStory = { id: 'story-a', title: 'Édition studio', titleAr: '', description: '', descriptionAr: '', publishAt: '2026-11-19T09:30:00Z', expiresAt: '',
  legacyMedia: null, editorial, products: ['sku-a', 'sku-b'].map(id => ({ id, name: id, brand: 'Atelier', image: '/media/item.jpg', price: 30, currency: 'TND', stockStatus: 'AVAILABLE', available: true })) };
const mount = (element: React.ReactElement) => render(<PrefsProvider><I18nProvider><ThemeProvider>{element}</ThemeProvider></I18nProvider></PrefsProvider>);
beforeEach(() => {
  jest.clearAllMocks(); mockReduced.mockReturnValue(true);
  (AppState as unknown as { currentState: string }).currentState = 'active';
  jest.mocked(useEditorialStory).mockReturnValue({ story, isPending: false, isError: false } as ReturnType<typeof useEditorialStory>);
});
afterEach(() => jest.restoreAllMocks());

it('shows black full-screen, then an exact linked product, then an inset GIF with Découvrir', () => {
  mount(<EditorialStoryScreen id={story.id} />);
  expect(StyleSheet.flatten(screen.getByTestId('editorial-story-viewer').props.style).backgroundColor).toBe('#000000');
  expect(screen.getByTestId('editorial-story-progress').props.accessibilityValue).toEqual({ min: 1, max: 3, now: 1 });
  fireEvent.press(screen.getByTestId('editorial-story-cta'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/story-article/[id]', params: { id: 'story-a' } });
  fireEvent.press(screen.getByRole('button', { name: 'Suivant' }));
  expect(screen.getByTestId('editorial-story-video')).toBeTruthy();
  expect(mockPlayer.muted).toBe(false);
  fireEvent.press(screen.getByTestId('editorial-story-mute'));
  expect(mockPlayer.muted).toBe(true);
  fireEvent.press(within(screen.getByTestId('editorial-story-product-sku-b')).getByRole('link'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'sku-b' } });
  expect(screen.queryByTestId('editorial-story-product-sku-a')).toBeNull();
  expect(screen.queryByTestId('editorial-story-cta')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Suivant' }));
  expect(screen.getByTestId('editorial-story-inset')).toBeTruthy();
  expect(screen.getByTestId('editorial-story-gif', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByText('Le texte')).toBeTruthy();
  expect(screen.getByTestId('editorial-story-cta')).toHaveTextContent('Découvrir');
  fireEvent.press(screen.getByTestId('editorial-story-cta'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/story-article/[id]', params: { id: 'story-a' } });
});

it('lets the viewer turn sound on or off even on silent slides, and keeps Close independent', () => {
  mount(<EditorialStoryScreen id={story.id} />);
  const mute = () => screen.getByTestId('editorial-story-mute');
  expect(mute()).toBeEnabled();
  fireEvent.press(mute());
  fireEvent.press(screen.getByRole('button', { name: 'Suivant' }));
  expect(mockPlayer.muted).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Suivant' }));
  expect(mute()).toBeEnabled();
  fireEvent.press(mute());
  fireEvent.press(screen.getByRole('button', { name: 'Précédent' }));
  expect(mockPlayer.muted).toBe(false);
  fireEvent.press(screen.getByTestId('editorial-story-close'));
  expect(router.back).toHaveBeenCalledTimes(1);
});

it('pauses timed advancement and continues from the same progress on resume', () => {
  mockReduced.mockReturnValue(false);
  let now = 1000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  const pending = new Map<number, () => void>();
  const originalInterval = global.setInterval;
  const originalClear = global.clearInterval;
  let ids = 1000;
  jest.spyOn(global, 'setInterval').mockImplementation(((callback: () => void, delay: number) => {
    if (delay !== 80) return originalInterval(callback, delay);
    const id = ++ids;
    pending.set(id, callback);
    return id;
  }) as typeof setInterval);
  jest.spyOn(global, 'clearInterval').mockImplementation(((id: number) => {
    if (typeof id === 'number' && id > 1000) pending.delete(id);
    else originalClear(id);
  }) as typeof clearInterval);
  const advance = (ticks: number) => act(() => {
    for (let i = 0; i < ticks; i++) { now += 80; for (const callback of [...pending.values()]) callback(); }
  });
  mount(<EditorialStoryScreen id={story.id} />);
  advance(22);
  fireEvent.press(screen.getByTestId('editorial-story-pause'));
  advance(50);
  expect(screen.getByTestId('editorial-story-progress').props.accessibilityValue.now).toBe(1);
  fireEvent.press(screen.getByTestId('editorial-story-pause'));
  advance(19);
  expect(screen.getByTestId('editorial-story-progress').props.accessibilityValue.now).toBe(2);
});

it('lays out the editorial cover and copy before the linked selection, with native product navigation', () => {
  mount(<StoryArticleScreen id={story.id} />);
  expect(screen.getByTestId('story-article-cover', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Notre article' })).toBeTruthy();
  expect(screen.getByText('Introduction')).toBeTruthy();
  expect(screen.getByText('Par Équipe créative')).toBeTruthy();
  expect(screen.getByText('Paragraphe un')).toBeTruthy();
  expect(screen.getByLabelText('Image éditoriale')).toBeTruthy();
  expect(within(screen.getByTestId('story-article-more')).getByRole('link', { name: 'Une autre histoire' })).toBeTruthy();
  expect(screen.queryByTestId('stories-gallery-card-story-a')).toBeNull();
  fireEvent.press(within(screen.getByTestId('editorial-story-product-sku-a')).getByRole('link'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'sku-a' } });
});


it('uses identical compact cards for a multi-product slide and routes Explorer to the same article', () => {
  const composition: StoryEditorial = { ...editorial, slides: [
    { ...editorial.slides[0]!, action: 'explore' },
    { ...editorial.slides[1]!, productId: undefined, productIds: ['sku-b', 'sku-a'] },
  ] };
  jest.mocked(useEditorialStory).mockReturnValue({ story: { ...story, editorial: composition }, isPending: false } as ReturnType<typeof useEditorialStory>);
  mount(<EditorialStoryScreen id={story.id} />);
  expect(screen.getByTestId('editorial-story-cta')).toHaveTextContent('Explorer');
  fireEvent.press(screen.getByTestId('editorial-story-cta'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/story-article/[id]', params: { id: story.id } });
  fireEvent.press(screen.getByRole('button', { name: 'Suivant' }));
  const rail = within(screen.getByTestId('editorial-story-product-rail'));
  const cards = rail.getAllByTestId(/^editorial-story-product-sku-/);
  expect(cards.map(card => card.props.testID)).toEqual(['editorial-story-product-sku-b', 'editorial-story-product-sku-a']);
  expect(StyleSheet.flatten(cards[0]!.props.style).minHeight).toBe(StyleSheet.flatten(cards[1]!.props.style).minHeight);
});

it('renders authored product write-ups and cards, followed by related Stories and alert signup', () => {
  const composition: StoryEditorial = { ...editorial, article: { ...editorial.article!, blocks: [
    { type: 'product', productId: 'sku-b', image: '', title: { text: 'En détail' }, content: { text: 'Pourquoi on aime cette pièce.' } },
    { type: 'product', productId: 'no-longer-available', image: '', title: { text: 'Produit retiré' }, content: { text: 'Hors catalogue' } },
  ] } };
  jest.mocked(useEditorialStory).mockReturnValue({ story: { ...story, editorial: composition }, isPending: false } as ReturnType<typeof useEditorialStory>);
  mount(<StoryArticleScreen id={story.id} />);
  const section = within(screen.getByTestId('story-article-focus-sku-b'));
  expect(section.getByRole('header', { name: 'En détail' })).toBeTruthy();
  expect(section.getByText('Pourquoi on aime cette pièce.')).toBeTruthy();
  expect(screen.queryByText('Produit retiré')).toBeNull();
  fireEvent.press(section.getByRole('link'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'sku-b' } });
  fireEvent.press(screen.getByRole('link', { name: 'Explorez toutes les stories' }));
  expect(router.dismissTo).toHaveBeenCalledWith({ pathname: '/stories', params: { id: '', focus: '' } });
  fireEvent.press(within(screen.getByTestId('stories-alerts')).getByRole('button', { name: 'Abonnez-moi' }));
  expect(router.push).toHaveBeenLastCalledWith('/sign-in');
});
