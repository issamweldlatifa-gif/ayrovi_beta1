import { cloneElement, type ReactElement } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import Profile from '../../app/account/profile';
import ProfileEdit from '../../app/account/profile-edit';
import AddressEdit from '../../app/account/address-edit';
import Data from '../../app/account/data';
import Password from '../../app/account/password';
import Notifications from '../../app/account/notifications';
import { changePassword, deleteCustomerAccount, fetchAddresses, fetchNotifications, markNotificationsRead, updateAddress, updateProfile, type Address, type CustomerAccount } from '@/api/account';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockSession = jest.fn();
const mockParams = jest.fn();
jest.mock('@/state/session', () => ({ useSession: () => mockSession() }));
jest.mock('@/api/account', () => ({
  fetchOverview: jest.fn(async () => ({})), fetchAddresses: jest.fn(), updateProfile: jest.fn(), updateAddress: jest.fn(), deleteAddress: jest.fn(),
  changePassword: jest.fn(), fetchSecurity: jest.fn(async () => ({ hasPassword: true })), deleteCustomerAccount: jest.fn(),
  fetchNotifications: jest.fn(), markNotificationsRead: jest.fn(),
}));
jest.mock('@/api/checkout', () => ({ ...jest.requireActual('@/api/checkout'), fetchCommercePolicy: jest.fn(async () => ({ governorates: ['Tunis'] })) }));
jest.mock('expo-image-picker', () => ({}));
jest.mock('@/api/hooks', () => ({ useFooterInfo: () => ({ data: { channels: [] } }) }));
jest.mock('@/design/appImage', () => ({ AppImage: () => null }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }, useLocalSearchParams: () => mockParams() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));

const account: CustomerAccount = { id: 'a1', email: 'sami@example.test', displayName: 'Sami Test', phone: '+21620123000', avatarUrl: '',
  phoneVerified: true, emailVerified: true, status: 'ACTIVE', locale: 'fr', marketingOptIn: false };
const address: Address = { id: 'a-home', label: 'Domicile test', recipientName: 'Sami Test', phone: '+21620123000', city: 'Tunis', governorate: 'Tunis',
  postalCode: '1000', addressLine: 'Adresse de test', deliveryNotes: '', isDefault: true };
const mockSignOut = jest.fn(async () => {});
const mockAdopt = jest.fn(async () => {});
const mockRefresh = jest.fn(async () => {});

async function mount(node: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = () => <QueryClientProvider client={client}><PrefsProvider><I18nProvider><ThemeProvider>{cloneElement(node)}</ThemeProvider></I18nProvider></PrefsProvider></QueryClientProvider>;
  const view = render(tree());
  await act(async () => {});
  return () => view.rerender(tree());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockReturnValue({ status: 'signedIn', account, signOut: mockSignOut, refreshAccount: mockRefresh, adoptSession: mockAdopt });
  mockParams.mockReturnValue({});
  jest.mocked(fetchAddresses).mockResolvedValue([]);
  jest.mocked(fetchNotifications).mockReset();
});

it('links the summary to editing, security and data; shows a real empty address book', async () => {
  await mount(<Profile />);
  expect(screen.getByText(account.email)).toBeTruthy();
  expect(await screen.findByText('Aucune adresse enregistrée.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Modifier mes informations' }));
  expect(router.push).toHaveBeenLastCalledWith('/account/profile-edit');
  fireEvent.press(screen.getByRole('link', { name: 'Changer le mot de passe' }));
  expect(router.push).toHaveBeenLastCalledWith('/account/password');
  fireEvent.press(screen.getByRole('link', { name: 'Demander ou supprimer des données' }));
  expect(router.push).toHaveBeenLastCalledWith('/account/data');
  fireEvent.press(screen.getByRole('button', { name: 'Ajouter une adresse' }));
  expect(router.push).toHaveBeenLastCalledWith('/account/address-edit');
});

