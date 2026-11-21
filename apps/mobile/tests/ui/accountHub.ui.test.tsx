import { LoyaltyDemoProvider, useLoyaltyDemo } from '@/features/loyalty/LoyaltyDemoProvider';
import { Pressable } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import AccountScreen from '../../app/(tabs)/account';
import { fetchOverview } from '@/api/account';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockSession = jest.fn();
jest.mock('@/state/session', () => ({ useSession: () => mockSession() }));
jest.mock('@/api/account', () => ({ fetchOverview: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }) }));
jest.mock('@/design/appImage', () => ({ AppImage: () => null }));

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider><LoyaltyDemoProvider><AccountScreen />
  </LoyaltyDemoProvider></ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>);
  await act(async () => {});
}

beforeEach(() => jest.clearAllMocks());

test('shows the new section layout without audience chips and labels the loyalty balance as a demo', async () => {
  mockSession.mockReturnValue({ status: 'signedOut' });
  await mount();
  expect(screen.getByRole('header', { name: 'Mon compte' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Résumé' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Données et confidentialité' })).toBeTruthy();
  const banner = within(screen.getByTestId('account-loyalty-banner'));
  expect(banner.getByText('ZAYROVI Plus · Light')).toBeTruthy();
  expect(banner.getByText('Démo')).toBeTruthy();
  fireEvent.press(screen.getByTestId('account-loyalty-banner'));
  expect(router.push).toHaveBeenLastCalledWith('/account/loyalty');
  fireEvent.press(screen.getByTestId('account-link-loyalty'));
  expect(router.push).toHaveBeenLastCalledWith('/account/loyalty');
  for (const text of ['Femme', 'Homme', 'Enfant', 'Gérer mon compte']) expect(screen.queryByText(text)).toBeNull();
  fireEvent.press(screen.getByTestId('account-link-orders'));
  expect(router.push).toHaveBeenLastCalledWith('/sign-in');
  fireEvent.press(screen.getByTestId('account-link-privacy'));
  expect(router.push).toHaveBeenLastCalledWith('/legal/privacy');
  expect(fetchOverview).not.toHaveBeenCalled();
});

test('retains functional account links, real unread count and sign-out', async () => {
  const signOut = jest.fn(async () => {});
  mockSession.mockReturnValue({ status: 'signedIn', verified: true, account: { id: 'x', displayName: 'Sami' }, signOut });
  jest.mocked(fetchOverview).mockResolvedValue({ counts: { unreadNotifications: 3 } } as Awaited<ReturnType<typeof fetchOverview>>);
  await mount();
  expect(screen.getByText('Sami')).toBeTruthy();
  expect(await within(screen.getByTestId('account-link-notifications')).findByText('3')).toBeTruthy();
  fireEvent.press(screen.getByTestId('account-link-orders'));
  expect(router.push).toHaveBeenLastCalledWith('/orders');
  fireEvent.press(screen.getByTestId('account-link-returns'));
  expect(router.push).toHaveBeenLastCalledWith('/returns');
  fireEvent.press(screen.getByTestId('account-link-profile'));
  expect(router.push).toHaveBeenLastCalledWith('/account/profile');
  await act(async () => { fireEvent.press(screen.getByTestId('account-sign-out')); });
  expect(signOut).toHaveBeenCalledTimes(1);
});


test('the top profile strip reflects simulated pending points and the confirmed tier, scoped to the current viewer', async () => {
  mockSession.mockReturnValue({ status: 'signedOut' });
  function DemoControls() {
    const [, dispatch] = useLoyaltyDemo();
    return <>
      <Pressable testID="try-purchase" onPress={() => dispatch({ type: 'purchase' })} />
      <Pressable testID="try-confirm" onPress={() => dispatch({ type: 'confirm' })} />
      <Pressable testID="try-mission" onPress={() => { dispatch({ type: 'mission', id: 'sizes' }); dispatch({ type: 'mission', id: 'birthday' }); }} />
    </>;
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = (owner: string) => <QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider>
    <LoyaltyDemoProvider owner={owner}><AccountScreen /><DemoControls /></LoyaltyDemoProvider>
  </ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>;
  const view = render(tree('first'));
  await act(async () => {});
  const banner = () => within(screen.getByTestId('account-loyalty-banner'));
  fireEvent.press(screen.getByTestId('try-purchase'));
  expect(banner().getByText('À confirmer : 40 points')).toBeTruthy();
  expect(banner().getByText('0 points confirmés')).toBeTruthy();
  fireEvent.press(screen.getByTestId('try-confirm'));
  fireEvent.press(screen.getByTestId('try-mission'));
  expect(banner().getByText('100 points confirmés')).toBeTruthy();
  expect(banner().getByText('ZAYROVI Plus · Shine')).toBeTruthy();
  view.rerender(tree('second'));
  expect(banner().getByText('0 points confirmés')).toBeTruthy();
  expect(banner().getByText('ZAYROVI Plus · Light')).toBeTruthy();
});
