/**
 * Menu de tri — rendu réel : fermé sans ancre, deux entrées dans l'ordre de la
 * référence, choix et fermeture.
 */
import { View } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { CommentSortMenu } from '../../src/features/social/CommentSortMenu';

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 0 } };
function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <PrefsProvider><I18nProvider><ThemeProvider><View style={{ flex: 1 }}>{children}</View></ThemeProvider></I18nProvider></PrefsProvider>
    </SafeAreaProvider>
  );
}
const anchor = { x: 300, y: 400, width: 44, height: 44 };

it('fermé sans ancre', () => {
  render(<Providers><CommentSortMenu anchor={null} value="popular" onPick={jest.fn()} onClose={jest.fn()} /></Providers>);
  expect(screen.queryByTestId('comment-sort-menu')).toBeNull();
});

it('deux entrées, populaires d’abord, choix et fermeture', () => {
  const onPick = jest.fn();
  const onClose = jest.fn();
  render(<Providers><CommentSortMenu anchor={anchor} value="popular" onPick={onPick} onClose={onClose} /></Providers>);
  const menu = screen.getByTestId('comment-sort-menu');
  const items = screen.getAllByRole('menuitem');
  expect(items.map((item) => item.props.testID)).toEqual(['comment-sort-popular', 'comment-sort-recent']);
  expect(screen.getByTestId('comment-sort-popular').props.accessibilityState).toMatchObject({ selected: true });
  // Sous l'icône (400 + 44 + 4) et bord aligné sur elle.
  const style = Object.assign({}, ...[menu.props.style].flat(Infinity).filter(Boolean));
  expect(style.top).toBe(448);
  expect(typeof style.right === 'number' || typeof style.left === 'number').toBe(true);
  fireEvent.press(screen.getByTestId('comment-sort-recent'));
  expect(onPick).toHaveBeenCalledWith('recent');
  fireEvent.press(screen.getByTestId('comment-sort-backdrop'));
  expect(onClose).toHaveBeenCalled();
});
