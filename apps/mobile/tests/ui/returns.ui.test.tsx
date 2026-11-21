import { cloneElement, type ReactElement } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { fetchOrderDetail, fetchOrders, type OrderDetail, type RecentOrder } from '@/api/account';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';
import ReturnsHome from '../../app/returns';
import ReturnRequest from '../../app/returns/request';
import ReturnGuide from '../../app/returns/guide';
import ReturnPolicy from '../../app/returns/policy';

const mockSession = jest.fn();
jest.mock('@/state/session', () => ({ useSession: () => mockSession() }));
jest.mock('@/api/account', () => ({ fetchOrders: jest.fn(), fetchOrderDetail: jest.fn() }));
jest.mock('@/api/hooks', () => ({ useFooterInfo: () => ({ data: { channels: [{ id: 'email', label: 'E-mail', href: 'mailto:support@example.test' }] } }) }));
jest.mock('@/design/appImage', () => ({ AppImage: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const delivered: RecentOrder = { id: 'order-a', status: 'DELIVERED', orderNumber: 'DEMO-A', createdAt: '2026-11-01T12:00:00Z', paymentStatus: 'PAID', totalTnd: 19.125, itemCount: 2, imageUrl: '' };
const shipped: RecentOrder = { ...delivered, id: 'order-b', status: 'SHIPPED', orderNumber: 'DEMO-B' };
const detail: OrderDetail = {
  ...delivered, paymentMethod: 'CARD', breakdown: {}, paidTnd: 19.125, remainderTnd: 0, governorate: '', addressLine: '',
  history: [], tracking: { carrier: '', trackingNumber: '', trackingUrl: '', shippedAt: '' }, invoiceNumber: '',
  transfer: { companyName: '', bankRib: '', posteAccount: '', reviewDelay: '' }, paymentOptions: { choices: [], cardGatewayAvailable: false },
  items: [{ id: 'item-a', title: 'Baskets test', variant: 'Taille 39' }, { id: 'item-b', title: 'Veste test', variant: 'M' }]
    .map(item => ({ ...item, quantity: 1, unitPriceTnd: 0, totalTnd: 0, imageUrl: '', sourceUrl: '' })),
};

async function mount(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = () => <QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider>{cloneElement(node)}</ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>;
  const view = render(tree());
  await act(async () => {});
  return () => view.rerender(tree());
}
beforeEach(() => { jest.clearAllMocks(); jest.mocked(fetchOrders).mockReset(); jest.mocked(fetchOrderDetail).mockReset(); mockSession.mockReturnValue({ status: 'signedIn', account: { id: 'first' } }); });

it('opens the return flow, guide and FAQ without pretending to have a refund history', async () => {
  await mount(<ReturnsHome />);
  expect(screen.getByText(/Le suivi et l’historique des remboursements ne sont pas consultables/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Retourner un article' }));
  expect(router.push).toHaveBeenLastCalledWith('/returns/request');
  fireEvent.press(screen.getByRole('link', { name: 'Comment faire un retour ?' }));
  expect(router.push).toHaveBeenLastCalledWith('/returns/guide');
  fireEvent.press(screen.getByRole('link', { name: 'Politique de retour et conditions' }));
  expect(router.push).toHaveBeenLastCalledWith('/returns/policy');
  expect(fetchOrders).not.toHaveBeenCalled();
});

it('uses real delivered orders, validates selection and opens only the configured contact', async () => {
  const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
  jest.mocked(fetchOrders).mockResolvedValue([delivered, shipped]);
  jest.mocked(fetchOrderDetail).mockResolvedValue(detail);
  try {
    await mount(<ReturnRequest />);
    expect(await screen.findByText('DEMO-A')).toBeTruthy();
    expect(screen.queryByText('DEMO-B')).toBeNull();
    fireEvent.press(screen.getByRole('radio'));
    const item = await screen.findByRole('checkbox', { name: 'Baskets test · Taille 39' });
    fireEvent.press(screen.getByRole('button', { name: 'Contacter le support pour ce retour' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Sélectionnez au moins un article.');
    fireEvent.press(item);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Articles sélectionnés : 1')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Contacter le support pour ce retour' }));
    expect(screen.getByText('Baskets test · Taille 39')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    await act(async () => fireEvent.press(screen.getByRole('link', { name: 'E-mail' })));
    expect(open).toHaveBeenCalledWith('mailto:support@example.test');
  } finally { open.mockRestore(); }
});

it('distinguishes a real empty list from a failed request and provides an expandable fallback', async () => {
  jest.mocked(fetchOrders).mockResolvedValue([]);
  await mount(<ReturnRequest />);
  expect(await screen.findByText(/Aucune commande livrée/)).toBeTruthy();
  const toggle = screen.getByRole('button', { name: 'Vous ne trouvez pas vos articles ?' });
  expect(toggle.props.accessibilityState.expanded).toBe(false);
  fireEvent.press(toggle);
  expect(screen.getByRole('button', { name: 'Vous ne trouvez pas vos articles ?' }).props.accessibilityState.expanded).toBe(true);
  fireEvent.press(screen.getByRole('link', { name: 'Retours' }));
  expect(router.push).toHaveBeenCalledWith('/returns');
});

it('does not show an empty list on request failure', async () => {
  jest.mocked(fetchOrders).mockRejectedValue(new Error('network'));
  await mount(<ReturnRequest />);
  expect(await screen.findByRole('button', { name: 'Réessayer' })).toBeTruthy();
  expect(screen.queryByText(/Aucune commande livrée/)).toBeNull();
});

it('clears the chosen item, order and open help on account switch and hides data at logout', async () => {
  jest.mocked(fetchOrders).mockResolvedValueOnce([delivered]).mockResolvedValueOnce([]);
  jest.mocked(fetchOrderDetail).mockResolvedValue(detail);
  const rerender = await mount(<ReturnRequest />);
  fireEvent.press(await screen.findByRole('radio'));
  fireEvent.press(await screen.findByRole('checkbox', { name: 'Baskets test · Taille 39' }));
  fireEvent.press(screen.getByRole('button', { name: 'Contacter le support pour ce retour' }));
  expect(screen.getByText('Baskets test · Taille 39')).toBeTruthy();
  mockSession.mockReturnValue({ status: 'signedIn', account: { id: 'second' } });
  rerender();
  expect(screen.queryAllByText('DEMO-A')).toHaveLength(0);
  expect(screen.queryByTestId('order-help-dialog')).toBeNull();
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('link', { name: 'E-mail' })).toBeNull();
  expect(await screen.findByText(/Aucune commande livrée/)).toBeTruthy();
  mockSession.mockReturnValue({ status: 'signedOut' });
  rerender();
  expect(screen.getByRole('button', { name: 'Se connecter' })).toBeTruthy();
  expect(fetchOrders).toHaveBeenCalledTimes(2);
});

it('links to the official terms and opens support with the selected order number', async () => {
  jest.mocked(fetchOrders).mockResolvedValue([delivered, shipped]);
  await mount(<ReturnPolicy />);
  fireEvent.press(screen.getByRole('link', { name: 'Lire les conditions de vente complètes' }));
  expect(router.push).toHaveBeenCalledWith('/legal/terms');
  const buttons = await screen.findAllByRole('button', { name: 'Obtenir de l’aide pour cette commande' });
  expect(buttons).toHaveLength(2);
  fireEvent.press(buttons[1]!);
  const dialog = within(screen.getByTestId('order-help-dialog'));
  expect(dialog.getByText('DEMO-B')).toBeTruthy();
  expect(dialog.queryByText('DEMO-A')).toBeNull();
});

it('offers actionable guidance without copying unapproved retailer promises', async () => {
  await mount(<ReturnGuide />);
  expect(screen.getByText(/Attendez ses instructions/)).toBeTruthy();
  expect(screen.queryByText(/30 jours|14 jours|Zalando/)).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retourner un article' }));
  expect(router.push).toHaveBeenCalledWith('/returns/request');
});
