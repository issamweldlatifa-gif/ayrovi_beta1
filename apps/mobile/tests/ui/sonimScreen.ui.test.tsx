/**
 * SONIM — test d'intégration UI de l'écran conversationnel IA.
 *
 * Vérifie :
 *   1. l'accueil éditorial et les quatre raccourcis métier (dont ouverture Z Lens) ;
 *   2. l'envoi d'un message, le flux SSE et le rendu d'une carte outil (`calculate_price`).
 */
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';

import { SonimScreen } from '../../src/features/sonim/SonimScreen';
import { ThemeProvider } from '../../src/design/theme';
import { I18nProvider } from '../../src/i18n';
import { PrefsProvider } from '../../src/state/prefs';

jest.mock('expo-router', () => ({
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
  useSession: () => ({ account: { displayName: 'Sami Ben Ali' }, verified: true }),
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
  beforeEach(() => jest.clearAllMocks());

  it('affiche le message d’accueil personnalisé et ouvre Lens au clic sur le raccourci image', async () => {
    await renderSonim();
    expect(screen.getByText('Bonjour Sami')).toBeTruthy();
    expect(screen.getByText('Que souhaitez-vous faire aujourd’hui ?')).toBeTruthy();

    fireEvent.press(screen.getByTestId('sonim-action-lens'));
    expect(router.push).toHaveBeenCalledWith('/lens');
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
