import { act, fireEvent, render, screen, within } from '@testing-library/react-native';
import { router } from 'expo-router';
import LoyaltyScreen from '../../app/account/loyalty';
import { ThemeProvider } from '@/design/theme';
import { I18nProvider } from '@/i18n';
import { PrefsProvider } from '@/state/prefs';

jest.mock('expo-router', () => ({ router: { canGoBack: () => true, back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: 16, left: 0 }) }));
jest.mock('@/design/appImage', () => ({ AppImage: () => null }));

async function mount() {
  render(<PrefsProvider><I18nProvider><ThemeProvider><LoyaltyScreen /></ThemeProvider></I18nProvider></PrefsProvider>);
  await act(async () => {});
}
const press = (id: string) => fireEvent.press(screen.getByTestId(id));

test('runs a mission once, simulates a boosted purchase and upgrades only after confirmation', async () => {
  await mount();
  expect(screen.getByText(/aucun point ni avantage réel/)).toBeTruthy();
  press('loyalty-mission-sizes');
  press('loyalty-complete-mission');
  expect(screen.getByTestId('loyalty-complete-mission')).toBeDisabled();
  fireEvent.press(within(screen.getByTestId('loyalty-detail')).getByText('Retour à ZAYROVI Plus'));
  expect(screen.getByTestId('loyalty-balance').props.children).toBe(50);
  press('loyalty-activate-booster');
  press('loyalty-simulate-purchase');
  expect(screen.getByText('À confirmer : 60 points')).toBeTruthy();
  expect(screen.getByText('Bienvenue au niveau Light')).toBeTruthy();
  press('loyalty-history');
  expect(screen.getByText('Bonus de 20 points en attente du délai de retour.')).toBeTruthy();
  press('loyalty-confirm-purchase');
  expect(screen.getByTestId('loyalty-balance').props.children).toBe(110);
  expect(screen.getByText('Bienvenue au niveau Shine')).toBeTruthy();
  press('loyalty-reset');
  expect(screen.getByTestId('loyalty-balance').props.children).toBe(0);
});

test('previews reward details, compares tiers, expands FAQs and closes to the account', async () => {
  await mount();
  expect(screen.getByTestId('loyalty-reward-express').props.accessibilityLabel).toContain('Verrouillé');
  press('loyalty-tier-star');
  expect(screen.getByTestId('loyalty-reward-express').props.accessibilityLabel).toContain('Disponible dans la démo');
  press('loyalty-reward-express');
  expect(within(screen.getByTestId('loyalty-detail')).getByText('Niveau illustré : Star')).toBeTruthy();
  fireEvent.press(within(screen.getByTestId('loyalty-detail')).getByText('Retour à ZAYROVI Plus'));
  press('loyalty-faq-levels');
  expect(screen.getByText(/La durée et les règles de renouvellement/)).toBeTruthy();
  press('loyalty-close');
  expect(router.back).toHaveBeenCalled();
});
