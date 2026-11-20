import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { BlackFridaySection } from '@/features/home/BlackFridaySection';
import { UpcomingStoresSection } from '@/features/home/UpcomingStoresSection';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import type { Promotion } from '@/api/sections';
import { UPCOMING_WEEK_MS } from '../../../../shared/aywebsUpcoming';

jest.mock('expo-router', () => ({ router: { push: jest.fn() }, useIsFocused: () => true }));
jest.mock('@/features/home/upcomingReminder', () => ({
  supportsUpcomingReminder: true, readUpcomingReminders: async () => new Map(), toggleUpcomingReminder: async () => true,
}));
jest.mock('@/design/appImage', () => ({ AppImage: () => null }));

async function mount(children: React.ReactNode) {
  const result = render(<PrefsProvider><I18nProvider><ThemeProvider>{children}</ThemeProvider></I18nProvider></PrefsProvider>);
  await act(async () => {});
  return result;
}
const promo: Promotion = { id: 'deal', name: 'Chaussures de sport', description: '', image: '/media/deal.jpg', status: 'ACTIVE',
  discountType: 'PERCENTAGE', value: 25, promoCode: '', startsAt: '', endsAt: '', productIds: ['shoe'], arrivalIds: [] };

test('the home campaign renders only real promotion data and routes to its linked item or all offers', async () => {
  await mount(<BlackFridaySection promotions={[promo]} />);
  expect(screen.getByText(/Black Friday/)).toBeTruthy();
  expect(screen.getByText(/25 %/)).toBeTruthy();
  fireEvent.press(screen.getByRole('link', { name: promo.name }));
  expect(router.push).toHaveBeenLastCalledWith({ pathname: '/product/[id]', params: { id: 'shoe' } });
  fireEvent.press(screen.getByTestId('black-friday-all'));
  expect(router.push).toHaveBeenLastCalledWith('/promotions');
});

test('does not invent tiles or savings when the promotion feed is empty', async () => {
  await mount(<BlackFridaySection promotions={[]} />);
  expect(screen.queryByTestId('black-friday-rail')).toBeNull();
  expect(screen.getByTestId('black-friday-all')).toBeTruthy();
});

test('shows upcoming stores with one-week countdowns and a truthful local reminder state', async () => {
  const now = Date.now();
  await mount(<UpcomingStoresSection data={{ offsetMs: 0, stores: [
    { id: 'clarks', name: 'Clarks', opensAt: new Date(now + UPCOMING_WEEK_MS).toISOString(), image: '', logo: '/stores/clarks.png' },
    { id: 'expired', name: 'Expired', opensAt: new Date(now - 10_000).toISOString(), image: '', logo: '' },
  ] }} />);
  expect(screen.getByTestId('upcoming-store-clarks')).toBeTruthy();
  expect(screen.queryByTestId('upcoming-store-expired')).toBeNull();
  expect(screen.getByText('7j 0h 0m 0s')).toBeTruthy();
  await act(async () => { fireEvent.press(screen.getByRole('button', { name: 'Me notifier — Clarks' })); });
  expect(screen.getByRole('button', { name: 'Annuler le rappel — Clarks', selected: true })).toBeTruthy();
});
