/**
 * SONIM — test d'intégration UI de l'écran conversationnel IA.
 *
 * Vérifie :
 *   1. l'accueil éditorial et les quatre raccourcis métier (dont ouverture Z Lens) ;
 *   2. l'envoi d'un message, le flux SSE et le rendu d'une carte outil (`calculate_price`).
 */
import React from 'react';
import { Platform } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';

import { SonimScreen } from '../../src/features/sonim/SonimScreen';
import { clearSonimSession } from '../../src/features/sonim/sonimSession';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: false })),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, bottom: 16, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../../src/session/session', () => ({ useSessionId: () => 'sess_sonim_ui' }));
jest.mock('../../src/state/session', () => ({
  useSession: () => ({ account: { id: 'account_1', displayName: 'Sami Ben Ali' }, status: 'signedIn', verified: true }),
}));
jest.mock('../../src/features/shell/AppHeader', () => ({ AppHeader: () => null }));

jest.mock('../../src/api/assistant', () => {
  const actual = jest.requireActual('../../src/api/assistant');
  return {
    ...actual,
    fetchAssistantStatus: jest.fn(async () => ({
      ready: true,
      provider: 'gemini',
      streaming: true,
      vision: true,
      voiceReady: true,
    })),
    streamAssistantChat: jest.fn((_input: unknown, onEvent: (ev: unknown) => void) => {
      const finished = (async () => {
        onEvent({ type: 'state', state: 'thinking' });
        onEvent({ type: 'delta', text: 'Voici le calcul complet en dinars.' });
        onEvent({
          type: 'tool',
          name: 'calculate_price',
          data: {
            breakdown: {
              totalTND: 245.5,
              convertedPriceTND: 180,
              customsFeeTND: 30,
              shippingFeeTND: 20,
              serviceFeeTND: 15.5,
              expressFeeTND: 0,
            },
          },
        });
        onEvent({ type: 'done', model: 'gemini-2.5-flash' });
        return 'done' as const;
      })();
      return { abort: jest.fn(), finished };
    }),
  };
});

async function renderSonim() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <PrefsProvider>
      <I18nProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <SonimScreen />
          </QueryClientProvider>
        </ThemeProvider>
      </I18nProvider>
    </PrefsProvider>,
  );
  await act(async () => {});
  return view;
}

