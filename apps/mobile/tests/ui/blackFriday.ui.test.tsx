import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { BlackFridaySection } from '@/features/home/BlackFridaySection';
import { parseBlackFriday, useBlackFriday } from '@/api/blackFriday';
import BlackFridayScreen from '../../app/black-friday';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import { TYPE_SCALE } from '@/design/tokens.generated';
import { DEFAULT_BLACK_FRIDAY } from '../../../../shared/blackFriday';

const mockParams = jest.fn((): { view?: string; collection?: string } => ({}));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), canGoBack: () => true, back: jest.fn() }, useLocalSearchParams: () => mockParams() }));
jest.mock('@/state/session', () => ({ useSession: () => ({ status: 'signedOut', account: null }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }) }));
jest.mock('@/design/appImage', () => ({ AppImage: ({ testID, blurRadius, uri }: any) => {
  const { View } = require('react-native'); return <View testID={testID} blurRadius={blurRadius} accessibilityHint={uri} />;
} }));
jest.mock('@/api/blackFriday', () => ({ ...jest.requireActual('@/api/blackFriday'), useBlackFriday: jest.fn() }));
const product = { id: 'vans', name: 'Vans · Veste', brand: 'Vans', image: '/media/coat.jpg', price: 70, compareAtPrice: 100 };
const tommy = { ...product, id: 'tommy', brand: 'Tommy', name: 'Tommy · T-shirt', price: 90 };
const endsAt = new Date(Date.now() + 36 * 3600000).toISOString();
const collection = (id: string, titleFr: string, productIds: string[]) => ({ id, titleFr, titleAr: titleFr, cover: `/media/${id}.jpg`, endsAt, productIds, demo: true });
const campaign = parseBlackFriday({ ...DEFAULT_BLACK_FRIDAY, cover: '/media/all.jpg', featureCover: '/media/feature.jpg', backgroundColor: '#235715', surfaceColor: '#DFEFE1', featureCtaFr: 'Offres du moment',
  collections: [collection('street', 'Streetwear', ['vans']), collection('daily', 'Style casual', ['tommy', 'vans']), collection('city', 'Pour la ville', ['tommy']), collection('extra', 'Dernière sélection', ['tommy'])], products: [product, tommy] })!;
async function mount(child: React.ReactNode) {
  render(<PrefsProvider><I18nProvider><ThemeProvider>{child}</ThemeProvider></I18nProvider></PrefsProvider>);
  await act(async () => {});
}

test('shows an overlapping horizontal rail, a shaded final-card link and a separate outlined CTA', async () => {
  await mount(<BlackFridaySection campaign={campaign} />);
  const rail = screen.getByTestId('black-friday-rail');
  expect(rail.props.horizontal).toBe(true);
  expect(StyleSheet.flatten(screen.getByTestId('black-friday-banner').props.style).backgroundColor).toBe('#235715');
  expect(StyleSheet.flatten(screen.getByTestId('home-black-friday').props.style).backgroundColor).toBe('#DFEFE1');
  expect(screen.getByTestId('black-friday-terminal-badge')).toBeTruthy();
  expect(StyleSheet.flatten(rail.props.style).marginTop).toBeLessThan(0);
  expect(screen.getByText(/jusqu’à −30 %/)).toBeTruthy();
  expect(screen.getByTestId('black-friday-terminal-image').props.blurRadius).toBe(1);
  expect(rail.props.data).toHaveLength(4);
  expect(screen.queryByTestId('black-friday-rail-extra')).toBeNull();
  fireEvent.press(screen.getByTestId('black-friday-rail-street'));
  expect(router.push).toHaveBeenLastCalledWith('/black-friday?view=products&collection=street');
  fireEvent.press(screen.getByTestId('black-friday-terminal'));
  expect(router.push).toHaveBeenLastCalledWith('/black-friday');
  const cta = screen.getByTestId('black-friday-all');
  expect(StyleSheet.flatten(cta.props.style).borderWidth).toBe(2);
  fireEvent.press(cta);
  expect(router.push).toHaveBeenLastCalledWith('/black-friday');
});

