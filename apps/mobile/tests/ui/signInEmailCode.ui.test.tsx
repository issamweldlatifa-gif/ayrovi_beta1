/**
 * Écran de connexion — page unique façon ChatGPT (RNTL + jest-expo).
 *
 * Ce que ces tests protègent :
 *  • le parcours reste DANS l'écran : adresse → code → session, sans navigateur ;
 *  • une adresse mal formée n'appelle jamais le serveur ;
 *  • le code est demandé au bon endroit, et la validation appelle la session ;
 *  • le mot de passe reste accessible, mais en option, pas par défaut.
 */
import { router } from 'expo-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import SignInScreen from '../../app/sign-in';
import { ThemeProvider, useTheme } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';
import { LoadingSpinner } from '../../src/design/LoadingSpinner';

// Premier rendu à froid (chargement de l'arbre et des modules natifs simulés) : marge large.
jest.setTimeout(20000);

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

// Compte mémorisé : simulé ici, le coffre réel (SecureStore) n'existe pas en test.
jest.mock('../../src/features/auth/lastAccount', () => ({
  useRememberedAccount: jest.fn(() => ({ account: null, ready: true, remember: jest.fn() })),
}));

jest.mock('../../src/features/auth/browser', () => ({
  closeProviderBrowser: jest.fn(async () => undefined),
  openProviderSession: jest.fn(async () => 'done'),
}));

// Bibliothèque Google native simulée : le sélecteur ne s'ouvre pas en test.
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(async () => true),
    signIn: jest.fn(),
    signInSilently: jest.fn(),
  },
  isSuccessResponse: (response: any) => response?.type === 'success',
  isErrorWithCode: (error: any) => Boolean(error && typeof error === 'object' && 'code' in error),
  statusCodes: { SIGN_IN_CANCELLED: '12501' },
}));

jest.mock('../../src/api/providers', () => ({
  googleNativeLogin: jest.fn(),
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
      google: false, googleNative: false, facebook: false, apple: false, passwordReset: true,
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

describe('Google natif : sélecteur dans l’application', () => {
  const GOOGLE_ID = 'test-web-client.apps.googleusercontent.com';
  const { GoogleSignin } = jest.requireMock('@react-native-google-signin/google-signin');
  const { googleNativeLogin } = jest.requireMock('../../src/api/providers');
  const { openProviderSession } = jest.requireMock('../../src/features/auth/browser');

  beforeEach(() => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = GOOGLE_ID;
    jest.clearAllMocks();
    resetSession({
      authConfig: { phoneOtp: true, email: true, emailCode: true, google: false, googleNative: true, facebook: false, apple: false, passwordReset: true },
    });
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  });

  it('le jeton Google est transmis au serveur, sans aucun onglet navigateur', async () => {
    GoogleSignin.signIn.mockResolvedValue({ type: 'success', data: { idToken: 'aaa.bbb.ccc' } });
    googleNativeLogin.mockResolvedValue({ sessionToken: 'tok', account: { id: 'a1' } });
    await renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-provider-google')); });
    expect(GoogleSignin.configure).toHaveBeenCalledWith(expect.objectContaining({ webClientId: GOOGLE_ID }));
    expect(googleNativeLogin).toHaveBeenCalledWith('aaa.bbb.ccc');
    expect(mockSession.adoptSession).toHaveBeenCalledWith({ sessionToken: 'tok', account: { id: 'a1' } });
    expect(openProviderSession).not.toHaveBeenCalled();
  });

  it('fermer le sélecteur ne montre aucune erreur et n’appelle pas le serveur', async () => {
    GoogleSignin.signIn.mockResolvedValue({ type: 'cancelled' });
    await renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-provider-google')); });
    expect(googleNativeLogin).not.toHaveBeenCalled();
    expect(mockSession.adoptSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('sans identifiant Web dans l’application, le message dit la configuration (pas un faux succès)', async () => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    await renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-provider-google')); });
    expect(GoogleSignin.signIn).not.toHaveBeenCalled();
    expect(googleNativeLogin).not.toHaveBeenCalled();
    // Le message nomme la panne ET le code technique à donner au support.
    expect(screen.getByText(/Google n’est pas correctement configuré.*GOOGLE_CLIENT_ID_MISSING/)).toBeTruthy();
  });
});

describe('liens légaux : pages dans l’application', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSession();
  });

  it('Conditions et Confidentialité ouvrent une page de l’application, jamais le navigateur', async () => {
    await renderScreen();
    fireEvent.press(screen.getByTestId('auth-legal-terms'));
    fireEvent.press(screen.getByTestId('auth-legal-privacy'));
    expect(router.push).toHaveBeenNthCalledWith(1, '/legal/terms');
    expect(router.push).toHaveBeenNthCalledWith(2, '/legal/privacy');
    const { openProviderSession } = jest.requireMock('../../src/features/auth/browser');
    expect(openProviderSession).not.toHaveBeenCalled();
  });
});

describe('Google natif : aucune attente « navigateur »', () => {
  beforeEach(() => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = 'test-web-client.apps.googleusercontent.com';
    jest.clearAllMocks();
    resetSession({
      authConfig: { phoneOtp: true, email: true, emailCode: true, google: false, googleNative: true, facebook: false, apple: false, passwordReset: true },
    });
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  });

  it('pendant le sélecteur Google, aucun texte « terminer dans le navigateur » ni « annuler l’attente »', async () => {
    const { GoogleSignin } = jest.requireMock('@react-native-google-signin/google-signin');
    GoogleSignin.signIn.mockReturnValue(new Promise(() => {})); // sélecteur ouvert, pas encore de réponse
    await renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-provider-google')); });
    expect(screen.queryByText(/navigateur/)).toBeNull();
    expect(screen.queryByText('Annuler l’attente')).toBeNull();
  });
});

