/**
 * Session au retour au premier plan (13/11).
 *  • lancement hors-ligne puis réseau revenu : le compte devient vérifié sans redémarrer ;
 *  • session expirée pendant que l'application dormait : on repasse « déconnecté » ;
 *  • jeton refusé par le serveur au retour : déconnexion propre ;
 *  • compte déjà vérifié : aucun appel `/auth/me` (le jeton CSRF ne tourne pas pour rien).
 */
import { act, render, screen } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';
import { SessionProvider, useSession } from '@/state/session';
import { memoryBackend, serializeSession, SESSION_STORAGE_KEY } from '@/state/sessionStore';

const mockBackend = { current: memoryBackend() };
jest.mock('@/state/sessionStore', () => {
  const actual = jest.requireActual('@/state/sessionStore');
  return { ...actual, openSecureBackend: async () => ({ backend: mockBackend.current, isSecure: true }) };
});
const mockFetchMe = jest.fn();
jest.mock('@/api/account', () => ({
  ...jest.requireActual('@/api/account'),
  fetchMe: (...args: unknown[]) => mockFetchMe(...args),
  fetchAuthConfig: () => Promise.resolve(null),
  logout: () => Promise.resolve(),
}));

const account = {
  id: 'acc_1', displayName: 'Sarra', email: 'sarra@example.test', phone: '', avatarUrl: '',
  emailVerified: true, phoneVerified: false, status: 'ACTIVE', locale: 'fr', marketingOptIn: false,
};
const me = { account, csrfToken: 'csrf-2', expiresAt: new Date(Date.now() + 86_400_000).toISOString() };

let foreground: ((state: string) => void) | null = null;
beforeEach(() => {
  mockFetchMe.mockReset();
  foreground = null;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    foreground = handler as (state: string) => void;
    return { remove: () => { foreground = null; } } as never;
  });
});
afterEach(() => jest.restoreAllMocks());

function store(expiresAt: string) {
  mockBackend.current = memoryBackend({
    [SESSION_STORAGE_KEY]: serializeSession({ token: 'tok_1', csrfToken: 'csrf-1', expiresAt, displayName: 'Sarra' }),
  });
}

function Probe() {
  const session = useSession();
  return <Text testID="probe">{`${session.status}|${session.verified ? 'verified' : 'unverified'}|${session.account?.id ?? ''}`}</Text>;
}

async function boot() {
  render(<SessionProvider><Probe /></SessionProvider>);
  await act(async () => {});
}
const probe = () => screen.getByTestId('probe').props.children;
async function comeBack() {
  await act(async () => { foreground?.('background'); foreground?.('active'); });
}

it('lancement hors-ligne puis retour : le compte est vérifié sans redémarrage', async () => {
  store(new Date(Date.now() + 86_400_000).toISOString());
  mockFetchMe.mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 0 }));
  await boot();
  expect(probe()).toBe('signedIn|unverified|');
  mockFetchMe.mockResolvedValueOnce(me);
  await comeBack();
  expect(probe()).toBe('signedIn|verified|acc_1');
});

it('jeton refusé au retour (révoqué ailleurs) : déconnexion propre', async () => {
  store(new Date(Date.now() + 86_400_000).toISOString());
  mockFetchMe.mockRejectedValueOnce(Object.assign(new Error('offline'), { status: 0 }));
  await boot();
  mockFetchMe.mockResolvedValueOnce(null);
  await comeBack();
  expect(probe()).toBe('signedOut|unverified|');
  expect(mockBackend.current.values.has(SESSION_STORAGE_KEY)).toBe(false);
});

it('session expirée pendant le sommeil : « déconnecté » au retour, sans appel réseau', async () => {
  const soon = Date.now() + 60_000;
  store(new Date(soon).toISOString());
  mockFetchMe.mockResolvedValueOnce({ ...me, expiresAt: new Date(soon).toISOString() });
  await boot();
  expect(probe()).toBe('signedIn|verified|acc_1');
  const now = jest.spyOn(Date, 'now').mockReturnValue(soon + 1_000);
  await comeBack();
  now.mockRestore();
  expect(probe()).toBe('signedOut|unverified|');
  expect(mockFetchMe).toHaveBeenCalledTimes(1);
});

it('compte déjà vérifié : le retour ne relit pas /auth/me', async () => {
  store(new Date(Date.now() + 86_400_000).toISOString());
  mockFetchMe.mockResolvedValueOnce(me);
  await boot();
  await comeBack();
  expect(mockFetchMe).toHaveBeenCalledTimes(1);
  expect(probe()).toBe('signedIn|verified|acc_1');
});
