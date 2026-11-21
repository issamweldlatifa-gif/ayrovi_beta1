import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import GiftShop from '../../app/(tabs)/gift-cards';
import GiftWallet from '../../app/account/gift-cards';
import GiftDesign from '../../app/gift-cards/design';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

const mockSession = jest.fn();
const mockParams = jest.fn();
jest.mock('@/state/session', () => ({ useSession: () => mockSession() }));
jest.mock('expo-router', () => ({ router: { push: jest.fn(), navigate: jest.fn() }, useLocalSearchParams: () => mockParams() }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }) }));
jest.mock('@/design/appImage', () => ({ AppImage: () => null }));

const wrap = (Component: typeof GiftShop) => <PrefsProvider><I18nProvider><ThemeProvider><Component /></ThemeProvider></I18nProvider></PrefsProvider>;
async function mount(Component: typeof GiftShop) {
  const view = render(wrap(Component));
  await act(async () => {});
  return view;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockReturnValue({ status: 'signedOut' });
  mockParams.mockReturnValue({ format: 'digital', design: 'orbit' });
});

test('wallet links directly to the gift shopping tab and never pretends to activate a card', async () => {
  await mount(GiftWallet);
  expect(screen.getByText('Aucune carte dans cet aperçu')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Ajouter une carte cadeau' }).props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Acheter une carte cadeau' }));
  expect(router.navigate).toHaveBeenCalledWith('/(tabs)/gift-cards');
});

test('shop displays both formats and opens the exact selected design', async () => {
  await mount(GiftShop);
  expect(screen.getByRole('header', { name: 'Cartes avec enveloppe' })).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Cartes numériques' })).toBeTruthy();
  fireEvent.press(screen.getByTestId('gift-tile-digital-orbit'));
  expect(router.push).toHaveBeenLastCalledWith('/gift-cards/design?format=digital&design=orbit');
  fireEvent.press(screen.getByRole('button', { name: 'Mes cartes cadeaux' }));
  expect(router.push).toHaveBeenLastCalledWith('/account/gift-cards');
});

test('even printable gifts require an email; sign-in only rehearses recipient-matched access', async () => {
  const view = await mount(GiftDesign);
  fireEvent.press(screen.getByRole('radio', { name: 'À imprimer' }));
  const recap = () => fireEvent.press(screen.getByRole('button', { name: 'Voir le récapitulatif' }));
  recap();
  expect(screen.getByText('Saisissez une adresse e-mail valide pour le destinataire.')).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Adresse e-mail du destinataire'), 'Friend@example.com');
  recap();
  expect(screen.getByText('Pour quelqu’un d’autre · friend@example.com')).toBeTruthy();
  expect(screen.getByTestId('gift-preview-summary')).toBeTruthy();
  const viewCode = () => fireEvent.press(screen.getByRole('button', { name: 'Voir le code · démo' }));
  viewCode();
  expect(router.push).toHaveBeenCalledWith('/sign-in');
  mockSession.mockReturnValue({ status: 'signedIn', account: { email: 'other@example.com', emailVerified: true } });
  view.rerender(wrap(GiftDesign));
  viewCode();
  expect(screen.getByText(/correspond à celle du destinataire/)).toBeTruthy();
  mockSession.mockReturnValue({ status: 'signedIn', account: { email: 'friend@example.com', emailVerified: false } });
  view.rerender(wrap(GiftDesign));
  expect(screen.queryByText(/Aucun code réel/)).toBeNull();
  mockSession.mockReturnValue({ status: 'signedIn', account: { email: 'friend@example.com', emailVerified: true } });
  view.rerender(wrap(GiftDesign));
  viewCode();
  expect(screen.getByText(/Aucun code réel/)).toBeTruthy();
  fireEvent.changeText(screen.getByLabelText('Montant personnalisé (TND)'), '0');
  expect(screen.queryByTestId('gift-preview-summary')).toBeNull();
  recap();
  expect(screen.getByText(/Saisissez un montant valide/)).toBeTruthy();
});

test('physical gifts can be configured for the signed-in customer without offering another delivery channel', async () => {
  mockSession.mockReturnValue({ status: 'signedIn', account: { email: 'me@example.com', emailVerified: true } });
  mockParams.mockReturnValue({ format: 'physical', design: 'orbit' });
  await mount(GiftDesign);
  expect(screen.getByRole('header', { name: 'Éclat solaire' })).toBeTruthy();
  expect(screen.queryByRole('radio', { name: 'À imprimer' })).toBeNull();
  fireEvent.press(screen.getByRole('radio', { name: 'Pour moi' }));
  expect(screen.getByLabelText('Adresse e-mail du destinataire').props.value).toBe('me@example.com');
  fireEvent.press(screen.getByRole('button', { name: 'Voir le récapitulatif' }));
  expect(screen.getByText('Pour moi · me@example.com')).toBeTruthy();
  expect(screen.getByText(/uniquement via l’invitation envoyée par e-mail/)).toBeTruthy();
});