describe('Compte mémorisé et attente dans le bouton', () => {
  const GOOGLE_ID = 'test-web-client.apps.googleusercontent.com';
  const { GoogleSignin } = jest.requireMock('@react-native-google-signin/google-signin');
  const { googleNativeLogin } = jest.requireMock('../../src/api/providers');
  const { useRememberedAccount } = jest.requireMock('../../src/features/auth/lastAccount');

  const remember = jest.fn();
  const remembered = (account: unknown) => {
    useRememberedAccount.mockReturnValue({ account, ready: true, remember });
  };

  beforeEach(() => {
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID = GOOGLE_ID;
    jest.clearAllMocks();
    resetSession({
      authConfig: { phoneOtp: true, email: true, emailCode: true, google: false, googleNative: true, facebook: false, apple: false, passwordReset: true },
    });
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
    remembered(null);
  });

  it('sans compte mémorisé, le formulaire complet reste proposé', async () => {
    remembered(null);
    await renderScreen();
    expect(screen.queryByTestId('auth-remembered-account')).toBeNull();
    expect(screen.getByTestId('auth-email-code-send')).toBeTruthy();
  });

  it('un compte Google mémorisé s’affiche « Continuer avec ce compte » avec son adresse', async () => {
    remembered({ provider: 'google', email: 'essam@gmail.com', name: 'Essam' });
    await renderScreen();
    expect(screen.getByTestId('auth-remembered-account')).toBeTruthy();
    expect(screen.getByText('Continuer avec ce compte')).toBeTruthy();
    expect(screen.getByText('essam@gmail.com')).toBeTruthy();
    // Le formulaire complet n'apparaît qu'après « Se connecter autrement ».
    expect(screen.queryByTestId('auth-email-code-send')).toBeNull();
  });

  it('« Se connecter autrement » révèle le formulaire complet', async () => {
    remembered({ provider: 'google', email: 'essam@gmail.com', name: 'Essam' });
    await renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-remembered-other')); });
    expect(screen.getByTestId('auth-email-code-send')).toBeTruthy();
    expect(screen.queryByTestId('auth-remembered-account')).toBeNull();
  });

  it('le compte Google mémorisé reprend la session SANS sélecteur, puis la mémorise', async () => {
    remembered({ provider: 'google', email: 'essam@gmail.com', name: 'Essam' });
    GoogleSignin.signInSilently.mockResolvedValue({ type: 'success', data: { idToken: 'x.y.z', user: { email: 'essam@gmail.com', name: 'Essam' } } });
    googleNativeLogin.mockResolvedValue({ sessionToken: 'tok', account: { id: 'a1' } });
    await renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-remembered-account')); });
    expect(GoogleSignin.signInSilently).toHaveBeenCalled();
    expect(GoogleSignin.signIn).not.toHaveBeenCalled();
    expect(googleNativeLogin).toHaveBeenCalledWith('x.y.z');
    expect(remember).toHaveBeenCalledWith({ provider: 'google', email: 'essam@gmail.com', name: 'Essam' });
  });

  it('sans session Google mémorisée sur l’appareil, le sélecteur normal prend le relais', async () => {
    remembered({ provider: 'google', email: 'essam@gmail.com', name: 'Essam' });
    GoogleSignin.signInSilently.mockResolvedValue({ type: 'noSavedCredentialFound', data: null });
    GoogleSignin.signIn.mockResolvedValue({ type: 'cancelled' });
    await renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-remembered-account')); });
    expect(GoogleSignin.signInSilently).toHaveBeenCalled();
    expect(GoogleSignin.signIn).toHaveBeenCalled();
    expect(googleNativeLogin).not.toHaveBeenCalled();
  });

  it('pendant l’attente Google, le bouton Google affiche un indicateur DANS le bouton', async () => {
    remembered(null);
    GoogleSignin.signIn.mockReturnValue(new Promise(() => {}));
    await renderScreen();
    const googleButton = () => screen.getByTestId('auth-provider-google');
    expect(within(googleButton()).queryByTestId('auth-provider-google-busy', { includeHiddenElements: true })).toBeNull();
    await act(async () => { fireEvent.press(googleButton()); });
    // Le cercle d'attente est DANS le bouton Google (à la place du logo), et lui seul attend.
    expect(googleButton().props.accessibilityState.busy).toBe(true);
    expect(within(googleButton()).UNSAFE_getByType(LoadingSpinner)).toBeTruthy();
    expect(within(googleButton()).getByTestId('auth-provider-google-busy', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.getByTestId('auth-email-code-send').props.accessibilityState.busy).toBeFalsy();
  });
});

describe('page d’accueil de la connexion — modal fort (référence Zalando 085315)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSession();
  });

  it('la marque ouvre la page : mot-symbole posé au-dessus du titre, sans sous-titre', async () => {
    await renderScreen();
    expect(screen.getByLabelText('zayrovi')).toBeTruthy();
    expect(screen.getByText("Se connecter ou s'inscrire")).toBeTruthy();
    // L'ancien sous-titre a disparu de la page d'accueil (le titre suffit).
    expect(screen.queryByText('Utilisez votre adresse e-mail pour continuer. Un compte est créé automatiquement si besoin.')).toBeNull();
  });

  it('le champ e-mail est une boîte « encochée » : étiquette dans sa propre boîte, corps sans bordure haute', async () => {
    await renderScreen();
    const boxed = screen.getByTestId('auth-boxed-email');
    const box = boxed.props.children;
    const topRow = Array.isArray(box) ? box[0] : box;
    const labelBox = topRow.props.children[0];
    const body = Array.isArray(box) ? box[1] : null;
    expect(StyleSheet.flatten(labelBox.props.style)).toMatchObject({ borderBottomWidth: 0, borderTopLeftRadius: 8 });
    expect(StyleSheet.flatten(body.props.style)).toMatchObject({ borderTopWidth: 0, borderBottomLeftRadius: 8 });
    // Aucune superposition : l'encoche vit dans le flux (rangée haute + corps).
    expect(JSON.stringify(StyleSheet.flatten(topRow.props.style))).not.toContain('absolute');
  });

  it('Continuer est un bouton plein ENCRE (plus jamais la lavande du violet désactivé)', async () => {
    let theme: ReturnType<typeof useTheme> | null = null;
    const Probe = () => { theme = useTheme(); return null; };
    const view = render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}>
        <PrefsProvider><I18nProvider><ThemeProvider><Probe /><SignInScreen /></ThemeProvider></I18nProvider></PrefsProvider>
      </QueryClientProvider>,
    );
    await act(async () => { await Promise.resolve(); });
    const style = StyleSheet.flatten(screen.getByTestId('auth-email-code-send').props.style);
    expect(style.backgroundColor).toBe(theme!.colors.ink);
    expect(view.toJSON()).toBeTruthy();
    view.unmount();
  });

  it('le paragraphe légal porte des liens soulignés qui ouvrent les pages DANS l’application', async () => {
    await renderScreen();
    // Deux porteurs du même nom : le paragraphe (en haut) et la rangée du bas.
    // Le paragraphe arrive en premier dans l'arbre.
    const terms = screen.getAllByRole('link', { name: 'Conditions d’utilisation' })[0];
    const privacy = screen.getAllByRole('link', { name: 'Politique de confidentialité' })[0];
    expect(StyleSheet.flatten(terms.props.style)).toMatchObject({ textDecorationLine: 'underline' });
    fireEvent.press(terms);
    fireEvent.press(privacy);
    expect(router.push).toHaveBeenCalledWith('/legal/terms');
    expect(router.push).toHaveBeenCalledWith('/legal/privacy');
  });

  it('les trois fournisseurs s’affichent en pastilles contour avec leur marque, inactifs tant que le serveur les refuse', async () => {
    await renderScreen();
    for (const id of ['google', 'facebook', 'apple']) {
      const button = screen.getByTestId(`auth-provider-${id}`);
      expect(button.props.accessibilityState.disabled).toBe(true);
    }
    // L'explication reste affichée : jamais un bouton mort sans raison.
    expect(screen.getByText('Pas encore activé sur le serveur.')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-provider-apple')); });
    expect(mockSession.adoptSession).not.toHaveBeenCalled();
  });

  it('fournisseur activé par le serveur : sa pastille devient cliquable, les autres restent expliquées', async () => {
    resetSession({
      authConfig: { phoneOtp: true, email: true, emailCode: true, google: true, googleNative: true, facebook: false, apple: false, passwordReset: true },
    });
    await renderScreen();
    expect(screen.getByTestId('auth-provider-google').props.accessibilityState.disabled).toBe(false);
    expect(screen.getByTestId('auth-provider-facebook').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('auth-provider-apple').props.accessibilityState.disabled).toBe(true);
  });
});