describe('SonimScreen UI', () => {
  beforeEach(() => { jest.clearAllMocks(); clearSonimSession(); });

  it('affiche le message d’accueil personnalisé et ouvre Lens au clic sur le raccourci image', async () => {
    await renderSonim();
    expect(screen.getByText('Bonjour, je suis Clean !')).toBeTruthy();
    expect(screen.getAllByTestId(/sonim-action-/)).toHaveLength(3);
    expect(screen.getByText('Analyser une image')).toHaveStyle({ fontFamily: Platform.OS === 'ios' ? 'Arial' : 'sans-serif', fontWeight: '400', color: '#000000' });

    fireEvent.press(screen.getByTestId('sonim-action-lens'));
    expect(router.push).toHaveBeenCalledWith('/lens');
  });

  it('keeps the mobile composer pure white against a subtle canvas, with a 32dp orange glyph and 44dp touch target', async () => {
    await renderSonim();
    expect(screen.getByTestId('clean-screen-root')).toHaveStyle({ backgroundColor: '#F7F7F7' });
    expect(screen.getByTestId('clean-composer-box')).toHaveStyle({ backgroundColor: '#FFFFFF', borderRadius: 28 });
    expect(screen.getByTestId('sonim-input')).toHaveStyle({ backgroundColor: '#FFFFFF', color: '#000000' });
    expect(screen.getByTestId('sonim-input').props.underlineColorAndroid).toBe('transparent');
    expect(screen.getByTestId('sonim-send')).toHaveStyle({ width: 44, height: 44 });
    const glyph = screen.getByTestId('clean-action-glyph');
    expect(Number(glyph.props.width)).toBe(32);
    expect(Number(glyph.props.height)).toBe(32);
  });

  it('ouvre le menu d’images et signale le refus de la caméra', async () => {
    const picker = jest.requireMock('expo-image-picker');
    await renderSonim();
    fireEvent.press(screen.getByTestId('sonim-attach'));
    await act(async () => { fireEvent.press(screen.getByTestId('sonim-attach-camera')); });
    expect(picker.requestCameraPermissionsAsync).toHaveBeenCalled();
    expect(picker.launchCameraAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Impossible d’ouvrir les photos ou l’appareil photo. Vérifiez les autorisations et réessayez.')).toBeTruthy();
  });

  it('shows exactly five ordered attachment entries and routes AYWEBs without adding a chat message', async () => {
    await renderSonim();
    fireEvent.press(screen.getByTestId('sonim-attach'));
    const entries = screen.getAllByTestId(/^sonim-attach-(camera|aywebs|lens|gallery|files)$/);
    expect(entries.map(entry => entry.props.testID)).toEqual(['sonim-attach-camera', 'sonim-attach-aywebs', 'sonim-attach-lens', 'sonim-attach-gallery', 'sonim-attach-files']);
    fireEvent.press(screen.getByTestId('sonim-attach-aywebs'));
    expect(router.push).toHaveBeenCalledWith('/(tabs)/aywebs');
  });

  it('keeps the menu empty pending its new specification', async () => {
    await renderSonim();
    fireEvent.press(screen.getByTestId('sonim-menu-open'));
    expect(screen.queryByText('Nouvelle conversation')).toBeNull();
    expect(screen.queryByText('Suivre une commande')).toBeNull();
  });

  it('préserve le brouillon et les messages après navigation', async () => {
    const first = await renderSonim();
    fireEvent.changeText(screen.getByTestId('sonim-input'), 'Calcule 50 EUR');
    await act(async () => { fireEvent.press(screen.getByTestId('sonim-send')); });
    await waitFor(() => expect(screen.getByText('Voici le calcul complet en dinars.')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('sonim-input'), 'Brouillon');
    first.unmount();
    await renderSonim();
    expect(screen.getByTestId('sonim-input').props.value).toBe('Brouillon');
    expect(screen.getByText('Voici le calcul complet en dinars.')).toBeTruthy();
  });

  it('annule le flux au départ et ignore les événements tardifs', async () => {
    const api = jest.requireMock('../../src/api/assistant');
    let emit: (event: unknown) => void = () => {};
    let finish: (outcome: string) => void = () => {};
    const abort = jest.fn();
    api.streamAssistantChat.mockImplementationOnce((_input: unknown, onEvent: (event: unknown) => void) => {
      emit = onEvent;
      return { abort, finished: new Promise((resolve) => { finish = resolve; }) };
    });
    const view = await renderSonim();
    fireEvent.changeText(screen.getByTestId('sonim-input'), 'Bonjour');
    await act(async () => { fireEvent.press(screen.getByTestId('sonim-send')); });
    view.unmount();
    expect(abort).toHaveBeenCalled();
    await act(async () => { emit({ type: 'delta', text: 'Tardif' }); finish('done'); });
    await renderSonim();
    expect(screen.queryByText('Tardif')).toBeNull();
    expect(screen.getByText('La réponse a été interrompue. Réessayez.')).toBeTruthy();
  });

  it('permet à une seconde vue Sonim d’arrêter le flux partagé', async () => {
    const api = jest.requireMock('../../src/api/assistant');
    let emit: (event: unknown) => void = () => {};
    let finish: (outcome: string) => void = () => {};
    const abort = jest.fn();
    api.streamAssistantChat.mockImplementationOnce((_input: unknown, onEvent: (event: unknown) => void) => {
      emit = onEvent;
      return { abort, finished: new Promise((resolve) => { finish = resolve; }) };
    });
    const first = await renderSonim();
    fireEvent.changeText(within(first.UNSAFE_root).getByTestId('sonim-input'), 'Question');
    await act(async () => { fireEvent.press(within(first.UNSAFE_root).getByTestId('sonim-send')); });
    const second = await renderSonim();
    await act(async () => { fireEvent.press(within(second.UNSAFE_root).getByTestId('sonim-stop')); });
    expect(abort).toHaveBeenCalled();
    await act(async () => { emit({ type: 'delta', text: 'Tardif' }); finish('done'); });
    expect(within(second.UNSAFE_root).queryByText('Tardif')).toBeNull();
    first.unmount();
    second.unmount();
  });

  it('envoie un message et affiche la réponse SSE ainsi que la carte d’estimation TND', async () => {
    await renderSonim();

    fireEvent.changeText(screen.getByTestId('sonim-input'), 'Calcule 50 EUR');
    await act(async () => {
      fireEvent.press(screen.getByTestId('sonim-send'));
    });

    await waitFor(() => {
      expect(screen.getByText('Voici le calcul complet en dinars.')).toBeTruthy();
      expect(screen.getByText('Estimation ZAYROVI')).toBeTruthy();
      expect(screen.getByText('245.50 TND')).toBeTruthy();
    });
  });
});
