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
import { StyleSheet, Dimensions } from 'react-native';
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

// Recherche d'adresse (branchement Zalando) : simulée, contrôlable par test.
jest.mock('../../src/api/account', () => ({
  lookupEmail: jest.fn(async () => ({ registered: false })),
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

describe('branchement de l’adresse — connu ⇒ mot de passe, inconnu ⇒ inscription', () => {
  const { lookupEmail } = jest.requireMock('../../src/api/account');

  beforeEach(() => {
    jest.clearAllMocks();
    resetSession();
    lookupEmail.mockResolvedValue({ registered: false });
  });

  it('la page s’ouvre sur l’adresse ; Continuer reste ENCRE (référence Zalando) et une adresse invalide est signalée SOUS le champ, sans appeler le serveur', async () => {
    await renderScreen();
    fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'pas-une-adresse');
    expect(screen.getByTestId('auth-email-continue')).not.toBeDisabled();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-email-continue')); });
    expect(lookupEmail).not.toHaveBeenCalled();
    // L'erreur appartient au champ : elle s'affiche dessous, pas en haut de page.
    const boxed = screen.getByTestId('auth-boxed-email');
    expect(within(boxed).getByText('Saisissez une adresse e-mail valide.')).toBeTruthy();
    expect(screen.queryByTestId('auth-failure')).toBeNull();
    // Corriger l'adresse efface l'erreur aussitôt.
    fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'pas-une-adresse@');
    expect(screen.queryByText('Saisissez une adresse e-mail valide.')).toBeNull();
  });

  it('adresse connue : mot de passe d’abord, avec Révéler, code en option et mot de passe oublié', async () => {
    lookupEmail.mockResolvedValue({ registered: true });
    await renderScreen();
    fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'known@example.tn');
    await act(async () => { fireEvent.press(screen.getByTestId('auth-email-continue')); });
    expect(lookupEmail).toHaveBeenCalledWith('known@example.tn');
    const field = screen.getByTestId('auth-password-field');
    expect(field.props.secureTextEntry).toBe(true);
    fireEvent.press(screen.getByTestId('auth-password-reveal'));
    expect(screen.getByTestId('auth-password-field').props.secureTextEntry).toBe(false);
    // « Modifier » ramène à l'adresse, éditable.
    fireEvent.press(screen.getByTestId('auth-email-edit'));
    expect(screen.getByTestId('auth-email-continue')).toBeTruthy();
    // Revenir au mot de passe pour la suite du test.
    await act(async () => { fireEvent.press(screen.getByTestId('auth-email-continue')); });
    // Le bouton principal est « Se connecter » (encre), le code est l'option.
    expect(screen.getByTestId('auth-email-submit').props.accessibilityLabel).toBe('Se connecter');
    expect(screen.getByTestId('auth-email-code-send').props.accessibilityLabel).toBe('Recevoir un code par e-mail');
    // Mot de passe oublié : le lien emporte l'adresse vers l'écran de récupération.
    await act(async () => { fireEvent.press(screen.getByTestId('auth-forgot-link')); });
    expect(router.push).toHaveBeenCalledWith(expect.objectContaining({ pathname: '/forgot', params: { email: 'known@example.tn' } }));
  });

  it('adresse connue : « Recevoir un code par e-mail » demande le code et affiche les six boîtes', async () => {
    lookupEmail.mockResolvedValue({ registered: true });
    await renderScreen();
    fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'known@example.tn');
    await act(async () => { fireEvent.press(screen.getByTestId('auth-email-continue')); });
    await act(async () => { fireEvent.press(screen.getByTestId('auth-email-code-send')); });
    expect(mockSession.requestEmailCode).toHaveBeenCalledWith('known@example.tn', 'fr');
    await waitFor(() => expect(screen.getByTestId('auth-email-code-verify')).toBeTruthy());
    expect(screen.getByText('Saisissez le code de vérification envoyé à ah***@ex***.tn.')).toBeTruthy();
    for (let index = 0; index < 6; index += 1) {
      expect(screen.getByTestId(`auth-code-box-${index}`)).toBeTruthy();
    }
  });

  it('adresse inconnue : inscription — mot de passe, prénom, nom de famille, S’inscrire', async () => {
    await renderScreen();
    fireEvent.changeText(screen.getByLabelText('Adresse e-mail'), 'nouveau@example.tn');
    await act(async () => { fireEvent.press(screen.getByTestId('auth-email-continue')); });
    expect(screen.getByTestId('auth-register-password')).toBeTruthy();
    expect(screen.getByLabelText('Prénom')).toBeTruthy();
    expect(screen.getByLabelText('Nom de famille')).toBeTruthy();
    // Incomplete : le bouton reste grisé tant que nom/prénom/mot de passe manquent.
    expect(screen.getByTestId('auth-register-submit')).toBeDisabled();
    fireEvent.changeText(screen.getByTestId('auth-register-password'), 'motdepasse8');
    fireEvent.changeText(screen.getByLabelText('Prénom'), 'Sami');
    fireEvent.changeText(screen.getByLabelText('Nom de famille'), 'Ben Ali');
    await act(async () => { fireEvent.press(screen.getByTestId('auth-register-submit')); });
    expect(mockSession.signUpWithEmail).toHaveBeenCalledWith(expect.objectContaining({
      displayName: 'Sami Ben Ali',
      email: 'nouveau@example.tn',
      password: 'motdepasse8',
      marketingOptIn: false,
    }));
  });

  it('valider le code : saisie boîte par boîte, la session reçoit les 6 chiffres', async () => {
    resetSession({
      emailChallenge: { challengeId: 'ecode_x', maskedEmail: 'ah***@ex***.tn', expiresInSeconds: 600, developmentCode: '' },
    });
    await renderScreen();
    '482913'.split('').forEach((digit, index) => {
      fireEvent.changeText(screen.getByTestId(`auth-code-box-${index}`), digit);
    });
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

  it('renvoi du code : compte à rebours visible puis lien actif ; « autre compte » ramène à l’adresse', async () => {
    resetSession({
      emailChallenge: { challengeId: 'ecode_z', maskedEmail: 'ah***@ex***.tn', expiresInSeconds: 600, developmentCode: '' },
    });
    await renderScreen();
    const resend = screen.getByTestId('auth-email-code-resend');
    expect(resend.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/Renvoyer un nouveau code \(60\)/)).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-email-another')); });
    expect(mockSession.cancelEmailCode).toHaveBeenCalled();
    expect(screen.getByTestId('auth-email-continue')).toBeTruthy();
  });

  it('sans aucune méthode e-mail configurée, le bouton Continuer est désactivé', async () => {
    resetSession({ authConfig: { ...mockSession.authConfig, emailCode: false, email: false } });
    await renderScreen();
    expect(screen.getByTestId('auth-email-continue')).toBeDisabled();
  });

  it('les lignes retirées n’apparaissent plus : téléphone, mot de passe en entrée, trousseau, explications', async () => {
    await renderScreen();
    expect(screen.queryByText('Continuer avec un numéro de téléphone')).toBeNull();
    expect(screen.queryByText('Continuer avec un mot de passe')).toBeNull();
    expect(screen.queryByText('Session rangée dans le trousseau de l’appareil.')).toBeNull();
    expect(screen.queryByText('Pas encore activé sur le serveur.')).toBeNull();
    expect(screen.queryByText('Le même compte que sur le site — vos commandes suivent.')).toBeNull();
    expect(screen.queryByText('OU')).toBeNull();
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
    expect(screen.getByTestId('auth-email-continue')).toBeTruthy();
  });

  it('un compte Google mémorisé s’affiche « Continuer avec ce compte » avec son adresse', async () => {
    remembered({ provider: 'google', email: 'essam@gmail.com', name: 'Essam' });
    await renderScreen();
    expect(screen.getByTestId('auth-remembered-account')).toBeTruthy();
    expect(screen.getByText('Continuer avec ce compte')).toBeTruthy();
    expect(screen.getByText('essam@gmail.com')).toBeTruthy();
    // Le formulaire complet n'apparaît qu'après « Se connecter autrement ».
    expect(screen.queryByTestId('auth-email-continue')).toBeNull();
  });

  it('« Se connecter autrement » révèle le formulaire complet', async () => {
    remembered({ provider: 'google', email: 'essam@gmail.com', name: 'Essam' });
    await renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-remembered-other')); });
    expect(screen.getByTestId('auth-email-continue')).toBeTruthy();
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
    expect(screen.getByTestId('auth-email-continue').props.accessibilityState.busy).toBeFalsy();
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

  it('le champ e-mail a la forme Zalando (12/11) : étiquette AU-DESSUS, boîte de 48 pt comme les autres champs', async () => {
    await renderScreen();
    const boxed = screen.getByTestId('auth-boxed-email');
    expect(within(boxed).getByText('Adresse e-mail')).toBeTruthy();
    const input = screen.getByLabelText('Adresse e-mail');
    const box = StyleSheet.flatten(input.parent?.props.style ?? {});
    // On remonte jusqu'à la boîte bordée (le parent direct peut être un hôte interne).
    let node: any = input;
    let style: any = box;
    while (node && !(style && style.borderWidth)) {
      node = node.parent;
      style = node ? StyleSheet.flatten(node.props.style ?? {}) : null;
    }
    expect(style).toMatchObject({ minHeight: 48, borderWidth: 1.5, borderRadius: 8 });
    // Plus de bordure haute supprimée (l'ancien champ « encoché »).
    expect(style.borderTopWidth).toBeUndefined();
  });

  it('titre à la taille de l’écran (24 petit téléphone · 28 téléphone · 32 tablette), grossissement système plafonné', async () => {
    const { authTitleSize, authGutter } = jest.requireActual('../../src/features/auth/AuthLayout');
    expect([authTitleSize(320), authTitleSize(360), authTitleSize(412), authTitleSize(600), authTitleSize(1024)]).toEqual([24, 28, 28, 32, 32]);
    expect([authGutter(390, [4, 8, 12, 16, 24]), authGutter(800, [4, 8, 12, 16, 24])]).toEqual([16, 24]);
    await renderScreen();
    const title = screen.getByTestId('auth-title');
    expect(StyleSheet.flatten(title.props.style).fontSize).toBe(authTitleSize(Dimensions.get('window').width));
    expect(title.props.maxFontSizeMultiplier).toBe(1.2);
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
    const style = StyleSheet.flatten(screen.getByTestId('auth-email-continue').props.style);
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

  it('les trois fournisseurs : pastilles contour au MÊME contraste (12/11, plus de gris « cassé ») ; non activé ⇒ « bientôt » au toucher, rien ne s’ouvre', async () => {
    const { openProviderSession } = jest.requireMock('../../src/features/auth/browser');
    await renderScreen();
    for (const id of ['google', 'facebook', 'apple']) {
      const button = screen.getByTestId(`auth-provider-${id}`);
      expect(button.props.accessibilityState.disabled).toBe(false);
      expect(StyleSheet.flatten(button.props.style).opacity).toBe(1);
    }
    // Plus aucune ligne d'explication permanente (retirée, demande du 10/11).
    expect(screen.queryByText('Pas encore activé sur le serveur.')).toBeNull();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-provider-apple')); });
    expect(mockSession.adoptSession).not.toHaveBeenCalled();
    expect(openProviderSession).not.toHaveBeenCalled();
    expect(screen.getByText('La connexion avec Apple arrive bientôt. En attendant, continuez avec votre adresse e-mail.')).toBeTruthy();
  });

  it('fournisseur activé par le serveur : sa pastille lance la connexion, les autres expliquent', async () => {
    const { openProviderSession } = jest.requireMock('../../src/features/auth/browser');
    resetSession({
      authConfig: { phoneOtp: true, email: true, emailCode: true, google: true, googleNative: true, facebook: false, apple: false, passwordReset: true },
    });
    await renderScreen();
    await act(async () => { fireEvent.press(screen.getByTestId('auth-provider-facebook')); });
    expect(openProviderSession).not.toHaveBeenCalled();
    expect(screen.getByText('La connexion avec Facebook arrive bientôt. En attendant, continuez avec votre adresse e-mail.')).toBeTruthy();
  });
});