test('all deals shows the same selections plus additional campaign cards with deadline and demo copy', async () => {
  mockParams.mockReturnValue({});
  jest.mocked(useBlackFriday).mockReturnValue({ data: campaign, isPending: false, isError: false } as ReturnType<typeof useBlackFriday>);
  await mount(<BlackFridayScreen />);
  const heading = screen.getByText('BLACK FRIDAY WEEK');
  expect(heading.props.numberOfLines).toBeUndefined();
  expect(StyleSheet.flatten(heading.props.style).fontSize).toBe(TYPE_SCALE.bodyStrong);
  expect(StyleSheet.flatten(screen.getByTestId('black-friday-landing-title').props.style).fontSize).toBe(TYPE_SCALE.h3);
  expect(screen.getByText('Offres de démonstration')).toBeTruthy();
  expect(screen.getAllByText('Se termine dans')).toHaveLength(4);
  expect(screen.getByTestId('black-friday-cover-street').props.accessibilityHint).toMatch(/\/media\/street.jpg$/);
  expect(screen.getByTestId('black-friday-collection-extra')).toBeTruthy();
  expect(screen.queryByTestId('black-friday-product-grid')).toBeNull();
  fireEvent.press(screen.getByTestId('black-friday-collection-street'));
  expect(router.push).toHaveBeenLastCalledWith('/black-friday?view=products&collection=street');
});

test('a selection opens only its linked products with existing catalogue routes and prices', async () => {
  mockParams.mockReturnValue({ view: 'products', collection: 'street' });
  await mount(<BlackFridayScreen />);
  expect(screen.getAllByRole('link')).toHaveLength(1);
  expect(screen.getByTestId('black-friday-product-badge')).toBeTruthy();
  expect(screen.queryByTestId('black-friday-product-tommy')).toBeNull();
  expect(screen.getByText('1 article affiché')).toBeTruthy();
  expect(screen.getByText('−30%')).toBeTruthy();
  const price = screen.getByTestId('black-friday-product-price-vans');
  expect(price.props.children).toBe('70.00\u00a0TND');
  expect(StyleSheet.flatten(price.props.style).fontSize).toBe(TYPE_SCALE.price);
  expect(StyleSheet.flatten(screen.getByTestId('black-friday-product-photo-vans').props.style).aspectRatio).toBeGreaterThan(0.8);
  fireEvent.press(screen.getByTestId('black-friday-product-vans'));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'vans' } });
});

test('sorts and filters within the selection and updates the visible count', async () => {
  mockParams.mockReturnValue({ view: 'products', collection: 'daily' });
  await mount(<BlackFridayScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Trier' }));
  fireEvent.press(screen.getByRole('button', { name: 'Prix croissant' }));
  expect(screen.getAllByRole('link').map(link => link.props.testID)).toEqual(['black-friday-product-vans', 'black-friday-product-tommy']);
  fireEvent.press(screen.getByRole('button', { name: 'Filtres' }));
  fireEvent.press(screen.getByRole('button', { name: 'Tommy' }));
  expect(screen.getByText('1 article affiché')).toBeTruthy();
  expect(screen.queryByTestId('black-friday-product-vans')).toBeNull();
});

test('allows the full collection heading to wrap and keeps millimes with TND', async () => {
  const longTitle = 'Vans – Vestiaire street et accessoires pour la ville';
  const precise = parseBlackFriday({ ...DEFAULT_BLACK_FRIDAY, cover: '/media/all.jpg',
    products: [{ ...product, price: 261.726, compareAtPrice: 348.968 }],
    collections: [collection('street', longTitle, ['vans'])],
  })!;
  jest.mocked(useBlackFriday).mockReturnValue({ data: precise, isPending: false, isError: false } as ReturnType<typeof useBlackFriday>);
  mockParams.mockReturnValue({ view: 'products', collection: 'street' });
  await mount(<BlackFridayScreen />);
  const heading = screen.getByTestId('black-friday-header-title');
  expect(heading.props.children).toBe(longTitle);
  expect(heading.props.numberOfLines).toBeUndefined();
  expect(screen.getByTestId('black-friday-product-price-vans').props.children).toBe('261.726\u00a0TND');
  expect(screen.getByText('348.968 TND')).toBeTruthy();
});

test.each(['unavailable', 'expired'])('never opens an alternative collection for %s links', async id => {
  const includingExpired = { ...campaign, collections: [...campaign.collections, { ...collection('expired', 'Terminée', ['tommy']), endsAt: '2000-01-01T00:00:00.000Z' }] };
  jest.mocked(useBlackFriday).mockReturnValue({ data: includingExpired, isPending: false, isError: false } as ReturnType<typeof useBlackFriday>);
  mockParams.mockReturnValue({ view: 'products', collection: id });
  await mount(<BlackFridayScreen />);
  expect(screen.queryByTestId('black-friday-product-grid')).toBeNull();
  expect(screen.getByText('Aucun article remisé pour le moment.')).toBeTruthy();
});
