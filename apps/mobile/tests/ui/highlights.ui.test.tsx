import type { ReactNode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, View } from 'react-native';
import WatchShopScreen from '../../app/watch-shop';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import HighlightScreen from '../../app/highlight-viewer';
import { HighlightsSection } from '../../src/features/highlights/HighlightsSection';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import type { Reel } from '../../src/api/social';

const product = (id: string, available = true) => ({ id, available, name: `Article ${id}`, image: `/media/${id}.jpg`, price: 68, currency: 'TND', stockStatus: 'AVAILABLE' });
const reel = (id: string): Reel => ({ id, title: `Le look ${id}`, channelId: 'pub_zayrovi', description: 'En images', videoUrl: `/media/${id}.mp4`, posterUrl: `/media/${id}.jpg`,
  durationSeconds: 18, publishAt: '', views: 0, likes: 0, product: product(id), products: [product(id)] });
let mockId = 'r2';
let mockFocused = true;
let mockHidden: string[] = [];
const mockQuery: { data?: Reel[]; isPending: boolean } = { isPending: false };
const mockPlayback = jest.fn(({ id, blocked }: { id: string; blocked: boolean }) => <View testID={`playback-${id}-${blocked}`} />);
jest.mock('expo-router', () => ({ useIsFocused: () => mockFocused, useLocalSearchParams: () => ({ id: mockId }),
  router: { push: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('../../src/features/reels/useReelPreviewActivity', () => ({ useReelPreviewActivity: () => ({ visible: true }) }));
jest.mock('../../src/features/reels/reelVisibility', () => ({ useHiddenReels: () => mockHidden }));
jest.mock('../../src/api/zayroviHighlights', () => ({ useZayroviHighlights: () => mockQuery, highlightsKey: ['home', 'zayrovi-highlights'] }));
jest.mock('../../src/api/hooks', () => ({ useSocialCounts: () => ({ data: {} }) }));
jest.mock('../../src/state/session', () => ({ useSession: () => ({ status: 'signedOut' }) }));
jest.mock('../../src/session/session', () => ({ useSessionId: () => '' }));
jest.mock('../../src/features/reels/ReelPlayback', () => ({ ReelPlayback: (props: any) => mockPlayback(props) }));
jest.mock('../../src/features/social/ReelCommentsModal', () => ({ ReelCommentsModal: ({ reel, onClose }: any) => {
  const { Pressable } = require('react-native');
  return <Pressable testID={`comments-for-${reel.id}`} onPress={onClose} />;
} }));
jest.mock('../../src/features/publications/PublicationAuthSheet', () => ({ PublicationAuthSheet: () => {
  const { View } = require('react-native');
  return <View testID="highlight-auth" />;
} }));

function wrap(node: ReactNode, client = new QueryClient()) {
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, bottom: 26, left: 0, right: 0 } }}>
    <QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider>{node}</ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>
  </SafeAreaProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockId = 'r2'; mockFocused = true; mockHidden = [];
  mockQuery.data = ['r1', 'r2', 'r3', 'r4'].map(reel);
});

