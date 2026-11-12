/**
 * Écran Sécurité — appareils connectés et confirmation de l'adresse (12/11/2026).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SecurityScreen from '../../app/account/security';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

jest.setTimeout(20000);

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
  useIsFocused: () => true,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockSession = { account: { id: 'a1', email: 'amine@example.tn' }, refreshAccount: jest.fn(async () => undefined), adoptSession: jest.fn() };
jest.mock('../../src/state/session', () => ({ useSession: () => mockSession }));

jest.mock('../../src/api/account', () => ({
  fetchSecurity: jest.fn(async () => ({ emailVerified: false, phoneVerified: true, hasPassword: false, identities: [], activeSessions: 2, lastLoginAt: '' })),
  fetchDeviceSessions: jest.fn(async () => ([
    { handle: 'cur', current: true, platform: 'iPhone', client: 'Application ZAYROVI', ipMasked: '196.203.x.x', createdAt: '', lastSeenAt: '' },
    { handle: 'old', current: false, platform: 'Windows', client: 'Chrome', ipMasked: '41.230.x.x', createdAt: '', lastSeenAt: '' },
  ])),
  revokeDeviceSession: jest.fn(async () => undefined),
  logoutOtherDevices: jest.fn(async () => 1),
  requestEmailVerification: jest.fn(async () => ({ alreadyVerified: false, challengeId: 'everify_1', maskedEmail: 'am***@ex***.tn', expiresInSeconds: 900, developmentCode: '' })),
  confirmEmailVerification: jest.fn(async () => true),
  changePassword: jest.fn(),
}));

let client: QueryClient | null = null;
async function renderScreen() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <SecurityScreen />
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </QueryClientProvider>,
  );
  await act(async () => { await Promise.resolve(); });
  return view;
}
afterEach(() => { client?.clear(); client = null; jest.clearAllMocks(); });

it('liste les appareils ; ferme un appareil puis tous les autres', async () => {
  const api = jest.requireMock('../../src/api/account');
  await renderScreen();
  await waitFor(() => expect(screen.getByTestId('security-revoke-old')).toBeTruthy());
  expect(screen.queryByTestId('security-revoke-cur')).toBeNull();
  await act(async () => { fireEvent.press(screen.getByTestId('security-revoke-old')); });
  expect(api.revokeDeviceSession).toHaveBeenCalledWith('old');
  await act(async () => { fireEvent.press(screen.getByTestId('security-logout-others')); });
  expect(api.logoutOtherDevices).toHaveBeenCalled();
});

it('confirme l’adresse avec le code reçu', async () => {
  const api = jest.requireMock('../../src/api/account');
  await renderScreen();
  await waitFor(() => expect(screen.getByTestId('security-email-send')).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByTestId('security-email-send')); });
  expect(api.requestEmailVerification).toHaveBeenCalled();
  await waitFor(() => expect(screen.getByTestId('security-email-code')).toBeTruthy());
  expect(screen.getByTestId('security-email-confirm')).toBeDisabled();
  fireEvent.changeText(screen.getByTestId('security-email-code'), '123456');
  await act(async () => { fireEvent.press(screen.getByTestId('security-email-confirm')); });
  expect(api.confirmEmailVerification).toHaveBeenCalledWith('everify_1', '123456', expect.any(String));
  expect(mockSession.refreshAccount).toHaveBeenCalled();
});
