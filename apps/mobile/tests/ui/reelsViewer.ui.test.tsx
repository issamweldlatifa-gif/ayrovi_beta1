import ReelsScreen from '../../app/reels';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { FlatList } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ReelsViewerScreen from '../../app/reels-viewer';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
const mockReels: { data: unknown; isPending: boolean; isPlaceholderData?: boolean } = { data: undefined, isPending: true };
jest.mock('expo-router', () => ({ useIsFocused: () => true, useLocalSearchParams: () => ({ id: 'r2' }) }));
jest.mock('../../src/api/hooks', () => ({ useReels: () => mockReels, useSocialCounts: () => ({ data: {} }) }));
jest.mock('../../src/features/reels/reelVisibility', () => ({ useHiddenReels: () => [] }));
jest.mock('../../src/features/social/ReelCard', () => ({ ReelCard: () => null }));
jest.mock('../../src/features/social/ReelCommentsModal', () => ({ ReelCommentsModal: () => null }));
function wrap() {
  return <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, bottom: 24, left: 0, right: 0 } }}>
    <PrefsProvider><I18nProvider><ThemeProvider><ReelsViewerScreen /></ThemeProvider></I18nProvider></PrefsProvider>
  </SafeAreaProvider>;
}
it('opens a cold-link Reel after loading, and pages by the actual available viewport', () => {
  const viewer = render(wrap());
  expect(screen.queryByTestId('reels-viewer-list')).toBeNull();
  mockReels.data = [{ id: 'r1' }, { id: 'r2' }]; mockReels.isPending = false;
  viewer.rerender(wrap());
  const list = screen.UNSAFE_getByType(FlatList);
  expect(list.props.initialScrollIndex).toBe(1);
  expect(list.props.initialNumToRender).toBe(2);
  expect(list.props.windowSize).toBe(5);
  const reposition = jest.spyOn(list.instance, 'scrollToIndex');
  fireEvent(screen.getByTestId('reels-viewer'), 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 700 } } });
  expect(reposition).toHaveBeenCalledWith({ index: 1, animated: false });
  expect(screen.UNSAFE_getByType(FlatList).props.getItemLayout(null, 1)).toEqual({ length: 700, offset: 700, index: 1 });
});

it('uses the same full-screen virtualized viewer for the /reels entry point', () => {
  expect(ReelsScreen).toBe(ReelsViewerScreen);
});

it('shows cached presentation while keeping playback disabled until the anchored response is verified', () => {
  mockReels.data = [{ id: 'r2' }]; mockReels.isPending = false; mockReels.isPlaceholderData = true;
  const viewer = render(wrap());
  expect(screen.getByTestId('reels-viewer-loading')).toBeTruthy();
  expect(screen.UNSAFE_getByType(FlatList).props.renderItem({ item: { id: 'r2' }, index: 0 }).props.active).toBe(false);
  mockReels.isPlaceholderData = false; viewer.rerender(wrap());
  expect(screen.queryByTestId('reels-viewer-loading')).toBeNull();
  expect(screen.UNSAFE_getByType(FlatList).props.renderItem({ item: { id: 'r2' }, index: 0 }).props.active).toBe(true);
});

it('plays the visible Reel, preloads ONLY the next one, and never unmounts on comments (11/11)', () => {
  mockReels.data = [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }, { id: 'r4' }]; mockReels.isPending = false; mockReels.isPlaceholderData = false;
  render(wrap());
  const renderItem = screen.UNSAFE_getByType(FlatList).props.renderItem;
  const card = (index: number) => renderItem({ item: { id: `r${index + 1}` }, index }).props;
  expect(card(1)).toMatchObject({ active: true, preload: false, suspended: false });
  expect(card(2)).toMatchObject({ active: false, preload: true });
  expect(card(0)).toMatchObject({ active: false, preload: false });
  expect(card(3)).toMatchObject({ active: false, preload: false });
});
