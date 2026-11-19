import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import SocialCommerceScreen from '@/features/social-commerce/SocialCommerceScreen';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

let mockFilter = 'all';
const reel = { kind: 'reel', id: 'r-1', products: [], reel: { id: 'r-1', title: 'Le vestiaire', posterUrl: '/media/poster.jpg' } };
const story = { kind: 'story', id: 's-1', story: { id: 's-1', title: 'Maille du jour', mediaType: 'IMAGE', mediaUrl: '/media/story.jpg' } };
const mockQuery = jest.fn((filter: string) => ({ data: { pages: [{ items: filter === 'stories' ? [story] : [reel, story] }] }, isError: false, isRefetching: false }));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), setParams: jest.fn() },
  useIsFocused: () => true,
  useLocalSearchParams: () => ({ filter: mockFilter }),
  useFocusEffect: () => undefined,
}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) }));
jest.mock('@/api/socialCommerce', () => ({ useSocialCommerce: (filter: string) => mockQuery(filter), socialCommerceKey: (filter: string) => [filter] }));
jest.mock('@/features/reels/ReelPreview', () => ({ ReelPreview: () => null }));
jest.mock('@/design/appImage', () => ({ AppImage: () => null }));
jest.mock('@/features/reels/reelVisibility', () => ({ useHiddenReels: () => [] }));
jest.mock('@/features/shopping/LiveCartGlyph', () => ({ LiveCartButton: () => null }));
jest.mock('@/features/social/StoryViewer', () => ({ StoryViewer: ({ initialIndex }: { initialIndex: number }) => {
  const { Text } = require('react-native');
  return <Text testID="story-viewer">{initialIndex}</Text>;
} }));

async function mount(filter = 'all') {
  mockFilter = filter;
  render(<QueryClientProvider client={new QueryClient()}><PrefsProvider><I18nProvider><ThemeProvider><SocialCommerceScreen /></ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>);
  await act(async () => {});
}

beforeEach(() => jest.clearAllMocks());

it('opens the existing reel viewer and keeps Pub to Shop in Publication', async () => {
  await mount();
  fireEvent.press(screen.getByRole('button', { name: 'Le vestiaire' }));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/reels-viewer', params: { id: 'r-1' } });
  fireEvent.press(screen.getByTestId('social-pub-to-shop'));
  expect(router.push).toHaveBeenCalledWith('/publications');
});

it('honours the Stories filter, requests the filtered page and opens the existing viewer', async () => {
  await mount('stories');
  expect(mockQuery).toHaveBeenLastCalledWith('stories');
  expect(screen.getByRole('tab', { name: 'Stories', selected: true })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Le vestiaire' })).toBeNull();
  fireEvent.press(screen.getAllByRole('button', { name: 'Maille du jour' })[0]!);
  expect(screen.getByTestId('story-viewer')).toBeTruthy();
});
