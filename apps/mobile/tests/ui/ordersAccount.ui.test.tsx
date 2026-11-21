import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import OrderDetailScreen from '../../app/orders/[id]';
import OrdersScreen from '../../app/orders';
import { fetchOrderDetail, fetchOrders, parseOrderDetail } from '../../src/api/account';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() }, useLocalSearchParams: () => ({ id: 'real-order' }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../../src/api/account', () => ({ ...jest.requireActual('../../src/api/account'), fetchOrders: jest.fn(), fetchOrderDetail: jest.fn() }));
const mockSession: { status: string; account: { id: string } | null } = { status: 'signedIn', account: { id: 'first' } };
jest.mock('../../src/state/session', () => ({ useSession: () => mockSession }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-web-browser', () => ({}));
jest.mock('@/design/appImage', () => ({ AppImage: () => null }));
jest.mock('@/api/hooks', () => ({ useFooterInfo: () => ({ isPending: false, data: { channels: [] } }) }));
beforeEach(() => { jest.clearAllMocks(); mockSession.status = 'signedIn'; mockSession.account = { id: 'first' }; });

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

async function mount(node: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider>{node}</ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>);
  await act(async () => {});
}

test('shows the actual empty state and links back to shopping', async () => {
  jest.mocked(fetchOrders).mockResolvedValueOnce([]);
  await mount(<OrdersScreen />);
  expect(await screen.findByText('Vous n’avez pas encore passé de commande.')).toBeTruthy();
  expect(screen.queryByTestId('orders-period')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Continuer mes achats' }));
  expect(router.navigate).toHaveBeenCalledWith('/(tabs)');
});

test('filters by date, does not hide historical orders behind an empty account message, and opens the exact id', async () => {
  jest.mocked(fetchOrders).mockResolvedValueOnce([{ id: 'old', orderNumber: 'AYR-200001', status: 'CREATED',
    createdAt: '2021-01-01T10:00:00Z', itemCount: 1, paymentStatus: 'PENDING', imageUrl: '/x.jpg',
    previewName: 'Chaussures', previewSize: '39', totalTnd: 19 }]);
  await mount(<OrdersScreen />);
  expect(await screen.findByText('Aucune commande sur cette période.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Toutes les commandes' }));
  expect(screen.getByText('Chaussures')).toBeTruthy();
  expect(screen.getByText('Taille : 39')).toBeTruthy();
  fireEvent.press(screen.getByTestId('order-old'));
  expect(router.push).toHaveBeenCalledWith({ pathname: '/orders/[id]', params: { id: 'old' } });
});

test('displays official bank data only for the relevant active transfer order and renders stored amounts', async () => {
  const stored = { id: 'real-order', order_number: 'AYR-300001', status: 'AWAITING_DEPOSIT', payment_status: 'PENDING',
    payment_method: 'BANK_TRANSFER', subtotal_tnd: 65, shipping_tnd: 0, total_tnd: 65, paid_amount_tnd: 0, remainder_tnd: 65,
    address: 'Adresse enregistrée', governorate: 'Tunis', created_at: '2026-11-19T10:00:00Z',
    paymentOptions: { transfer: { companyName: 'Bénéficiaire de test', bankRib: 'RIB-TEST', posteAccount: 'POSTE-TEST' } } };
  jest.mocked(fetchOrderDetail).mockResolvedValueOnce(parseOrderDetail(stored));
  await mount(<OrderDetailScreen />);
  const transfer = within(await screen.findByTestId('order-transfer-details'));
  expect(transfer.getByText('RIB-TEST')).toBeTruthy();
  expect(transfer.queryByText('POSTE-TEST')).toBeNull();
  expect(screen.getByText('Adresse enregistrée')).toBeTruthy();
  expect(screen.getByTestId('order-progress').props.accessibilityValue.now).toBe(1);
});

test.each(['CARD', 'BANK_TRANSFER'])('does not show transfer directions for a settled %s order', async method => {
  jest.mocked(fetchOrderDetail).mockResolvedValueOnce(parseOrderDetail({ id: 'real-order', order_number: 'AYR-300001',
    status: 'DELIVERED', payment_method: method, payment_status: 'PAID', paymentOptions: { transfer: { bankRib: 'RIB-TEST' } } }));
  await mount(<OrderDetailScreen />);
  expect(await screen.findByText('Livrée')).toBeTruthy();
  expect(screen.queryByTestId('order-transfer-details')).toBeNull();
  expect(screen.queryByText('RIB-TEST')).toBeNull();
  expect(screen.getByTestId('order-progress').props.accessibilityValue.now).toBe(5);
});

test('does not confuse a failed request with an empty order history', async () => {
  jest.mocked(fetchOrders).mockRejectedValueOnce(new Error('offline'));
  await mount(<OrdersScreen />);
  expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeTruthy();
  expect(screen.queryByTestId('orders-empty')).toBeNull();
});

test('does not expose configured bank instructions in an order awaiting card payment', async () => {
  jest.mocked(fetchOrderDetail).mockResolvedValueOnce(parseOrderDetail({ id: 'real-order', order_number: 'AYR-300001',
    status: 'AWAITING_DEPOSIT', payment_method: 'CARD', payment_status: 'PENDING',
    paymentOptions: { choices: ['CARD'], transfer: { bankRib: 'RIB-TEST' } } }));
  await mount(<OrderDetailScreen />);
  expect(await screen.findByRole('button', { name: 'Payer par carte' })).toBeTruthy();
  expect(screen.queryByTestId('order-transfer-details')).toBeNull();
  expect(screen.queryByText('RIB-TEST')).toBeNull();
});


test('opens the dedicated return flow and FAQ from orders', async () => {
  jest.mocked(fetchOrders).mockResolvedValueOnce([]);
  await mount(<OrdersScreen />);
  fireEvent.press(screen.getByRole('button', { name: 'Retourner un article' }));
  expect(router.push).toHaveBeenLastCalledWith('/returns/request');
  fireEvent.press(screen.getByRole('link', { name: 'Politique de retour et conditions' }));
  expect(router.push).toHaveBeenLastCalledWith('/returns/policy');
});
