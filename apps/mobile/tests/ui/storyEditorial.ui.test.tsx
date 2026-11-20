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

jest.mock('expo-router', () => ({ useIsFocused: () => true, router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('@/state/session', () => ({ useSession: () => ({ status: 'signedOut', account: null }) }));
jest.mock('@/session/session', () => ({ useSessionId: () => 'story-guest' }));
jest.mock('@/api/social', () => ({ sendInteraction: jest.fn(async () => ({})) }));
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
  fireEvent.press(screen.getByTestId('editorial-story-mute'));
  expect(mockPlayer.muted).toBe(false);
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
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/story-article/[id]', params: { id: 'story-a', mode: 'discover' } });
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
  mount(<StoryArticleScreen id={story.id} discover />);
  expect(screen.getByTestId('story-article-cover', { includeHiddenElements: true })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Notre article' })).toBeTruthy();
  expect(screen.getByText('Introduction')).toBeTruthy();
  expect(screen.getByText('Par Équipe créative')).toBeTruthy();
  expect(screen.getByText('Paragraphe un')).toBeTruthy();
  expect(screen.getByLabelText('Image éditoriale')).toBeTruthy();
  expect(screen.getAllByRole('link')).toHaveLength(2);
  fireEvent.press(within(screen.getByTestId('editorial-story-product-sku-a')).getByRole('link'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'sku-a' } });
});
