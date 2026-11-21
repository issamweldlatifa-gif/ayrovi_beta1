import { LoyaltyDemoProvider, useLoyaltyDemo } from '@/features/loyalty/LoyaltyDemoProvider';
import { Pressable } from 'react-native';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import AccountScreen from '../../app/(tabs)/account';
import WalletScreen from '../../app/account/wallet';
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

async function mount(element = <AccountScreen />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider><LoyaltyDemoProvider>{element}
  </LoyaltyDemoProvider></ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>);
  await act(async () => {});
}

beforeEach(() => jest.clearAllMocks());

test('shows the new section layout without audience chips and labels the loyalty balance as a demo', async () => {
  mockSession.mockReturnValue({ status: 'signedOut' });
  await mount();
  expect(screen.getByRole('header', { name: 'Mon compte' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Résumé' })).toBeTruthy();
  const titles = screen.getAllByText(/^(Mon compte|Wallet|Résumé)$/);
  expect(titles.map(node => node.props.children)).toEqual(['Mon compte', 'Wallet', 'Résumé']);
  const wallet = screen.getByRole('link', { name: 'Wallet · 0.00 TND · Non activé' });
  expect(within(wallet).getByText('0.00 TND')).toBeTruthy();
  fireEvent.press(wallet);
  expect(router.push).toHaveBeenLastCalledWith('/account/wallet');
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
  fireEvent.press(screen.getByTestId('account-link-settings'));
  expect(router.push).toHaveBeenLastCalledWith('/account/settings');
  expect(fetchOverview).not.toHaveBeenCalled();
});

test('retains functional account links, real unread count and sign-out', async () => {
  const signOut = jest.fn(async () => {});
  mockSession.mockReturnValue({ status: 'signedIn', verified: true, account: { id: 'x', displayName: 'Sami' }, signOut });
  jest.mocked(fetchOverview).mockResolvedValue({ counts: { unreadNotifications: 3 } } as Awaited<ReturnType<typeof fetchOverview>>);
  await mount();
  expect(screen.getByText('Sami')).toBeTruthy();
  fireEvent.press(screen.getByTestId('account-wallet-card'));
  expect(router.push).toHaveBeenLastCalledWith('/account/wallet');
  expect(await within(screen.getByTestId('account-link-notifications')).findByText('3')).toBeTruthy();
  fireEvent.press(screen.getByTestId('account-link-orders'));
  expect(router.push).toHaveBeenLastCalledWith('/orders');
  fireEvent.press(screen.getByTestId('account-link-gifts'));
  expect(router.push).toHaveBeenLastCalledWith('/account/gift-cards');
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


test('the Wallet screen only shows the inactive balance and has no recharge action', async () => {
  mockSession.mockReturnValue({ status: 'signedIn', account: { id: 'wallet-owner' } });
  await mount(<WalletScreen />);
  expect(screen.getByRole('header', { name: 'Wallet' })).toBeTruthy();
  expect(screen.getByText('0.00 TND')).toBeTruthy();
  expect(screen.getByText('Le Wallet n’est pas encore activé. Le rechargement n’est pas disponible.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /recharg/i })).toBeNull();
  expect(fetchOverview).not.toHaveBeenCalled();
});

test('a guest opening the Wallet screen directly is prompted to sign in', async () => {
  mockSession.mockReturnValue({ status: 'signedOut' });
  await mount(<WalletScreen />);
  expect(screen.queryByText('0.00 TND')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Se connecter' }));
  expect(router.push).toHaveBeenLastCalledWith('/sign-in');
});