it('renders four poster/product pairs without starting playback; both touch targets open the chosen video', () => {
  render(wrap(<HighlightsSection />));
  expect(screen.getByTestId('home-highlights')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Watshis, Shop' })).toBeTruthy();
  expect(screen.getAllByTestId(/^highlight-tile-/)).toHaveLength(4);
  expect(screen.getAllByTestId(/^highlight-overlay-/)).toHaveLength(4);
  fireEvent.press(screen.getByTestId('highlight-tile-r2'));
  fireEvent.press(screen.getByTestId('highlight-overlay-r3'));
  expect(router.push).toHaveBeenNthCalledWith(1, '/highlight-viewer?id=r2');
  expect(router.push).toHaveBeenNthCalledWith(2, '/highlight-viewer?id=r3');
  expect(mockPlayback).not.toHaveBeenCalled();
});

it('opens the edge-to-edge Explore gallery and its product tile opens the selected video', () => {
  const home = render(wrap(<HighlightsSection />));
  fireEvent.press(screen.getByTestId('watch-shop-explore'));
  expect(router.push).toHaveBeenLastCalledWith('/watch-shop');
  home.unmount();
  render(wrap(<WatchShopScreen />));
  expect(screen.getByRole('header', { name: 'Watshis Shop' })).toBeTruthy();
  expect(screen.getAllByTestId(/^watch-shop-frame-/)).toHaveLength(4);
  expect(StyleSheet.flatten(screen.getByTestId('watch-shop-frame-r2').props.style).borderRadius).toBeUndefined();
  expect(screen.getByTestId('highlight-overlay-r2').props.accessibilityLabel).toContain('68');
  fireEvent.press(screen.getByTestId('highlight-overlay-r2'));
  expect(router.push).toHaveBeenLastCalledWith('/highlight-viewer?id=r2');
  expect(mockPlayback).not.toHaveBeenCalled();
});

it('Explore omits hidden videos without leaving the gallery empty when other selections remain', () => {
  mockHidden = ['r1'];
  render(wrap(<WatchShopScreen />));
  expect(screen.queryByTestId('watch-shop-frame-r1')).toBeNull();
  expect(screen.getAllByTestId(/^watch-shop-frame-/)).toHaveLength(3);
});

it('does not show an incomplete shopping template or override hidden videos', () => {
  mockHidden = ['r1'];
  render(wrap(<HighlightsSection />));
  expect(screen.queryByTestId('home-highlights')).toBeNull();
});

it('opens one selected player, with official publisher and an Acheter card but no products tag for one article', () => {
  render(wrap(<HighlightScreen />));
  expect(screen.getByTestId('playback-r2-false')).toBeTruthy();
  expect(mockPlayback).toHaveBeenCalledWith(expect.objectContaining({ id: 'r2', contentFit: 'cover' }));
  expect(screen.getByTestId('reel-publisher')).toBeTruthy();
  expect(screen.getByText('Acheter')).toBeTruthy();
  expect(screen.queryByTestId('highlight-more-products')).toBeNull();
  fireEvent.press(screen.getByTestId('highlight-buy-r2'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: 'r2' } });
  fireEvent.press(screen.getByTestId('highlight-close'));
  expect(router.back).toHaveBeenCalled();
});

it('shows only additional sellable linked cards on demand, without pausing or changing the selected video', () => {
  mockQuery.data![1]!.products = [product('extra'), product('r2'), product('hidden', false), product('extra2')];
  render(wrap(<HighlightScreen />));
  expect(screen.getByText('+2 articles')).toBeTruthy();
  expect(screen.queryByTestId('highlight-buy-extra')).toBeNull();
  fireEvent.press(screen.getByTestId('highlight-more-products'));
  expect(screen.getByTestId('highlight-product-carousel')).toHaveProp('horizontal', true);
  expect(screen.getByTestId('highlight-buy-r2')).toBeTruthy();
  expect(screen.queryByTestId('highlight-buy-hidden')).toBeNull();
  expect(screen.getByTestId('playback-r2-false')).toBeTruthy();
  fireEvent.press(screen.getByTestId('highlight-buy-extra'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/product/[id]', params: { id: 'extra' } });
  fireEvent.press(screen.getByTestId('highlight-more-products'));
  expect(screen.queryByTestId('highlight-product-carousel')).toBeNull();
});

it('suspends the same playback while comments or sign-in cover it', () => {
  render(wrap(<HighlightScreen />));
  fireEvent.press(screen.getByTestId('highlight-comments'));
  expect(screen.getByTestId('playback-r2-true')).toBeTruthy();
  fireEvent.press(screen.getByTestId('comments-for-r2'));
  expect(screen.getByTestId('playback-r2-false')).toBeTruthy();
  fireEvent.press(screen.getByTestId('highlight-reaction'));
  expect(screen.getByTestId('highlight-auth')).toBeTruthy();
  expect(screen.getByTestId('playback-r2-true')).toBeTruthy();
});

it('never falls back to playing the first clip when the requested clip disappears', () => {
  mockId = 'removed';
  render(wrap(<HighlightScreen />));
  expect(screen.getByText('Cette vidéo n’est plus disponible.')).toBeTruthy();
  expect(mockPlayback).not.toHaveBeenCalled();
});
