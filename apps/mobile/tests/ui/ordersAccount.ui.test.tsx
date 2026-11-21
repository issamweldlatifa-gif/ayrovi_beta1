import { act, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrdersScreen from '../../app/orders';
import { fetchOrders } from '../../src/api/account';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../src/api/account', () => ({ fetchOrders: jest.fn() }));
const mockSession: { status: string; account: { id: string } | null } = { status: 'signedIn', account: { id: 'first' } };
jest.mock('../../src/state/session', () => ({ useSession: () => mockSession }));

test('the order list follows the active account and stays private after logout', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const mockFetch = jest.mocked(fetchOrders);
  mockFetch.mockResolvedValue([]);
  client.setQueryData(['account', 'orders', 'first'], [
    { id: 'first-order', orderNumber: 'AYR-100001', status: 'CREATED', paymentStatus: 'PENDING', itemCount: 1, totalTnd: 10 },
  ]);
  const tree = () => <QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider>
    <OrdersScreen />
  </ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>;
  const view = render(tree());
  await act(async () => {});
  expect(screen.getByTestId('order-first-order')).toBeTruthy();
  mockSession.account = { id: 'second' };
  view.rerender(tree());
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  expect(screen.queryByTestId('order-first-order')).toBeNull();
  mockSession.status = 'signedOut';
  mockSession.account = null;
  view.rerender(tree());
  expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
  expect(mockFetch).toHaveBeenCalledTimes(1);
  view.unmount();
  client.clear();
});
