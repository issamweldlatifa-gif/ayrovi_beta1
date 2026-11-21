import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Checkout from '../../app/checkout';
import { createAddress, fetchAddresses, type Address } from '@/api/account';
import { submitCheckout, type CheckoutResult } from '@/api/checkout';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockSession = jest.fn();
jest.mock('@/state/session', () => ({ useSession: () => mockSession() }));
jest.mock('@/session/session', () => ({ useSessionId: () => 'test-session' }));
jest.mock('@/api/account', () => ({ fetchAddresses: jest.fn(), createAddress: jest.fn() }));
jest.mock('@/api/cart', () => ({ fetchZayroviCart: jest.fn(async () => ({ units: 1, items: [], totalTND: 80, productSubtotalTND: 70, deliveryTND: 10 })),
  zayroviCartReadiness: () => ({ canCheckout: true, staleLines: [], blockReason: '' }) }));
jest.mock('@/api/checkout', () => ({ ...jest.requireActual('@/api/checkout'), fetchCommercePolicy: jest.fn(async () =>
  jest.requireActual('@/api/checkout').parseCommercePolicy({ governorates: ['Tunis'], deposit: { percent: 30, cardDiscountPercent: 0 } })), submitCheckout: jest.fn() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true } }));
jest.mock('expo-web-browser', () => ({}));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const home: Address = { id: 'home', label: 'Maison test', recipientName: 'Sami Test', phone: '+21698123456', addressLine: '10 Rue Test',
  city: 'Tunis', postalCode: '1000', deliveryNotes: 'Étage 2', governorate: 'Tunis', isDefault: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockReturnValue({ status: 'signedIn', account: { id: 'buyer', email: 'buyer@example.test', emailVerified: true, phoneVerified: false } });
  jest.mocked(fetchAddresses).mockResolvedValue([home]);
});

async function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = () => <QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider><Checkout /></ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>;
  const view = render(tree());
  await act(async () => {});
  return () => view.rerender(tree());
}

it('prefills the saved default but sends current order details without saving silent changes', async () => {
  jest.mocked(submitCheckout).mockResolvedValue({ orderId: 'one', orderNumber: 'CMD-1', totalTND: 80, itemCount: 1, deposit: {} } as CheckoutResult);
  await mount();
  expect(screen.getByLabelText('Rue et numéro').props.value).toBe('10 Rue Test');
  expect(screen.getByLabelText('Ville (facultatif)').props.value).toBe('Tunis');
  fireEvent.changeText(screen.getByLabelText(/Instructions de livraison/), 'Sonner 1');
  expect(screen.getByRole('radio', { name: /Maison test/ }).props.accessibilityState.checked).toBe(false);
  fireEvent.press(screen.getByRole('checkbox'));
  fireEvent.press(screen.getByTestId('checkout-submit'));
  await waitFor(() => expect(submitCheckout).toHaveBeenCalledWith(expect.objectContaining({ name: 'Sami Test', city: 'Tunis', address: '10 Rue Test, 1000 Tunis, Sonner 1', deliveryMode: 'home' }), { sessionId: 'test-session' }));
  expect(createAddress).not.toHaveBeenCalled();
});

it('writes a new address only after explicit save and clears the draft on a customer switch', async () => {
  jest.mocked(createAddress).mockImplementation(async input => ({ ...home, ...input, id: 'new', isDefault: false }));
  const rerender = await mount();
  fireEvent.changeText(screen.getByLabelText('Rue et numéro'), '11 Rue Test');
  const save = screen.getByRole('button', { name: 'Enregistrer dans mes adresses' });
  fireEvent.press(save);
  await waitFor(() => expect(createAddress).toHaveBeenCalledWith(expect.objectContaining({ addressLine: '11 Rue Test', city: 'Tunis', postalCode: '1000' })));
  expect(await screen.findByText('Adresse enregistrée dans votre carnet.')).toBeTruthy();
  jest.mocked(fetchAddresses).mockResolvedValue([]);
  mockSession.mockReturnValue({ status: 'signedIn', account: { id: 'second', emailVerified: true, displayName: 'Second client' } });
  rerender();
  expect(screen.getByLabelText('Rue et numéro').props.value).toBe('');
  expect(screen.getByLabelText('Nom complet du destinataire').props.value).toBe('Second client');
});
