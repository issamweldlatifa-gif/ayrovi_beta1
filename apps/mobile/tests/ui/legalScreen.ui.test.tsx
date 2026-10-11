/**
 * Pages légales dans l’application : conditions et confidentialité.
 *
 *  • elles s’ouvrent DANS l’application : aucun navigateur, aucune sortie ;
 *  • le bouton retour revient à l’écran précédent ;
 *  • le texte arabe est affiché en arabe ; sans version arabe, on le dit.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { LegalScreen } from '../../src/features/legal/LegalScreen';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// La langue est pilotée par un globe de test : le vrai fournisseur la lit en asynchrone.
jest.mock('../../src/state/prefs', () => {
  const actual = jest.requireActual('../../src/state/prefs');
  return {
    ...actual,
    usePrefs: () => {
      const value = actual.usePrefs();
      return { ...value, locale: (globalThis as any).__testLocale ?? value.locale };
    },
  };
});

async function renderLegal(docId: 'terms' | 'privacy') {
  const view = render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <LegalScreen docId={docId} />
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
  await act(async () => {});
  return view;
}

describe('pages légales dans l’application', () => {
  afterEach(() => {
    (globalThis as any).__testLocale = undefined;
    jest.clearAllMocks();
  });

  it('les conditions s’affichent en français, avec leur titre et leurs sections', async () => {
    await renderLegal('terms');
    expect(screen.getByText('Conditions de vente et politique de retour')).toBeTruthy();
    expect(screen.getByText('Commande et vérification')).toBeTruthy();
  });

  it('le bouton retour revient à l’écran précédent, sans navigateur', async () => {
    await renderLegal('terms');
    fireEvent.press(screen.getByRole('button', { name: 'Retour' }));
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('sans écran précédent (ouverture directe), le retour ramène au compte', async () => {
    (router.canGoBack as jest.Mock).mockReturnValueOnce(false);
    await renderLegal('privacy');
    fireEvent.press(screen.getByRole('button', { name: 'Retour' }));
    expect(router.replace).toHaveBeenCalledWith('/(tabs)/account');
  });

  it('les conditions existent en arabe : le titre arabe est affiché, sans mention de repli', async () => {
    (globalThis as any).__testLocale = 'ar';
    await renderLegal('terms');
    expect(screen.getByText('شروط البيع وسياسة الإرجاع')).toBeTruthy();
    expect(screen.queryByText('هذه الوثيقة متوفرة بالفرنسية حالياً.')).toBeNull();
  });

  it('la confidentialité n’existe qu’en français : en arabe, on affiche le français et on le dit', async () => {
    (globalThis as any).__testLocale = 'ar';
    await renderLegal('privacy');
    expect(screen.getByText('Politique de confidentialité')).toBeTruthy();
    expect(screen.getByText('هذه الوثيقة متوفرة بالفرنسية حالياً.')).toBeTruthy();
  });
});
