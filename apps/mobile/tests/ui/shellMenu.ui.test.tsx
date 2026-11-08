/**
 * En-tête et menu :
 *  • la cloche ouvre les NOTIFICATIONS, ou la CONNEXION quand on n’est pas connecté ;
 *  • la langue et le thème sont dans le menu (plus sur la page compte).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { LegacyMainMenu } from '../../src/features/shell/LegacyMainMenu';
import { AppHeader } from '../../src/features/shell/AppHeader';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('../../src/state/session', () => ({
  useSession: () => ({ status: (globalThis as any).__testStatus ?? 'signedOut' }),
}));

async function renderHeader(props: { brand?: 'zayrovi' | 'aywebs'; showNotifications?: boolean } = {}, legacy = false) {
  const view = render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          {legacy ? <LegacyMainMenu scrolled={false} {...props} /> : <AppHeader scrolled={false} {...props} />}
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
  await act(async () => {});
  return view;
}

describe('icône compte et menu', () => {
  afterEach(() => {
    (globalThis as any).__testStatus = undefined;
    jest.clearAllMocks();
  });

  it('non connecté : la cloche ouvre directement la connexion', async () => {
    await renderHeader();
    fireEvent.press(screen.getByRole('button', { name: 'Notifications' }));
    expect(router.push).toHaveBeenCalledWith('/sign-in');
  });

  it('connecté : la cloche ouvre directement les notifications', async () => {
    (globalThis as any).__testStatus = 'signedIn';
    await renderHeader();
    fireEvent.press(screen.getByRole('button', { name: 'Notifications' }));
    expect(router.push).toHaveBeenCalledWith('/account/notifications');
  });

  it('removes the menu entry and exposes only a disabled unassigned Plus Light', async () => {
    await renderHeader();
    expect(screen.queryByRole('button', { name: 'Mon compte' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    fireEvent.press(screen.getByTestId('plus-light'));
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByLabelText('zayrovi')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Panier ZAYROVI' })).toBeTruthy();
  });

  it('AYWEBs uses its supplied wordmark, hides the neighboring menu, and keeps the cart action', async () => {
    await renderHeader({ brand: 'aywebs', showNotifications: false });
    expect(screen.getByTestId('aywebs-header-wordmark')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Menu' })).toBeNull();
    expect(screen.queryByText('AYWEBs')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Notifications' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Panier ZAYROVI' }));
    expect(router.push).toHaveBeenCalledWith('/panier');
  });

  it('retains the unmounted legacy settings for an explicit future restoration', async () => {
    await renderHeader({}, true);
    fireEvent.press(screen.getByRole('button', { name: 'Menu' }));
    expect(screen.getByText('Langue')).toBeTruthy();
    expect(screen.getByText('Thème')).toBeTruthy();
    expect(screen.getByText('Français')).toBeTruthy();
    expect(screen.getByText('العربية')).toBeTruthy();
    expect(screen.getByText('Système')).toBeTruthy();
    expect(screen.getByText('Clair')).toBeTruthy();
    expect(screen.getByText('Sombre')).toBeTruthy();
  });
});
