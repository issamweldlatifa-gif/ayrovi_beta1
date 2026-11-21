import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { BlackFridaySection } from '@/features/home/BlackFridaySection';
import { parseBlackFriday, useBlackFriday } from '@/api/blackFriday';
import BlackFridayScreen from '../../app/black-friday';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { DEFAULT_BLACK_FRIDAY } from '../../../../shared/blackFriday';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16 }) }));
jest.mock('@/design/appImage', () => ({ AppImage: ({ testID, blurRadius }: any) => {
  const { View } = require('react-native'); return <View testID={testID} blurRadius={blurRadius} />;
} }));
jest.mock('@/api/blackFriday', () => ({ ...jest.requireActual('@/api/blackFriday'), useBlackFriday: jest.fn() }));
const product = { id: 'vans', name: 'Vans · Veste', brand: 'Vans', image: '/media/coat.jpg', price: 70, compareAtPrice: 100 };
const campaign = parseBlackFriday({ ...DEFAULT_BLACK_FRIDAY, cover: '/media/all.jpg', products: [product, { ...product, id: 'tommy', name: 'Tommy', price: 90 }] })!;
async function mount(child: React.ReactNode) {
  render(<PrefsProvider><I18nProvider><ThemeProvider>{child}</ThemeProvider></I18nProvider></PrefsProvider>);
  await act(async () => {});
}

test('shows an overlapping horizontal rail, a shaded final-card link and a separate outlined CTA', async () => {
  await mount(<BlackFridaySection campaign={campaign} />);
  const rail = screen.getByTestId('black-friday-rail');
  expect(rail.props.horizontal).toBe(true);
  expect(StyleSheet.flatten(rail.props.style).marginTop).toBeLessThan(0);
  expect(screen.getByText(/jusqu’à −30 %/)).toBeTruthy();
  expect(screen.getByTestId('black-friday-terminal-image').props.blurRadius).toBe(1);
  fireEvent.press(screen.getByTestId('black-friday-product-vans'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'vans' } });
  fireEvent.press(screen.getByTestId('black-friday-terminal'));
  expect(router.push).toHaveBeenLastCalledWith('/black-friday');
  const cta = screen.getByTestId('black-friday-all');
  expect(StyleSheet.flatten(cta.props.style).borderWidth).toBe(2);
  fireEvent.press(cta);
  expect(router.push).toHaveBeenLastCalledWith('/black-friday');
});

test('all offers is scoped to the campaign and uses canonical prices', async () => {
  jest.mocked(useBlackFriday).mockReturnValue({ data: campaign, isPending: false, isError: false } as ReturnType<typeof useBlackFriday>);
  await mount(<BlackFridayScreen />);
  expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(screen.getByText(/70\.00 TND/)).toBeTruthy();
  fireEvent.press(screen.getByTestId('black-friday-product-tommy'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'tommy' } });
});
