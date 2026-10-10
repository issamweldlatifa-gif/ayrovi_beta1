/**
 * Écran de connexion — page unique façon ChatGPT (RNTL + jest-expo).
 *
 * Ce que ces tests protègent :
 *  • le parcours reste DANS l'écran : adresse → code → session, sans navigateur ;
 *  • une adresse mal formée n'appelle jamais le serveur ;
 *  • le code est demandé au bon endroit, et la validation appelle la session ;
 *  • le mot de passe reste accessible, mais en option, pas par défaut.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SignInScreen from '../../app/sign-in';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

const mockSession: Record<string, any> = {};

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
  useIsFocused: () => true,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// Le mock est réactif : changer la session déclenche un rendu, comme le vrai contexte.
jest.mock('../../src/state/session', () => {
  const React = jest.requireActual('react');
  const listeners = new Set<() => void>();
  (globalThis as any).__notifySession = () => listeners.forEach((listener) => listener());
  return {
    useSession: () => {
      const [, force] = React.useReducer((count: number) => count + 1, 0);
      React.useEffect(() => {
        listeners.add(force);
        return () => { listeners.delete(force); };
      }, []);
      return mockSession;
    },
  };
});

const notifySession = () => (globalThis as any).__notifySession?.();

jest.mock('../../src/api/public', () => {
  const actual = jest.requireActual('../../src/api/public');
  return { ...actual, fetchServerReadiness: jest.fn(async () => ({})) };
});

jest.mock('../../src/features/auth/browser', () => ({
  closeProviderBrowser: jest.fn(async () => undefined),
  openLegalPage: jest.fn(async () => undefined),
  openProviderSession: jest.fn(async () => 'done'),
}));

jest.mock('../../src/api/providers', () => ({
  newHandoffCode: jest.fn(),
  pollHandoff: jest.fn(),
  providerDoneUrl: jest.fn(() => ''),
  providerStartUrl: jest.fn(() => ''),
}));

function resetSession(overrides: Record<string, unknown> = {}) {
  for (const key of Object.keys(mockSession)) delete mockSession[key];
  Object.assign(mockSession, {
    status: 'signedOut',
    account: null,
    authConfig: {
      phoneOtp: true, email: true, emailCode: true,
      google: false, facebook: false, apple: false, passwordReset: true,
    },
    challenge: null,
    emailChallenge: null,
    storageSecure: true,
    verified: false,
    notice: '',
    requestPhoneCode: jest.fn(),
    confirmPhoneCode: jest.fn(),
    cancelPhoneCode: jest.fn(),
    requestEmailCode: jest.fn(async () => {
      mockSession.emailChallenge = {
        challengeId: 'ecode_test', maskedEmail: 'ah***@ex***.tn', expiresInSeconds: 600, developmentCode: '',
      };
      notifySession();
      return mockSession.emailChallenge;
    }),
    confirmEmailCode: jest.fn(async () => ({ sessionToken: 'tok' })),
    cancelEmailCode: jest.fn(() => { mockSession.emailChallenge = null; notifySession(); }),
    signInWithEmail: jest.fn(),
    signUpWithEmail: jest.fn(),
    signOut: jest.fn(),
    refreshAccount: jest.fn(),
    adoptSession: jest.fn(),
    ...overrides,
  });
}

// `gcTime: 0` : sans cela, les minuteries de nettoyage du cache gardent Jest ouvert.
let client: QueryClient | null = null;

async function renderScreen() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(
    <QueryClientProvider client={client}>
      <PrefsProvider>
        <I18nProvider>
          <ThemeProvider>
            <SignInScreen />
          </ThemeProvider>
        </I18nProvider>
      </PrefsProvider>
    </QueryClientProvider>,
  );
  // Préférences lues de façon asynchrone : on attend l'état stable avant d'interagir.
  await act(async () => { await Promise.resolve(); });
  return view;
}

afterEach(() => {
  client?.clear();
  client = null;
});

beforeEach(() => {
  resetSession();
});

describe('connexion par code e-mail, dans l’application', () => {
  it('la page s’ouvre sur l’adresse e-mail ; le bouton reste grisé tant qu’elle est invalide', async () => {
    await renderScreen();
    fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'pas-une-adresse');
    expect(screen.getByTestId('auth-email-code-send')).toBeDisabled();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-email-code-send')); });
    expect(mockSession.requestEmailCode).not.toHaveBeenCalled();
  });

  it('demande le code pour l’adresse saisie, puis affiche l’étape « code » sur la même page', async () => {
    await renderScreen();
    fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), '  Ahmed@Example.tn ');
    await act(async () => { fireEvent.press(screen.getByTestId('auth-email-code-send')); });
    expect(mockSession.requestEmailCode).toHaveBeenCalledWith('  Ahmed@Example.tn ', 'fr');
    await waitFor(() => expect(screen.getByTestId('auth-email-code-verify')).toBeTruthy());
    expect(screen.getByText('Saisissez le code de vérification envoyé à ah***@ex***.tn.')).toBeTruthy();
    expect(screen.getByText('Vérifiez votre boîte de réception')).toBeTruthy();
  });

  it('valider le code appelle la session avec le code saisi, sans quitter l’écran pour un navigateur', async () => {
    resetSession({
      emailChallenge: { challengeId: 'ecode_x', maskedEmail: 'ah***@ex***.tn', expiresInSeconds: 600, developmentCode: '' },
    });
    await renderScreen();
    fireEvent.changeText(screen.getByLabelText('Code reçu par e-mail'), '482913');
    await act(async () => { fireEvent.press(screen.getByTestId('auth-email-code-verify')); });
    expect(mockSession.confirmEmailCode).toHaveBeenCalledWith('482913');
    const { openProviderSession } = jest.requireMock('../../src/features/auth/browser');
    expect(openProviderSession).not.toHaveBeenCalled();
  });

  it('le code de développement, quand il est renvoyé, est affiché tel quel', async () => {
    resetSession({
      emailChallenge: { challengeId: 'ecode_y', maskedEmail: 'ah***@ex***.tn', expiresInSeconds: 600, developmentCode: '123456' },
    });
    await renderScreen();
    expect(screen.getByText('E-mail non configuré : code de développement 123456')).toBeTruthy();
  });

  it('le mot de passe n’est pas le chemin par défaut, mais reste accessible en option', async () => {
    await renderScreen();
    expect(screen.queryByLabelText('Mot de passe')).toBeNull();
    fireEvent.press(screen.getByTestId('auth-start-password'));
    expect(screen.getByLabelText('Mot de passe')).toBeTruthy();
    expect(screen.getByTestId('auth-email-submit')).toBeTruthy();
  });

  it('le téléphone est une option sous « OU » : Tunisie, numéro, code SMS', async () => {
    await renderScreen();
    fireEvent.press(screen.getByTestId('auth-start-phone'));
    expect(screen.getByLabelText('Pays/Région')).toBeTruthy();
    expect(screen.getByLabelText('Numéro tunisien')).toBeTruthy();
    expect(screen.getByTestId('auth-send-code')).toBeTruthy();
  });

  it('sans méthode e-mail configurée, le bouton d’envoi est désactivé', async () => {
    resetSession({ authConfig: { ...mockSession.authConfig, emailCode: false, email: false } });
    await renderScreen();
    expect(screen.getByTestId('auth-email-code-send')).toBeDisabled();
  });
});