it('saves the actual identity fields and leaves the verified phone read-only', async () => {
  await mount(<ProfileEdit />);
  expect(screen.getByLabelText('Téléphone').props.editable).toBe(false);
  fireEvent.changeText(screen.getByLabelText('Nom complet'), 'Sami Modifié');
  fireEvent.press(screen.getByRole('button', { name: 'Enregistrer' }));
  await waitFor(() => expect(updateProfile).toHaveBeenCalledWith({ displayName: 'Sami Modifié', email: account.email, marketingOptIn: false }));
  expect(mockRefresh).toHaveBeenCalledTimes(1);
});

it('edits only the selected account address, preserves the default flag and submits the postal code', async () => {
  mockParams.mockReturnValue({ id: address.id });
  jest.mocked(updateAddress).mockResolvedValue(address);
  jest.mocked(fetchAddresses).mockResolvedValue([address]);
  await mount(<AddressEdit />);
  expect((await screen.findByLabelText('Rue et numéro')).props.value).toBe(address.addressLine);
  fireEvent.changeText(screen.getByLabelText('Code postal (facultatif)'), '1001');
  fireEvent.press(screen.getByRole('button', { name: 'Enregistrer l’adresse' }));
  await waitFor(() => expect(updateAddress).toHaveBeenCalledWith(address.id, expect.objectContaining({ postalCode: '1001', isDefault: true })));
  expect(router.back).toHaveBeenCalled();
});

it('does not allow a destructive account operation without the second step and explicit acknowledgement', async () => {
  await mount(<Data />);
  fireEvent.press(screen.getByRole('tab', { name: 'Supprimer le compte' }));
  fireEvent.press(screen.getByRole('button', { name: 'Supprimer mon compte' }));
  expect(deleteCustomerAccount).not.toHaveBeenCalled();
  const button = () => screen.getByRole('button', { name: 'Confirmer la suppression définitive' });
  expect(button()).toBeDisabled();
  fireEvent(screen.getByRole('switch'), 'valueChange', true);
  await act(async () => fireEvent.press(button()));
  expect(deleteCustomerAccount).toHaveBeenCalledTimes(1);
  expect(mockSignOut).toHaveBeenCalledTimes(1);
  expect(router.replace).toHaveBeenCalledWith('/(tabs)/account');
});

it('requires the matching password confirmation then adopts the renewed session', async () => {
  const issue = { account, csrfToken: 'renewed', expiresAt: '', sessionToken: 'renewed', linkedHistoricalOrders: 0 };
  jest.mocked(changePassword).mockResolvedValue(issue);
  await mount(<Password />);
  fireEvent.changeText(await screen.findByLabelText('Mot de passe actuel'), 'sample-current');
  fireEvent.changeText(screen.getByLabelText('Nouveau mot de passe'), 'sample-replacement');
  fireEvent.changeText(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'not-a-match');
  expect(screen.getByRole('button', { name: 'Modifier le mot de passe' })).toBeDisabled();
  expect(changePassword).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByLabelText('Confirmer le nouveau mot de passe'), 'sample-replacement');
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Modifier le mot de passe' })));
  expect(changePassword).toHaveBeenCalledWith('sample-current', 'sample-replacement');
  expect(mockAdopt).toHaveBeenCalledWith(issue);
});

it('renders the illustration only for a successful empty inbox', async () => {
  jest.mocked(fetchNotifications).mockResolvedValueOnce([]);
  await mount(<Notifications />);
  expect(await screen.findByTestId('notifications-empty')).toBeTruthy();
});

it('preserves the real unread inbox and hides it when the account signs out', async () => {
  jest.mocked(fetchNotifications).mockResolvedValue([{ id: 'n1', type: 'order', title: 'Votre commande', message: 'Une mise à jour.', readAt: '', createdAt: '', actionUrl: '' }]);
  const rerender = await mount(<Notifications />);
  expect(await screen.findByText('Votre commande')).toBeTruthy();
  expect(screen.queryByTestId('notifications-empty')).toBeNull();
  await act(async () => fireEvent.press(screen.getByRole('button', { name: 'Tout marquer comme lu (1)' })));
  expect(markNotificationsRead).toHaveBeenCalled();
  mockSession.mockReturnValue({ status: 'signedOut', account: null });
  rerender();
  expect(screen.queryByText('Votre commande')).toBeNull();
});
