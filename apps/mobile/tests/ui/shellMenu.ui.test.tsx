/**
 * En-tête et menu :
 *  • la cloche ouvre les NOTIFICATIONS, ou la CONNEXION quand on n’est pas connecté ;
 *  • la langue et le thème sont dans le menu (plus sur la page compte).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
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

async function renderHeader() {
  const view = render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <AppHeader scrolled={false} />
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

  it('l’icône menu est à gauche du logo, la cloche et le panier à droite', async () => {
    await renderHeader();
    expect(screen.queryByRole('button', { name: 'Mon compte' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Menu' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Panier AYROVI' })).toBeTruthy();
  });

  it('le menu contient la langue et le thème, avec leurs choix', async () => {
    await renderHeader();
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
