import { act, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import PublicationsScreen from '../../app/publications';
import RetiredPublicationCollection from '../../app/publication-collection/[id]';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

jest.mock('expo-router', () => ({ useIsFocused: () => true, Redirect: 'Redirect', router: {} }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));

it('keeps the white safe-area header and only the empty state, with no query provider needed', async () => {
  render(<PrefsProvider><I18nProvider><ThemeProvider><PublicationsScreen /></ThemeProvider></I18nProvider></PrefsProvider>);
  await act(async () => {});
  expect(StyleSheet.flatten(screen.getByTestId('publication-page').props.style)).toMatchObject({ paddingTop: 24, paddingBottom: 16 });
  expect(StyleSheet.flatten(screen.getByTestId('publication-header-bar').props.style).backgroundColor).toBe('#FFFFFF');
  expect(screen.getByText('Aucune publication pour le moment.')).toBeTruthy();
  expect(screen.queryByTestId('publication-blocks')).toBeNull();
});

it('redirects a bookmark to a retired collection back to Publications', () => {
  expect(RetiredPublicationCollection().props.href).toBe('/publications');
});
